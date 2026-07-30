"""API contracts for the settings / currency module."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator


# --------------------------------------------------------------------------- #
# Rates
# --------------------------------------------------------------------------- #
class RateIn(BaseModel):
    rate: Decimal
    day: date


class RateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    currency_id: int
    rate: Decimal
    day: date
    created_at: datetime


# --------------------------------------------------------------------------- #
# Currencies
# --------------------------------------------------------------------------- #
class CurrencyCreate(BaseModel):
    code: str
    name: str
    symbol: str = ""
    # Optional first rate (base units per 1 unit). Ignored for the base currency.
    rate: Decimal | None = None

    @field_validator("code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class CurrencyUpdate(BaseModel):
    name: str | None = None
    symbol: str | None = None
    is_active: bool | None = None
    is_base: bool | None = None
    is_default: bool | None = None
    position: int | None = None


class CurrencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    symbol: str
    is_base: bool
    is_default: bool
    is_active: bool
    position: int
    # Attached by the service: most-recent rate & its day (base has rate 1).
    latest_rate: Decimal | None = None
    latest_day: date | None = None
