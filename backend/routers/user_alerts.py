import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.user_alerts import User_alertsService
from dependencies.auth import get_current_user, get_admin_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/user_alerts", tags=["user_alerts"])


# ---------- Pydantic Schemas ----------
class User_alertsData(BaseModel):
    """Entity data schema (for create/update)"""
    alert_type: str
    severity: str
    title: str
    message: str
    details: str = None
    is_read: bool = None
    is_dismissed: bool = None


class User_alertsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    alert_type: Optional[str] = None
    severity: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    details: Optional[str] = None
    is_read: Optional[bool] = None
    is_dismissed: Optional[bool] = None


class User_alertsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    alert_type: str
    severity: str
    title: str
    message: str
    details: Optional[str] = None
    is_read: Optional[bool] = None
    is_dismissed: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class User_alertsListResponse(BaseModel):
    """List response schema"""
    items: List[User_alertsResponse]
    total: int
    skip: int
    limit: int


class User_alertsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[User_alertsData]


class User_alertsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: User_alertsUpdateData


class User_alertsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[User_alertsBatchUpdateItem]


class User_alertsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=User_alertsListResponse)
async def query_user_alertss(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query user_alertss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying user_alertss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = User_alertsService(db)
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
        logger.debug(f"Found {result['total']} user_alertss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid user_alerts query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying user_alertss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=User_alertsListResponse)
async def query_user_alertss_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_admin_user),
):
    # Query user_alertss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying user_alertss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = User_alertsService(db)
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
        logger.debug(f"Found {result['total']} user_alertss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid user_alerts query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying user_alertss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=User_alertsResponse)
async def get_user_alerts(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single user_alerts by ID (user can only see their own records)"""
    logger.debug(f"Fetching user_alerts with id: {id}, fields={fields}")
    
    service = User_alertsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"User_alerts with id {id} not found")
            raise HTTPException(status_code=404, detail="User_alerts not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=User_alertsResponse, status_code=201)
async def create_user_alerts(
    data: User_alertsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user_alerts"""
    logger.debug(f"Creating new user_alerts with data: {data}")
    
    service = User_alertsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create user_alerts")
        
        logger.info(f"User_alerts created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating user_alerts: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating user_alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[User_alertsResponse], status_code=201)
async def create_user_alertss_batch(
    request: User_alertsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple user_alertss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} user_alertss")
    
    service = User_alertsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} user_alertss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[User_alertsResponse])
async def update_user_alertss_batch(
    request: User_alertsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple user_alertss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} user_alertss")
    
    service = User_alertsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} user_alertss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=User_alertsResponse)
async def update_user_alerts(
    id: int,
    data: User_alertsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing user_alerts (requires ownership)"""
    logger.debug(f"Updating user_alerts {id} with data: {data}")

    service = User_alertsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"User_alerts with id {id} not found for update")
            raise HTTPException(status_code=404, detail="User_alerts not found")
        
        logger.info(f"User_alerts {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating user_alerts {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating user_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_user_alertss_batch(
    request: User_alertsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple user_alertss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} user_alertss")
    
    service = User_alertsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} user_alertss successfully")
        return {"message": f"Successfully deleted {deleted_count} user_alertss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_user_alerts(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single user_alerts by ID (requires ownership)"""
    logger.debug(f"Deleting user_alerts with id: {id}")
    
    service = User_alertsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"User_alerts with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="User_alerts not found")
        
        logger.info(f"User_alerts {id} deleted successfully")
        return {"message": "User_alerts deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user_alerts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")