import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.vehicles import VehiclesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/vehicles", tags=["vehicles"])


# ---------- Pydantic Schemas ----------
class VehiclesData(BaseModel):
    """Entity data schema (for create/update)"""
    fleet_id: str
    model: str
    brand: str
    license_plate: str
    status: str = None
    km_counter: int = None
    next_maintenance_date: Optional[date] = None
    battery_level: int = None
    zone: str = None


class VehiclesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    fleet_id: Optional[str] = None
    model: Optional[str] = None
    brand: Optional[str] = None
    license_plate: Optional[str] = None
    status: Optional[str] = None
    km_counter: Optional[int] = None
    next_maintenance_date: Optional[date] = None
    battery_level: Optional[int] = None
    zone: Optional[str] = None


class VehiclesResponse(BaseModel):
    """Entity response schema"""
    id: int
    fleet_id: str
    model: str
    brand: str
    license_plate: str
    status: Optional[str] = None
    km_counter: Optional[int] = None
    next_maintenance_date: Optional[date] = None
    battery_level: Optional[int] = None
    zone: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VehiclesListResponse(BaseModel):
    """List response schema"""
    items: List[VehiclesResponse]
    total: int
    skip: int
    limit: int


class VehiclesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[VehiclesData]


class VehiclesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: VehiclesUpdateData


class VehiclesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[VehiclesBatchUpdateItem]


class VehiclesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=VehiclesListResponse)
async def query_vehicless(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Query vehicless with filtering, sorting, and pagination"""
    logger.debug(f"Querying vehicless: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = VehiclesService(db)
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
        logger.debug(f"Found {result['total']} vehicless")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid vehicles query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying vehicless: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=VehiclesListResponse)
async def query_vehicless_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    # Query vehicless with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying vehicless: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = VehiclesService(db)
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
        logger.debug(f"Found {result['total']} vehicless")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid vehicles query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying vehicless: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=VehiclesResponse)
async def get_vehicles(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Get a single vehicles by ID"""
    logger.debug(f"Fetching vehicles with id: {id}, fields={fields}")
    
    service = VehiclesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Vehicles with id {id} not found")
            raise HTTPException(status_code=404, detail="Vehicles not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vehicles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=VehiclesResponse, status_code=201)
async def create_vehicles(
    data: VehiclesData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Create a new vehicles"""
    logger.debug(f"Creating new vehicles with data: {data}")
    
    service = VehiclesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create vehicles")
        
        logger.info(f"Vehicles created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating vehicles: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating vehicles: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[VehiclesResponse], status_code=201)
async def create_vehicless_batch(
    request: VehiclesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Create multiple vehicless in a single request"""
    logger.debug(f"Batch creating {len(request.items)} vehicless")
    
    service = VehiclesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} vehicless successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[VehiclesResponse])
async def update_vehicless_batch(
    request: VehiclesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Update multiple vehicless in a single request"""
    logger.debug(f"Batch updating {len(request.items)} vehicless")
    
    service = VehiclesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} vehicless successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=VehiclesResponse)
async def update_vehicles(
    id: int,
    data: VehiclesUpdateData,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Update an existing vehicles"""
    logger.debug(f"Updating vehicles {id} with data: {data}")

    service = VehiclesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Vehicles with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Vehicles not found")
        
        logger.info(f"Vehicles {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating vehicles {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating vehicles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_vehicless_batch(
    request: VehiclesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Delete multiple vehicless by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} vehicless")
    
    service = VehiclesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} vehicless successfully")
        return {"message": f"Successfully deleted {deleted_count} vehicless", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_vehicles(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Delete a single vehicles by ID"""
    logger.debug(f"Deleting vehicles with id: {id}")
    
    service = VehiclesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Vehicles with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Vehicles not found")
        
        logger.info(f"Vehicles {id} deleted successfully")
        return {"message": "Vehicles deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vehicles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")