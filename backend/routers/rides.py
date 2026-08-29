import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.rides import RidesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/rides", tags=["rides"])


# ---------- Pydantic Schemas ----------
class RidesData(BaseModel):
    """Entity data schema (for create/update)"""
    passenger_id: int = None
    driver_id: int = None
    vehicle_id: int = None
    status: str = None
    pickup_address: str
    pickup_lat: float = None
    pickup_lng: float = None
    destination_address: str
    destination_lat: float = None
    destination_lng: float = None
    distance_km: float = None
    duration_min: int = None
    estimated_price: int = None
    final_price: int = None
    payment_method: str = None
    payment_status: str = None
    rating: int = None
    comment: str = None
    is_scheduled: bool = None
    scheduled_at: Optional[datetime] = None
    km_start: int = None
    km_end: int = None
    co2_saved: float = None


class RidesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    passenger_id: Optional[int] = None
    driver_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    status: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    destination_address: Optional[str] = None
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    distance_km: Optional[float] = None
    duration_min: Optional[int] = None
    estimated_price: Optional[int] = None
    final_price: Optional[int] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    rating: Optional[int] = None
    comment: Optional[str] = None
    is_scheduled: Optional[bool] = None
    scheduled_at: Optional[datetime] = None
    km_start: Optional[int] = None
    km_end: Optional[int] = None
    co2_saved: Optional[float] = None


class RidesResponse(BaseModel):
    """Entity response schema"""
    id: int
    passenger_id: Optional[int] = None
    driver_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    status: Optional[str] = None
    pickup_address: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    destination_address: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    distance_km: Optional[float] = None
    duration_min: Optional[int] = None
    estimated_price: Optional[int] = None
    final_price: Optional[int] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    rating: Optional[int] = None
    comment: Optional[str] = None
    is_scheduled: Optional[bool] = None
    scheduled_at: Optional[datetime] = None
    km_start: Optional[int] = None
    km_end: Optional[int] = None
    co2_saved: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RidesListResponse(BaseModel):
    """List response schema"""
    items: List[RidesResponse]
    total: int
    skip: int
    limit: int


class RidesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[RidesData]


class RidesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: RidesUpdateData


class RidesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[RidesBatchUpdateItem]


class RidesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=RidesListResponse)
async def query_ridess(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query ridess with filtering, sorting, and pagination"""
    logger.debug(f"Querying ridess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = RidesService(db)
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
        logger.debug(f"Found {result['total']} ridess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid rides query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying ridess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=RidesListResponse)
async def query_ridess_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query ridess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying ridess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = RidesService(db)
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
        logger.debug(f"Found {result['total']} ridess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid rides query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying ridess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=RidesResponse)
async def get_rides(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single rides by ID"""
    logger.debug(f"Fetching rides with id: {id}, fields={fields}")
    
    service = RidesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Rides with id {id} not found")
            raise HTTPException(status_code=404, detail="Rides not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching rides {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=RidesResponse, status_code=201)
async def create_rides(
    data: RidesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new rides"""
    logger.debug(f"Creating new rides with data: {data}")
    
    service = RidesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create rides")
        
        logger.info(f"Rides created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating rides: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating rides: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[RidesResponse], status_code=201)
async def create_ridess_batch(
    request: RidesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple ridess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} ridess")
    
    service = RidesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} ridess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[RidesResponse])
async def update_ridess_batch(
    request: RidesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple ridess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} ridess")
    
    service = RidesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} ridess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=RidesResponse)
async def update_rides(
    id: int,
    data: RidesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing rides"""
    logger.debug(f"Updating rides {id} with data: {data}")

    service = RidesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Rides with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Rides not found")
        
        logger.info(f"Rides {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating rides {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating rides {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_ridess_batch(
    request: RidesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple ridess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} ridess")
    
    service = RidesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} ridess successfully")
        return {"message": f"Successfully deleted {deleted_count} ridess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_rides(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single rides by ID"""
    logger.debug(f"Deleting rides with id: {id}")
    
    service = RidesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Rides with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Rides not found")
        
        logger.info(f"Rides {id} deleted successfully")
        return {"message": "Rides deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting rides {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")