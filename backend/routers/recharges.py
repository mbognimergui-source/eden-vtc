import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.recharges import RechargesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/recharges", tags=["recharges"])


# ---------- Pydantic Schemas ----------
class RechargesData(BaseModel):
    """Entity data schema (for create/update)"""
    driver_id: int = None
    vehicle_id: int
    station: str
    kwh: float
    price_per_kwh: float = None
    total_cost: int
    km_counter: int = None
    date: Optional[date] = None


class RechargesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    driver_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    station: Optional[str] = None
    kwh: Optional[float] = None
    price_per_kwh: Optional[float] = None
    total_cost: Optional[int] = None
    km_counter: Optional[int] = None
    date: Optional[date] = None


class RechargesResponse(BaseModel):
    """Entity response schema"""
    id: int
    driver_id: Optional[int] = None
    vehicle_id: int
    station: str
    kwh: float
    price_per_kwh: Optional[float] = None
    total_cost: int
    km_counter: Optional[int] = None
    date: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RechargesListResponse(BaseModel):
    """List response schema"""
    items: List[RechargesResponse]
    total: int
    skip: int
    limit: int


class RechargesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[RechargesData]


class RechargesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: RechargesUpdateData


class RechargesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[RechargesBatchUpdateItem]


class RechargesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=RechargesListResponse)
async def query_rechargess(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query rechargess with filtering, sorting, and pagination"""
    logger.debug(f"Querying rechargess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = RechargesService(db)
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
        logger.debug(f"Found {result['total']} rechargess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid recharges query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying rechargess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=RechargesListResponse)
async def query_rechargess_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query rechargess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying rechargess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = RechargesService(db)
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
        logger.debug(f"Found {result['total']} rechargess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid recharges query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying rechargess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=RechargesResponse)
async def get_recharges(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single recharges by ID"""
    logger.debug(f"Fetching recharges with id: {id}, fields={fields}")
    
    service = RechargesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Recharges with id {id} not found")
            raise HTTPException(status_code=404, detail="Recharges not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching recharges {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=RechargesResponse, status_code=201)
async def create_recharges(
    data: RechargesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new recharges"""
    logger.debug(f"Creating new recharges with data: {data}")
    
    service = RechargesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create recharges")
        
        logger.info(f"Recharges created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating recharges: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating recharges: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[RechargesResponse], status_code=201)
async def create_rechargess_batch(
    request: RechargesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple rechargess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} rechargess")
    
    service = RechargesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} rechargess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[RechargesResponse])
async def update_rechargess_batch(
    request: RechargesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple rechargess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} rechargess")
    
    service = RechargesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} rechargess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=RechargesResponse)
async def update_recharges(
    id: int,
    data: RechargesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing recharges"""
    logger.debug(f"Updating recharges {id} with data: {data}")

    service = RechargesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Recharges with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Recharges not found")
        
        logger.info(f"Recharges {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating recharges {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating recharges {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_rechargess_batch(
    request: RechargesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple rechargess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} rechargess")
    
    service = RechargesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} rechargess successfully")
        return {"message": f"Successfully deleted {deleted_count} rechargess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_recharges(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single recharges by ID"""
    logger.debug(f"Deleting recharges with id: {id}")
    
    service = RechargesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Recharges with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Recharges not found")
        
        logger.info(f"Recharges {id} deleted successfully")
        return {"message": "Recharges deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting recharges {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")