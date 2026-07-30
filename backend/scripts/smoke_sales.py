"""Smoke test for the sales flow — schedule engine + full deal lifecycle."""

import asyncio
import os
import tempfile
from datetime import date
from decimal import Decimal

_db_path = os.path.join(tempfile.mkdtemp(), "smoke_sales.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.modules.clients import schemas as cs, service as clients_service  # noqa: E402
from app.modules.sales import engine, schemas as ss, service as sales_service  # noqa: E402
from app.modules.structure import schemas as sts, service as structure_service  # noqa: E402
from app.modules.structure.models import SpaceKind, UnitStatus  # noqa: E402

_failures = 0


def check(label, cond):
    global _failures
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        _failures += 1


async def main():
    await init_models()

    # --- engine unit test (pure, no DB) ---
    print("\n1) Schedule engine (installment 24 oy, 30% down, +15%)")
    plan = engine.PlanParams(
        deal_type=engine.DealType.INSTALLMENT,
        down_payment_percent=Decimal("30"), term_months=24,
        markup_percent=Decimal("15"), day_of_month=5,
    )
    sched = engine.build_schedule(Decimal("720000000"), plan, date(2026, 1, 10))
    total_expected = Decimal("828000000.00")          # 720M × 1.15
    down_expected = Decimal("248400000.00")           # 30% of total
    check(f"total = 828,000,000 (got {sched.total})", sched.total == total_expected)
    check(f"down = 248,400,000 (got {sched.lines[0].amount})", sched.lines[0].amount == down_expected)
    check("25 lines (1 down + 24 monthly)", len(sched.lines) == 25)
    paid_sum = sum(l.amount for l in sched.lines)
    check(f"lines sum to total exactly (got {paid_sum})", paid_sum == total_expected)
    check("installment due day = 5th", sched.lines[1].due_date.day == 5)

    # --- full DB flow ---
    print("\n2) Build unit + client + plan")
    async with SessionFactory() as db:
        cx = await structure_service.create_complex(db, sts.ComplexCreate(name="ЖК Test"))
        block = await structure_service.create_block(db, sts.BlockCreate(complex_id=cx.id, name="B"))
        floor = await structure_service.create_floor(db, sts.FloorCreate(block_id=block.id, number=9))
        unit = await structure_service.create_unit(db, sts.UnitCreate(
            floor_id=floor.id, number="B-903", rooms=3, price_per_m2=Decimal("12000000"),
            parts=[
                sts.SpacePartIn(kind=SpaceKind.LIVING, m2=Decimal("30")),
                sts.SpacePartIn(kind=SpaceKind.KITCHEN, m2=Decimal("14")),
                sts.SpacePartIn(kind=SpaceKind.BEDROOM, m2=Decimal("16")),
                sts.SpacePartIn(kind=SpaceKind.BALCONY, m2=Decimal("0"), price_factor=Decimal("0.5")),
            ],
        ))
        client = await clients_service.create_client(db, cs.ClientCreate(full_name="Alisher Karimov"))
        dbplan = await sales_service.create_plan(db, ss.PaymentPlanCreate(
            name="24 oy +15%", deal_type=engine.DealType.INSTALLMENT,
            down_payment_percent=Decimal("30"), term_months=24, markup_percent=Decimal("15"),
        ))
        unit_id, client_id, plan_id = unit.id, client.id, dbplan.id
        check(f"unit price = 720,000,000 (got {structure_service.compute_price(unit)})",
              structure_service.compute_price(unit) == Decimal("720000000.00"))

    print("\n3) Preview → create → sign")
    async with SessionFactory() as db:
        price, sched = await sales_service.preview_schedule(db, unit_id, plan_id, date(2026, 1, 10))
        check(f"preview total 828M (got {sched.total})", sched.total == Decimal("828000000.00"))

        deal = await sales_service.create_deal(db, ss.DealCreate(
            unit_id=unit_id, client_id=client_id, plan_id=plan_id,
        ))
        deal_id = deal.id
        check("deal starts DRAFT", deal.state == "draft")
        check(f"deal total snapshot 828M (got {deal.total})", deal.total == Decimal("828000000.00"))

    async with SessionFactory() as db:
        deal = await sales_service.get_deal(db, deal_id)
        deal = await sales_service.sign_deal(db, deal, date(2026, 1, 10))
        check("deal ACTIVE after sign", deal.state == "active")
        check("25 payment rows generated", len(deal.payments) == 25)
        check("first payment PENDING", deal.payments[0].status == "pending")
        check("second payment PLANNED", deal.payments[1].status == "planned")

    print("\n4) Unit flipped to SOLD (live status)")
    async with SessionFactory() as db:
        u = await structure_service.get_unit(db, unit_id)
        check(f"unit status = sold (got {u.status})", u.status == UnitStatus.SOLD)

    print("\n5) Record the down payment")
    async with SessionFactory() as db:
        deal = await sales_service.get_deal(db, deal_id)
        down = deal.payments[0]
        paid = await sales_service.record_payment(db, down, Decimal("248400000"), method_id=None)
        check("down payment marked PAID", paid.status == "paid")

    print("\n6) Cancel releases the unit")
    async with SessionFactory() as db:
        deal = await sales_service.get_deal(db, deal_id)
        await sales_service.cancel_deal(db, deal)
        u = await structure_service.get_unit(db, unit_id)
        check(f"unit back to FREE (got {u.status})", u.status == UnitStatus.FREE)

    print()
    if _failures:
        print(f"FAILED: {_failures} check(s)")
        raise SystemExit(1)
    print("ALL SALES CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
