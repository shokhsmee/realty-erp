"""Sales-domain logic: plans, methods, the deal lifecycle, and payments.

Business rules that touch the property tree (flipping a unit's status) live here
and call into the structure service — sales depends on structure, never the
reverse. Service functions raise ValueError on rule violations; the router
translates those into HTTP 400.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.realtime import publish_unit_status
from app.modules.clients import service as clients_service
from app.modules.sales import engine, models as m, schemas as s
from app.modules.structure import service as structure_service
from app.modules.structure.models import UnitStatus

# A unit can start a deal only from these states (not if already sold).
_SELLABLE = {UnitStatus.FREE, UnitStatus.HOLD, UnitStatus.RESERVED}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def log_event(db: AsyncSession, deal_id: int, kind: str, text: str, author_id: int | None = None, meta: dict | None = None) -> None:
    """Append a chatter/tracking entry (caller commits)."""
    db.add(m.DealEvent(deal_id=deal_id, kind=kind, text=text, author_id=author_id, meta=meta or {}))


async def list_events(db: AsyncSession, deal_id: int) -> list[s.DealEventOut]:
    from app.modules.users.models import User

    stmt = (
        select(m.DealEvent, User.full_name)
        .outerjoin(User, m.DealEvent.author_id == User.id)
        .where(m.DealEvent.deal_id == deal_id)
        .order_by(m.DealEvent.created_at.desc(), m.DealEvent.id.desc())
    )
    out = []
    for ev, author_name in (await db.execute(stmt)).all():
        o = s.DealEventOut.model_validate(ev)
        o.author_name = author_name
        out.append(o)
    return out


async def add_event(db: AsyncSession, deal_id: int, text: str, author_id: int | None) -> m.DealEvent:
    ev = m.DealEvent(deal_id=deal_id, kind="note", text=text, author_id=author_id, meta={})
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def list_receipts(db: AsyncSession, deal_id: int) -> list[s.ReceiptOut]:
    from app.modules.users.models import User

    stmt = (
        select(m.PaymentReceipt, m.PaymentMethod.name, User.full_name)
        .outerjoin(m.PaymentMethod, m.PaymentReceipt.method_id == m.PaymentMethod.id)
        .outerjoin(User, m.PaymentReceipt.author_id == User.id)
        .where(m.PaymentReceipt.deal_id == deal_id)
        .order_by(m.PaymentReceipt.paid_at.desc(), m.PaymentReceipt.id.desc())
    )
    out = []
    for rc, method_name, author_name in (await db.execute(stmt)).all():
        o = s.ReceiptOut.model_validate(rc)
        o.method_name = method_name
        o.author_name = author_name
        out.append(o)
    return out


# --------------------------------------------------------------------------- #
# Payment methods
# --------------------------------------------------------------------------- #
async def list_methods(db: AsyncSession) -> list[m.PaymentMethod]:
    result = await db.execute(select(m.PaymentMethod).order_by(m.PaymentMethod.name))
    return list(result.scalars().all())


async def create_method(db: AsyncSession, data: s.PaymentMethodCreate) -> m.PaymentMethod:
    obj = m.PaymentMethod(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_method(db: AsyncSession, method_id: int) -> m.PaymentMethod | None:
    return await db.get(m.PaymentMethod, method_id)


async def update_method(db: AsyncSession, obj: m.PaymentMethod, data: s.PaymentMethodUpdate) -> m.PaymentMethod:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_method(db: AsyncSession, obj: m.PaymentMethod) -> None:
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- #
# Payment plans
# --------------------------------------------------------------------------- #
async def list_plans(db: AsyncSession) -> list[m.PaymentPlan]:
    result = await db.execute(select(m.PaymentPlan).order_by(m.PaymentPlan.name))
    return list(result.scalars().all())


async def get_plan(db: AsyncSession, plan_id: int) -> m.PaymentPlan | None:
    return await db.get(m.PaymentPlan, plan_id)


async def create_plan(db: AsyncSession, data: s.PaymentPlanCreate) -> m.PaymentPlan:
    obj = m.PaymentPlan(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_plan(db: AsyncSession, obj: m.PaymentPlan, data: s.PaymentPlanUpdate) -> m.PaymentPlan:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_plan(db: AsyncSession, obj: m.PaymentPlan) -> None:
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- #
# Schedule helpers
# --------------------------------------------------------------------------- #
def _resolve_params(terms, plan: m.PaymentPlan | None) -> engine.PlanParams:
    """Effective schedule inputs: a referenced plan wins; else the ad-hoc terms."""
    src = plan if plan is not None else terms
    return engine.PlanParams(
        deal_type=engine.DealType(src.deal_type),
        down_payment_percent=Decimal(src.down_payment_percent or 0),
        term_months=int(src.term_months or 0),
        markup_percent=Decimal(src.markup_percent or 0),
        day_of_month=int(src.day_of_month or 5),
    )


async def preview_schedule(
    db: AsyncSession, req: s.SchedulePreviewRequest
) -> tuple[Decimal, Decimal, engine.Schedule]:
    unit = await structure_service.get_unit(db, req.unit_id)
    if unit is None:
        raise ValueError("Unit not found")
    plan = await get_plan(db, req.plan_id) if req.plan_id else None
    params = _resolve_params(req, plan)
    price = structure_service.compute_price(unit)
    net = engine.net_price(price, req.discount_percent, req.discount_amount)
    schedule = engine.build_schedule(net, params, req.start_date or date.today())
    return price, net, schedule


# --------------------------------------------------------------------------- #
# Deal lifecycle
# --------------------------------------------------------------------------- #
async def get_deal(db: AsyncSession, deal_id: int) -> m.Deal | None:
    return await db.get(m.Deal, deal_id)


async def list_deals(db: AsyncSession) -> list[m.Deal]:
    result = await db.execute(select(m.Deal).order_by(m.Deal.created_at.desc()))
    return list(result.scalars().all())


async def list_deal_rows(db: AsyncSession) -> list[s.DealRow]:
    """Deals enriched with client/unit/manager names and collection progress."""
    from app.modules.clients.models import Client
    from app.modules.structure.models import Unit
    from app.modules.users.models import User

    stmt = (
        select(m.Deal, Client.full_name, Unit.number, User.full_name)
        .join(Client, m.Deal.client_id == Client.id)
        .join(Unit, m.Deal.unit_id == Unit.id)
        .outerjoin(User, m.Deal.manager_id == User.id)
        .order_by(m.Deal.created_at.desc())
    )
    result = await db.execute(stmt)
    rows: list[s.DealRow] = []
    for deal, client_name, unit_number, manager_name in result.all():
        paid = sum((p.paid_amount or Decimal("0") for p in deal.payments), Decimal("0"))
        unpaid = [p for p in deal.payments if (p.paid_amount or Decimal("0")) < p.amount]
        next_due = min((p.due_date for p in unpaid), default=None)
        rows.append(
            s.DealRow(
                id=deal.id,
                unit_number=unit_number,
                client_name=client_name,
                manager_name=manager_name,
                deal_type=deal.deal_type,
                state=deal.state,
                total=deal.total,
                paid=paid,
                remaining=deal.total - paid,
                next_due=next_due,
                payments_paid=len(deal.payments) - len(unpaid),
                payments_total=len(deal.payments),
            )
        )
    return rows


async def build_deal_detail(db: AsyncSession, deal: m.Deal) -> s.DealDetailOut:
    """DealOut + the joined names the deal card needs."""
    from app.modules.clients.models import Client
    from app.modules.structure.models import Block, Complex, Floor, Unit
    from app.modules.users.models import User

    unit = await db.get(Unit, deal.unit_id)
    client = await db.get(Client, deal.client_id)
    manager = await db.get(User, deal.manager_id) if deal.manager_id else None
    complex_name = None
    if unit is not None:
        floor = await db.get(Floor, unit.floor_id)
        block = await db.get(Block, floor.block_id) if floor else None
        cx = await db.get(Complex, block.complex_id) if block else None
        complex_name = cx.name if cx else None

    detail = s.DealDetailOut.model_validate(deal)
    detail.unit_number = unit.number if unit else None
    detail.client_name = client.full_name if client else None
    detail.client_phone = client.phone if client else None
    detail.manager_name = manager.full_name if manager else None
    detail.complex_name = complex_name
    return detail


async def create_deal(db: AsyncSession, data: s.DealCreate, author_id: int | None = None) -> m.Deal:
    unit = await structure_service.get_unit(db, data.unit_id)
    if unit is None:
        raise ValueError("Unit not found")
    if unit.status not in _SELLABLE:
        raise ValueError(f"Unit is not sellable (status={unit.status})")
    if await clients_service.get_client(db, data.client_id) is None:
        raise ValueError("Client not found")

    plan = await get_plan(db, data.plan_id) if data.plan_id else None
    params = _resolve_params(data, plan)

    price = structure_service.compute_price(unit)
    net = engine.net_price(price, data.discount_percent, data.discount_amount)
    # Total is independent of the start date, so today is fine for the snapshot.
    schedule = engine.build_schedule(net, params, date.today())

    deal = m.Deal(
        unit_id=unit.id,
        client_id=data.client_id,
        plan_id=plan.id if plan else None,
        manager_id=data.manager_id,
        deal_type=params.deal_type,
        price=price,
        total=schedule.total,
        discount_percent=data.discount_percent,
        discount_amount=data.discount_amount,
        down_payment_percent=params.down_payment_percent,
        term_months=params.term_months,
        markup_percent=params.markup_percent,
        day_of_month=params.day_of_month,
        note=data.note,
        state=m.DealState.DRAFT,
    )
    db.add(deal)
    await db.flush()
    log_event(db, deal.id, "created", "Bitim yaratildi", author_id)
    await db.commit()
    await db.refresh(deal)
    return deal


def _deal_total(deal: m.Deal) -> Decimal:
    """Recompute a deal's total from its own snapshotted terms."""
    params = engine.PlanParams(
        deal_type=engine.DealType(deal.deal_type),
        down_payment_percent=deal.down_payment_percent,
        term_months=deal.term_months,
        markup_percent=deal.markup_percent,
        day_of_month=deal.day_of_month,
    )
    net = engine.net_price(deal.price, deal.discount_percent, deal.discount_amount)
    return engine.build_schedule(net, params, date.today()).total


async def update_deal(db: AsyncSession, deal: m.Deal, data: s.DealUpdate, author_id: int | None = None) -> m.Deal:
    if deal.state in (m.DealState.SIGNED, m.DealState.ACTIVE, m.DealState.CLOSED):
        # Once signed, only paperwork fields may change (not the money terms).
        allowed = {"manager_id", "contract_no", "contract_date", "note"}
        payload = {k: v for k, v in data.model_dump(exclude_unset=True).items() if k in allowed}
    else:
        payload = data.model_dump(exclude_unset=True)
        # A referenced plan overrides ad-hoc term fields.
        if payload.get("plan_id"):
            plan = await get_plan(db, payload["plan_id"])
            if plan is not None:
                payload.update(deal_type=plan.deal_type, down_payment_percent=plan.down_payment_percent,
                               term_months=plan.term_months, markup_percent=plan.markup_percent,
                               day_of_month=plan.day_of_month)
    for field, value in payload.items():
        setattr(deal, field, value)
    if deal.state not in (m.DealState.SIGNED, m.DealState.ACTIVE, m.DealState.CLOSED):
        deal.total = _deal_total(deal)
    if payload:
        fields = ", ".join(sorted(payload.keys()))
        log_event(db, deal.id, "edit", f"Tahrirlandi: {fields}", author_id, {"fields": list(payload.keys())})
    await db.commit()
    await db.refresh(deal)
    return deal


async def _set_unit_status(db: AsyncSession, unit_id: int, status: UnitStatus) -> None:
    unit = await structure_service.get_unit(db, unit_id)
    if unit is not None:
        unit.status = status


async def reserve_deal(db: AsyncSession, deal: m.Deal, booking_days: int = 3, author_id: int | None = None) -> m.Deal:
    if deal.state not in (m.DealState.DRAFT, m.DealState.RESERVED):
        raise ValueError(f"Cannot reserve from state {deal.state}")
    await _set_unit_status(db, deal.unit_id, UnitStatus.RESERVED)
    deal.state = m.DealState.RESERVED
    deal.booking_expires_at = _now() + timedelta(days=max(booking_days, 0))
    log_event(db, deal.id, "reserved", f"Bron qilindi ({booking_days} kun)", author_id)
    await db.commit()
    await db.refresh(deal)
    await publish_unit_status(deal.unit_id, UnitStatus.RESERVED)
    return deal


async def sign_deal(
    db: AsyncSession, deal: m.Deal, start: date | None,
    contract_no: str | None = None, contract_date: date | None = None, author_id: int | None = None,
) -> m.Deal:
    """Generate the payment schedule, mark the unit sold, activate the deal."""
    if deal.state in (m.DealState.SIGNED, m.DealState.ACTIVE, m.DealState.CLOSED):
        raise ValueError(f"Deal already {deal.state}")

    # Schedule is built from the deal's own snapshotted terms + discount.
    params = engine.PlanParams(
        deal_type=engine.DealType(deal.deal_type),
        down_payment_percent=deal.down_payment_percent,
        term_months=deal.term_months,
        markup_percent=deal.markup_percent,
        day_of_month=deal.day_of_month,
    )
    net = engine.net_price(deal.price, deal.discount_percent, deal.discount_amount)
    schedule = engine.build_schedule(net, params, start or date.today())

    # First payment is due now (PENDING); the rest are future (PLANNED).
    deal.payments.clear()
    for i, line in enumerate(schedule.lines):
        deal.payments.append(
            m.Payment(
                seq=line.seq,
                kind=line.kind,
                due_date=line.due_date,
                amount=line.amount,
                status=m.PaymentStatus.PENDING if i == 0 else m.PaymentStatus.PLANNED,
            )
        )

    deal.total = schedule.total
    if contract_no is not None:
        deal.contract_no = contract_no
    deal.contract_date = contract_date or deal.contract_date or date.today()
    await _set_unit_status(db, deal.unit_id, UnitStatus.SOLD)
    deal.state = m.DealState.ACTIVE
    deal.signed_at = _now()
    log_event(db, deal.id, "signed", f"Shartnoma imzolandi{(' № ' + deal.contract_no) if deal.contract_no else ''}", author_id)
    await db.commit()
    await db.refresh(deal)
    await publish_unit_status(deal.unit_id, UnitStatus.SOLD)
    return deal


async def cancel_deal(db: AsyncSession, deal: m.Deal, author_id: int | None = None) -> m.Deal:
    if deal.state == m.DealState.CANCELLED:
        return deal
    # Release the unit back to the market.
    await _set_unit_status(db, deal.unit_id, UnitStatus.FREE)
    deal.state = m.DealState.CANCELLED
    log_event(db, deal.id, "cancelled", "Bitim bekor qilindi, xonadon boʻshatildi", author_id)
    await db.commit()
    await db.refresh(deal)
    await publish_unit_status(deal.unit_id, UnitStatus.FREE)
    return deal


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
async def get_payment(db: AsyncSession, payment_id: int) -> m.Payment | None:
    return await db.get(m.Payment, payment_id)


def _covers_label(seqs: list[int]) -> str:
    months = [x for x in seqs if x > 0]
    parts = []
    if 0 in seqs:
        parts.append("boshlangʻich")
    if months:
        parts.append(f"{min(months)}-oy" if len(months) == 1 else f"{min(months)}–{max(months)} oy")
    return ", ".join(parts) or "—"


async def distribute_payment(
    db: AsyncSession, deal: m.Deal, start_payment_id: int, amount: Decimal, method_id: int | None,
    author_id: int | None = None,
) -> tuple[list[dict], Decimal]:
    """Apply `amount` to the deal's schedule starting at `start_payment_id` and
    cascading any surplus to the following installments. Returns per-line
    allocations and any leftover that didn't fit the remaining schedule."""
    amount = Decimal(amount)
    if amount <= 0:
        raise ValueError("Payment amount must be positive")

    payments = sorted(deal.payments, key=lambda p: p.seq)
    start_seq = next((p.seq for p in payments if p.id == start_payment_id), None)
    if start_seq is None:
        raise ValueError("Payment not found on this deal")

    left = amount
    allocations: list[dict] = []
    for p in payments:
        if p.seq < start_seq or left <= 0:
            continue
        due = p.amount - (p.paid_amount or Decimal("0"))
        if due <= 0:
            continue
        take = min(due, left)
        p.paid_amount = (p.paid_amount or Decimal("0")) + take
        p.method_id = method_id
        if p.paid_amount >= p.amount:
            p.status = m.PaymentStatus.PAID
            p.paid_at = _now()
        else:
            p.status = m.PaymentStatus.PENDING
        left -= take
        allocations.append({"payment_id": p.id, "seq": p.seq, "applied": str(take)})

    applied_total = amount - left
    if applied_total > 0:
        covers = _covers_label([a["seq"] for a in allocations])
        # Sequential receipt number per deal.
        n = (await db.execute(select(func.count(m.PaymentReceipt.id)).where(m.PaymentReceipt.deal_id == deal.id))).scalar() or 0
        db.add(m.PaymentReceipt(
            deal_id=deal.id, number=f"INV-{deal.id}-{n + 1:04d}", amount=applied_total,
            method_id=method_id, covers=covers, author_id=author_id,
        ))
        log_event(db, deal.id, "payment", f"Toʻlov qabul qilindi ({covers})", author_id, {"amount": str(applied_total)})

    await db.commit()
    await db.refresh(deal)
    return allocations, left


async def record_payment(
    db: AsyncSession, payment: m.Payment, amount: Decimal, method_id: int | None
) -> m.Payment:
    if amount <= 0:
        raise ValueError("Payment amount must be positive")
    payment.paid_amount = (payment.paid_amount or Decimal("0")) + Decimal(amount)
    payment.method_id = method_id
    if payment.paid_amount >= payment.amount:
        payment.status = m.PaymentStatus.PAID
        payment.paid_at = _now()
    else:
        payment.status = m.PaymentStatus.PENDING
    await db.commit()
    await db.refresh(payment)
    return payment
