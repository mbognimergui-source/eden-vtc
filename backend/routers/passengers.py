import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.passengers import PassengersService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/passengers", tags=["passengers"])


# ---------- Pydantic Schemas ----------
class PassengersData(BaseModel):
    """Entity data schema (for create/update)"""
    first_name: str
    last_name: str = None
    phone: str
    city: str = None
    wallet_balance: int = None
    has_pending_debt: bool = None
    debt_amount: int = None
    total_rides: int = None
    co2_saved: float = None


class PassengersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    wallet_balance: Optional[int] = None
    has_pending_debt: Optional[bool] = None
    debt_amount: Optional[int] = None
    total_rides: Optional[int] = None
    co2_saved: Optional[float] = None


class PassengersResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    first_name: str
    last_name: Optional[str] = None
    phone: str
    city: Optional[str] = None
    wallet_balance: Optional[int] = None
    has_pending_debt: Optional[bool] = None
    debt_amount: Optional[int] = None
    total_rides: Optional[int] = None
    co2_saved: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PassengersListResponse(BaseModel):
    """List response schema"""
    items: List[PassengersResponse]
    total: int
    skip: int
    limit: int


class PassengersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[PassengersData]


class PassengersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: PassengersUpdateData


class PassengersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[PassengersBatchUpdateItem]


class PassengersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=PassengersListResponse)
async def query_passengerss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query passengerss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying passengerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = PassengersService(db)
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
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} passengerss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid passengers query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying passengerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=PassengersListResponse)
async def query_passengerss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query passengerss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying passengerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = PassengersService(db)
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
        logger.debug(f"Found {result['total']} passengerss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid passengers query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying passengerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=PassengersResponse)
async def get_passengers(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single passengers by ID (user can only see their own records)"""
    logger.debug(f"Fetching passengers with id: {id}, fields={fields}")
    
    service = PassengersService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Passengers with id {id} not found")
            raise HTTPException(status_code=404, detail="Passengers not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching passengers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=PassengersResponse, status_code=201)
async def create_passengers(
    data: PassengersData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new passengers"""
    logger.debug(f"Creating new passengers with data: {data}")
    
    service = PassengersService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create passengers")
        
        logger.info(f"Passengers created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating passengers: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating passengers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[PassengersResponse], status_code=201)
async def create_passengerss_batch(
    request: PassengersBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple passengerss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} passengerss")
    
    service = PassengersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} passengerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[PassengersResponse])
async def update_passengerss_batch(
    request: PassengersBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple passengerss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} passengerss")
    
    service = PassengersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} passengerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=PassengersResponse)
async def update_passengers(
    id: int,
    data: PassengersUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing passengers (requires ownership)"""
    logger.debug(f"Updating passengers {id} with data: {data}")

    service = PassengersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Passengers with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Passengers not found")
        
        logger.info(f"Passengers {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating passengers {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating passengers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_passengerss_batch(
    request: PassengersBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple passengerss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} passengerss")
    
    service = PassengersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} passengerss successfully")
        return {"message": f"Successfully deleted {deleted_count} passengerss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_passengers(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single passengers by ID (requires ownership)"""
    logger.debug(f"Deleting passengers with id: {id}")
    
    service = PassengersService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Passengers with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Passengers not found")
        
        logger.info(f"Passengers {id} deleted successfully")
        return {"message": "Passengers deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting passengers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")