"""
Access Management Router — Admin-only role and permission management for EDEN VTC.
Only administrators can assign/revoke roles and manage user access.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.user_roles import User_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/access", tags=["access-management"])


# --- Pydantic Schemas ---

class RoleAssignRequest(BaseModel):
    target_user_id: str
    role: str  # "passenger", "driver", "admin"
    permissions: Optional[str] = "{}"


class RoleUpdateRequest(BaseModel):
    role_id: int
    is_active: Optional[bool] = None
    role: Optional[str] = None
    permissions: Optional[str] = None


class RoleRevokeRequest(BaseModel):
    role_id: int


class UserRoleResponse(BaseModel):
    id: int
    user_id: str
    role: str
    is_active: bool
    granted_by: str
    permissions: str

    class Config:
        from_attributes = True


class AccessCheckResponse(BaseModel):
    user_id: str
    roles: List[str]
    is_admin: bool
    is_driver: bool
    is_passenger: bool
    is_active: bool


# --- Helper: Check if current user is admin ---

async def verify_admin(current_user: UserResponse, db: AsyncSession):
    """Verify that the current user has admin role. Raises 403 if not."""
    stmt = select(User_roles).where(
        User_roles.user_id == current_user.id,
        User_roles.role == "admin",
        User_roles.is_active == True
    )
    result = await db.execute(stmt)
    admin_role = result.scalar_one_or_none()
    if not admin_role:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé. Seuls les administrateurs peuvent effectuer cette action."
        )
    return admin_role


# --- Endpoints ---

@router.get("/my-roles", response_model=AccessCheckResponse)
async def get_my_roles(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's roles and access level."""
    stmt = select(User_roles).where(
        User_roles.user_id == current_user.id,
        User_roles.is_active == True
    )
    result = await db.execute(stmt)
    roles = result.scalars().all()

    role_names = [r.role for r in roles]

    return AccessCheckResponse(
        user_id=current_user.id,
        roles=role_names,
        is_admin="admin" in role_names,
        is_driver="driver" in role_names,
        is_passenger="passenger" in role_names or len(role_names) == 0,
        is_active=any(r.is_active for r in roles) if roles else True,
    )


@router.post("/assign-role", response_model=UserRoleResponse)
async def assign_role(
    data: RoleAssignRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign a role to a user. Admin only."""
    await verify_admin(current_user, db)

    if data.role not in ("passenger", "driver", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide. Valeurs acceptées : passenger, driver, admin")

    # Check if user already has this role
    stmt = select(User_roles).where(
        User_roles.user_id == data.target_user_id,
        User_roles.role == data.role,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Reactivate if inactive
        if not existing.is_active:
            existing.is_active = True
            existing.granted_by = current_user.id
            await db.commit()
            await db.refresh(existing)
            return UserRoleResponse.model_validate(existing)
        raise HTTPException(status_code=409, detail=f"L'utilisateur possède déjà le rôle '{data.role}'")

    # Create new role assignment
    new_role = User_roles(
        user_id=data.target_user_id,
        role=data.role,
        is_active=True,
        granted_by=current_user.id,
        permissions=data.permissions or "{}",
    )
    db.add(new_role)
    await db.commit()
    await db.refresh(new_role)

    return UserRoleResponse.model_validate(new_role)


@router.put("/update-role", response_model=UserRoleResponse)
async def update_role(
    data: RoleUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a role assignment. Admin only."""
    await verify_admin(current_user, db)

    stmt = select(User_roles).where(User_roles.id == data.role_id)
    result = await db.execute(stmt)
    role_obj = result.scalar_one_or_none()

    if not role_obj:
        raise HTTPException(status_code=404, detail="Attribution de rôle introuvable")

    if data.is_active is not None:
        role_obj.is_active = data.is_active
    if data.role is not None:
        if data.role not in ("passenger", "driver", "admin"):
            raise HTTPException(status_code=400, detail="Rôle invalide")
        role_obj.role = data.role
    if data.permissions is not None:
        role_obj.permissions = data.permissions

    await db.commit()
    await db.refresh(role_obj)

    return UserRoleResponse.model_validate(role_obj)


@router.post("/revoke-role")
async def revoke_role(
    data: RoleRevokeRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) a role from a user. Admin only."""
    await verify_admin(current_user, db)

    stmt = select(User_roles).where(User_roles.id == data.role_id)
    result = await db.execute(stmt)
    role_obj = result.scalar_one_or_none()

    if not role_obj:
        raise HTTPException(status_code=404, detail="Attribution de rôle introuvable")

    # Prevent admin from revoking their own admin role
    if role_obj.user_id == current_user.id and role_obj.role == "admin":
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas révoquer votre propre rôle administrateur")

    role_obj.is_active = False
    await db.commit()

    return {"success": True, "message": f"Rôle '{role_obj.role}' révoqué avec succès"}


@router.get("/users-roles", response_model=List[UserRoleResponse])
async def list_all_roles(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all role assignments. Admin only."""
    await verify_admin(current_user, db)

    stmt = select(User_roles).order_by(User_roles.created_at.desc())
    result = await db.execute(stmt)
    roles = result.scalars().all()

    return [UserRoleResponse.model_validate(r) for r in roles]


@router.get("/check-access/{target_user_id}", response_model=AccessCheckResponse)
async def check_user_access(
    target_user_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check a specific user's access level. Admin only."""
    await verify_admin(current_user, db)

    stmt = select(User_roles).where(
        User_roles.user_id == target_user_id,
        User_roles.is_active == True
    )
    result = await db.execute(stmt)
    roles = result.scalars().all()

    role_names = [r.role for r in roles]

    return AccessCheckResponse(
        user_id=target_user_id,
        roles=role_names,
        is_admin="admin" in role_names,
        is_driver="driver" in role_names,
        is_passenger="passenger" in role_names or len(role_names) == 0,
        is_active=any(r.is_active for r in roles) if roles else True,
    )


@router.post("/init-admin")
async def initialize_first_admin(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initialize the first admin. Only works if no admin exists yet.
    The first authenticated user to call this becomes admin.
    """
    # Check if any admin exists (several may exist in practice — e.g. via
    # setup-all-roles — so this only needs to detect presence, not fetch a
    # single row: scalar_one_or_none() would raise on more than one match).
    stmt = select(User_roles).where(
        User_roles.role == "admin",
        User_roles.is_active == True
    ).limit(1)
    result = await db.execute(stmt)
    existing_admin = result.scalar_one_or_none()

    if existing_admin:
        raise HTTPException(
            status_code=403,
            detail="Un administrateur existe déjà. Contactez l'administrateur actuel pour obtenir les droits."
        )

    # Create admin role for current user
    admin_role = User_roles(
        user_id=current_user.id,
        role="admin",
        is_active=True,
        granted_by=current_user.id,
        permissions='{"full_access": true}',
    )
    db.add(admin_role)

    # Also give passenger role
    passenger_role = User_roles(
        user_id=current_user.id,
        role="passenger",
        is_active=True,
        granted_by=current_user.id,
        permissions="{}",
    )
    db.add(passenger_role)

    await db.commit()

    return {
        "success": True,
        "message": "Vous êtes maintenant administrateur EDEN VTC",
        "user_id": current_user.id,
    }


# Rôles qu'un utilisateur peut s'attribuer lui-même sans validation d'un
# administrateur. "admin" est volontairement exclu : le self-service illimité
# permettait auparavant à n'importe quel utilisateur authentifié de devenir
# administrateur (POST /assign-single-role?role=admin, sans aucune vérification),
# et setup-all-roles l'incluait systématiquement — une élévation de privilèges
# triviale. Devenir administrateur passe désormais uniquement par /init-admin
# (le tout premier utilisateur, tant qu'aucun admin n'existe) ou par l'octroi
# explicite d'un administrateur déjà en place via /assign-role.
SELF_SERVICE_ROLES = ("passenger", "driver")


@router.post("/setup-all-roles")
async def setup_all_roles(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign the passenger and driver roles to the current user, so they can
    try both interfaces. Reactivates existing inactive roles instead of
    creating duplicates. Does NOT grant admin — see SELF_SERVICE_ROLES.
    """
    assigned = []

    for role_name in SELF_SERVICE_ROLES:
        # Check if user already has this role
        stmt = select(User_roles).where(
            User_roles.user_id == current_user.id,
            User_roles.role == role_name,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.granted_by = current_user.id
                assigned.append({"role": role_name, "status": "reactivated"})
            else:
                assigned.append({"role": role_name, "status": "already_active"})
        else:
            new_role = User_roles(
                user_id=current_user.id,
                role=role_name,
                is_active=True,
                granted_by=current_user.id,
                permissions="{}",
            )
            db.add(new_role)
            assigned.append({"role": role_name, "status": "created"})

    await db.commit()

    return {
        "success": True,
        "message": "Les rôles Client et Chauffeur ont été attribués avec succès",
        "user_id": current_user.id,
        "roles": assigned,
    }


@router.post("/assign-single-role")
async def assign_single_role_to_self(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    role: str = "passenger",
):
    """
    Assign a single role to the current user (self-service demo convenience).
    Accepts: passenger, driver. Admin cannot be self-assigned — see
    SELF_SERVICE_ROLES and /init-admin.
    """
    if role not in SELF_SERVICE_ROLES:
        raise HTTPException(
            status_code=403,
            detail=(
                "Le rôle administrateur ne peut pas être auto-attribué. "
                "Utilisez /init-admin si aucun administrateur n'existe encore, "
                "ou demandez l'accès à un administrateur déjà en place."
            ),
        )

    stmt = select(User_roles).where(
        User_roles.user_id == current_user.id,
        User_roles.role == role,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.granted_by = current_user.id
            await db.commit()
            return {"success": True, "role": role, "status": "reactivated"}
        return {"success": True, "role": role, "status": "already_active"}

    new_role = User_roles(
        user_id=current_user.id,
        role=role,
        is_active=True,
        granted_by=current_user.id,
        permissions="{}",
    )
    db.add(new_role)
    await db.commit()

    return {"success": True, "role": role, "status": "created"}