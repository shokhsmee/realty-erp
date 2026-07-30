"""Accounting endpoints (guarded by the `accounting` app)."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, require
from app.core.permissions import App, Level
from app.modules.accounting import schemas as s
from app.modules.accounting import service

view = Depends(require(App.ACCOUNTING, Level.VIEW))

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _today() -> date:
    return datetime.now(timezone.utc).date()


@router.get("/summary", response_model=s.Summary, dependencies=[view])
async def summary(db: DbSession):
    return await service.summary(db, _today())


@router.get("/payments", response_model=list[s.PaymentRow], dependencies=[view])
async def payments(db: DbSession, status: str = "all"):
    """Rassrochka register. status: all | paid | overdue | pending | planned."""
    return await service.register(db, _today(), status)


@router.get("/debtors", response_model=list[s.DebtorRow], dependencies=[view])
async def debtors(db: DbSession):
    return await service.debtors(db, _today())
