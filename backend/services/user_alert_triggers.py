"""
User Alert Triggers — Utility functions to create user alerts
from various detection points in the application.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models.user_alerts import User_alerts

logger = logging.getLogger(__name__)


async def trigger_new_device_alert(
    db: AsyncSession,
    user_id: str,
    device_fingerprint: str,
    install_count: int,
):
    """Alert user when a new device is detected on their account."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="new_device",
        severity="medium",
        title="Nouvel appareil détecté",
        message=(
            f"Un nouvel appareil a été associé à votre compte. "
            f"Si ce n'est pas vous, changez immédiatement votre mot de passe."
        ),
        details=json.dumps({
            "device_fingerprint": device_fingerprint[:16] + "...",
            "install_count": install_count,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] new_device alert for user={user_id}")


async def trigger_fraud_attempt_alert(
    db: AsyncSession,
    user_id: str,
    reason: str,
    device_fingerprint: str,
):
    """Alert user when a fraud attempt is detected (multi-account, device blocked)."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="fraud_attempt",
        severity="critical",
        title="Tentative de fraude détectée",
        message=(
            f"Une activité suspecte a été détectée sur votre compte : {reason}. "
            f"Votre appareil a été signalé. Contactez le support si c'est une erreur."
        ),
        details=json.dumps({
            "reason": reason,
            "device_fingerprint": device_fingerprint[:16] + "...",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] fraud_attempt alert for user={user_id}")


async def trigger_suspicious_login_alert(
    db: AsyncSession,
    user_id: str,
    source_ip: str,
    location: str = "Inconnu",
):
    """Alert user when login from unusual location/IP."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="suspicious_login",
        severity="high",
        title="Connexion inhabituelle détectée",
        message=(
            f"Une connexion depuis une localisation inhabituelle ({location}) "
            f"a été détectée. Si ce n'est pas vous, sécurisez votre compte."
        ),
        details=json.dumps({
            "source_ip": source_ip,
            "location": location,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] suspicious_login alert for user={user_id}")


async def trigger_multiple_accounts_alert(
    db: AsyncSession,
    user_id: str,
    other_user_ids: list,
    device_fingerprint: str,
):
    """Alert when same device is used with multiple accounts."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="multiple_accounts",
        severity="high",
        title="Appareil partagé avec d'autres comptes",
        message=(
            f"Votre appareil est associé à {len(other_user_ids)} autre(s) compte(s). "
            f"Cela peut indiquer une tentative de contournement. "
            f"Contactez le support si nécessaire."
        ),
        details=json.dumps({
            "other_accounts_count": len(other_user_ids),
            "device_fingerprint": device_fingerprint[:16] + "...",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] multiple_accounts alert for user={user_id}")


async def trigger_account_locked_alert(
    db: AsyncSession,
    user_id: str,
    reason: str,
    debt_amount: int = 0,
):
    """Alert when account is locked due to debt or fraud."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="account_locked",
        severity="critical",
        title="Compte verrouillé",
        message=(
            f"Votre compte a été verrouillé : {reason}. "
            f"Régularisez votre situation pour retrouver l'accès complet."
        ),
        details=json.dumps({
            "reason": reason,
            "debt_amount": debt_amount,
            "locked_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] account_locked alert for user={user_id}")


async def trigger_unusual_location_alert(
    db: AsyncSession,
    user_id: str,
    location: str,
    expected_location: str = "Douala/Yaoundé",
):
    """Alert when user activity from unexpected geographic location."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="unusual_location",
        severity="medium",
        title="Activité depuis une localisation inhabituelle",
        message=(
            f"Une activité a été détectée depuis {location}, "
            f"loin de votre zone habituelle ({expected_location}). "
            f"Vérifiez que c'est bien vous."
        ),
        details=json.dumps({
            "detected_location": location,
            "expected_location": expected_location,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] unusual_location alert for user={user_id}")


async def trigger_debt_warning_alert(
    db: AsyncSession,
    user_id: str,
    debt_amount: int,
):
    """Alert when debt reaches warning threshold."""
    alert = User_alerts(
        user_id=user_id,
        alert_type="debt_warning",
        severity="high",
        title="Avertissement dette élevée",
        message=(
            f"Votre dette atteint {debt_amount:,} FCFA. "
            f"Régularisez rapidement pour éviter le verrouillage de votre compte."
        ),
        details=json.dumps({
            "debt_amount": debt_amount,
            "threshold": 5000,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }),
        is_read=False,
        is_dismissed=False,
    )
    db.add(alert)
    logger.info(f"[user-alerts] debt_warning alert for user={user_id}")