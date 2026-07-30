"""HTTP endpoints for sales: methods, plans, schedule preview, deals, payments.

Guarded by the `deals` app: reads need view, deal actions need edit, and config
(methods/plans) needs manage. Service ValueErrors become HTTP 400.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUser, DbSession, require
from app.core.permissions import App, Level
from app.modules.sales import schemas as s
from app.modules.sales import service

view = Depends(require(App.DEALS, Level.VIEW))
edit = Depends(require(App.DEALS, Level.EDIT))
manage = Depends(require(App.DEALS, Level.MANAGE))

router = APIRouter(prefix="/sales", tags=["sales"])


def _bad_request(exc: ValueError) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


async def _get_deal_or_404(db, deal_id: int):
    deal = await service.get_deal(db, deal_id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")
    return deal


# --------------------------------------------------------------------------- #
# Config: payment methods & plans
# --------------------------------------------------------------------------- #
@router.get("/payment-methods", response_model=list[s.PaymentMethodOut], dependencies=[view])
async def list_methods(db: DbSession):
    return await service.list_methods(db)


@router.post("/payment-methods", response_model=s.PaymentMethodOut, status_code=201, dependencies=[manage])
async def create_method(payload: s.PaymentMethodCreate, db: DbSession):
    return await service.create_method(db, payload)


@router.patch("/payment-methods/{method_id}", response_model=s.PaymentMethodOut, dependencies=[manage])
async def update_method(method_id: int, payload: s.PaymentMethodUpdate, db: DbSession):
    obj = await service.get_method(db, method_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Method not found")
    return await service.update_method(db, obj, payload)


@router.delete("/payment-methods/{method_id}", status_code=204, dependencies=[manage])
async def delete_method(method_id: int, db: DbSession):
    obj = await service.get_method(db, method_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Method not found")
    await service.delete_method(db, obj)


@router.get("/plans", response_model=list[s.PaymentPlanOut], dependencies=[view])
async def list_plans(db: DbSession):
    return await service.list_plans(db)


@router.post("/plans", response_model=s.PaymentPlanOut, status_code=201, dependencies=[manage])
async def create_plan(payload: s.PaymentPlanCreate, db: DbSession):
    return await service.create_plan(db, payload)


@router.patch("/plans/{plan_id}", response_model=s.PaymentPlanOut, dependencies=[manage])
async def update_plan(plan_id: int, payload: s.PaymentPlanUpdate, db: DbSession):
    obj = await service.get_plan(db, plan_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    return await service.update_plan(db, obj, payload)


@router.delete("/plans/{plan_id}", status_code=204, dependencies=[manage])
async def delete_plan(plan_id: int, db: DbSession):
    obj = await service.get_plan(db, plan_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    await service.delete_plan(db, obj)


# --------------------------------------------------------------------------- #
# Schedule preview
# --------------------------------------------------------------------------- #
@router.post("/schedule-preview", response_model=s.SchedulePreviewOut, dependencies=[view])
async def schedule_preview(payload: s.SchedulePreviewRequest, db: DbSession):
    try:
        price, net, schedule = await service.preview_schedule(db, payload)
    except ValueError as exc:
        raise _bad_request(exc)
    return s.SchedulePreviewOut(
        unit_price=price,
        net_price=net,
        total=schedule.total,
        lines=[s.ScheduleLineOut(**vars(line)) for line in schedule.lines],
    )


# --------------------------------------------------------------------------- #
# Deals
# --------------------------------------------------------------------------- #
@router.get("/deals", response_model=list[s.DealOut], dependencies=[view])
async def list_deals(db: DbSession):
    return await service.list_deals(db)


@router.get("/deals/rows", response_model=list[s.DealRow], dependencies=[view])
async def list_deal_rows(db: DbSession):
    return await service.list_deal_rows(db)


@router.post("/deals", response_model=s.DealOut, status_code=201, dependencies=[edit])
async def create_deal(payload: s.DealCreate, db: DbSession, user: CurrentUser):
    try:
        return await service.create_deal(db, payload, author_id=user.id)
    except ValueError as exc:
        raise _bad_request(exc)


@router.get("/deals/{deal_id}", response_model=s.DealDetailOut, dependencies=[view])
async def get_deal(deal_id: int, db: DbSession):
    deal = await _get_deal_or_404(db, deal_id)
    return await service.build_deal_detail(db, deal)


@router.patch("/deals/{deal_id}", response_model=s.DealOut, dependencies=[edit])
async def update_deal(deal_id: int, payload: s.DealUpdate, db: DbSession, user: CurrentUser):
    deal = await _get_deal_or_404(db, deal_id)
    try:
        return await service.update_deal(db, deal, payload, author_id=user.id)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/deals/{deal_id}/reserve", response_model=s.DealOut, dependencies=[edit])
async def reserve_deal(deal_id: int, db: DbSession, user: CurrentUser, payload: s.ReserveRequest = s.ReserveRequest()):
    deal = await _get_deal_or_404(db, deal_id)
    try:
        return await service.reserve_deal(db, deal, payload.booking_days, author_id=user.id)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/deals/{deal_id}/sign", response_model=s.DealOut, dependencies=[edit])
async def sign_deal(deal_id: int, payload: s.SignRequest, db: DbSession, user: CurrentUser):
    deal = await _get_deal_or_404(db, deal_id)
    try:
        return await service.sign_deal(db, deal, payload.start_date, payload.contract_no, payload.contract_date, author_id=user.id)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/deals/{deal_id}/cancel", response_model=s.DealOut, dependencies=[edit])
async def cancel_deal(deal_id: int, db: DbSession, user: CurrentUser):
    deal = await _get_deal_or_404(db, deal_id)
    return await service.cancel_deal(db, deal, author_id=user.id)


# --------------------------------------------------------------------------- #
# Receipts (paid invoices) & chatter events
# --------------------------------------------------------------------------- #
@router.get("/deals/{deal_id}/receipts", response_model=list[s.ReceiptOut], dependencies=[view])
async def list_receipts(deal_id: int, db: DbSession):
    return await service.list_receipts(db, deal_id)


@router.get("/deals/{deal_id}/events", response_model=list[s.DealEventOut], dependencies=[view])
async def list_events(deal_id: int, db: DbSession):
    return await service.list_events(db, deal_id)


@router.post("/deals/{deal_id}/events", response_model=s.DealEventOut, status_code=201, dependencies=[view])
async def add_event(deal_id: int, payload: s.EventCreate, db: DbSession, user: CurrentUser):
    await _get_deal_or_404(db, deal_id)
    return await service.add_event(db, deal_id, payload.text, author_id=user.id)


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
@router.post("/deals/{deal_id}/distribute", response_model=s.DistributeResult, dependencies=[edit])
async def distribute_payment(deal_id: int, payload: s.DistributeRequest, db: DbSession, user: CurrentUser):
    deal = await _get_deal_or_404(db, deal_id)
    try:
        allocations, leftover = await service.distribute_payment(
            db, deal, payload.start_payment_id, payload.amount, payload.method_id, author_id=user.id
        )
    except ValueError as exc:
        raise _bad_request(exc)
    return s.DistributeResult(allocations=allocations, leftover=leftover)


@router.post("/payments/{payment_id}/record", response_model=s.PaymentOut, dependencies=[edit])
async def record_payment(payment_id: int, payload: s.RecordPaymentRequest, db: DbSession):
    payment = await service.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    try:
        return await service.record_payment(db, payment, payload.amount, payload.method_id)
    except ValueError as exc:
        raise _bad_request(exc)
