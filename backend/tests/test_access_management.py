"""
Tests pour routers/access_management.py.

Couvre en priorité la régression de sécurité corrigée : avant ce correctif,
n'importe quel utilisateur authentifié pouvait s'auto-attribuer le rôle
"admin" via /assign-single-role?role=admin ou /setup-all-roles, sans
aucune vérification — une élévation de privilèges triviale donnant accès
au panneau de gestion des accès (voir/modifier les rôles de tous les
utilisateurs). Ces tests garantissent que seuls "passenger"/"driver"
restent auto-attribuables, et que devenir administrateur exige /init-admin
(premier utilisateur uniquement) ou l'octroi explicite par un admin déjà
en place.
"""
import sys
import os

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.access_management import (  # noqa: E402
    assign_single_role_to_self,
    setup_all_roles,
    initialize_first_admin,
    SELF_SERVICE_ROLES,
)


class FakeUserResponse:
    def __init__(self, user_id="user-1"):
        self.id = user_id


class FakeUserRole:
    def __init__(self, role_id=1, user_id="user-1", role="passenger", is_active=True):
        self.id = role_id
        self.user_id = user_id
        self.role = role
        self.is_active = is_active
        self.granted_by = user_id


class FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeDb:
    def __init__(self, execute_results):
        self._results = list(execute_results)
        self.added = []
        self.committed = 0

    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1


class TestSelfServiceRolesCannotIncludeAdmin:
    def test_admin_is_not_in_the_self_service_allowlist(self):
        assert "admin" not in SELF_SERVICE_ROLES
        assert set(SELF_SERVICE_ROLES) == {"passenger", "driver"}


class TestAssignSingleRoleToSelf:
    @pytest.mark.asyncio
    async def test_rejects_self_assigning_admin(self):
        db = FakeDb(execute_results=[])
        with pytest.raises(HTTPException) as exc_info:
            await assign_single_role_to_self(current_user=FakeUserResponse(), db=db, role="admin")
        assert exc_info.value.status_code == 403
        assert db.added == []  # aucune écriture tentée

    @pytest.mark.asyncio
    async def test_allows_self_assigning_passenger(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        result = await assign_single_role_to_self(current_user=FakeUserResponse(), db=db, role="passenger")
        assert result["success"] is True
        assert db.added[0].role == "passenger"

    @pytest.mark.asyncio
    async def test_allows_self_assigning_driver(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        result = await assign_single_role_to_self(current_user=FakeUserResponse(), db=db, role="driver")
        assert result["success"] is True
        assert db.added[0].role == "driver"

    @pytest.mark.asyncio
    async def test_rejects_unknown_role(self):
        db = FakeDb(execute_results=[])
        with pytest.raises(HTTPException) as exc_info:
            await assign_single_role_to_self(current_user=FakeUserResponse(), db=db, role="superuser")
        assert exc_info.value.status_code == 403


class TestSetupAllRoles:
    @pytest.mark.asyncio
    async def test_never_grants_admin(self):
        db = FakeDb(execute_results=[FakeScalarResult(None), FakeScalarResult(None)])
        result = await setup_all_roles(current_user=FakeUserResponse(), db=db)

        granted_roles = {r["role"] for r in result["roles"]}
        assert granted_roles == {"passenger", "driver"}
        assert "admin" not in granted_roles
        assert all(obj.role != "admin" for obj in db.added)


class TestInitializeFirstAdmin:
    @pytest.mark.asyncio
    async def test_first_user_becomes_admin_when_none_exists(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        result = await initialize_first_admin(current_user=FakeUserResponse("first-user"), db=db)

        assert result["success"] is True
        assert any(obj.role == "admin" for obj in db.added)

    @pytest.mark.asyncio
    async def test_refuses_when_an_admin_already_exists(self):
        db = FakeDb(execute_results=[FakeScalarResult(FakeUserRole(role="admin"))])
        with pytest.raises(HTTPException) as exc_info:
            await initialize_first_admin(current_user=FakeUserResponse("second-user"), db=db)
        assert exc_info.value.status_code == 403
        assert db.added == []
