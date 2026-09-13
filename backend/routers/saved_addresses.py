import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.saved_addresses import Saved_addressesService
from dependencies.auth import get_current_user, get_admin_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/saved_addresses", tags=["saved_addresses"])


# ---------- Pydantic Schemas ----------
class Saved_addressesData(BaseModel):
    """Entity data schema (for create/update)"""
    label: str
    address: str
    lat: float
    lng: float
    icon: str = None
    is_default: bool = None
    use_count: int = None


class Saved_addressesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    label: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = None
    use_count: Optional[int] = None


class Saved_addressesResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    label: str
    address: str
    lat: float
    lng: float
    icon: Optional[str] = None
    is_default: Optional[bool] = None
    use_count: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Saved_addressesListResponse(BaseModel):
    """List response schema"""
    items: List[Saved_addressesResponse]
    total: int
    skip: int
    limit: int


class Saved_addressesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Saved_addressesData]


class Saved_addressesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Saved_addressesUpdateData


class Saved_addressesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Saved_addressesBatchUpdateItem]


class Saved_addressesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Saved_addressesListResponse)
async def query_saved_addressess(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query saved_addressess with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying saved_addressess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Saved_addressesService(db)
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
        logger.debug(f"Found {result['total']} saved_addressess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid saved_addresses query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying saved_addressess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Saved_addressesListResponse)
async def query_saved_addressess_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    # Query saved_addressess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying saved_addressess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Saved_addressesService(db)
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
        logger.debug(f"Found {result['total']} saved_addressess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid saved_addresses query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying saved_addressess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Saved_addressesResponse)
async def get_saved_addresses(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single saved_addresses by ID (user can only see their own records)"""
    logger.debug(f"Fetching saved_addresses with id: {id}, fields={fields}")
    
    service = Saved_addressesService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Saved_addresses with id {id} not found")
            raise HTTPException(status_code=404, detail="Saved_addresses not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching saved_addresses {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Saved_addressesResponse, status_code=201)
async def create_saved_addresses(
    data: Saved_addressesData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new saved_addresses"""
    logger.debug(f"Creating new saved_addresses with data: {data}")
    
    service = Saved_addressesService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create saved_addresses")
        
        logger.info(f"Saved_addresses created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating saved_addresses: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating saved_addresses: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Saved_addressesResponse], status_code=201)
async def create_saved_addressess_batch(
    request: Saved_addressesBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple saved_addressess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} saved_addressess")
    
    service = Saved_addressesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} saved_addressess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Saved_addressesResponse])
async def update_saved_addressess_batch(
    request: Saved_addressesBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple saved_addressess in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} saved_addressess")
    
    service = Saved_addressesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} saved_addressess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Saved_addressesResponse)
async def update_saved_addresses(
    id: int,
    data: Saved_addressesUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing saved_addresses (requires ownership)"""
    logger.debug(f"Updating saved_addresses {id} with data: {data}")

    service = Saved_addressesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Saved_addresses with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Saved_addresses not found")
        
        logger.info(f"Saved_addresses {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating saved_addresses {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating saved_addresses {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_saved_addressess_batch(
    request: Saved_addressesBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple saved_addressess by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} saved_addressess")
    
    service = Saved_addressesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} saved_addressess successfully")
        return {"message": f"Successfully deleted {deleted_count} saved_addressess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_saved_addresses(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single saved_addresses by ID (requires ownership)"""
    logger.debug(f"Deleting saved_addresses with id: {id}")
    
    service = Saved_addressesService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Saved_addresses with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Saved_addresses not found")
        
        logger.info(f"Saved_addresses {id} deleted successfully")
        return {"message": "Saved_addresses deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting saved_addresses {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")