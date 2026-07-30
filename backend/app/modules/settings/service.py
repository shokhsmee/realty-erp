"""Currency-domain logic (pure functions over an AsyncSession).

`rate` = base-currency units per 1 unit of the currency; the base currency is
pinned at rate 1. Conversion between any two currencies goes through the base.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings import models as m
from app.modules.settings import schemas as s


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
def _latest(cur: m.Currency) -> tuple[Decimal | None, date | None]:
    """Most-recent rate for a currency (rates are ordered day-desc)."""
    if cur.is_base:
        return Decimal("1"), None
    if cur.rates:
        r = cur.rates[0]
        return r.rate, r.day
    return None, None


def _decorate(cur: m.Currency) -> m.Currency:
    """Attach transient latest_rate / latest_day for the Pydantic output."""
    rate, day = _latest(cur)
    cur.latest_rate = rate  # type: ignore[attr-defined]
    cur.latest_day = day  # type: ignore[attr-defined]
    return cur


async def list_currencies(db: AsyncSession) -> list[m.Currency]:
    result = await db.execute(
        select(m.Currency).order_by(m.Currency.position, m.Currency.id)
    )
    return [_decorate(c) for c in result.scalars().all()]


async def get_currency(db: AsyncSession, currency_id: int) -> m.Currency | None:
    return await db.get(m.Currency, currency_id)


async def base_currency(db: AsyncSession) -> m.Currency | None:
    result = await db.execute(select(m.Currency).where(m.Currency.is_base.is_(True)))
    return result.scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Writes — currencies
# --------------------------------------------------------------------------- #
async def _clear_flag(db: AsyncSession, field: str) -> None:
    """Turn off a boolean flag (is_base / is_default) on every currency."""
    result = await db.execute(select(m.Currency).where(getattr(m.Currency, field).is_(True)))
    for c in result.scalars().all():
        setattr(c, field, False)


async def create_currency(db: AsyncSession, data: s.CurrencyCreate) -> m.Currency:
    existing = (await db.execute(select(m.Currency))).scalars().all()
    is_first = not existing

    # A brand-new currency becomes the selected default ("last added is selected").
    await _clear_flag(db, "is_default")
    max_pos = max((c.position for c in existing), default=-1)

    cur = m.Currency(
        code=data.code,
        name=data.name,
        symbol=data.symbol,
        is_base=is_first,  # the very first currency is the base
        is_default=True,
        is_active=True,
        position=max_pos + 1,
    )
    db.add(cur)
    await db.flush()

    # Seed a rate: base is always 1; others use the supplied rate (default 1).
    seed_rate = Decimal("1") if is_first else (data.rate if data.rate is not None else Decimal("1"))
    db.add(m.CurrencyRate(currency_id=cur.id, rate=seed_rate, day=date.today()))

    await db.commit()
    await db.refresh(cur)
    return _decorate(cur)


async def update_currency(db: AsyncSession, cur: m.Currency, data: s.CurrencyUpdate) -> m.Currency:
    payload = data.model_dump(exclude_unset=True)
    # Only one currency may hold each exclusive flag.
    if payload.get("is_base"):
        await _clear_flag(db, "is_base")
    if payload.get("is_default"):
        await _clear_flag(db, "is_default")
    for field, value in payload.items():
        setattr(cur, field, value)
    await db.commit()
    await db.refresh(cur)
    return _decorate(cur)


async def delete_currency(db: AsyncSession, cur: m.Currency) -> None:
    await db.delete(cur)
    await db.commit()


# --------------------------------------------------------------------------- #
# Writes — rates
# --------------------------------------------------------------------------- #
async def list_rates(db: AsyncSession, currency_id: int) -> list[m.CurrencyRate]:
    result = await db.execute(
        select(m.CurrencyRate)
        .where(m.CurrencyRate.currency_id == currency_id)
        .order_by(m.CurrencyRate.day.desc())
    )
    return list(result.scalars().all())


async def set_rate(db: AsyncSession, currency_id: int, data: s.RateIn) -> m.CurrencyRate:
    """Upsert the rate for a given day (one reading per currency per day)."""
    result = await db.execute(
        select(m.CurrencyRate).where(
            m.CurrencyRate.currency_id == currency_id, m.CurrencyRate.day == data.day
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = m.CurrencyRate(currency_id=currency_id, rate=data.rate, day=data.day)
        db.add(row)
    else:
        row.rate = data.rate
    await db.commit()
    await db.refresh(row)
    return row


async def delete_rate(db: AsyncSession, rate_id: int) -> None:
    row = await db.get(m.CurrencyRate, rate_id)
    if row is not None:
        await db.delete(row)
        await db.commit()
