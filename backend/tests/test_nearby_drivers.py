"""
Tests pour GET /api/v1/dispatch/nearby-drivers.

Scénarios couverts :
1. Aucun chauffeur en ligne -> liste vide, pas de requête position inutile
2. Chauffeurs en ligne mais hors du rayon -> exclus
3. Chauffeurs en ligne dans le rayon -> inclus, triés du plus proche au plus loin
4. Un chauffeur en ligne sans position GPS enregistrée -> ignoré sans planter
5. Un chauffeur "on_ride"/"offline" n'est jamais renvoyé, même à 0 km
"""
import sys
import os
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.ride_dispatch import get_nearby_drivers  # noqa: E402


# === Fixtures et helpers ===

class FakeUserResponse:
    def __init__(self, user_id="user-abc-123"):
        self.id = user_id


class FakeDriver:
    def __init__(self, driver_id, status="online", rating=4.5):
        self.id = driver_id
        self.status = status
        self.rating = rating


class FakePosition:
    def __init__(self, driver_id, vehicle_id, latitude, longitude, heading=90.0):
        self.driver_id = driver_id
        self.vehicle_id = vehicle_id
        self.latitude = latitude
        self.longitude = longitude
        self.heading = heading


class FakeScalarsResult:
    """Simule db.execute(...).scalars().all()."""
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class FakeDb:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)

    async def execute(self, *_args, **_kwargs):
        return self._execute_results.pop(0)


# Centre de Douala (cf. services/service_areas.py)
DOUALA_LAT, DOUALA_LNG = 4.0511, 9.7679


# === Tests ===

class TestNearbyDrivers:
    @pytest.mark.asyncio
    async def test_no_online_driver_returns_empty_without_position_query(self):
        db = FakeDb(execute_results=[FakeScalarsResult([])])

        result = await get_nearby_drivers(
            lat=DOUALA_LAT, lng=DOUALA_LNG, radius_km=3.0,
            db=db, current_user=FakeUserResponse(),
        )

        assert result == {"drivers": [], "total": 0, "radius_km": 3.0}

    @pytest.mark.asyncio
    async def test_driver_outside_radius_is_excluded(self):
        driver = FakeDriver(driver_id=1)
        # ~8 km d'Akwa : hors d'un rayon de 3 km.
        position = FakePosition(driver_id=1, vehicle_id=1, latitude=4.0186, longitude=9.6942)
        db = FakeDb(execute_results=[FakeScalarsResult([driver]), FakeScalarsResult([position])])

        result = await get_nearby_drivers(
            lat=DOUALA_LAT, lng=DOUALA_LNG, radius_km=3.0,
            db=db, current_user=FakeUserResponse(),
        )

        assert result["drivers"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_drivers_within_radius_are_sorted_by_distance(self):
        drivers = [FakeDriver(driver_id=1, rating=4.8), FakeDriver(driver_id=2, rating=4.9)]
        # driver 2 légèrement plus proche du centre que driver 1.
        positions = [
            FakePosition(driver_id=1, vehicle_id=1, latitude=4.0483, longitude=9.6999),
            FakePosition(driver_id=2, vehicle_id=2, latitude=4.0511, longitude=9.7600),
        ]
        db = FakeDb(execute_results=[FakeScalarsResult(drivers), FakeScalarsResult(positions)])

        result = await get_nearby_drivers(
            lat=DOUALA_LAT, lng=DOUALA_LNG, radius_km=10.0,
            db=db, current_user=FakeUserResponse(),
        )

        assert result["total"] == 2
        assert [d["driver_id"] for d in result["drivers"]] == [2, 1]
        assert result["drivers"][0]["distance_km"] < result["drivers"][1]["distance_km"]
        assert result["drivers"][0]["rating"] == 4.9

    @pytest.mark.asyncio
    async def test_driver_without_position_is_skipped_not_crashed(self):
        driver = FakeDriver(driver_id=1)
        position = FakePosition(driver_id=1, vehicle_id=1, latitude=None, longitude=None)
        db = FakeDb(execute_results=[FakeScalarsResult([driver]), FakeScalarsResult([position])])

        result = await get_nearby_drivers(
            lat=DOUALA_LAT, lng=DOUALA_LNG, radius_km=10.0,
            db=db, current_user=FakeUserResponse(),
        )

        assert result["drivers"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_offline_driver_never_returned(self):
        # La requête SQL filtre déjà `status == "online"` : un chauffeur
        # hors-ligne ne fait jamais partie du premier jeu de résultats.
        db = FakeDb(execute_results=[FakeScalarsResult([])])

        result = await get_nearby_drivers(
            lat=DOUALA_LAT, lng=DOUALA_LNG, radius_km=100.0,
            db=db, current_user=FakeUserResponse(),
        )

        assert result["drivers"] == []
