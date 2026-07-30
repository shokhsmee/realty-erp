"""Payment-schedule engine — pure, no DB, no FastAPI.

Given a unit price, a plan (down-payment %, term, markup %, payment day) and a
start date, it produces the concrete list of payments. This is the single place
the sales math lives, so it can be unit-tested in isolation and reused by
previews, deal signing, and restructuring.

Deal types:
- cash        : one payment of the (optionally discounted) total.
- installment : down-payment now + N equal monthly payments (last absorbs rounding).
- mortgage    : down-payment now + one bank-disbursement milestone for the rest.
"""

from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from enum import StrEnum

_CENTS = Decimal("0.01")
_HUNDRED = Decimal("100")


def _round(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP)


class DealType(StrEnum):
    CASH = "cash"
    INSTALLMENT = "installment"
    MORTGAGE = "mortgage"


def net_price(price: Decimal, discount_percent: Decimal = Decimal("0"), discount_amount: Decimal = Decimal("0")) -> Decimal:
    """Unit price after a percentage discount then a flat discount (never below 0)."""
    price = Decimal(price)
    after_pct = price * (Decimal("1") - Decimal(discount_percent or 0) / _HUNDRED)
    net = after_pct - Decimal(discount_amount or 0)
    return _round(max(net, Decimal("0")))


def add_months(d: date, months: int, day: int | None = None) -> date:
    """Add whole months, clamping the day to the target month's length."""
    zero_based = d.month - 1 + months
    year = d.year + zero_based // 12
    month = zero_based % 12 + 1
    days_in_month = monthrange(year, month)[1]
    target_day = day if day is not None else d.day
    return date(year, month, min(target_day, days_in_month))


@dataclass
class PlanParams:
    """Duck-typed plan inputs; the ORM PaymentPlan satisfies the same shape."""

    deal_type: DealType
    down_payment_percent: Decimal = Decimal("0")
    term_months: int = 0
    markup_percent: Decimal = Decimal("0")
    day_of_month: int = 5


@dataclass
class ScheduleLine:
    seq: int
    due_date: date
    amount: Decimal
    kind: str  # full | down | installment | bank


@dataclass
class Schedule:
    total: Decimal
    lines: list[ScheduleLine] = field(default_factory=list)


def build_schedule(price: Decimal, plan, start: date) -> Schedule:
    """Build the payment schedule for `price` under `plan`, starting at `start`."""
    price = Decimal(price)
    deal_type = DealType(plan.deal_type)
    markup = Decimal(plan.markup_percent or 0)
    total = _round(price * (Decimal("1") + markup / _HUNDRED))

    # Cash: single payment of the total.
    if deal_type is DealType.CASH:
        return Schedule(total, [ScheduleLine(0, start, total, "full")])

    down = _round(total * Decimal(plan.down_payment_percent or 0) / _HUNDRED)
    remaining = _round(total - down)
    lines = [ScheduleLine(0, start, down, "down")]

    # Mortgage: bank pays the remainder as one milestone next month.
    if deal_type is DealType.MORTGAGE:
        lines.append(ScheduleLine(1, add_months(start, 1), remaining, "bank"))
        return Schedule(total, lines)

    # Installment: N equal monthly payments; last one absorbs the rounding drift.
    term = int(plan.term_months)
    if term <= 0:
        raise ValueError("installment plan requires term_months > 0")
    monthly = _round(remaining / term)
    for i in range(1, term + 1):
        amount = monthly if i < term else _round(remaining - monthly * (term - 1))
        due = add_months(start, i, plan.day_of_month)
        lines.append(ScheduleLine(i, due, amount, "installment"))
    return Schedule(total, lines)
