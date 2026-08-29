"""Gestion des jetons applicatifs (JWT).

Le flux OIDC/SSO navigateur a ete retire : les passagers se connectent
uniquement par numero de telephone avec un code OTP envoye par SMS.
Ce module ne conserve donc que la creation et la validation du JWT
applicatif emis par EDEN VTC.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from core.config import settings
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

logger = logging.getLogger(__name__)


class AccessTokenError(Exception):
    """Erreur liee au jeton d'acces applicatif."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def _user_hash(user_id: Any) -> str:
    """Retourne un hash court de l'identifiant pour les journaux."""
    if not user_id or user_id == "unknown":
        return "unknown"
    return hashlib.sha256(str(user_id).encode()).hexdigest()[:8]


def create_access_token(claims: Dict[str, Any], expires_minutes: Optional[int] = None) -> str:
    """Cree un JWT signe a partir des claims fournis."""
    if not settings.jwt_secret_key:
        logger.error("JWT secret key is not configured")
        raise ValueError("JWT secret key is not configured")

    now = datetime.now(timezone.utc)
    token_claims = claims.copy()

    expiry_minutes = expires_minutes if expires_minutes is not None else int(settings.jwt_expire_minutes)
    expire_at = now + timedelta(minutes=expiry_minutes)

    token_claims.update(
        {
            "exp": expire_at,
            "iat": now,
            "nbf": now,
        }
    )

    token = jwt.encode(token_claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    logger.debug("Authentication token created for user hash: %s", _user_hash(token_claims.get("sub", "unknown")))
    return token


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode et valide un JWT applicatif."""
    if not settings.jwt_secret_key:
        logger.error("JWT secret key is not configured")
        raise AccessTokenError("Authentication service is misconfigured")

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        logger.debug("Authentication token validated for user hash: %s", _user_hash(payload.get("sub", "unknown")))
        return payload
    except ExpiredSignatureError as exc:
        logger.info("Authentication token has expired")
        raise AccessTokenError("Token has expired") from exc
    except JWTError as exc:
        logger.warning("Token validation failed: %s", type(exc).__name__)
        raise AccessTokenError("Invalid authentication token") from exc