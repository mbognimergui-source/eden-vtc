"""
User Alerts Custom Router — Endpoints for user-facing security alerts.
Provides: my alerts, mark as read, dismiss, stats, and trigger helpers.
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.user_alerts import User_alerts
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/user-alerts", tags=["user-alerts"])


# ---------- Pydantic Schemas ----------
class UserAlertResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    title: str
    message: str
    details: Optional[str] = None
    is_read: bool
    is_dismissed: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserAlertStatsResponse(BaseModel):
    total: int
    unread: int
    critical: int
    high: int
    medium: int
    low: int


class MarkReadRequest(BaseModel):
    alert_ids: List[int]


class CreateAlertRequest(BaseModel):
    """Used internally or by admin to create user alerts"""
    user_id: str
    alert_type: str
    severity: str
    title: str
    message: str
    details: Optional[str] = None


# ---------- Endpoints ----------

@router.get("/my-alerts", response_model=List[UserAlertResponse])
async def get_my_alerts(
    include_dismissed: bool = Query(False, description="Include dismissed alerts"),
    limit: int = Query(50, le=100),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's security alerts, ordered by most recent."""
    conditions = [User_alerts.user_id == current_user.id]
    if not include_dismissed:
        conditions.append(User_alerts.is_dismissed != True)

    query = (
        select(User_alerts)
        .where(and_(*conditions))
        .order_by(User_alerts.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        UserAlertResponse(
            id=a.id,
            alert_type=a.alert_type,
            severity=a.severity,
            title=a.title,
            message=a.message,
            details=a.details,
            is_read=bool(a.is_read),
            is_dismissed=bool(a.is_dismissed),
            created_at=a.created_at,
        )
        for a in alerts
    ]


@router.get("/stats", response_model=UserAlertStatsResponse)
async def get_my_alert_stats(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get alert statistics for current user."""
    base_condition = User_alerts.user_id == current_user.id

    # Total non-dismissed
    total_q = select(func.count(User_alerts.id)).where(
        and_(base_condition, User_alerts.is_dismissed != True)
    )
    total_result = await db.execute(total_q)
    total = total_result.scalar() or 0

    # Unread
    unread_q = select(func.count(User_alerts.id)).where(
        and_(base_condition, User_alerts.is_read != True, User_alerts.is_dismissed != True)
    )
    unread_result = await db.execute(unread_q)
    unread = unread_result.scalar() or 0

    # By severity
    severity_counts = {}
    for sev in ["critical", "high", "medium", "low"]:
        sev_q = select(func.count(User_alerts.id)).where(
            and_(base_condition, User_alerts.severity == sev, User_alerts.is_dismissed != True)
        )
        sev_result = await db.execute(sev_q)
        severity_counts[sev] = sev_result.scalar() or 0

    return UserAlertStatsResponse(
        total=total,
        unread=unread,
        critical=severity_counts["critical"],
        high=severity_counts["high"],
        medium=severity_counts["medium"],
        low=severity_counts["low"],
    )


@router.post("/mark-read")
async def mark_alerts_read(
    data: MarkReadRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark specific alerts as read."""
    if not data.alert_ids:
        return {"updated": 0}

    stmt = (
        update(User_alerts)
        .where(
            and_(
                User_alerts.user_id == current_user.id,
                User_alerts.id.in_(data.alert_ids),
            )
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()

    return {"updated": result.rowcount}


@router.post("/mark-all-read")
async def mark_all_alerts_read(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all user's alerts as read."""
    stmt = (
        update(User_alerts)
        .where(
            and_(
                User_alerts.user_id == current_user.id,
                User_alerts.is_read != True,
            )
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()

    return {"updated": result.rowcount}


@router.post("/dismiss/{alert_id}")
async def dismiss_alert(
    alert_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dismiss a specific alert (hide from view)."""
    stmt = (
        update(User_alerts)
        .where(
            and_(
                User_alerts.user_id == current_user.id,
                User_alerts.id == alert_id,
            )
        )
        .values(is_dismissed=True, is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")

    return {"dismissed": True}


@router.post("/trigger")
async def trigger_user_alert(
    data: CreateAlertRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Internal endpoint to trigger a user alert.
    Called by other services (device-lock, security middleware, etc.)
    """
    new_alert = User_alerts(
        user_id=data.user_id,
        alert_type=data.alert_type,
        severity=data.severity,
        title=data.title,
        message=data.message,
        details=data.details,
        is_read=False,
        is_dismissed=False,
    )
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)

    logger.info(
        f"[user-alerts] Triggered alert for user={data.user_id}: "
        f"type={data.alert_type}, severity={data.severity}"
    )

    return {"id": new_alert.id, "created": True}