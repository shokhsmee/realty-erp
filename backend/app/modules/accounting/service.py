"""Accounting reports derived from the sales payment schedules.

This module owns no tables — it reads `Payment` (joined to Deal → Client → Unit)
and computes receivables views. Overdue is computed on the fly (due in the past
and not fully paid), so it's always current without a nightly job.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting import schemas as s
from app.modules.clients.models import Client
from app.modules.sales.models import Deal, Payment
from app.modules.structure.models import Unit

_ZERO = Decimal("0")


@dataclass
class _Row:
    payment: Payment
    client_id: int
    client_name: str
    unit_number: str


async def _rows(db: AsyncSession) -> list[_Row]:
    """All scheduled payments joined with their client and unit."""
    stmt = (
        select(Payment, Client.id, Client.full_name, Unit.number)
        .join(Deal, Payment.deal_id == Deal.id)
        .join(Client, Deal.client_id == Client.id)
        .join(Unit, Deal.unit_id == Unit.id)
        .order_by(Payment.due_date)
    )
    result = await db.execute(stmt)
    return [
        _Row(payment=p, client_id=cid, client_name=name, unit_number=num)
        for p, cid, name, num in result.all()
    ]


def _remaining(p: Payment) -> Decimal:
    return max(p.amount - (p.paid_amount or _ZERO), _ZERO)


def _is_paid(p: Payment) -> bool:
    return (p.paid_amount or _ZERO) >= p.amount


def _effective_status(p: Payment, today: date) -> str:
    if _is_paid(p):
        return "paid"
    if p.due_date < today:
        return "overdue"
    if p.due_date == today:
        return "pending"
    return "planned"


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
async def summary(db: AsyncSession, today: date) -> s.Summary:
    rows = await _rows(db)
    planned = sum((r.payment.amount for r in rows), _ZERO)
    collected = sum((r.payment.paid_amount or _ZERO for r in rows), _ZERO)

    overdue_rows = [r for r in rows if not _is_paid(r.payment) and r.payment.due_date < today]
    overdue_total = sum((_remaining(r.payment) for r in overdue_rows), _ZERO)

    planned_month = sum(
        (r.payment.amount for r in rows
         if r.payment.due_date.year == today.year and r.payment.due_date.month == today.month),
        _ZERO,
    )
    collected_month = sum(
        (r.payment.paid_amount or _ZERO for r in rows
         if r.payment.paid_at
         and r.payment.paid_at.year == today.year
         and r.payment.paid_at.month == today.month),
        _ZERO,
    )

    return s.Summary(
        planned_total=planned,
        collected_total=collected,
        outstanding_total=planned - collected,
        overdue_total=overdue_total,
        overdue_count=len(overdue_rows),
        planned_month=planned_month,
        collected_month=collected_month,
    )


async def register(db: AsyncSession, today: date, status: str = "all") -> list[s.PaymentRow]:
    rows = await _rows(db)
    out: list[s.PaymentRow] = []
    for r in rows:
        p = r.payment
        eff = _effective_status(p, today)
        if status != "all" and status != eff:
            continue
        out.append(
            s.PaymentRow(
                id=p.id,
                deal_id=p.deal_id,
                client_name=r.client_name,
                unit_number=r.unit_number,
                seq=p.seq,
                kind=p.kind,
                due_date=p.due_date,
                amount=p.amount,
                paid_amount=p.paid_amount or _ZERO,
                remaining=_remaining(p),
                status=eff,
                overdue_days=(today - p.due_date).days if eff == "overdue" else 0,
            )
        )
    return out


async def debtors(db: AsyncSession, today: date) -> list[s.DebtorRow]:
    """Aggregate overdue amounts per client (most overdue first)."""
    rows = await _rows(db)
    buckets: dict[int, dict] = {}
    for r in rows:
        p = r.payment
        if _is_paid(p) or p.due_date >= today:
            continue
        b = buckets.setdefault(
            r.client_id,
            {
                "client_name": r.client_name,
                "unit_number": r.unit_number,
                "overdue_amount": _ZERO,
                "overdue_count": 0,
                "oldest_due": p.due_date,
            },
        )
        b["overdue_amount"] += _remaining(p)
        b["overdue_count"] += 1
        b["oldest_due"] = min(b["oldest_due"], p.due_date)

    result = [
        s.DebtorRow(
            client_id=cid,
            client_name=b["client_name"],
            unit_number=b["unit_number"],
            overdue_amount=b["overdue_amount"],
            overdue_count=b["overdue_count"],
            oldest_due=b["oldest_due"],
            days_overdue=(today - b["oldest_due"]).days,
        )
        for cid, b in buckets.items()
    ]
    result.sort(key=lambda d: d.overdue_amount, reverse=True)
    return result
