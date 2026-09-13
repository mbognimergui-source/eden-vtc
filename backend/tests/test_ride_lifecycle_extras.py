"""
Tests pour les ajouts "Phase 1 compétitivité" de routers/ride_dispatch.py :
- Notation post-course (passager -> chauffeur, chauffeur -> passager)
- Frais d'annulation quand le passager annule une course déjà acceptée
"""
import sys
import os

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.ride_dispatch import (  # noqa: E402
    rate_ride,
    rate_passenger,
    cancel_ride,
    RateRideRequest,
    CANCELLATION_FEE,
)


class FakeUserResponse:
    def __init__(self, user_id="user-1"):
        self.id = user_id


class FakePassenger:
    def __init__(self, passenger_id=1, user_id="user-1", wallet_balance=1000):
        self.id = passenger_id
        self.user_id = user_id
        self.wallet_balance = wallet_balance


class FakeDriver:
    def __init__(self, driver_id=1, user_id="driver-1", status="on_ride", rating=4.0, total_rides=3):
        self.id = driver_id
        self.user_id = user_id
        self.status = status
        self.rating = rating
        self.total_rides = total_rides


class FakeRide:
    def __init__(self, ride_id=1, passenger_id=1, driver_id=1, status="completed", rating=None, passenger_rating=None):
        self.id = ride_id
        self.passenger_id = passenger_id
        self.driver_id = driver_id
        self.status = status
        self.rating = rating
        self.comment = None
        self.passenger_rating = passenger_rating
        self.passenger_comment = None


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
        self.rolled_back = 0

    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1

    async def rollback(self):
        self.rolled_back += 1


class TestRateRide:
    @pytest.mark.asyncio
    async def test_passenger_rates_driver_updates_average(self):
        ride = FakeRide(rating=None)
        passenger = FakePassenger()
        driver = FakeDriver(rating=4.0, total_rides=3)
        db = FakeDb(execute_results=[
            FakeScalarResult(ride),
            FakeScalarResult(passenger),
            FakeScalarResult(driver),
        ])

        result = await rate_ride(1, RateRideRequest(rating=5, comment="Top !"), db=db, current_user=FakeUserResponse())

        assert result["success"] is True
        assert ride.rating == 5
        assert ride.comment == "Top !"
        # (4.0*3 + 5) / 4 = 4.25
        assert driver.rating == 4.25
        assert db.committed == 1

    @pytest.mark.asyncio
    async def test_first_ever_rating_sets_driver_rating_directly(self):
        ride = FakeRide()
        passenger = FakePassenger()
        driver = FakeDriver(rating=0.0, total_rides=0)
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger), FakeScalarResult(driver)])

        await rate_ride(1, RateRideRequest(rating=4), db=db, current_user=FakeUserResponse())

        assert driver.rating == 4.0

    @pytest.mark.asyncio
    async def test_cannot_rate_twice(self):
        ride = FakeRide(rating=3)
        passenger = FakePassenger()
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger)])

        with pytest.raises(HTTPException) as exc_info:
            await rate_ride(1, RateRideRequest(rating=5), db=db, current_user=FakeUserResponse())

        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_cannot_rate_someone_elses_ride(self):
        ride = FakeRide(passenger_id=999)
        passenger = FakePassenger(passenger_id=1)  # ne correspond pas à ride.passenger_id
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger)])

        with pytest.raises(HTTPException) as exc_info:
            await rate_ride(1, RateRideRequest(rating=5), db=db, current_user=FakeUserResponse())

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_cannot_rate_ride_not_completed(self):
        ride = FakeRide(status="accepted")
        passenger = FakePassenger()
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger)])

        with pytest.raises(HTTPException) as exc_info:
            await rate_ride(1, RateRideRequest(rating=5), db=db, current_user=FakeUserResponse())

        assert exc_info.value.status_code == 400


class TestRatePassenger:
    @pytest.mark.asyncio
    async def test_driver_rates_passenger(self):
        ride = FakeRide(passenger_rating=None)
        driver = FakeDriver()
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(driver)])

        result = await rate_passenger(1, RateRideRequest(rating=5, comment="Ponctuel"), db=db, current_user=FakeUserResponse("driver-1"))

        assert result["success"] is True
        assert ride.passenger_rating == 5
        assert ride.passenger_comment == "Ponctuel"

    @pytest.mark.asyncio
    async def test_only_assigned_driver_can_rate(self):
        ride = FakeRide(driver_id=1)
        other_driver = FakeDriver(driver_id=2, user_id="driver-2")
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(other_driver)])

        with pytest.raises(HTTPException) as exc_info:
            await rate_passenger(1, RateRideRequest(rating=5), db=db, current_user=FakeUserResponse("driver-2"))

        assert exc_info.value.status_code == 403


class TestCancellationFee:
    @pytest.mark.asyncio
    async def test_fee_charged_when_passenger_cancels_accepted_ride(self):
        ride = FakeRide(status="accepted", driver_id=1)
        passenger = FakePassenger(wallet_balance=1000)
        driver = FakeDriver()
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger), FakeScalarResult(driver)])

        result = await cancel_ride(1, db=db, current_user=FakeUserResponse("user-1"))

        assert result["cancellation_fee"] == CANCELLATION_FEE
        assert passenger.wallet_balance == 1000 - CANCELLATION_FEE
        assert len(db.added) == 1
        assert db.added[0].type == "cancellation_fee"

    @pytest.mark.asyncio
    async def test_fee_capped_at_available_balance(self):
        ride = FakeRide(status="accepted", driver_id=1)
        passenger = FakePassenger(wallet_balance=200)  # < CANCELLATION_FEE
        driver = FakeDriver()
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger), FakeScalarResult(driver)])

        result = await cancel_ride(1, db=db, current_user=FakeUserResponse("user-1"))

        assert result["cancellation_fee"] == 200
        assert passenger.wallet_balance == 0

    @pytest.mark.asyncio
    async def test_no_fee_when_still_pending(self):
        """Aucun chauffeur engagé -> aucune pénalité."""
        ride = FakeRide(status="pending", driver_id=None)
        passenger = FakePassenger(wallet_balance=1000)
        db = FakeDb(execute_results=[FakeScalarResult(ride), FakeScalarResult(passenger)])

        result = await cancel_ride(1, db=db, current_user=FakeUserResponse("user-1"))

        assert result["cancellation_fee"] == 0
        assert passenger.wallet_balance == 1000
        assert db.added == []

    @pytest.mark.asyncio
    async def test_no_fee_when_driver_cancels(self):
        """C'est le chauffeur qui annule, pas le passager -> pas de frais côté passager."""
        ride = FakeRide(status="accepted", driver_id=1)
        db = FakeDb(execute_results=[
            FakeScalarResult(ride),
            FakeScalarResult(None),  # aucun passager ne correspond à current_user (c'est le chauffeur)
            FakeScalarResult(FakeDriver()),
        ])

        result = await cancel_ride(1, db=db, current_user=FakeUserResponse("driver-1"))

        assert result["cancellation_fee"] == 0
        assert db.added == []
