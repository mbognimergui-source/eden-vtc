import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.security_alerts import Security_alertsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/security_alerts", tags=["security_alerts"])


# ---------- Pydantic Schemas ----------
class Security_alertsData(BaseModel):
    """Entity data schema (for create/update)"""
    alert_type: str
    severity: str
    source_ip: str = None
    target_path: str = None
    description: str
    details: str = None
    is_resolved: bool = None
    resolved_by: str = None
    resolved_at: str = None


class Security_alertsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    alert_type: Optional[str] = None
    severity: Optional[str] = None
    source_ip: Optional[str] = None
    target_path: Optional[str] = None
    description: Optional[str] = None
    details: Optional[str] = None
    is_resolved: Optional[bool] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None


class Security_alertsResponse(BaseModel):
    """Entity response schema"""
    id: int
    alert_type: str
    severity: str
    source_ip: Optional[str] = None
    target_path: Optional[str] = None
    description: str
    details: Optional[str] = None
    is_resolved: Optional[bool] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Security_alertsListResponse(BaseModel):
    """List response schema"""
    items: List[Security_alertsResponse]
    total: int
    skip: int
    limit: int


class Security_alertsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Security_alertsData]


class Security_alertsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Security_alertsUpdateData


class Security_alertsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Security_alertsBatchUpdateItem]


class Security_alertsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Security_alertsListResponse)
async def query_security_alertss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query security_alertss with filtering, sorting, and pagination"""
    logger.debug(f"Querying security_alertss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Security_alertsService(db)
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
        logger.debug(f"Found {result['total']} security_alertss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid security_alerts query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying security_alertss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Security_alertsListResponse)
async def query_security_alertss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query security_alertss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying security_alertss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Security_alertsService(db)
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
        logger.debug(f"Found {result['total']} security_alertss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid security_alerts query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying security_alertss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Security_alertsResponse)
async def get_security_alerts(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single security_alerts by ID"""
    logger.debug(f"Fetching security_alerts with id: {id}, fields={fields}")
    
    service = Security_alertsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Security_alerts with id {id} not found")
            raise HTTPException(status_code=404, detail="Security_alerts not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching security_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Security_alertsResponse, status_code=201)
async def create_security_alerts(
    data: Security_alertsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new security_alerts"""
    logger.debug(f"Creating new security_alerts with data: {data}")
    
    service = Security_alertsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create security_alerts")
        
        logger.info(f"Security_alerts created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating security_alerts: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating security_alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Security_alertsResponse], status_code=201)
async def create_security_alertss_batch(
    request: Security_alertsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple security_alertss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} security_alertss")
    
    service = Security_alertsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} security_alertss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Security_alertsResponse])
async def update_security_alertss_batch(
    request: Security_alertsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple security_alertss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} security_alertss")
    
    service = Security_alertsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} security_alertss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Security_alertsResponse)
async def update_security_alerts(
    id: int,
    data: Security_alertsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing security_alerts"""
    logger.debug(f"Updating security_alerts {id} with data: {data}")

    service = Security_alertsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Security_alerts with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Security_alerts not found")
        
        logger.info(f"Security_alerts {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating security_alerts {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating security_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_security_alertss_batch(
    request: Security_alertsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple security_alertss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} security_alertss")
    
    service = Security_alertsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} security_alertss successfully")
        return {"message": f"Successfully deleted {deleted_count} security_alertss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_security_alerts(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single security_alerts by ID"""
    logger.debug(f"Deleting security_alerts with id: {id}")
    
    service = Security_alertsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Security_alerts with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Security_alerts not found")
        
        logger.info(f"Security_alerts {id} deleted successfully")
        return {"message": "Security_alerts deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting security_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")