# @File: backend/routers/ai_images.py
# @Desc: API route for AI image generation (admin marketing)
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List

from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenImgRequest

router = APIRouter(prefix="/api/v1/ai-images", tags=["ai-images"])

# Pre-configured prompts for EDEN VTC marketing
PRESET_PROMPTS = {
    "banner_hero": "Professional hero banner for EDEN VTC, luxury electric vehicle taxi service in Douala Cameroon, sleek modern electric car on African city road, deep blue (#1F4E5F) and gold (#C9A227) color scheme, premium quality, photorealistic, wide format",
    "social_post": "Instagram-style social media post for EDEN VTC electric taxi service in Africa, modern electric vehicle, vibrant Douala cityscape background, eco-friendly green transport theme, deep blue and gold accents, professional marketing material",
    "flyer_promo": "Promotional flyer design for EDEN VTC, 100% electric VTC service in Cameroon, showing luxury electric car with African passengers, deep blue (#1F4E5F) background with gold (#C9A227) text accents, clean modern design, professional",
    "driver_recruit": "Recruitment poster for EDEN VTC drivers in Cameroon, professional African driver next to modern electric vehicle, welcoming and professional atmosphere, deep blue and gold brand colors, text space for job details",
    "eco_campaign": "Environmental campaign visual for EDEN VTC, showing contrast between polluting taxis and clean electric EDEN VTC vehicles in African city, green nature elements, sustainability message, professional marketing quality",
}


class ImageGenerateRequest(BaseModel):
    prompt: str
    preset: Optional[str] = None  # key from PRESET_PROMPTS
    size: Optional[str] = "1024x1024"
    quality: Optional[str] = "standard"


class ImageGenerateResponse(BaseModel):
    image_url: str
    prompt_used: str


class PresetsResponse(BaseModel):
    presets: dict


@router.get("/presets", response_model=PresetsResponse)
async def get_presets(
    current_user: UserResponse = Depends(get_current_user),
):
    """Get available preset prompts for image generation"""
    return PresetsResponse(presets=PRESET_PROMPTS)


@router.post("/generate", response_model=ImageGenerateResponse)
async def generate_image(
    data: ImageGenerateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Generate a marketing image using AI"""
    try:
        service = AIHubService()

        # Use preset if specified, otherwise use custom prompt
        if data.preset and data.preset in PRESET_PROMPTS:
            prompt = PRESET_PROMPTS[data.preset]
            # Append custom additions if provided
            if data.prompt and data.prompt != data.preset:
                prompt = f"{prompt}. Additional details: {data.prompt}"
        else:
            # Add EDEN VTC branding context to custom prompts
            prompt = f"{data.prompt}. Brand: EDEN VTC, colors deep blue #1F4E5F and gold #C9A227, electric vehicles, Cameroon Africa context"

        request = GenImgRequest(
            prompt=prompt,
            model="gpt-image-2",
            size=data.size or "1024x1024",
            quality=data.quality or "standard",
            n=1,
        )

        response = await service.genimg(request)

        # Get image URL from response
        image_url = ""
        if response.images and len(response.images) > 0:
            image_url = response.images[0]

        return ImageGenerateResponse(
            image_url=image_url,
            prompt_used=prompt,
        )

    except Exception as e:
        logging.error(f"Image generation error: {e}")
        return ImageGenerateResponse(
            image_url="",
            prompt_used=f"Erreur: {str(e)}",
        )