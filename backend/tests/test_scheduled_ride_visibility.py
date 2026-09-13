"""
Tests d'intégration (sqlite en mémoire) pour la visibilité des courses
programmées dans GET /api/v1/dispatch/available-rides.

Une course `is_scheduled=True` ne doit apparaître aux chauffeurs que lorsque
`scheduled_at` est atteint ou dépassé ; une course non programmée reste
visible comme avant. Ce filtre est appliqué directement dans la clause SQL
(`WHERE ... OR scheduled_at <= now()`), donc un test avec des doublures
Python (FakeDb) ne le couvrirait pas réellement — on utilise donc une vraie
base sqlite en mémoire.
"""
import sys
import os
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base  # noqa: E402
from models.rides import Rides  # noqa: E402
from models.drivers import Drivers  # noqa: E402
from schemas.auth import UserResponse  # noqa: E402
from routers.ride_dispatch import get_available_rides  # noqa: E402


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[Rides.__table__, Drivers.__table__])

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as s:
        yield s

    await engine.dispose()


async def _add_online_driver(session, user_id="driver-1"):
    driver = Drivers(user_id=user_id, first_name="Jean", last_name="Test", phone="+237600000000", status="online", rating=4.5)
    session.add(driver)
    await session.commit()
    return driver


async def _add_ride(session, **kwargs):
    defaults = dict(
        status="pending",
        driver_id=None,
        pickup_address="Bastos, Yaoundé",
        pickup_lat=3.8895,
        pickup_lng=11.5108,
        destination_address="Centre-ville, Yaoundé",
        destination_lat=3.8667,
        destination_lng=11.5167,
    )
    defaults.update(kwargs)
    ride = Rides(**defaults)
    session.add(ride)
    await session.commit()
    return ride


class TestScheduledRideVisibility:
    @pytest.mark.asyncio
    async def test_non_scheduled_ride_is_visible(self, session):
        await _add_online_driver(session)
        await _add_ride(session, is_scheduled=False)

        result = await get_available_rides(3.8895, 11.5108, db=session, current_user=UserResponse(id="driver-1", email="", role="user"))

        assert result["total"] == 1

    @pytest.mark.asyncio
    async def test_scheduled_ride_hidden_before_its_time(self, session):
        await _add_online_driver(session)
        await _add_ride(
            session,
            is_scheduled=True,
            scheduled_at=datetime.now() + timedelta(hours=2),
        )

        result = await get_available_rides(3.8895, 11.5108, db=session, current_user=UserResponse(id="driver-1", email="", role="user"))

        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_scheduled_ride_visible_once_due(self, session):
        await _add_online_driver(session)
        await _add_ride(
            session,
            is_scheduled=True,
            scheduled_at=datetime.now() - timedelta(minutes=1),
        )

        result = await get_available_rides(3.8895, 11.5108, db=session, current_user=UserResponse(id="driver-1", email="", role="user"))

        assert result["total"] == 1

    @pytest.mark.asyncio
    async def test_scheduled_ride_visible_exactly_at_due_time(self, session):
        await _add_online_driver(session)
        due_now = datetime.now()
        await _add_ride(session, is_scheduled=True, scheduled_at=due_now)

        result = await get_available_rides(3.8895, 11.5108, db=session, current_user=UserResponse(id="driver-1", email="", role="user"))

        assert result["total"] == 1
