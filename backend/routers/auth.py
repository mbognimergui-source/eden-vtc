"""Routes d'authentification residuelles.

Le SSO/OIDC navigateur a ete retire. Les passagers se connectent via
/api/v1/auth/phone/* (code OTP par SMS). Ce routeur conserve seulement :
- /login : refus explicite (410) pour signaler la migration ;
- /token/exchange : echange du jeton plateforme (acces administrateur) ;
- /me : profil du porteur du JWT ;
- /logout : simple indication de la page de connexion telephone.
"""

import logging

import httpx
from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from models.auth import User
from schemas.auth import (
    PlatformTokenExchangeRequest,
    TokenExchangeResponse,
    UserResponse,
)
from services.auth import AuthService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

PHONE_LOGIN_MESSAGE = (
    "La connexion SSO est desactivee. Les passagers se connectent desormais "
    "par numero de telephone avec un code SMS : /api/v1/auth/phone/request-code."
)


def derive_name_from_email(email: str) -> str:
    """Deduit un nom lisible depuis une adresse email (comptes plateforme)."""
    return email.split("@", 1)[0] if email else ""


@router.get("/login")
async def login():
    """Connexion SSO retiree : le seul flux passager est l'OTP SMS par telephone."""
    logger.info("[login] SSO login attempt rejected, phone OTP is the only passenger login flow")
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=PHONE_LOGIN_MESSAGE)


@router.get("/callback")
async def callback():
    """Callback OIDC retire."""
    logger.info("[callback] OIDC callback attempt rejected, SSO flow removed")
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=PHONE_LOGIN_MESSAGE)


@router.post("/token/exchange", response_model=TokenExchangeResponse)
async def exchange_platform_token(
    payload: PlatformTokenExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Echange un jeton plateforme contre un JWT applicatif (role admin ou user)."""
    logger.info("[token/exchange] Received platform token exchange request")

    verify_url = f"{settings.oidc_issuer_url}/platform/tokens/verify"

    try:
        async with httpx.AsyncClient() as client:
            verify_response = await client.post(
                verify_url,
                json={"platform_token": payload.platform_token},
                headers={"Content-Type": "application/json"},
            )
        logger.debug("[token/exchange] Issuer response status: %s", verify_response.status_code)
    except httpx.HTTPError as exc:
        logger.error("[token/exchange] HTTP error verifying platform token: %s", exc, exc_info=True)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to verify platform token") from exc

    try:
        verify_body = verify_response.json()
    except ValueError:
        logger.error("[token/exchange] Failed to parse issuer response as JSON")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from platform token verification service",
        )

    if not isinstance(verify_body, dict):
        logger.error("[token/exchange] Unexpected response type: %s", type(verify_body))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unexpected response from platform token verification service",
        )

    if verify_response.status_code != status.HTTP_200_OK or not verify_body.get("success"):
        message = verify_body.get("message", "")
        logger.warning(
            "[token/exchange] Token verification failed: status=%s, message=%s",
            verify_response.status_code,
            message,
        )
        raise HTTPException(
            status_code=verify_response.status_code,
            detail=message or "Platform token verification failed",
        )

    payload_data = verify_body.get("data") or {}
    raw_user_id = payload_data.get("user_id")

    if not raw_user_id:
        logger.error("[token/exchange] Platform token payload missing user_id")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platform token payload missing user_id")

    platform_user_id = str(raw_user_id)
    is_admin = platform_user_id == str(settings.admin_user_id)
    role = "admin" if is_admin else "user"

    logger.info("[token/exchange] User verified, role=%s", role)
    auth_service = AuthService(db)

    user_email = payload_data.get("email", "") or (getattr(settings, "admin_user_email", "") if is_admin else "")
    user_name = payload_data.get("name") or payload_data.get("username") or derive_name_from_email(user_email)

    user = User(id=platform_user_id, email=user_email, name=user_name, role=role)
    app_token, expires_at, _ = await auth_service.issue_app_token(user=user)
    logger.info("[token/exchange] Token issued successfully, expires_at=%s", expires_at)

    return TokenExchangeResponse(token=app_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Retourne les informations de l'utilisateur courant."""
    return current_user


@router.get("/logout")
async def logout():
    """Deconnexion : le client supprime son JWT local et revient a la page telephone."""
    return {"redirect_url": f"{settings.frontend_url}/login"}