"""Routes d'authentification par téléphone + OTP SMS pour EDEN VTC.

Remplace le flux SSO/OIDC pour les passagers : aucun email ni mot de passe.
Le JWT applicatif est émis par le service d'authentification existant.
"""

import logging
from typing import Optional

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from schemas.auth import UserResponse
from services.auth import AuthService
from services.phone_auth import (
    DEFAULT_OTP_CHANNEL,
    OTP_CHANNELS,
    OTP_LENGTH,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_SECONDS,
    PhoneAuthError,
    PhoneAuthService,
    _dev_mode_enabled,
    channel_ready,
    mask_phone,
    normalize_phone,
    send_otp_code,
    sms_channel_ready,
    whatsapp_channel_ready,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/auth/phone", tags=["phone-authentication"])
logger = logging.getLogger(__name__)


class RequestCodeRequest(BaseModel):
    phone: str = Field(..., description="Numéro de téléphone, ex +237612345678")
    channel: str = Field(
        default=DEFAULT_OTP_CHANNEL,
        description="Canal de livraison du code : 'sms' ou 'whatsapp'",
    )

    @field_validator("channel")
    @classmethod
    def _validate_channel(cls, value: str) -> str:
        cleaned = (value or "").strip().lower()
        if cleaned not in OTP_CHANNELS:
            return DEFAULT_OTP_CHANNEL
        return cleaned


class RequestCodeResponse(BaseModel):
    sent: bool
    phone: str
    masked_phone: str
    channel: str
    expires_in: int
    resend_after: int
    code_length: int
    dev_code: Optional[str] = None


class VerifyCodeRequest(BaseModel):
    phone: str = Field(..., description="Numéro de téléphone utilisé pour la demande de code")
    code: str = Field(..., description="Code OTP reçu par SMS")


class VerifyCodeResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_at: int
    profile_complete: bool
    first_name: Optional[str] = None
    city: Optional[str] = None


class ProfileRequest(BaseModel):
    first_name: str = Field(..., description="Prénom du passager")
    city: str = Field(..., description="Ville du passager, ex Douala")


class ProfileResponse(BaseModel):
    profile_complete: bool
    first_name: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    masked_phone: Optional[str] = None


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return ""


def _raise_http(exc: PhoneAuthError) -> None:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    raise HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers)


@router.get("/status")
async def phone_auth_status():
    """Indique quels canaux (SMS, WhatsApp) sont prêts (utile pour l'écran de connexion)."""
    return {
        "sms_ready": sms_channel_ready(),
        "whatsapp_ready": whatsapp_channel_ready(),
        "dev_mode": _dev_mode_enabled(),
        "code_length": OTP_LENGTH,
        "expires_in": OTP_TTL_SECONDS,
    }


@router.post("/request-code", response_model=RequestCodeResponse)
async def request_code(
    data: RequestCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Génère un OTP haché puis l'envoie par SMS ou WhatsApp via Twilio, selon le canal choisi."""
    service = PhoneAuthService(db)

    try:
        phone = normalize_phone(data.phone)
    except PhoneAuthError as exc:
        _raise_http(exc)

    channel = data.channel or DEFAULT_OTP_CHANNEL
    channel_is_ready = channel_ready(channel)
    dev_mode = _dev_mode_enabled() and not channel_is_ready

    if not dev_mode and not channel_is_ready:
        channel_label = "WhatsApp" if channel == "whatsapp" else "SMS"
        raise HTTPException(
            status_code=503,
            detail=f"Le service {channel_label} n'est pas encore configuré. Contactez le support EDEN VTC.",
        )

    # Phase 1 (base de données courte) : contrôle des quotas + création du code
    try:
        created = await service.create_otp(phone=phone, request_ip=_client_ip(request), channel=channel)
    except PhoneAuthError as exc:
        _raise_http(exc)

    otp_id = created["otp_id"]
    code = created["code"]

    # Phase 2 (appel externe, hors transaction) : envoi du code
    if dev_mode:
        logger.warning("[otp] Mode développement : envoi (%s) non effectué pour %s", channel, mask_phone(phone))
        await service.mark_delivery(otp_id, "dev_bypass")
        return RequestCodeResponse(
            sent=True,
            phone=phone,
            masked_phone=mask_phone(phone),
            channel=channel,
            expires_in=OTP_TTL_SECONDS,
            resend_after=OTP_RESEND_COOLDOWN_SECONDS,
            code_length=OTP_LENGTH,
            dev_code=code,
        )

    try:
        _, delivery_status = await send_otp_code(channel, phone, code)
    except PhoneAuthError as exc:
        await service.mark_delivery(otp_id, "failed")
        _raise_http(exc)

    # Phase 3 (base de données courte) : trace de livraison
    await service.mark_delivery(otp_id, delivery_status)

    return RequestCodeResponse(
        sent=True,
        phone=phone,
        masked_phone=mask_phone(phone),
        channel=channel,
        expires_in=OTP_TTL_SECONDS,
        resend_after=OTP_RESEND_COOLDOWN_SECONDS,
        code_length=OTP_LENGTH,
    )


@router.post("/verify-code", response_model=VerifyCodeResponse)
async def verify_code(
    data: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Valide l'OTP puis émet le JWT applicatif existant."""
    service = PhoneAuthService(db)

    try:
        phone = normalize_phone(data.phone)
        await service.verify_otp(phone=phone, code=data.code)
        user = await service.get_or_create_phone_user(phone)
        passenger = await service.ensure_passenger(user_id=user.id, phone=phone)
    except PhoneAuthError as exc:
        _raise_http(exc)

    auth_service = AuthService(db)
    token, expires_at, _ = await auth_service.issue_app_token(user=user)

    logger.info("[otp] Connexion réussie pour %s", mask_phone(phone))

    return VerifyCodeResponse(
        token=token,
        expires_at=int(expires_at.timestamp()),
        profile_complete=PhoneAuthService.is_profile_complete(passenger),
        first_name=(passenger.first_name or None) if passenger else None,
        city=(passenger.city or None) if passenger else None,
    )


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retourne le profil minimal du passager connecté."""
    service = PhoneAuthService(db)
    passenger = await service.get_passenger(current_user.id)

    if passenger is None:
        return ProfileResponse(profile_complete=False)

    return ProfileResponse(
        profile_complete=PhoneAuthService.is_profile_complete(passenger),
        first_name=passenger.first_name or None,
        city=passenger.city or None,
        phone=passenger.phone or None,
        masked_phone=mask_phone(passenger.phone) if passenger.phone else None,
    )


@router.post("/profile", response_model=ProfileResponse)
async def save_profile(
    data: ProfileRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enregistre le profil minimal après la première connexion."""
    service = PhoneAuthService(db)

    try:
        passenger = await service.save_profile(
            user_id=current_user.id,
            first_name=data.first_name,
            city=data.city,
        )
    except PhoneAuthError as exc:
        _raise_http(exc)

    return ProfileResponse(
        profile_complete=PhoneAuthService.is_profile_complete(passenger),
        first_name=passenger.first_name or None,
        city=passenger.city or None,
        phone=passenger.phone or None,
        masked_phone=mask_phone(passenger.phone) if passenger.phone else None,
    )