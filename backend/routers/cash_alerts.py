# @File: backend/routers/cash_alerts.py
# @Desc: Notifications admin pour mouvements importants de caisse EDEN VTC
# Alertes automatiques : transaction importante, dette créée, encours bas, entrée manuelle
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.cash_alerts import Cash_alerts
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/cash-alerts", tags=["cash_alerts"])


# === Schemas ===

class ResolveAlertRequest(BaseModel):
    """Acquitter une alerte"""
    resolved_by: str = "admin"


# === Seuils par défaut ===
ALERT_THRESHOLDS = {
    "large_transaction": 50000,      # Alerte si transaction > 50 000 FCFA
    "daily_revenue_high": 500000,    # Alerte si recettes du jour > 500 000 FCFA
    "low_encours": 10000,            # Alerte si encours < 10 000 FCFA
    "debt_created": 0,               # Toute dette créée
    "manual_entry_large": 100000,    # Entrée manuelle > 100 000 FCFA
}


# === Helper: Créer une alerte (appelé depuis ride_completion et cash_register) ===

async def create_cash_alert(
    db: AsyncSession,
    alert_type: str,
    severity: str,
    title: str,
    message: str,
    amount: Optional[int] = None,
    ride_id: Optional[int] = None,
    passenger_id: Optional[int] = None,
    details: Optional[dict] = None,
):
    """Crée une alerte de caisse."""
    alert = Cash_alerts(
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        amount=amount,
        ride_id=ride_id,
        passenger_id=passenger_id,
        details=details,
        is_read=False,
        is_resolved=False,
    )
    db.add(alert)
    logger.info(f"Cash alert created: [{severity}] {title} - {message}")
    return alert


# === Endpoints ===

@router.get("/alerts")
async def get_alerts(
    unread_only: bool = False,
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Liste des alertes de caisse (filtrable)."""
    try:
        query = select(Cash_alerts).order_by(Cash_alerts.created_at.desc())

        if unread_only:
            query = query.where(Cash_alerts.is_read == False)
        if severity:
            query = query.where(Cash_alerts.severity == severity)
        if alert_type:
            query = query.where(Cash_alerts.alert_type == alert_type)

        query = query.offset(offset).limit(limit)
        result = await db.execute(query)
        alerts = result.scalars().all()

        # Count unread
        unread_count_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(Cash_alerts.is_read == False)
        )
        unread_count = unread_count_result.scalar() or 0

        # Count by severity (unread only)
        critical_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(
                and_(Cash_alerts.is_read == False, Cash_alerts.severity == "critical")
            )
        )
        critical_count = critical_result.scalar() or 0

        warning_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(
                and_(Cash_alerts.is_read == False, Cash_alerts.severity == "warning")
            )
        )
        warning_count = warning_result.scalar() or 0

        return {
            "alerts": [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "title": a.title,
                    "message": a.message,
                    "amount": a.amount,
                    "ride_id": a.ride_id,
                    "passenger_id": a.passenger_id,
                    "details": a.details,
                    "is_read": a.is_read,
                    "is_resolved": a.is_resolved,
                    "resolved_by": a.resolved_by,
                    "resolved_at": str(a.resolved_at) if a.resolved_at else None,
                    "created_at": str(a.created_at) if a.created_at else None,
                }
                for a in alerts
            ],
            "unread_count": unread_count,
            "critical_count": critical_count,
            "warning_count": warning_count,
            "total": len(alerts),
        }
    except Exception as e:
        logger.error(f"Error getting cash alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Marquer une alerte comme lue."""
    try:
        result = await db.execute(
            select(Cash_alerts).where(Cash_alerts.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        if not alert:
            raise HTTPException(status_code=404, detail="Alerte introuvable")

        alert.is_read = True
        await db.commit()

        return {"success": True, "message": "Alerte marquée comme lue"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error marking alert read: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    data: ResolveAlertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Acquitter/résoudre une alerte."""
    try:
        result = await db.execute(
            select(Cash_alerts).where(Cash_alerts.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        if not alert:
            raise HTTPException(status_code=404, detail="Alerte introuvable")

        alert.is_read = True
        alert.is_resolved = True
        alert.resolved_by = data.resolved_by
        alert.resolved_at = datetime.now()
        await db.commit()

        return {"success": True, "message": "Alerte résolue"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error resolving alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Marquer toutes les alertes comme lues."""
    try:
        result = await db.execute(
            select(Cash_alerts).where(Cash_alerts.is_read == False)
        )
        alerts = result.scalars().all()
        for alert in alerts:
            alert.is_read = True
        await db.commit()

        return {"success": True, "message": f"{len(alerts)} alertes marquées comme lues"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error marking all alerts read: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_alert_stats(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Statistiques des alertes (pour badge dans l'UI)."""
    try:
        today_start = datetime.combine(date.today(), datetime.min.time())

        # Unread count
        unread_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(Cash_alerts.is_read == False)
        )
        unread = unread_result.scalar() or 0

        # Today's alerts
        today_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(
                Cash_alerts.created_at >= today_start
            )
        )
        today_count = today_result.scalar() or 0

        # Critical unresolved
        critical_result = await db.execute(
            select(func.count(Cash_alerts.id)).where(
                and_(
                    Cash_alerts.severity == "critical",
                    Cash_alerts.is_resolved == False,
                )
            )
        )
        critical_unresolved = critical_result.scalar() or 0

        return {
            "unread": unread,
            "today": today_count,
            "critical_unresolved": critical_unresolved,
        }
    except Exception as e:
        logger.error(f"Error getting alert stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/thresholds")
async def get_thresholds(
    current_user: UserResponse = Depends(get_current_user),
):
    """Retourne les seuils d'alerte actuels."""
    return {"thresholds": ALERT_THRESHOLDS}