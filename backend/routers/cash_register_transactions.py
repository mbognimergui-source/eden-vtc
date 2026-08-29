import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.cash_register_transactions import Cash_register_transactionsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/cash_register_transactions", tags=["cash_register_transactions"])


# ---------- Pydantic Schemas ----------
class Cash_register_transactionsData(BaseModel):
    """Entity data schema (for create/update)"""
    account_type: str
    operation: str
    amount: int
    ride_id: int = None
    passenger_id: int = None
    description: str
    balance_after: int = None


class Cash_register_transactionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    account_type: Optional[str] = None
    operation: Optional[str] = None
    amount: Optional[int] = None
    ride_id: Optional[int] = None
    passenger_id: Optional[int] = None
    description: Optional[str] = None
    balance_after: Optional[int] = None


class Cash_register_transactionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    account_type: str
    operation: str
    amount: int
    ride_id: Optional[int] = None
    passenger_id: Optional[int] = None
    description: str
    balance_after: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Cash_register_transactionsListResponse(BaseModel):
    """List response schema"""
    items: List[Cash_register_transactionsResponse]
    total: int
    skip: int
    limit: int


class Cash_register_transactionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Cash_register_transactionsData]


class Cash_register_transactionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Cash_register_transactionsUpdateData


class Cash_register_transactionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Cash_register_transactionsBatchUpdateItem]


class Cash_register_transactionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Cash_register_transactionsListResponse)
async def query_cash_register_transactionss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query cash_register_transactionss with filtering, sorting, and pagination"""
    logger.debug(f"Querying cash_register_transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Cash_register_transactionsService(db)
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
        logger.debug(f"Found {result['total']} cash_register_transactionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid cash_register_transactions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying cash_register_transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Cash_register_transactionsListResponse)
async def query_cash_register_transactionss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query cash_register_transactionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying cash_register_transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Cash_register_transactionsService(db)
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
        logger.debug(f"Found {result['total']} cash_register_transactionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid cash_register_transactions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying cash_register_transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Cash_register_transactionsResponse)
async def get_cash_register_transactions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cash_register_transactions by ID"""
    logger.debug(f"Fetching cash_register_transactions with id: {id}, fields={fields}")
    
    service = Cash_register_transactionsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Cash_register_transactions with id {id} not found")
            raise HTTPException(status_code=404, detail="Cash_register_transactions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching cash_register_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Cash_register_transactionsResponse, status_code=201)
async def create_cash_register_transactions(
    data: Cash_register_transactionsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new cash_register_transactions"""
    logger.debug(f"Creating new cash_register_transactions with data: {data}")
    
    service = Cash_register_transactionsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create cash_register_transactions")
        
        logger.info(f"Cash_register_transactions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating cash_register_transactions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating cash_register_transactions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Cash_register_transactionsResponse], status_code=201)
async def create_cash_register_transactionss_batch(
    request: Cash_register_transactionsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple cash_register_transactionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} cash_register_transactionss")
    
    service = Cash_register_transactionsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} cash_register_transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Cash_register_transactionsResponse])
async def update_cash_register_transactionss_batch(
    request: Cash_register_transactionsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple cash_register_transactionss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} cash_register_transactionss")
    
    service = Cash_register_transactionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} cash_register_transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Cash_register_transactionsResponse)
async def update_cash_register_transactions(
    id: int,
    data: Cash_register_transactionsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing cash_register_transactions"""
    logger.debug(f"Updating cash_register_transactions {id} with data: {data}")

    service = Cash_register_transactionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Cash_register_transactions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Cash_register_transactions not found")
        
        logger.info(f"Cash_register_transactions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating cash_register_transactions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating cash_register_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_cash_register_transactionss_batch(
    request: Cash_register_transactionsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple cash_register_transactionss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} cash_register_transactionss")
    
    service = Cash_register_transactionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} cash_register_transactionss successfully")
        return {"message": f"Successfully deleted {deleted_count} cash_register_transactionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_cash_register_transactions(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single cash_register_transactions by ID"""
    logger.debug(f"Deleting cash_register_transactions with id: {id}")
    
    service = Cash_register_transactionsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Cash_register_transactions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Cash_register_transactions not found")
        
        logger.info(f"Cash_register_transactions {id} deleted successfully")
        return {"message": "Cash_register_transactions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cash_register_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")