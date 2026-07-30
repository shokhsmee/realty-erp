"""API contracts for the sales module."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.sales.engine import DealType
from app.modules.sales.models import DealState, PaymentStatus


# --------------------------------------------------------------------------- #
# Payment methods
# --------------------------------------------------------------------------- #
class PaymentMethodCreate(BaseModel):
    key: str
    name: str
    is_active: bool = True
    fee_percent: Decimal = Decimal("0")


class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    fee_percent: Decimal | None = None


class PaymentMethodOut(PaymentMethodCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --------------------------------------------------------------------------- #
# Payment plans (deal-type config)
# --------------------------------------------------------------------------- #
class PaymentPlanCreate(BaseModel):
    name: str
    deal_type: DealType
    down_payment_percent: Decimal = Decimal("0")
    term_months: int = 0
    markup_percent: Decimal = Decimal("0")
    day_of_month: int = 5
    is_active: bool = True


class PaymentPlanUpdate(BaseModel):
    name: str | None = None
    deal_type: DealType | None = None
    down_payment_percent: Decimal | None = None
    term_months: int | None = None
    markup_percent: Decimal | None = None
    day_of_month: int | None = None
    is_active: bool | None = None


class PaymentPlanOut(PaymentPlanCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --------------------------------------------------------------------------- #
# Reusable schedule terms — a plan OR ad-hoc values tuned on the deal.
# --------------------------------------------------------------------------- #
class DealTerms(BaseModel):
    """Effective schedule inputs. Either reference a plan_id, or supply the
    fields directly for a one-off ("custom") arrangement."""

    plan_id: int | None = None
    deal_type: DealType = DealType.CASH
    down_payment_percent: Decimal = Decimal("0")
    term_months: int = 0
    markup_percent: Decimal = Decimal("0")
    day_of_month: int = 5
    discount_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")


# --------------------------------------------------------------------------- #
# Schedule preview (no persistence)
# --------------------------------------------------------------------------- #
class SchedulePreviewRequest(DealTerms):
    unit_id: int
    start_date: date | None = None


class ScheduleLineOut(BaseModel):
    seq: int
    due_date: date
    amount: Decimal
    kind: str


class SchedulePreviewOut(BaseModel):
    unit_price: Decimal
    net_price: Decimal
    total: Decimal
    lines: list[ScheduleLineOut]


# --------------------------------------------------------------------------- #
# Deals & payments
# --------------------------------------------------------------------------- #
class DealCreate(DealTerms):
    unit_id: int
    client_id: int
    manager_id: int | None = None
    note: str | None = None


class DealUpdate(BaseModel):
    """Adjust an unsigned deal's terms / paperwork (recomputes the total)."""

    plan_id: int | None = None
    deal_type: DealType | None = None
    down_payment_percent: Decimal | None = None
    term_months: int | None = None
    markup_percent: Decimal | None = None
    day_of_month: int | None = None
    discount_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    manager_id: int | None = None
    contract_no: str | None = None
    contract_date: date | None = None
    note: str | None = None


class ReserveRequest(BaseModel):
    booking_days: int = 3  # how long the hold lasts before it lapses


class SignRequest(BaseModel):
    start_date: date | None = None  # defaults to today
    contract_no: str | None = None
    contract_date: date | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    seq: int
    kind: str
    due_date: date
    amount: Decimal
    paid_amount: Decimal
    paid_at: datetime | None
    method_id: int | None
    status: PaymentStatus


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    unit_id: int
    client_id: int
    plan_id: int | None
    manager_id: int | None
    deal_type: DealType
    price: Decimal
    total: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    down_payment_percent: Decimal
    term_months: int
    markup_percent: Decimal
    day_of_month: int
    booking_expires_at: datetime | None
    contract_no: str | None
    contract_date: date | None
    note: str | None
    state: DealState
    created_at: datetime
    signed_at: datetime | None
    payments: list[PaymentOut] = []


class DealDetailOut(DealOut):
    """DealOut enriched with the joined names the UI needs."""

    unit_number: str | None = None
    client_name: str | None = None
    client_phone: str | None = None
    manager_name: str | None = None
    complex_name: str | None = None


class RecordPaymentRequest(BaseModel):
    amount: Decimal
    method_id: int | None = None


class DistributeRequest(BaseModel):
    """Pay `amount` starting at a chosen installment; any surplus cascades to the
    following installments (fill-forward)."""

    start_payment_id: int
    amount: Decimal
    method_id: int | None = None


class DistributeResult(BaseModel):
    allocations: list[dict] = []   # [{payment_id, seq, applied}]
    leftover: Decimal = Decimal("0")


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    deal_id: int
    number: str
    amount: Decimal
    method_id: int | None
    method_name: str | None = None
    covers: str | None
    author_name: str | None = None
    paid_at: datetime


class DealEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    deal_id: int
    kind: str
    text: str
    author_id: int | None
    author_name: str | None = None
    meta: dict = {}
    created_at: datetime


class EventCreate(BaseModel):
    text: str


class DealRow(BaseModel):
    """Enriched deal for the list view (names + collection progress)."""

    id: int
    unit_number: str
    client_name: str
    manager_name: str | None
    deal_type: DealType
    state: DealState
    total: Decimal
    paid: Decimal
    remaining: Decimal
    next_due: date | None
    payments_paid: int
    payments_total: int
