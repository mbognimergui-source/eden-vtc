"""
Tests d'intégration (sqlite en mémoire) pour EDEN Trust Score.

Le calcul agrège des courses par statut via GROUP BY — une doublure FakeDb
ne peut pas simuler cette agrégation SQL fidèlement, donc comme pour le
filtre de visibilité des courses programmées, on utilise une vraie base
sqlite en mémoire plutôt que des résultats préprogrammés.
"""
import sys
import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base  # noqa: E402
from models.rides import Rides  # noqa: E402
from models.drivers import Drivers  # noqa: E402
from services.trust_score import compute_driver_trust_score  # noqa: E402


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[Rides.__table__, Drivers.__table__])

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as s:
        yield s

    await engine.dispose()


async def _add_driver(session, rating=4.5, total_rides=50):
    driver = Drivers(
        user_id="driver-1", first_name="Jean", last_name="Test", phone="+237600000000",
        status="online", rating=rating, total_rides=total_rides,
    )
    session.add(driver)
    await session.commit()
    return driver


async def _add_ride(session, driver_id, status):
    ride = Rides(
        driver_id=driver_id,
        status=status,
        pickup_address="Bastos, Yaoundé",
        destination_address="Centre-ville, Yaoundé",
    )
    session.add(ride)
    await session.commit()


class TestTrustScore:
    @pytest.mark.asyncio
    async def test_new_driver_with_no_concluded_rides_gets_benefit_of_the_doubt(self, session):
        driver = await _add_driver(session, rating=5.0, total_rides=0)

        result = await compute_driver_trust_score(session, driver)

        # rating=100, experience=0, reliability=100 (aucune course conclue -> bénéfice du doute)
        # 100*0.45 + 0*0.20 + 100*0.35 = 80
        assert result["score"] == 80
        assert "Pas encore d'historique" in result["factors"][1]

    @pytest.mark.asyncio
    async def test_high_performing_experienced_driver_scores_near_top(self, session):
        driver = await _add_driver(session, rating=4.9, total_rides=250)
        for _ in range(20):
            await _add_ride(session, driver.id, "completed")

        result = await compute_driver_trust_score(session, driver)

        assert result["score"] >= 90
        assert result["grade"] == "Excellent"

    @pytest.mark.asyncio
    async def test_frequent_cancellations_pull_score_down(self, session):
        driver = await _add_driver(session, rating=4.9, total_rides=50)
        for _ in range(2):
            await _add_ride(session, driver.id, "completed")
        for _ in range(8):
            await _add_ride(session, driver.id, "cancelled")

        result = await compute_driver_trust_score(session, driver)

        # reliability = 2/10 = 20% -> score tiré nettement vers le bas malgré une bonne note
        assert result["score"] < 70
        assert "2/10" in result["factors"][1]

    @pytest.mark.asyncio
    async def test_low_rating_caps_score_even_with_perfect_reliability(self, session):
        driver = await _add_driver(session, rating=2.0, total_rides=100)
        for _ in range(10):
            await _add_ride(session, driver.id, "completed")

        result = await compute_driver_trust_score(session, driver)

        # rating=40, experience=50, reliability=100 -> 40*0.45+50*0.20+100*0.35 = 63
        assert result["score"] == 63

    @pytest.mark.asyncio
    async def test_score_is_always_bounded_0_to_100(self, session):
        driver = await _add_driver(session, rating=0.0, total_rides=0)
        for _ in range(5):
            await _add_ride(session, driver.id, "cancelled")

        result = await compute_driver_trust_score(session, driver)

        assert 0 <= result["score"] <= 100
