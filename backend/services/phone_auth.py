"""Authentification par téléphone + OTP SMS ou WhatsApp (Twilio).

Règles de sécurité appliquées :
- le code OTP n'est jamais stocké en clair (SHA-256 salé avec la clé JWT) ;
- usage unique + expiration courte ;
- limitation des demandes d'envoi (par téléphone et par IP) ;
- limitation du nombre de tentatives de validation par code.

Deux canaux de livraison sont disponibles, au choix du passager :
- SMS classique via l'API Messages de Twilio (nécessite un Alphanumeric
  Sender ID pré-enregistré pour le Cameroun, cf. documentation Twilio) ;
- WhatsApp via un modèle de message "AUTHENTICATION" approuvé par Meta,
  envoyé via l'API Content de Twilio (généralement disponible bien plus
  vite que l'enregistrement SMS camerounais).
"""

import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from core.config import settings
from models.auth import User
from models.passengers import Passengers
from models.phone_otp_requests import Phone_otp_requests
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# --- Paramètres de sécurité ---
OTP_LENGTH = 6
OTP_TTL_SECONDS = 300  # 5 minutes
OTP_MAX_ATTEMPTS = 5  # tentatives de validation par code
OTP_RESEND_COOLDOWN_SECONDS = 60  # délai minimal entre deux envois
OTP_MAX_PER_PHONE_WINDOW = 3  # envois max par téléphone
OTP_PHONE_WINDOW_SECONDS = 900  # sur 15 minutes
OTP_MAX_PER_IP_WINDOW = 10  # envois max par IP
OTP_IP_WINDOW_SECONDS = 3600  # sur 1 heure

DEFAULT_COUNTRY_CODE = "237"  # Cameroun
TWILIO_API_ROOT = "https://api.twilio.com/2010-04-01"
TWILIO_CONTENT_API_ROOT = "https://api.twilio.com/2010-04-01"

OTP_CHANNELS = ("sms", "whatsapp")
DEFAULT_OTP_CHANNEL = "sms"


class PhoneAuthError(Exception):
    """Erreur métier de l'authentification par téléphone."""

    def __init__(self, message: str, status_code: int = 400, retry_after: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise un datetime éventuellement naïf renvoyé par la base."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def normalize_phone(raw_phone: str) -> str:
    """Normalise un numéro saisi vers le format E.164.

    Accepte : 6XXXXXXXX, 237XXXXXXXXX, 00237XXXXXXXXX, +237XXXXXXXXX.
    """
    if not raw_phone or not raw_phone.strip():
        raise PhoneAuthError("Veuillez saisir votre numéro de téléphone.")

    cleaned = re.sub(r"[\s().\-]", "", raw_phone.strip())

    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]

    if cleaned.startswith("+"):
        digits = cleaned[1:]
    elif cleaned.startswith(DEFAULT_COUNTRY_CODE) and len(cleaned) > 9:
        digits = cleaned
    else:
        digits = DEFAULT_COUNTRY_CODE + cleaned.lstrip("0")

    if not digits.isdigit():
        raise PhoneAuthError("Numéro invalide. Exemple attendu : +237 6XX XX XX XX.")

    if len(digits) < 8 or len(digits) > 15:
        raise PhoneAuthError("Numéro invalide. Exemple attendu : +237 6XX XX XX XX.")

    # Contrôle spécifique Cameroun : 9 chiffres après l'indicatif
    if digits.startswith(DEFAULT_COUNTRY_CODE):
        local = digits[len(DEFAULT_COUNTRY_CODE) :]
        if len(local) != 9:
            raise PhoneAuthError("Numéro camerounais invalide. Format attendu : +237 6XX XX XX XX.")

    return "+" + digits


def mask_phone(phone: str) -> str:
    """Masque le numéro pour l'affichage et les journaux."""
    if len(phone) <= 5:
        return "***"
    return f"{phone[:5]}{'*' * max(0, len(phone) - 7)}{phone[-2:]}"


def _generate_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def _hash_code(phone: str, code: str) -> str:
    """Hache le code avec un sel dérivé du numéro et de la clé serveur."""
    secret = (getattr(settings, "jwt_secret_key", "") or "eden-vtc-otp").encode("utf-8")
    payload = f"{phone}:{code}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def user_id_for_phone(phone: str) -> str:
    """Identifiant utilisateur stable et non réversible dérivé du numéro."""
    secret = (getattr(settings, "jwt_secret_key", "") or "eden-vtc-otp").encode("utf-8")
    digest = hmac.new(secret, phone.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"phone_{digest[:32]}"


def _twilio_config() -> Dict[str, str]:
    """Lit la configuration Twilio depuis les variables d'environnement."""
    return {
        "account_sid": (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip(),
        "auth_token": (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip(),
        "from_number": (
            os.environ.get("TWILIO_PHONE_NUMBER")
            or os.environ.get("TWILIO_FROM_NUMBER")
            or os.environ.get("TWILIO_SENDER_NUMBER")
            or ""
        ).strip(),
        "messaging_service_sid": (os.environ.get("TWILIO_MESSAGING_SERVICE_SID") or "").strip(),
    }


def _whatsapp_config() -> Dict[str, str]:
    """Lit la configuration WhatsApp (Twilio) depuis les variables d'environnement.

    - TWILIO_WHATSAPP_FROM : numéro expéditeur WhatsApp approuvé, ex "+14155238886"
      (le préfixe "whatsapp:" est ajouté automatiquement).
    - TWILIO_WHATSAPP_CONTENT_SID : SID (HXxxxxxxxx...) du modèle de message
      catégorie "AUTHENTICATION" approuvé par Meta dans Twilio Content Template
      Builder. Un seul paramètre {{1}} = le code OTP.
    """
    return {
        "account_sid": (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip(),
        "auth_token": (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip(),
        "from_number": (os.environ.get("TWILIO_WHATSAPP_FROM") or "").strip(),
        "content_sid": (os.environ.get("TWILIO_WHATSAPP_CONTENT_SID") or "").strip(),
    }


def _dev_mode_enabled() -> bool:
    return (os.environ.get("OTP_DEV_MODE") or "").strip().lower() in ("1", "true", "yes")


def sms_channel_ready() -> bool:
    cfg = _twilio_config()
    return bool(cfg["account_sid"] and cfg["auth_token"] and (cfg["from_number"] or cfg["messaging_service_sid"]))


def whatsapp_channel_ready() -> bool:
    cfg = _whatsapp_config()
    return bool(cfg["account_sid"] and cfg["auth_token"] and cfg["from_number"] and cfg["content_sid"])


def channel_ready(channel: str) -> bool:
    """Indique si le canal demandé (sms ou whatsapp) est configuré et prêt."""
    if channel == "whatsapp":
        return whatsapp_channel_ready()
    return sms_channel_ready()


async def send_sms_code(phone: str, code: str) -> Tuple[bool, str]:
    """Envoie le code par SMS via l'API REST Twilio.

    Retourne (succès, statut) sans jamais journaliser le code.
    """
    cfg = _twilio_config()
    if not sms_channel_ready():
        raise PhoneAuthError(
            "Le service SMS n'est pas configuré. Contactez le support EDEN VTC.",
            status_code=503,
        )

    body = f"EDEN VTC : votre code de connexion est {code}. Il expire dans 5 minutes. Ne le partagez avec personne."
    form: Dict[str, str] = {"To": phone, "Body": body}
    if cfg["messaging_service_sid"]:
        form["MessagingServiceSid"] = cfg["messaging_service_sid"]
    else:
        form["From"] = cfg["from_number"]

    basic = base64.b64encode(f"{cfg['account_sid']}:{cfg['auth_token']}".encode("utf-8")).decode("ascii")
    url = f"{TWILIO_API_ROOT}/Accounts/{cfg['account_sid']}/Messages.json"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                data=form,
                headers={
                    "Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
    except httpx.HTTPError as exc:
        logger.error("[otp] Échec réseau Twilio pour %s : %s", mask_phone(phone), exc)
        raise PhoneAuthError(
            "Impossible d'envoyer le SMS pour le moment. Réessayez dans un instant.",
            status_code=502,
        ) from exc

    if response.status_code >= 300:
        detail = ""
        try:
            detail = str(response.json().get("message", ""))
        except ValueError:
            detail = response.text[:200]
        logger.error(
            "[otp] Twilio a refusé l'envoi vers %s (status=%s) : %s",
            mask_phone(phone),
            response.status_code,
            detail,
        )
        raise PhoneAuthError(
            "Ce numéro n'a pas pu être joint par SMS. Vérifiez le numéro puis réessayez.",
            status_code=502,
        )

    try:
        status_value = str(response.json().get("status", "sent"))
    except ValueError:
        status_value = "sent"

    logger.info("[otp] SMS envoyé à %s (statut Twilio=%s)", mask_phone(phone), status_value)
    return True, status_value


async def send_whatsapp_code(phone: str, code: str) -> Tuple[bool, str]:
    """Envoie le code par WhatsApp via un modèle "AUTHENTICATION" approuvé (API Content Twilio).

    Retourne (succès, statut) sans jamais journaliser le code.
    """
    cfg = _whatsapp_config()
    if not whatsapp_channel_ready():
        raise PhoneAuthError(
            "Le service WhatsApp n'est pas configuré. Contactez le support EDEN VTC.",
            status_code=503,
        )

    import json as _json

    form: Dict[str, str] = {
        "To": f"whatsapp:{phone}",
        "From": f"whatsapp:{cfg['from_number']}",
        "ContentSid": cfg["content_sid"],
        "ContentVariables": _json.dumps({"1": code}),
    }

    basic = base64.b64encode(f"{cfg['account_sid']}:{cfg['auth_token']}".encode("utf-8")).decode("ascii")
    url = f"{TWILIO_CONTENT_API_ROOT}/Accounts/{cfg['account_sid']}/Messages.json"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                data=form,
                headers={
                    "Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
    except httpx.HTTPError as exc:
        logger.error("[otp] Échec réseau Twilio (WhatsApp) pour %s : %s", mask_phone(phone), exc)
        raise PhoneAuthError(
            "Impossible d'envoyer le code par WhatsApp pour le moment. Réessayez dans un instant.",
            status_code=502,
        ) from exc

    if response.status_code >= 300:
        detail = ""
        try:
            detail = str(response.json().get("message", ""))
        except ValueError:
            detail = response.text[:200]
        logger.error(
            "[otp] Twilio a refusé l'envoi WhatsApp vers %s (status=%s) : %s",
            mask_phone(phone),
            response.status_code,
            detail,
        )
        raise PhoneAuthError(
            "Ce numéro n'a pas pu être joint par WhatsApp. Vérifiez qu'il est bien relié à un compte "
            "WhatsApp, ou choisissez l'envoi par SMS.",
            status_code=502,
        )

    try:
        status_value = str(response.json().get("status", "sent"))
    except ValueError:
        status_value = "sent"

    logger.info("[otp] WhatsApp envoyé à %s (statut Twilio=%s)", mask_phone(phone), status_value)
    return True, status_value


async def send_otp_code(channel: str, phone: str, code: str) -> Tuple[bool, str]:
    """Dispatch de l'envoi vers le canal demandé (sms par défaut)."""
    if channel == "whatsapp":
        return await send_whatsapp_code(phone, code)
    return await send_sms_code(phone, code)


class PhoneAuthService:
    """Orchestration des OTP et du profil minimal passager."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Limitation de débit ---

    async def _enforce_send_limits(self, phone: str, request_ip: str) -> None:
        now = _now()

        last_result = await self.db.execute(
            select(Phone_otp_requests)
            .where(Phone_otp_requests.phone == phone)
            .order_by(Phone_otp_requests.id.desc())
            .limit(1)
        )
        last = last_result.scalar_one_or_none()
        if last is not None:
            created = _as_aware(last.created_at) or now
            elapsed = (now - created).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                wait = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed) or 1
                raise PhoneAuthError(
                    f"Un code vient d'être envoyé. Patientez {wait} seconde(s) avant de redemander.",
                    status_code=429,
                    retry_after=wait,
                )

        phone_window_start = now - timedelta(seconds=OTP_PHONE_WINDOW_SECONDS)
        phone_count_result = await self.db.execute(
            select(func.count(Phone_otp_requests.id)).where(
                Phone_otp_requests.phone == phone,
                Phone_otp_requests.created_at >= phone_window_start,
            )
        )
        if (phone_count_result.scalar() or 0) >= OTP_MAX_PER_PHONE_WINDOW:
            raise PhoneAuthError(
                "Trop de demandes pour ce numéro. Réessayez dans 15 minutes.",
                status_code=429,
                retry_after=OTP_PHONE_WINDOW_SECONDS,
            )

        if request_ip:
            ip_window_start = now - timedelta(seconds=OTP_IP_WINDOW_SECONDS)
            ip_count_result = await self.db.execute(
                select(func.count(Phone_otp_requests.id)).where(
                    Phone_otp_requests.request_ip == request_ip,
                    Phone_otp_requests.created_at >= ip_window_start,
                )
            )
            if (ip_count_result.scalar() or 0) >= OTP_MAX_PER_IP_WINDOW:
                raise PhoneAuthError(
                    "Trop de demandes depuis cet appareil. Réessayez plus tard.",
                    status_code=429,
                    retry_after=OTP_IP_WINDOW_SECONDS,
                )

    # --- Envoi ---

    async def create_otp(self, phone: str, request_ip: str, channel: str = DEFAULT_OTP_CHANNEL) -> Dict[str, Any]:
        """Crée un OTP en base puis clôture la transaction avant l'envoi (SMS ou WhatsApp)."""
        if channel not in OTP_CHANNELS:
            channel = DEFAULT_OTP_CHANNEL

        await self._enforce_send_limits(phone, request_ip)

        # Invalide les codes précédents encore actifs (un seul code valide à la fois)
        pending_result = await self.db.execute(
            select(Phone_otp_requests).where(
                Phone_otp_requests.phone == phone,
                Phone_otp_requests.consumed.is_(False),
            )
        )
        for pending in pending_result.scalars().all():
            pending.consumed = True

        code = _generate_code()
        record = Phone_otp_requests(
            phone=phone,
            code_hash=_hash_code(phone, code),
            expires_at=_now() + timedelta(seconds=OTP_TTL_SECONDS),
            attempts=0,
            consumed=False,
            request_ip=request_ip or None,
            delivery_status="pending",
            channel=channel,
        )
        self.db.add(record)
        await self.db.commit()

        return {"otp_id": record.id, "code": code, "channel": channel}

    async def mark_delivery(self, otp_id: int, status_value: str) -> None:
        """Met à jour le statut de livraison dans une phase DB distincte."""
        result = await self.db.execute(select(Phone_otp_requests).where(Phone_otp_requests.id == otp_id))
        record = result.scalar_one_or_none()
        if record is None:
            return
        record.delivery_status = status_value
        if status_value == "failed":
            record.consumed = True
        await self.db.commit()

    # --- Vérification ---

    async def verify_otp(self, phone: str, code: str) -> None:
        """Valide le code : usage unique, expiration et tentatives limitées."""
        cleaned_code = re.sub(r"\D", "", code or "")
        if len(cleaned_code) != OTP_LENGTH:
            raise PhoneAuthError(f"Le code doit contenir {OTP_LENGTH} chiffres.")

        result = await self.db.execute(
            select(Phone_otp_requests)
            .where(
                Phone_otp_requests.phone == phone,
                Phone_otp_requests.consumed.is_(False),
            )
            .order_by(Phone_otp_requests.id.desc())
            .limit(1)
        )
        record = result.scalar_one_or_none()

        if record is None:
            raise PhoneAuthError("Aucun code actif pour ce numéro. Demandez un nouveau code.")

        expires_at = _as_aware(record.expires_at)
        if expires_at is not None and expires_at < _now():
            record.consumed = True
            await self.db.commit()
            raise PhoneAuthError("Ce code a expiré. Demandez un nouveau code.")

        attempts = record.attempts or 0
        if attempts >= OTP_MAX_ATTEMPTS:
            record.consumed = True
            await self.db.commit()
            raise PhoneAuthError(
                "Trop de tentatives incorrectes. Demandez un nouveau code.",
                status_code=429,
            )

        if not hmac.compare_digest(record.code_hash, _hash_code(phone, cleaned_code)):
            record.attempts = attempts + 1
            remaining = max(0, OTP_MAX_ATTEMPTS - record.attempts)
            if remaining == 0:
                record.consumed = True
            await self.db.commit()
            if remaining == 0:
                raise PhoneAuthError(
                    "Trop de tentatives incorrectes. Demandez un nouveau code.",
                    status_code=429,
                )
            raise PhoneAuthError(f"Code incorrect. Il vous reste {remaining} tentative(s).")

        # Succès : usage unique
        record.consumed = True
        record.delivery_status = "verified"
        await self.db.commit()

    # --- Utilisateur et profil ---

    async def get_or_create_phone_user(self, phone: str) -> User:
        """Crée ou récupère l'utilisateur associé au numéro, sans email ni mot de passe."""
        user_id = user_id_for_phone(phone)
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(id=user_id, email="", name=None, role="user", last_login=_now())
            self.db.add(user)
        else:
            user.last_login = _now()

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def get_passenger(self, user_id: str) -> Optional[Passengers]:
        result = await self.db.execute(
            select(Passengers).where(Passengers.user_id == user_id).order_by(Passengers.id.asc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def ensure_passenger(self, user_id: str, phone: str) -> Passengers:
        """Crée idempotemment la fiche passager rattachée au numéro."""
        passenger = await self.get_passenger(user_id)
        if passenger is not None:
            if not passenger.phone:
                passenger.phone = phone
                await self.db.commit()
                await self.db.refresh(passenger)
            return passenger

        passenger = Passengers(
            user_id=user_id,
            first_name="",
            phone=phone,
            city=None,
            wallet_balance=0,
            has_pending_debt=False,
            debt_amount=0,
            total_rides=0,
            co2_saved=0,
        )
        self.db.add(passenger)
        await self.db.commit()
        await self.db.refresh(passenger)
        return passenger

    async def save_profile(self, user_id: str, first_name: str, city: str) -> Passengers:
        """Enregistre le profil minimal : prénom + ville."""
        clean_first_name = (first_name or "").strip()
        clean_city = (city or "").strip()

        if len(clean_first_name) < 2:
            raise PhoneAuthError("Veuillez saisir votre prénom (2 caractères minimum).")
        if len(clean_first_name) > 60:
            raise PhoneAuthError("Le prénom est trop long.")
        if len(clean_city) < 2:
            raise PhoneAuthError("Veuillez indiquer votre ville.")
        if len(clean_city) > 60:
            raise PhoneAuthError("Le nom de la ville est trop long.")

        passenger = await self.get_passenger(user_id)
        if passenger is None:
            raise PhoneAuthError("Profil introuvable. Reconnectez-vous.", status_code=404)

        passenger.first_name = clean_first_name
        passenger.city = clean_city

        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is not None:
            user.name = clean_first_name

        await self.db.commit()
        await self.db.refresh(passenger)
        return passenger

    @staticmethod
    def is_profile_complete(passenger: Optional[Passengers]) -> bool:
        if passenger is None:
            return False
        return bool((passenger.first_name or "").strip()) and bool((passenger.city or "").strip())