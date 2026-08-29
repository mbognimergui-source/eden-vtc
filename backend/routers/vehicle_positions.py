import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.vehicle_positions import Vehicle_positionsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/vehicle_positions", tags=["vehicle_positions"])


# ---------- Pydantic Schemas ----------
class Vehicle_positionsData(BaseModel):
    """Entity data schema (for create/update)"""
    vehicle_id: int
    latitude: float
    longitude: float
    speed: float = None
    heading: float = None
    accuracy: float = None
    status: str = None
    ride_id: int = None
    driver_id: int = None


class Vehicle_positionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    vehicle_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    status: Optional[str] = None
    ride_id: Optional[int] = None
    driver_id: Optional[int] = None


class Vehicle_positionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    vehicle_id: int
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    status: Optional[str] = None
    ride_id: Optional[int] = None
    driver_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Vehicle_positionsListResponse(BaseModel):
    """List response schema"""
    items: List[Vehicle_positionsResponse]
    total: int
    skip: int
    limit: int


class Vehicle_positionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Vehicle_positionsData]


class Vehicle_positionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Vehicle_positionsUpdateData


class Vehicle_positionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Vehicle_positionsBatchUpdateItem]


class Vehicle_positionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Vehicle_positionsListResponse)
async def query_vehicle_positionss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query vehicle_positionss with filtering, sorting, and pagination"""
    logger.debug(f"Querying vehicle_positionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Vehicle_positionsService(db)
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
        logger.debug(f"Found {result['total']} vehicle_positionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid vehicle_positions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying vehicle_positionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Vehicle_positionsListResponse)
async def query_vehicle_positionss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query vehicle_positionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying vehicle_positionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Vehicle_positionsService(db)
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
        logger.debug(f"Found {result['total']} vehicle_positionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid vehicle_positions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying vehicle_positionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Vehicle_positionsResponse)
async def get_vehicle_positions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single vehicle_positions by ID"""
    logger.debug(f"Fetching vehicle_positions with id: {id}, fields={fields}")
    
    service = Vehicle_positionsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Vehicle_positions with id {id} not found")
            raise HTTPException(status_code=404, detail="Vehicle_positions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vehicle_positions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Vehicle_positionsResponse, status_code=201)
async def create_vehicle_positions(
    data: Vehicle_positionsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new vehicle_positions"""
    logger.debug(f"Creating new vehicle_positions with data: {data}")
    
    service = Vehicle_positionsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create vehicle_positions")
        
        logger.info(f"Vehicle_positions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating vehicle_positions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating vehicle_positions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Vehicle_positionsResponse], status_code=201)
async def create_vehicle_positionss_batch(
    request: Vehicle_positionsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple vehicle_positionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} vehicle_positionss")
    
    service = Vehicle_positionsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} vehicle_positionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Vehicle_positionsResponse])
async def update_vehicle_positionss_batch(
    request: Vehicle_positionsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple vehicle_positionss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} vehicle_positionss")
    
    service = Vehicle_positionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} vehicle_positionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Vehicle_positionsResponse)
async def update_vehicle_positions(
    id: int,
    data: Vehicle_positionsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing vehicle_positions"""
    logger.debug(f"Updating vehicle_positions {id} with data: {data}")

    service = Vehicle_positionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Vehicle_positions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Vehicle_positions not found")
        
        logger.info(f"Vehicle_positions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating vehicle_positions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating vehicle_positions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_vehicle_positionss_batch(
    request: Vehicle_positionsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple vehicle_positionss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} vehicle_positionss")
    
    service = Vehicle_positionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} vehicle_positionss successfully")
        return {"message": f"Successfully deleted {deleted_count} vehicle_positionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_vehicle_positions(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single vehicle_positions by ID"""
    logger.debug(f"Deleting vehicle_positions with id: {id}")
    
    service = Vehicle_positionsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Vehicle_positions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Vehicle_positions not found")
        
        logger.info(f"Vehicle_positions {id} deleted successfully")
        return {"message": "Vehicle_positions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vehicle_positions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")