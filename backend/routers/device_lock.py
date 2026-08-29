"""
Device Lock Router — Anti-fraud device registration and debt lock verification.
Prevents users from circumventing debt by uninstalling/reinstalling the app.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.device_registry import Device_registry
from models.passengers import Passengers
from schemas.auth import UserResponse
from services.user_alert_triggers import (
    trigger_new_device_alert,
    trigger_fraud_attempt_alert,
    trigger_multiple_accounts_alert,
    trigger_account_locked_alert,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/device-lock", tags=["device-lock"])


class DeviceLockCheckRequest(BaseModel):
    device_fingerprint: str


class DeviceLockCheckResponse(BaseModel):
    locked: bool
    debt_amount: int
    block_reason: Optional[str] = None
    device_blocked: bool
    install_count: int
    message: str


@router.post("/check", response_model=DeviceLockCheckResponse)
async def check_device_lock(
    data: DeviceLockCheckRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Check if the current user/device is locked due to unpaid debt.
    Registers the device and detects fraud attempts (same device, different account).
    """
    user_id = current_user.id
    fingerprint = data.device_fingerprint

    logger.info(f"[device-lock] Checking device lock for user={user_id}, fp={fingerprint[:8]}...")

    # 1. Find passenger record for this user
    passenger_query = select(Passengers).where(Passengers.user_id == user_id)
    result = await db.execute(passenger_query)
    passenger = result.scalar_one_or_none()

    has_debt = False
    debt_amount = 0

    if passenger:
        has_debt = bool(passenger.has_pending_debt) and (passenger.debt_amount or 0) > 0
        debt_amount = passenger.debt_amount or 0

    # 2. Check if this device fingerprint was used by ANOTHER user with unpaid debt
    other_device_query = select(Device_registry).where(
        and_(
            Device_registry.device_fingerprint == fingerprint,
            Device_registry.user_id != user_id,
            Device_registry.has_debt_flag == True,
        )
    )
    other_result = await db.execute(other_device_query)
    fraudulent_devices = other_result.scalars().all()

    device_blocked = len(fraudulent_devices) > 0
    block_reason = None
    if device_blocked:
        block_reason = (
            "Cet appareil est associé à un autre compte avec une dette impayée. "
            "Veuillez régulariser la dette du compte précédent ou contacter le support."
        )

    # 3. Find or create device registry entry for this user + fingerprint
    existing_query = select(Device_registry).where(
        and_(
            Device_registry.device_fingerprint == fingerprint,
            Device_registry.user_id == user_id,
        )
    )
    existing_result = await db.execute(existing_query)
    existing_device = existing_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing_device:
        # Update existing record
        existing_device.install_count = (existing_device.install_count or 1) + 1
        existing_device.last_seen_at = now
        existing_device.has_debt_flag = has_debt
        existing_device.debt_amount_at_register = debt_amount
        if passenger:
            existing_device.passenger_id = passenger.id
        if device_blocked:
            existing_device.is_blocked = True
            existing_device.block_reason = block_reason
        install_count = existing_device.install_count

        # Trigger alert if reinstall detected (install_count > 2 = suspicious)
        if install_count > 2:
            await trigger_new_device_alert(db, user_id, fingerprint, install_count)
    else:
        # Create new record — first time this device is seen for this user
        new_device = Device_registry(
            device_fingerprint=fingerprint,
            user_id=user_id,
            passenger_id=passenger.id if passenger else None,
            has_debt_flag=has_debt,
            debt_amount_at_register=debt_amount,
            install_count=1,
            last_seen_at=now,
            is_blocked=device_blocked,
            block_reason=block_reason,
        )
        db.add(new_device)
        install_count = 1

        # Trigger new device alert for first-time device registration
        await trigger_new_device_alert(db, user_id, fingerprint, install_count)

    # Trigger fraud/multi-account alerts
    if device_blocked:
        await trigger_fraud_attempt_alert(
            db, user_id,
            "Appareil associé à un autre compte avec dette impayée",
            fingerprint,
        )

    if len(fraudulent_devices) > 0:
        other_ids = [d.user_id for d in fraudulent_devices if d.user_id != user_id]
        if other_ids:
            await trigger_multiple_accounts_alert(db, user_id, other_ids, fingerprint)

    # Trigger account locked alert
    if has_debt and debt_amount > 0:
        await trigger_account_locked_alert(
            db, user_id,
            f"Dette impayée de {debt_amount:,} FCFA",
            debt_amount,
        )

    await db.commit()

    # 4. Determine lock status
    locked = has_debt or device_blocked

    # 5. Build response message
    if device_blocked:
        message = block_reason
    elif has_debt:
        message = (
            f"Votre compte a une dette impayée de {debt_amount:,} FCFA. "
            f"L'application est verrouillée jusqu'à régularisation complète."
        )
    else:
        message = "Aucune dette détectée. Accès autorisé."

    logger.info(
        f"[device-lock] Result: user={user_id}, locked={locked}, "
        f"debt={debt_amount}, blocked={device_blocked}, installs={install_count}"
    )

    return DeviceLockCheckResponse(
        locked=locked,
        debt_amount=debt_amount,
        block_reason=block_reason,
        device_blocked=device_blocked,
        install_count=install_count,
        message=message,
    )