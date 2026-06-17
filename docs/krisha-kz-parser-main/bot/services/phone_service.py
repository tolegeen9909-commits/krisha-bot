from datetime import datetime, timezone, timedelta
from sqlalchemy import select, update, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models import Listing, Phone, WahaStatus


async def listing_exists(session: AsyncSession, task_id: int, advert_id: str) -> bool:
    """True, если объявление уже сохранено (телефон по нему собран в прошлый прогон)."""
    result = await session.execute(
        select(Listing.id).where(
            and_(Listing.task_id == task_id, Listing.advert_id == advert_id)
        )
    )
    return result.scalar_one_or_none() is not None


async def get_or_create_listing(
    session: AsyncSession, task_id: int, advert_id: str, listing_url: str
) -> tuple[Listing, bool]:
    result = await session.execute(
        select(Listing).where(
            and_(Listing.task_id == task_id, Listing.advert_id == advert_id)
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing, False
    listing = Listing(task_id=task_id, advert_id=advert_id, listing_url=listing_url)
    session.add(listing)
    await session.commit()
    await session.refresh(listing)
    return listing, True


async def save_phones(
    session: AsyncSession, task_id: int, listing_id: int, phones: list[str]
) -> int:
    saved = 0
    for phone in phones:
        # SAVEPOINT per insert — rollback only the duplicate, not the whole transaction
        async with session.begin_nested():
            try:
                phone_obj = Phone(task_id=task_id, listing_id=listing_id, phone=phone)
                session.add(phone_obj)
                await session.flush()
                saved += 1
            except Exception:
                pass  # duplicate — IntegrityError rolled back to savepoint
    await session.commit()
    return saved


async def get_phones(
    session: AsyncSession,
    task_id: int,
    limit: int = 100,
    status: WahaStatus = WahaStatus.pending,
) -> list[Phone]:
    result = await session.execute(
        select(Phone)
        .where(and_(Phone.task_id == task_id, Phone.waha_status == status))
        .order_by(Phone.collected_at)
        .limit(limit)
    )
    return list(result.scalars())


async def mark_phones(
    session: AsyncSession, phone_ids: list[int], status: WahaStatus
) -> int:
    if not phone_ids:
        return 0
    result = await session.execute(
        update(Phone)
        .where(Phone.id.in_(phone_ids))
        .values(waha_status=status)
        .returning(Phone.id)
    )
    await session.commit()
    return len(result.fetchall())


async def get_stats(session: AsyncSession, task_id: int | None = None) -> dict:
    filters = []
    if task_id is not None:
        filters.append(Phone.task_id == task_id)

    counts = {}
    for status in WahaStatus:
        result = await session.execute(
            select(func.count(Phone.id)).where(and_(Phone.waha_status == status, *filters))
        )
        counts[status.value] = result.scalar_one()

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count(Phone.id)).where(
            and_(Phone.collected_at >= today_start, *filters)
        )
    )
    counts["collected_today"] = result.scalar_one()

    return counts
