import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.country_tariffs import Country_tariffsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/country_tariffs", tags=["country_tariffs"])


# ---------- Pydantic Schemas ----------
class Country_tariffsData(BaseModel):
    """Entity data schema (for create/update)"""
    country_code: str
    country_name: str
    currency_code: str
    currency_symbol: str
    base_fare: int
    price_per_km: int
    price_per_min: int
    minimum_fare: int
    airport_surcharge: int = None
    night_multiplier: float = None
    night_start_hour: int = None
    night_end_hour: int = None
    daily_target: int = None
    rounding_unit: int = None
    is_active: bool = None


class Country_tariffsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    currency_code: Optional[str] = None
    currency_symbol: Optional[str] = None
    base_fare: Optional[int] = None
    price_per_km: Optional[int] = None
    price_per_min: Optional[int] = None
    minimum_fare: Optional[int] = None
    airport_surcharge: Optional[int] = None
    night_multiplier: Optional[float] = None
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    daily_target: Optional[int] = None
    rounding_unit: Optional[int] = None
    is_active: Optional[bool] = None


class Country_tariffsResponse(BaseModel):
    """Entity response schema"""
    id: int
    country_code: str
    country_name: str
    currency_code: str
    currency_symbol: str
    base_fare: int
    price_per_km: int
    price_per_min: int
    minimum_fare: int
    airport_surcharge: Optional[int] = None
    night_multiplier: Optional[float] = None
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    daily_target: Optional[int] = None
    rounding_unit: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Country_tariffsListResponse(BaseModel):
    """List response schema"""
    items: List[Country_tariffsResponse]
    total: int
    skip: int
    limit: int


class Country_tariffsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Country_tariffsData]


class Country_tariffsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Country_tariffsUpdateData


class Country_tariffsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Country_tariffsBatchUpdateItem]


class Country_tariffsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Country_tariffsListResponse)
async def query_country_tariffss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query country_tariffss with filtering, sorting, and pagination"""
    logger.debug(f"Querying country_tariffss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Country_tariffsService(db)
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
        logger.debug(f"Found {result['total']} country_tariffss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid country_tariffs query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying country_tariffss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Country_tariffsListResponse)
async def query_country_tariffss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query country_tariffss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying country_tariffss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Country_tariffsService(db)
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
        logger.debug(f"Found {result['total']} country_tariffss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid country_tariffs query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying country_tariffss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Country_tariffsResponse)
async def get_country_tariffs(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single country_tariffs by ID"""
    logger.debug(f"Fetching country_tariffs with id: {id}, fields={fields}")
    
    service = Country_tariffsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Country_tariffs with id {id} not found")
            raise HTTPException(status_code=404, detail="Country_tariffs not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching country_tariffs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Country_tariffsResponse, status_code=201)
async def create_country_tariffs(
    data: Country_tariffsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new country_tariffs"""
    logger.debug(f"Creating new country_tariffs with data: {data}")
    
    service = Country_tariffsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create country_tariffs")
        
        logger.info(f"Country_tariffs created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating country_tariffs: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating country_tariffs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Country_tariffsResponse], status_code=201)
async def create_country_tariffss_batch(
    request: Country_tariffsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple country_tariffss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} country_tariffss")
    
    service = Country_tariffsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} country_tariffss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Country_tariffsResponse])
async def update_country_tariffss_batch(
    request: Country_tariffsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple country_tariffss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} country_tariffss")
    
    service = Country_tariffsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} country_tariffss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Country_tariffsResponse)
async def update_country_tariffs(
    id: int,
    data: Country_tariffsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing country_tariffs"""
    logger.debug(f"Updating country_tariffs {id} with data: {data}")

    service = Country_tariffsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Country_tariffs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Country_tariffs not found")
        
        logger.info(f"Country_tariffs {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating country_tariffs {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating country_tariffs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_country_tariffss_batch(
    request: Country_tariffsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple country_tariffss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} country_tariffss")
    
    service = Country_tariffsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} country_tariffss successfully")
        return {"message": f"Successfully deleted {deleted_count} country_tariffss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_country_tariffs(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single country_tariffs by ID"""
    logger.debug(f"Deleting country_tariffs with id: {id}")
    
    service = Country_tariffsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Country_tariffs with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Country_tariffs not found")
        
        logger.info(f"Country_tariffs {id} deleted successfully")
        return {"message": "Country_tariffs deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting country_tariffs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")