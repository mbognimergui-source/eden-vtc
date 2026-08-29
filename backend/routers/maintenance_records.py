import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.maintenance_records import Maintenance_recordsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/maintenance_records", tags=["maintenance_records"])


# ---------- Pydantic Schemas ----------
class Maintenance_recordsData(BaseModel):
    """Entity data schema (for create/update)"""
    vehicle_id: int
    vehicle_fleet_id: str = None
    type: str
    description: str = None
    status: str
    scheduled_date: str = None
    completed_date: str = None
    cost: int = None
    notes: str = None


class Maintenance_recordsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    vehicle_id: Optional[int] = None
    vehicle_fleet_id: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    scheduled_date: Optional[str] = None
    completed_date: Optional[str] = None
    cost: Optional[int] = None
    notes: Optional[str] = None


class Maintenance_recordsResponse(BaseModel):
    """Entity response schema"""
    id: int
    vehicle_id: int
    vehicle_fleet_id: Optional[str] = None
    type: str
    description: Optional[str] = None
    status: str
    scheduled_date: Optional[str] = None
    completed_date: Optional[str] = None
    cost: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Maintenance_recordsListResponse(BaseModel):
    """List response schema"""
    items: List[Maintenance_recordsResponse]
    total: int
    skip: int
    limit: int


class Maintenance_recordsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Maintenance_recordsData]


class Maintenance_recordsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Maintenance_recordsUpdateData


class Maintenance_recordsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Maintenance_recordsBatchUpdateItem]


class Maintenance_recordsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Maintenance_recordsListResponse)
async def query_maintenance_recordss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query maintenance_recordss with filtering, sorting, and pagination"""
    logger.debug(f"Querying maintenance_recordss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Maintenance_recordsService(db)
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
        logger.debug(f"Found {result['total']} maintenance_recordss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid maintenance_records query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying maintenance_recordss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Maintenance_recordsListResponse)
async def query_maintenance_recordss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query maintenance_recordss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying maintenance_recordss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Maintenance_recordsService(db)
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
        logger.debug(f"Found {result['total']} maintenance_recordss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid maintenance_records query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying maintenance_recordss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Maintenance_recordsResponse)
async def get_maintenance_records(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single maintenance_records by ID"""
    logger.debug(f"Fetching maintenance_records with id: {id}, fields={fields}")
    
    service = Maintenance_recordsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Maintenance_records with id {id} not found")
            raise HTTPException(status_code=404, detail="Maintenance_records not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching maintenance_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Maintenance_recordsResponse, status_code=201)
async def create_maintenance_records(
    data: Maintenance_recordsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new maintenance_records"""
    logger.debug(f"Creating new maintenance_records with data: {data}")
    
    service = Maintenance_recordsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create maintenance_records")
        
        logger.info(f"Maintenance_records created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating maintenance_records: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating maintenance_records: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Maintenance_recordsResponse], status_code=201)
async def create_maintenance_recordss_batch(
    request: Maintenance_recordsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple maintenance_recordss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} maintenance_recordss")
    
    service = Maintenance_recordsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} maintenance_recordss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Maintenance_recordsResponse])
async def update_maintenance_recordss_batch(
    request: Maintenance_recordsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple maintenance_recordss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} maintenance_recordss")
    
    service = Maintenance_recordsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} maintenance_recordss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Maintenance_recordsResponse)
async def update_maintenance_records(
    id: int,
    data: Maintenance_recordsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing maintenance_records"""
    logger.debug(f"Updating maintenance_records {id} with data: {data}")

    service = Maintenance_recordsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Maintenance_records with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Maintenance_records not found")
        
        logger.info(f"Maintenance_records {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating maintenance_records {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating maintenance_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_maintenance_recordss_batch(
    request: Maintenance_recordsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple maintenance_recordss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} maintenance_recordss")
    
    service = Maintenance_recordsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} maintenance_recordss successfully")
        return {"message": f"Successfully deleted {deleted_count} maintenance_recordss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_maintenance_records(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single maintenance_records by ID"""
    logger.debug(f"Deleting maintenance_records with id: {id}")
    
    service = Maintenance_recordsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Maintenance_records with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Maintenance_records not found")
        
        logger.info(f"Maintenance_records {id} deleted successfully")
        return {"message": "Maintenance_records deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting maintenance_records {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")