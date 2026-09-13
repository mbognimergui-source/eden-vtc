"""
Tests pour POST /api/v1/dispatch/accept-ride — en particulier la protection
contre la double-acceptation concurrente (TOCTOU) : deux chauffeurs qui
liraient tous deux la course comme "pending" avant que l'un des deux ne
commette son acceptation.
"""
import sys
import os

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.ride_dispatch import accept_ride, AcceptRideRequest  # noqa: E402


class FakeUserResponse:
    def __init__(self, user_id="driver-user-1"):
        self.id = user_id


class FakeDriver:
    def __init__(self, driver_id=1, vehicle_id=10, status="online"):
        self.id = driver_id
        self.vehicle_id = vehicle_id
        self.status = status


class FakeRide:
    def __init__(self, ride_id=42):
        self.id = ride_id
        self.pickup_address = "Akwa, Douala"
        self.pickup_lat = 4.05
        self.pickup_lng = 9.70
        self.destination_address = "Bonanjo, Douala"
        self.destination_lat = 4.04
        self.destination_lng = 9.69


class FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeUpdateResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class FakeDb:
    """Renvoie les résultats préconfigurés dans l'ordre des appels execute()."""

    def __init__(self, execute_results):
        self._results = list(execute_results)
        self.committed = 0
        self.rolled_back = 0

    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)

    async def commit(self):
        self.committed += 1

    async def rollback(self):
        self.rolled_back += 1


class TestAcceptRideConcurrency:
    @pytest.mark.asyncio
    async def test_accept_succeeds_when_ride_still_pending_at_write_time(self):
        driver = FakeDriver()
        ride = FakeRide()
        db = FakeDb(execute_results=[
            FakeScalarResult(driver),   # lookup du chauffeur en ligne
            FakeScalarResult(ride),     # lecture initiale : course pending
            FakeUpdateResult(rowcount=1),  # réclamation atomique : gagnée
        ])

        result = await accept_ride(AcceptRideRequest(ride_id=42), db=db, current_user=FakeUserResponse())

        assert result["success"] is True
        assert result["ride_id"] == 42
        assert result["driver_id"] == driver.id
        assert db.committed == 1

    @pytest.mark.asyncio
    async def test_accept_fails_when_another_driver_won_the_race(self):
        """Deux chauffeurs lisent la course comme pending ; celui qui écrit
        en second doit voir rowcount=0 (l'autre l'a déjà prise) et recevoir
        un 409, pas un succès silencieusement incorrect."""
        driver = FakeDriver()
        ride = FakeRide()
        db = FakeDb(execute_results=[
            FakeScalarResult(driver),
            FakeScalarResult(ride),        # encore vue "pending" à la lecture...
            FakeUpdateResult(rowcount=0),  # ...mais un autre chauffeur a gagné l'écriture
        ])

        with pytest.raises(HTTPException) as exc_info:
            await accept_ride(AcceptRideRequest(ride_id=42), db=db, current_user=FakeUserResponse())

        assert exc_info.value.status_code == 409
        assert db.rolled_back == 1
