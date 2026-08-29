# @File: backend/routers/ai_tts.py
# @Desc: API route for TTS notifications for drivers
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenAudioRequest

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])


class TTSRideRequest(BaseModel):
    pickup_address: str
    destination_address: str
    passenger_name: Optional[str] = None
    estimated_price: Optional[int] = None
    distance_km: Optional[float] = None


class TTSCustomRequest(BaseModel):
    text: str
    gender: Optional[str] = "female"


class TTSResponse(BaseModel):
    audio_url: str
    text: str


@router.post("/ride-notification", response_model=TTSResponse)
async def generate_ride_notification(
    data: TTSRideRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Generate TTS audio for a new ride notification to the driver"""
    try:
        service = AIHubService()

        # Build notification text
        parts = ["Nouvelle course EDEN VTC."]

        if data.passenger_name:
            parts.append(f"Passager : {data.passenger_name}.")

        parts.append(f"Prise en charge : {data.pickup_address}.")
        parts.append(f"Destination : {data.destination_address}.")

        if data.distance_km:
            parts.append(f"Distance estimée : {data.distance_km:.1f} kilomètres.")

        if data.estimated_price:
            price_str = f"{data.estimated_price:,}".replace(",", " ")
            parts.append(f"Prix estimé : {price_str} francs CFA.")

        parts.append("Acceptez-vous cette course ?")

        text = " ".join(parts)

        request = GenAudioRequest(
            text=text,
            model="eleven_v3",
            gender="female",
        )

        response = await service.genaudio(request)

        return TTSResponse(audio_url=response.url, text=text)

    except Exception as e:
        logging.error(f"TTS ride notification error: {e}")
        # Return empty response with error text
        return TTSResponse(
            audio_url="",
            text=f"Erreur de génération audio: {str(e)}"
        )


@router.post("/custom", response_model=TTSResponse)
async def generate_custom_tts(
    data: TTSCustomRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Generate custom TTS audio"""
    try:
        service = AIHubService()

        request = GenAudioRequest(
            text=data.text,
            model="eleven_v3",
            gender=data.gender or "female",
        )

        response = await service.genaudio(request)

        return TTSResponse(audio_url=response.url, text=data.text)

    except Exception as e:
        logging.error(f"TTS custom error: {e}")
        return TTSResponse(
            audio_url="",
            text=f"Erreur de génération audio: {str(e)}"
        )