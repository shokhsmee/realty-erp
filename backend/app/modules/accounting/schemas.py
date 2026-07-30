"""API contracts for accounting reports (derived from payment schedules)."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class Summary(BaseModel):
    planned_total: Decimal       # sum of all scheduled amounts
    collected_total: Decimal     # sum of all payments received
    outstanding_total: Decimal   # planned − collected
    overdue_total: Decimal       # due in the past and still unpaid
    overdue_count: int
    planned_month: Decimal       # scheduled to fall due this calendar month
    collected_month: Decimal     # actually received this calendar month


class PaymentRow(BaseModel):
    id: int
    deal_id: int
    client_name: str
    unit_number: str
    seq: int
    kind: str
    due_date: date
    amount: Decimal
    paid_amount: Decimal
    remaining: Decimal
    status: str            # paid | overdue | pending | planned
    overdue_days: int


class DebtorRow(BaseModel):
    client_id: int
    client_name: str
    unit_number: str
    overdue_amount: Decimal
    overdue_count: int
    oldest_due: date
    days_overdue: int
