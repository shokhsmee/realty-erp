"""Sales-domain tables: payment methods, plans, deals, and scheduled payments.

    PaymentPlan (config) ──┐
    Unit (structure) ──────┼──> Deal ──< Payment
    Client (clients) ──────┘
"""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.sales.engine import DealType  # shared enum (pure module)


class DealState(StrEnum):
    DRAFT = "draft"
    RESERVED = "reserved"
    SIGNED = "signed"
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class PaymentStatus(StrEnum):
    PLANNED = "planned"    # future installment
    PENDING = "pending"    # due, not yet paid
    PAID = "paid"
    OVERDUE = "overdue"


class PaymentMethod(Base):
    """How money arrives — independent of the deal type (TZ §06)."""

    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    fee_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))


class PaymentPlan(Base):
    """A named, reusable sales scheme, e.g. '12 oy 0%' or '24 oy +15%' (TZ §05)."""

    __tablename__ = "payment_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    deal_type: Mapped[DealType] = mapped_column(String(20))
    down_payment_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    term_months: Mapped[int] = mapped_column(Integer, default=0)
    markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    day_of_month: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id", ondelete="RESTRICT"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_plans.id", ondelete="SET NULL"), default=None
    )
    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    deal_type: Mapped[DealType] = mapped_column(String(20))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2))       # unit price snapshot at deal time
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))       # net price + markup (final)
    state: Mapped[DealState] = mapped_column(String(20), default=DealState.DRAFT, index=True)

    # Discount off the unit price (both stack: percent first, then flat amount).
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))

    # Effective terms snapshot — the deal owns its schedule inputs so it stays
    # stable even if the source plan is later edited (Profitbase behaviour).
    down_payment_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    term_months: Mapped[int] = mapped_column(Integer, default=0)
    markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    day_of_month: Mapped[int] = mapped_column(Integer, default=5)

    # Booking / contract paperwork.
    booking_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    contract_no: Mapped[str | None] = mapped_column(String(50), default=None)
    contract_date: Mapped[date | None] = mapped_column(Date, default=None)
    note: Mapped[str | None] = mapped_column(String(255), default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    payments: Mapped[list["Payment"]] = relationship(
        back_populates="deal",
        cascade="all, delete-orphan",
        order_by="Payment.seq",
        lazy="selectin",
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))  # full | down | installment | bank
    due_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    method_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="SET NULL"), default=None
    )
    status: Mapped[PaymentStatus] = mapped_column(String(20), default=PaymentStatus.PLANNED)

    deal: Mapped[Deal] = relationship(back_populates="payments")


class PaymentReceipt(Base):
    """A recorded incoming payment — the "paid invoice"/kvitansiya. One row per
    money-received event (a single distribute may cover several schedule months)."""

    __tablename__ = "payment_receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    number: Mapped[str] = mapped_column(String(40))          # e.g. INV-12-0003
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    method_id: Mapped[int | None] = mapped_column(ForeignKey("payment_methods.id", ondelete="SET NULL"), default=None)
    covers: Mapped[str | None] = mapped_column(String(120), default=None)  # "6–8 oy"
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DealEvent(Base):
    """Chatter/tracking log for a deal — system messages (state changes, payments,
    edits) and user notes, Odoo mail.thread style."""

    __tablename__ = "deal_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # created|reserved|signed|cancelled|payment|edit|note
    text: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
