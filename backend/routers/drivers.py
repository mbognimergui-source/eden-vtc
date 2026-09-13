import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_admin_user, get_current_user
from schemas.auth import UserResponse
from services.drivers import DriversService
from services.phone_auth import normalize_phone, user_id_for_phone, PhoneAuthError

# Champs qu'un chauffeur peut modifier lui-même sur SA PROPRE fiche (statut
# en ligne/hors ligne, déclenché par le bouton bascule du tableau de bord).
# Tout le reste (salaire, note, véhicule assigné, user_id, ...) est une
# donnée RH/flotte réservée aux administrateurs.
DRIVER_SELF_EDITABLE_FIELDS = {"status"}

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/drivers", tags=["drivers"])


# ---------- Pydantic Schemas ----------
class DriversData(BaseModel):
    """Entity data schema (for create/update)"""
    user_id: str = None
    first_name: str
    last_name: str
    phone: str
    status: str = None
    vehicle_id: int = None
    license_number: str = None
    rating: float = None
    total_rides: int = None
    daily_earnings: int = None
    zone: str = None
    employee_id: str = None
    employment_type: str = None
    monthly_base_salary: int = None
    hire_date: date = None
    payout_account: str = None


class DriversUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    user_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    vehicle_id: Optional[int] = None
    license_number: Optional[str] = None
    rating: Optional[float] = None
    total_rides: Optional[int] = None
    daily_earnings: Optional[int] = None
    zone: Optional[str] = None
    employee_id: Optional[str] = None
    employment_type: Optional[str] = None
    monthly_base_salary: Optional[int] = None
    hire_date: Optional[date] = None
    payout_account: Optional[str] = None


class DriversResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: Optional[str] = None
    first_name: str
    last_name: str
    phone: str
    status: Optional[str] = None
    vehicle_id: Optional[int] = None
    license_number: Optional[str] = None
    rating: Optional[float] = None
    total_rides: Optional[int] = None
    daily_earnings: Optional[int] = None
    zone: Optional[str] = None
    employee_id: Optional[str] = None
    employment_type: Optional[str] = None
    monthly_base_salary: Optional[int] = None
    hire_date: Optional[date] = None
    payout_account: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DriversListResponse(BaseModel):
    """List response schema"""
    items: List[DriversResponse]
    total: int
    skip: int
    limit: int


class DriversBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[DriversData]


class DriversBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: DriversUpdateData


class DriversBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[DriversBatchUpdateItem]


class DriversBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=DriversListResponse)
async def query_driverss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Query driverss with filtering, sorting, and pagination"""
    logger.debug(f"Querying driverss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = DriversService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )
        logger.debug(f"Found {result['total']} driverss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid drivers query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying driverss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=DriversListResponse)
async def query_driverss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    # Query driverss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying driverss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = DriversService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} driverss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid drivers query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying driverss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=DriversResponse)
async def get_drivers(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Get a single drivers by ID"""
    logger.debug(f"Fetching drivers with id: {id}, fields={fields}")
    
    service = DriversService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Drivers with id {id} not found")
            raise HTTPException(status_code=404, detail="Drivers not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching drivers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=DriversResponse, status_code=201)
async def create_drivers(
    data: DriversData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Create a new drivers (admin only — fleet/HR data)."""
    logger.debug(f"Creating new drivers with data: {data}")

    service = DriversService(db)
    try:
        create_data = data.model_dump()
        # Relie automatiquement la fiche chauffeur au compte applicatif : le
        # même identifiant déterministe que l'authentification par téléphone
        # (services.phone_auth.user_id_for_phone) est dérivé ici à partir du
        # numéro saisi par l'administrateur. Dès que ce numéro se connecte
        # par OTP, il retrouve automatiquement SA fiche chauffeur — aucune
        # étape de liaison manuelle supplémentaire n'est nécessaire. Un
        # user_id fourni explicitement par l'appelant reste prioritaire.
        if not create_data.get("user_id") and create_data.get("phone"):
            try:
                create_data["user_id"] = user_id_for_phone(normalize_phone(create_data["phone"]))
            except PhoneAuthError:
                # Numéro dans un format non reconnu par la normalisation E.164 :
                # on laisse la fiche sans lien de compte plutôt que d'échouer
                # la création — un admin pourra corriger le numéro ensuite.
                pass
        result = await service.create(create_data)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create drivers")
        
        logger.info(f"Drivers created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating drivers: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating drivers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[DriversResponse], status_code=201)
async def create_driverss_batch(
    request: DriversBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Create multiple driverss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} driverss")
    
    service = DriversService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} driverss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[DriversResponse])
async def update_driverss_batch(
    request: DriversBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Update multiple driverss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} driverss")
    
    service = DriversService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} driverss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=DriversResponse)
async def update_drivers(
    id: int,
    data: DriversUpdateData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Update an existing drivers.

    Un administrateur peut modifier n'importe quel champ de n'importe quel
    chauffeur. Un chauffeur ne peut modifier que SA PROPRE fiche, et
    uniquement les champs de DRIVER_SELF_EDITABLE_FIELDS (le statut en
    ligne/hors ligne) — pas son salaire, sa note, son véhicule assigné, ni
    surtout le user_id qui relie la fiche à son compte."""
    logger.debug(f"Updating drivers {id} with data: {data}")

    service = DriversService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}

        if current_user.role != "admin":
            existing = await service.get_by_id(id)
            if not existing:
                raise HTTPException(status_code=404, detail="Drivers not found")
            if getattr(existing, "user_id", None) != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="Vous ne pouvez modifier que votre propre fiche chauffeur.",
                )
            disallowed = set(update_dict) - DRIVER_SELF_EDITABLE_FIELDS
            if disallowed:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Un chauffeur ne peut modifier que son statut (en ligne/hors ligne). "
                        f"Champ(s) non autorisé(s) : {', '.join(sorted(disallowed))}."
                    ),
                )

        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Drivers with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Drivers not found")
        
        logger.info(f"Drivers {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating drivers {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating drivers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_driverss_batch(
    request: DriversBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Delete multiple driverss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} driverss")
    
    service = DriversService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} driverss successfully")
        return {"message": f"Successfully deleted {deleted_count} driverss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_drivers(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Delete a single drivers by ID"""
    logger.debug(f"Deleting drivers with id: {id}")
    
    service = DriversService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Drivers with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Drivers not found")
        
        logger.info(f"Drivers {id} deleted successfully")
        return {"message": "Drivers deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting drivers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")