"""HTTP endpoints for settings / currency.

Currency *reads* are open to any authenticated user — every page needs them to
display prices. *Writes* require `settings:manage`.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUser, DbSession, require
from app.core.permissions import App, Level
from app.modules.settings import schemas as s
from app.modules.settings import service

manage = Depends(require(App.SETTINGS, Level.MANAGE))

router = APIRouter(prefix="/settings", tags=["settings"])


# --------------------------------------------------------------------------- #
# Currencies
# --------------------------------------------------------------------------- #
@router.get("/currencies", response_model=list[s.CurrencyOut])
async def list_currencies(db: DbSession, _: CurrentUser):
    return await service.list_currencies(db)


@router.post("/currencies", response_model=s.CurrencyOut, status_code=201, dependencies=[manage])
async def create_currency(payload: s.CurrencyCreate, db: DbSession):
    return await service.create_currency(db, payload)


@router.patch("/currencies/{currency_id}", response_model=s.CurrencyOut, dependencies=[manage])
async def update_currency(currency_id: int, payload: s.CurrencyUpdate, db: DbSession):
    cur = await service.get_currency(db, currency_id)
    if cur is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Currency not found")
    return await service.update_currency(db, cur, payload)


@router.delete("/currencies/{currency_id}", status_code=204, dependencies=[manage])
async def delete_currency(currency_id: int, db: DbSession):
    cur = await service.get_currency(db, currency_id)
    if cur is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Currency not found")
    if cur.is_base:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the base currency")
    await service.delete_currency(db, cur)


# --------------------------------------------------------------------------- #
# Daily rates
# --------------------------------------------------------------------------- #
@router.get("/currencies/{currency_id}/rates", response_model=list[s.RateOut])
async def list_rates(currency_id: int, db: DbSession, _: CurrentUser):
    return await service.list_rates(db, currency_id)


@router.post(
    "/currencies/{currency_id}/rates",
    response_model=s.RateOut,
    status_code=201,
    dependencies=[manage],
)
async def set_rate(currency_id: int, payload: s.RateIn, db: DbSession):
    cur = await service.get_currency(db, currency_id)
    if cur is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Currency not found")
    if cur.is_base:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Base currency rate is fixed at 1")
    return await service.set_rate(db, currency_id, payload)


@router.delete("/rates/{rate_id}", status_code=204, dependencies=[manage])
async def delete_rate(rate_id: int, db: DbSession):
    await service.delete_rate(db, rate_id)
