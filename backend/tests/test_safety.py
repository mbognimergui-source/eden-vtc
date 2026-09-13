"""
Tests pour le bouton SOS et le contact de confiance (routers/safety.py).
"""
import sys
import os

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.safety import (  # noqa: E402
    get_emergency_contact,
    set_emergency_contact,
    trigger_sos,
    list_active_sos_alerts,
    resolve_sos_alert,
    EmergencyContactRequest,
    SosRequest,
)


class FakeUserResponse:
    def __init__(self, user_id="user-1"):
        self.id = user_id


class FakePassenger:
    def __init__(self, passenger_id=1, user_id="user-1", contact_name=None, contact_phone=None):
        self.id = passenger_id
        self.user_id = user_id
        self.emergency_contact_name = contact_name
        self.emergency_contact_phone = contact_phone


class FakeDriver:
    def __init__(self, driver_id=1, user_id="driver-1"):
        self.id = driver_id
        self.user_id = user_id


class FakeRide:
    def __init__(self, ride_id=1, passenger_id=1, driver_id=1):
        self.id = ride_id
        self.passenger_id = passenger_id
        self.driver_id = driver_id


class FakeAlert:
    def __init__(self, alert_id=1, status="active", created_at="2026-09-13 12:00:00",
                 ride_id=1, passenger_id=1, driver_id=1, triggered_by="passenger",
                 latitude=3.88, longitude=11.5):
        self.id = alert_id
        self.status = status
        self.created_at = created_at
        self.ride_id = ride_id
        self.passenger_id = passenger_id
        self.driver_id = driver_id
        self.triggered_by = triggered_by
        self.latitude = latitude
        self.longitude = longitude


class FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeScalarsResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class FakeUpdateResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


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

    async def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = 42


class TestEmergencyContact:
    @pytest.mark.asyncio
    async def test_get_returns_empty_without_passenger_profile(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        result = await get_emergency_contact(db=db, current_user=FakeUserResponse())
        assert result.name is None
        assert result.phone is None

    @pytest.mark.asyncio
    async def test_get_returns_saved_contact(self):
        db = FakeDb(execute_results=[FakeScalarResult(FakePassenger(contact_name="Maman", contact_phone="+237690000000"))])
        result = await get_emergency_contact(db=db, current_user=FakeUserResponse())
        assert result.name == "Maman"
        assert result.phone == "+237690000000"

    @pytest.mark.asyncio
    async def test_set_updates_passenger_row(self):
        passenger = FakePassenger()
        db = FakeDb(execute_results=[FakeScalarResult(passenger)])
        result = await set_emergency_contact(
            EmergencyContactRequest(name="Papa", phone="+237691111111"),
            db=db, current_user=FakeUserResponse(),
        )
        assert passenger.emergency_contact_name == "Papa"
        assert passenger.emergency_contact_phone == "+237691111111"
        assert result.name == "Papa"
        assert db.committed == 1

    @pytest.mark.asyncio
    async def test_set_without_passenger_profile_raises_404(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        with pytest.raises(HTTPException) as exc_info:
            await set_emergency_contact(
                EmergencyContactRequest(name="Papa", phone="+237691111111"),
                db=db, current_user=FakeUserResponse(),
            )
        assert exc_info.value.status_code == 404


class TestTriggerSos:
    @pytest.mark.asyncio
    async def test_ride_not_found_raises_404(self):
        db = FakeDb(execute_results=[FakeScalarResult(None)])
        with pytest.raises(HTTPException) as exc_info:
            await trigger_sos(SosRequest(ride_id=999), db=db, current_user=FakeUserResponse())
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_passenger_triggers_sos_with_saved_contact(self):
        ride = FakeRide(passenger_id=1, driver_id=1)
        passenger = FakePassenger(passenger_id=1, contact_name="Maman", contact_phone="+237690000000")
        db = FakeDb(execute_results=[
            FakeScalarResult(ride),
            FakeScalarResult(passenger),
            FakeScalarResult(None),  # pas de profil chauffeur pour cet utilisateur
        ])
        result = await trigger_sos(
            SosRequest(ride_id=1, latitude=3.88, longitude=11.5),
            db=db, current_user=FakeUserResponse("user-1"),
        )
        assert result["success"] is True
        assert result["emergency_contact"] == {"name": "Maman", "phone": "+237690000000"}
        assert len(db.added) == 1
        assert db.added[0].triggered_by == "passenger"

    @pytest.mark.asyncio
    async def test_passenger_triggers_sos_without_saved_contact(self):
        ride = FakeRide(passenger_id=1, driver_id=1)
        passenger = FakePassenger(passenger_id=1)
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger), FakeScalarResult(None)])
        result = await trigger_sos(SosRequest(ride_id=1), db=db, current_user=FakeUserResponse("user-1"))
        assert result["emergency_contact"] is None

    @pytest.mark.asyncio
    async def test_driver_can_trigger_sos_on_assigned_ride(self):
        ride = FakeRide(passenger_id=1, driver_id=1)
        db = FakeDb(execute_results=[
            FakeScalarResult(ride),
            FakeScalarResult(None),  # pas de profil passager pour cet utilisateur
            FakeScalarResult(FakeDriver(driver_id=1, user_id="driver-1")),
        ])
        result = await trigger_sos(SosRequest(ride_id=1), db=db, current_user=FakeUserResponse("driver-1"))
        assert result["success"] is True
        assert db.added[0].triggered_by == "driver"

    @pytest.mark.asyncio
    async def test_unrelated_user_gets_403(self):
        ride = FakeRide(passenger_id=1, driver_id=1)
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(None), FakeScalarResult(None)])
        with pytest.raises(HTTPException) as exc_info:
            await trigger_sos(SosRequest(ride_id=1), db=db, current_user=FakeUserResponse("stranger"))
        assert exc_info.value.status_code == 403


class TestSosAdminEndpoints:
    @pytest.mark.asyncio
    async def test_list_active_alerts(self):
        db = FakeDb(execute_results=[FakeScalarsResult([FakeAlert(alert_id=1), FakeAlert(alert_id=2)])])
        result = await list_active_sos_alerts(db=db, current_user=FakeUserResponse())
        assert result["total"] == 2

    @pytest.mark.asyncio
    async def test_resolve_alert_success(self):
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=1)])
        result = await resolve_sos_alert(1, db=db, current_user=FakeUserResponse("admin-1"))
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_resolve_already_resolved_alert_raises_404(self):
        db = FakeDb(execute_results=[FakeUpdateResult(rowcount=0)])
        with pytest.raises(HTTPException) as exc_info:
            await resolve_sos_alert(1, db=db, current_user=FakeUserResponse("admin-1"))
        assert exc_info.value.status_code == 404
