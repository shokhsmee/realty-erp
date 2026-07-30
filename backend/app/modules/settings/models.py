"""Multi-currency tables.

    Currency ─── CurrencyRate[]   (one rate row per day)

Prices everywhere in the system are stored in ONE base currency. Every other
currency is an entry/display conversion driven by its most-recent daily rate,
so stored prices can never drift out of sync (the Odoo approach).

`rate` is defined as **base-currency units per 1 unit of this currency**
(e.g. base = UZS, USD rate = 12650  ⇒  1 USD = 12 650 soʻm). The base currency
therefore always has rate 1.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Currency(Base):
    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)  # UZS, USD, EUR…
    name: Mapped[str] = mapped_column(String(50))
    symbol: Mapped[str] = mapped_column(String(8), default="")
    # Exactly one currency is the base (rate 1); all prices are stored in it.
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    # The currency selected by default in the UI ("last added is selected").
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rates: Mapped[list["CurrencyRate"]] = relationship(
        back_populates="currency",
        cascade="all, delete-orphan",
        order_by="CurrencyRate.day.desc()",
        lazy="selectin",
    )


class CurrencyRate(Base):
    """One exchange-rate reading, dated. Latest by `day` is the one in force."""

    __tablename__ = "currency_rates"
    __table_args__ = (UniqueConstraint("currency_id", "day", name="uq_rate_currency_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    currency_id: Mapped[int] = mapped_column(
        ForeignKey("currencies.id", ondelete="CASCADE"), index=True
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("1"))
    day: Mapped[date] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    currency: Mapped[Currency] = relationship(back_populates="rates")
