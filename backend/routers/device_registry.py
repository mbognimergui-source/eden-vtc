import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.device_registry import Device_registryService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/device_registry", tags=["device_registry"])


# ---------- Pydantic Schemas ----------
class Device_registryData(BaseModel):
    """Entity data schema (for create/update)"""
    device_fingerprint: str
    passenger_id: int = None
    has_debt_flag: bool = None
    debt_amount_at_register: int = None
    install_count: int = None
    last_seen_at: Optional[datetime] = None
    is_blocked: bool = None
    block_reason: str = None


class Device_registryUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    device_fingerprint: Optional[str] = None
    passenger_id: Optional[int] = None
    has_debt_flag: Optional[bool] = None
    debt_amount_at_register: Optional[int] = None
    install_count: Optional[int] = None
    last_seen_at: Optional[datetime] = None
    is_blocked: Optional[bool] = None
    block_reason: Optional[str] = None


class Device_registryResponse(BaseModel):
    """Entity response schema"""
    id: int
    device_fingerprint: str
    passenger_id: Optional[int] = None
    has_debt_flag: Optional[bool] = None
    debt_amount_at_register: Optional[int] = None
    install_count: Optional[int] = None
    last_seen_at: Optional[datetime] = None
    is_blocked: Optional[bool] = None
    block_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Device_registryListResponse(BaseModel):
    """List response schema"""
    items: List[Device_registryResponse]
    total: int
    skip: int
    limit: int


class Device_registryBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Device_registryData]


class Device_registryBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Device_registryUpdateData


class Device_registryBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Device_registryBatchUpdateItem]


class Device_registryBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Device_registryListResponse)
async def query_device_registrys(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query device_registrys with filtering, sorting, and pagination"""
    logger.debug(f"Querying device_registrys: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Device_registryService(db)
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
        logger.debug(f"Found {result['total']} device_registrys")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid device_registry query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying device_registrys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Device_registryListResponse)
async def query_device_registrys_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query device_registrys with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying device_registrys: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Device_registryService(db)
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
        logger.debug(f"Found {result['total']} device_registrys")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid device_registry query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying device_registrys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Device_registryResponse)
async def get_device_registry(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single device_registry by ID"""
    logger.debug(f"Fetching device_registry with id: {id}, fields={fields}")
    
    service = Device_registryService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Device_registry with id {id} not found")
            raise HTTPException(status_code=404, detail="Device_registry not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching device_registry {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Device_registryResponse, status_code=201)
async def create_device_registry(
    data: Device_registryData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new device_registry"""
    logger.debug(f"Creating new device_registry with data: {data}")
    
    service = Device_registryService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create device_registry")
        
        logger.info(f"Device_registry created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating device_registry: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating device_registry: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Device_registryResponse], status_code=201)
async def create_device_registrys_batch(
    request: Device_registryBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple device_registrys in a single request"""
    logger.debug(f"Batch creating {len(request.items)} device_registrys")
    
    service = Device_registryService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} device_registrys successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Device_registryResponse])
async def update_device_registrys_batch(
    request: Device_registryBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple device_registrys in a single request"""
    logger.debug(f"Batch updating {len(request.items)} device_registrys")
    
    service = Device_registryService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} device_registrys successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Device_registryResponse)
async def update_device_registry(
    id: int,
    data: Device_registryUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing device_registry"""
    logger.debug(f"Updating device_registry {id} with data: {data}")

    service = Device_registryService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Device_registry with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Device_registry not found")
        
        logger.info(f"Device_registry {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating device_registry {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating device_registry {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_device_registrys_batch(
    request: Device_registryBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple device_registrys by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} device_registrys")
    
    service = Device_registryService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} device_registrys successfully")
        return {"message": f"Successfully deleted {deleted_count} device_registrys", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_device_registry(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single device_registry by ID"""
    logger.debug(f"Deleting device_registry with id: {id}")
    
    service = Device_registryService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Device_registry with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Device_registry not found")
        
        logger.info(f"Device_registry {id} deleted successfully")
        return {"message": "Device_registry deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting device_registry {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")