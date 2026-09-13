"""
Tests pour l'autorisation ajoutée à routers/drivers.py.

Avant ce correctif, n'importe quel utilisateur authentifié pouvait créer,
modifier ou supprimer N'IMPORTE QUELLE fiche chauffeur (salaire, note,
véhicule assigné, et même le user_id qui relie la fiche à un compte) via
PUT /api/v1/entities/drivers/{id}. Ces tests couvrent la logique
d'autorisation désormais appliquée : admin = accès complet, chauffeur =
peut seulement modifier son propre statut en ligne/hors ligne, autre
utilisateur = refusé. Couvre aussi le rattachement automatique user_id
lors de la création par un admin.
"""
import sys
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.drivers import create_drivers, update_drivers, DriversData, DriversUpdateData  # noqa: E402


class FakeUserResponse:
    def __init__(self, user_id="user-1", role="user"):
        self.id = user_id
        self.role = role


class FakeDriverRow:
    def __init__(self, driver_id=1, user_id="driver-owner"):
        self.id = driver_id
        self.user_id = user_id
        self.status = "offline"


class TestCreateDriversAutoLinksUserId:
    @pytest.mark.asyncio
    async def test_derives_user_id_from_phone_when_not_provided(self):
        data = DriversData(first_name="Jean", last_name="Test", phone="+237690123456")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.create = AsyncMock(return_value=FakeDriverRow())

            await create_drivers(data, db=object(), current_user=FakeUserResponse(role="admin"))

            sent_data = instance.create.await_args.args[0]
            assert sent_data["user_id"] is not None
            assert sent_data["user_id"].startswith("phone_")

    @pytest.mark.asyncio
    async def test_respects_explicit_user_id(self):
        data = DriversData(first_name="Jean", last_name="Test", phone="+237690123456", user_id="already-linked")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.create = AsyncMock(return_value=FakeDriverRow())

            await create_drivers(data, db=object(), current_user=FakeUserResponse(role="admin"))

            sent_data = instance.create.await_args.args[0]
            assert sent_data["user_id"] == "already-linked"

    @pytest.mark.asyncio
    async def test_leaves_user_id_none_on_unparseable_phone(self):
        data = DriversData(first_name="Jean", last_name="Test", phone="not-a-phone-number")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.create = AsyncMock(return_value=FakeDriverRow())

            await create_drivers(data, db=object(), current_user=FakeUserResponse(role="admin"))

            sent_data = instance.create.await_args.args[0]
            assert sent_data.get("user_id") is None


class TestUpdateDriversOwnershipRules:
    @pytest.mark.asyncio
    async def test_admin_can_change_any_field(self):
        data = DriversUpdateData(monthly_base_salary=200000, rating=4.9)

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.update = AsyncMock(return_value=FakeDriverRow())

            await update_drivers(1, data, db=object(), current_user=FakeUserResponse(role="admin"))

            instance.get_by_id.assert_not_called()
            sent_update = instance.update.await_args.args[1]
            assert sent_update["monthly_base_salary"] == 200000

    @pytest.mark.asyncio
    async def test_self_can_change_own_status(self):
        data = DriversUpdateData(status="online")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.get_by_id = AsyncMock(return_value=FakeDriverRow(user_id="driver-owner"))
            instance.update = AsyncMock(return_value=FakeDriverRow())

            result = await update_drivers(1, data, db=object(), current_user=FakeUserResponse(user_id="driver-owner"))

            assert result is not None
            sent_update = instance.update.await_args.args[1]
            assert sent_update == {"status": "online"}

    @pytest.mark.asyncio
    async def test_self_cannot_change_restricted_field(self):
        data = DriversUpdateData(monthly_base_salary=999999)

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.get_by_id = AsyncMock(return_value=FakeDriverRow(user_id="driver-owner"))

            with pytest.raises(HTTPException) as exc_info:
                await update_drivers(1, data, db=object(), current_user=FakeUserResponse(user_id="driver-owner"))

        assert exc_info.value.status_code == 403
        instance.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_owner_non_admin_rejected(self):
        data = DriversUpdateData(status="online")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.get_by_id = AsyncMock(return_value=FakeDriverRow(user_id="driver-owner"))

            with pytest.raises(HTTPException) as exc_info:
                await update_drivers(1, data, db=object(), current_user=FakeUserResponse(user_id="someone-else"))

        assert exc_info.value.status_code == 403
        instance.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_404_when_target_driver_missing_for_non_admin(self):
        data = DriversUpdateData(status="online")

        with patch("routers.drivers.DriversService") as MockService:
            instance = MockService.return_value
            instance.get_by_id = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await update_drivers(999, data, db=object(), current_user=FakeUserResponse(user_id="driver-owner"))

        assert exc_info.value.status_code == 404
