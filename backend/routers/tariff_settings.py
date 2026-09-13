import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_admin_user
from schemas.auth import UserResponse
from services.tariff_settings import Tariff_settingsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/tariff_settings", tags=["tariff_settings"])


# ---------- Pydantic Schemas ----------
class Tariff_settingsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    base_fare: int = None
    price_per_km: int = None
    price_per_min: int = None
    minimum_fare: int = None
    airport_surcharge: int = None
    night_multiplier: float = None
    night_start_hour: int = None
    night_end_hour: int = None
    co2_saved_per_km: float = None
    daily_target: int = None
    alert_threshold_percent: int = None
    zone: str = None
    is_active: bool = None


class Tariff_settingsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    base_fare: Optional[int] = None
    price_per_km: Optional[int] = None
    price_per_min: Optional[int] = None
    minimum_fare: Optional[int] = None
    airport_surcharge: Optional[int] = None
    night_multiplier: Optional[float] = None
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    co2_saved_per_km: Optional[float] = None
    daily_target: Optional[int] = None
    alert_threshold_percent: Optional[int] = None
    zone: Optional[str] = None
    is_active: Optional[bool] = None


class Tariff_settingsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    base_fare: Optional[int] = None
    price_per_km: Optional[int] = None
    price_per_min: Optional[int] = None
    minimum_fare: Optional[int] = None
    airport_surcharge: Optional[int] = None
    night_multiplier: Optional[float] = None
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    co2_saved_per_km: Optional[float] = None
    daily_target: Optional[int] = None
    alert_threshold_percent: Optional[int] = None
    zone: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Tariff_settingsListResponse(BaseModel):
    """List response schema"""
    items: List[Tariff_settingsResponse]
    total: int
    skip: int
    limit: int


class Tariff_settingsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Tariff_settingsData]


class Tariff_settingsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Tariff_settingsUpdateData


class Tariff_settingsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Tariff_settingsBatchUpdateItem]


class Tariff_settingsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Tariff_settingsListResponse)
async def query_tariff_settingss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query tariff_settingss with filtering, sorting, and pagination"""
    logger.debug(f"Querying tariff_settingss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Tariff_settingsService(db)
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
        logger.debug(f"Found {result['total']} tariff_settingss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid tariff_settings query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying tariff_settingss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Tariff_settingsListResponse)
async def query_tariff_settingss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query tariff_settingss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying tariff_settingss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Tariff_settingsService(db)
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
        logger.debug(f"Found {result['total']} tariff_settingss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid tariff_settings query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying tariff_settingss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Tariff_settingsResponse)
async def get_tariff_settings(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single tariff_settings by ID"""
    logger.debug(f"Fetching tariff_settings with id: {id}, fields={fields}")
    
    service = Tariff_settingsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Tariff_settings with id {id} not found")
            raise HTTPException(status_code=404, detail="Tariff_settings not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tariff_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Tariff_settingsResponse, status_code=201)
async def create_tariff_settings(
    data: Tariff_settingsData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Create a new tariff_settings"""
    logger.debug(f"Creating new tariff_settings with data: {data}")
    
    service = Tariff_settingsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create tariff_settings")
        
        logger.info(f"Tariff_settings created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating tariff_settings: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating tariff_settings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Tariff_settingsResponse], status_code=201)
async def create_tariff_settingss_batch(
    request: Tariff_settingsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Create multiple tariff_settingss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} tariff_settingss")
    
    service = Tariff_settingsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} tariff_settingss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Tariff_settingsResponse])
async def update_tariff_settingss_batch(
    request: Tariff_settingsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Update multiple tariff_settingss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} tariff_settingss")
    
    service = Tariff_settingsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} tariff_settingss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Tariff_settingsResponse)
async def update_tariff_settings(
    id: int,
    data: Tariff_settingsUpdateData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Update an existing tariff_settings"""
    logger.debug(f"Updating tariff_settings {id} with data: {data}")

    service = Tariff_settingsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Tariff_settings with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Tariff_settings not found")
        
        logger.info(f"Tariff_settings {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating tariff_settings {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating tariff_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_tariff_settingss_batch(
    request: Tariff_settingsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Delete multiple tariff_settingss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} tariff_settingss")
    
    service = Tariff_settingsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} tariff_settingss successfully")
        return {"message": f"Successfully deleted {deleted_count} tariff_settingss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_tariff_settings(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    """Delete a single tariff_settings by ID"""
    logger.debug(f"Deleting tariff_settings with id: {id}")
    
    service = Tariff_settingsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Tariff_settings with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Tariff_settings not found")
        
        logger.info(f"Tariff_settings {id} deleted successfully")
        return {"message": "Tariff_settings deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tariff_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")