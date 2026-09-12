"""
Tests pour services/service_areas.py et l'intégration de la zone de service
multi-villes dans routers/ride_dispatch.py.

Scénarios couverts :
1. get_active_service_cities ne retourne que les villes dont le pays est
   actif dans country_tariffs
2. is_within_any_city / find_nearest_city calculent correctement la ville la
   plus proche et si un point est dans son rayon
3. _assert_within_service_area (async, utilisé par create-ride) autorise un
   point dans une ville active et rejette avec un message nommant la ville
   active la plus proche sinon
4. Désactiver un pays dans country_tariffs retire sa ville de la zone
   desservie sans toucher au code
"""
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import service_areas  # noqa: E402
from routers.ride_dispatch import _assert_within_service_area  # noqa: E402


class FakeRowsResult:
    """Simule db.execute(select(Country_tariffs.country_code)...).all()."""
    def __init__(self, codes):
        self._rows = [(c,) for c in codes]

    def all(self):
        return self._rows


class FakeDb:
    def __init__(self, active_country_codes):
        self._codes = active_country_codes

    async def execute(self, *_args, **_kwargs):
        return FakeRowsResult(self._codes)


DOUALA = next(c for c in service_areas.SERVICE_CITIES if c.name == "Douala")
YAOUNDE = next(c for c in service_areas.SERVICE_CITIES if c.name == "Yaoundé")
NAIROBI = next(c for c in service_areas.SERVICE_CITIES if c.name == "Nairobi")


class TestGetActiveServiceCities:
    @pytest.mark.asyncio
    async def test_only_cities_of_active_countries_are_returned(self):
        db = FakeDb(active_country_codes=["CM"])  # Cameroun seul actif
        cities = await service_areas.get_active_service_cities(db)
        names = {c.name for c in cities}
        assert names == {"Douala", "Yaoundé"}

    @pytest.mark.asyncio
    async def test_no_active_country_returns_empty(self):
        db = FakeDb(active_country_codes=[])
        cities = await service_areas.get_active_service_cities(db)
        assert cities == []

    @pytest.mark.asyncio
    async def test_disabling_a_country_removes_its_city(self):
        """Désactiver KE (Kenya) dans country_tariffs retire Nairobi sans
        changement de code — seule la donnée change."""
        db_with_kenya = FakeDb(active_country_codes=["CM", "KE"])
        db_without_kenya = FakeDb(active_country_codes=["CM"])

        with_kenya = {c.name for c in await service_areas.get_active_service_cities(db_with_kenya)}
        without_kenya = {c.name for c in await service_areas.get_active_service_cities(db_without_kenya)}

        assert "Nairobi" in with_kenya
        assert "Nairobi" not in without_kenya


class TestDistanceHelpers:
    def test_point_at_city_center_is_within_radius(self):
        assert service_areas.is_within_any_city(DOUALA.lat, DOUALA.lng, [DOUALA]) is True

    def test_point_far_from_all_cities_is_outside(self):
        # Milieu de l'Atlantique : loin de toute ville de la liste.
        assert service_areas.is_within_any_city(10.0, -30.0, service_areas.SERVICE_CITIES) is False

    def test_find_nearest_city_picks_closest(self):
        # Un point proche de Yaoundé doit retourner Yaoundé, pas Douala,
        # même si les deux appartiennent au même pays.
        near_yaounde = (3.8600, 11.5100)
        nearest, distance = service_areas.find_nearest_city(*near_yaounde, [DOUALA, YAOUNDE, NAIROBI])
        assert nearest.name == "Yaoundé"
        assert distance < 5

    def test_find_nearest_city_empty_list_returns_none(self):
        assert service_areas.find_nearest_city(0, 0, []) is None


class TestAssertWithinServiceArea:
    @pytest.mark.asyncio
    async def test_ride_within_active_city_passes(self):
        db = FakeDb(active_country_codes=["CM"])
        # Ne doit pas lever : départ et arrivée tous deux proches d'Akwa (Douala).
        await _assert_within_service_area(db, 4.05, 9.70, 4.04, 9.71)

    @pytest.mark.asyncio
    async def test_ride_in_second_active_city_passes(self):
        """Une ville différente de Douala (Yaoundé), mais du même pays actif,
        doit être acceptée — c'est tout l'objet de la zone multi-villes."""
        db = FakeDb(active_country_codes=["CM"])
        await _assert_within_service_area(db, YAOUNDE.lat, YAOUNDE.lng, YAOUNDE.lat + 0.01, YAOUNDE.lng + 0.01)

    @pytest.mark.asyncio
    async def test_ride_outside_every_active_city_is_rejected_with_nearest_named(self):
        db = FakeDb(active_country_codes=["CM"])  # seule Douala/Yaoundé actives
        with pytest.raises(Exception) as exc_info:
            await _assert_within_service_area(db, NAIROBI.lat, NAIROBI.lng, NAIROBI.lat, NAIROBI.lng)
        assert exc_info.value.status_code == 403
        # Le message doit nommer la ville active la plus proche (Yaoundé),
        # pas Nairobi elle-même (dont le pays n'est pas actif ici).
        assert "Yaoundé" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_no_active_country_rejects_everywhere(self):
        db = FakeDb(active_country_codes=[])
        with pytest.raises(Exception) as exc_info:
            await _assert_within_service_area(db, DOUALA.lat, DOUALA.lng, None, None)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_missing_coordinates_are_skipped_not_rejected(self):
        """Pas de coordonnées connues pour la destination (pas encore géocodée) :
        ne doit pas lever pour un champ absent."""
        db = FakeDb(active_country_codes=["CM"])
        await _assert_within_service_area(db, DOUALA.lat, DOUALA.lng, None, None)
