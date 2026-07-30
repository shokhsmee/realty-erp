"""Smoke test for accounting reports — builds an overdue installment deal."""

import asyncio
import os
import tempfile
from datetime import date
from decimal import Decimal

_db_path = os.path.join(tempfile.mkdtemp(), "smoke_acct.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.modules.accounting import service as acct  # noqa: E402
from app.modules.clients import schemas as cs, service as clients_service  # noqa: E402
from app.modules.sales import engine, schemas as ss, service as sales_service  # noqa: E402
from app.modules.structure import schemas as sts, service as structure_service  # noqa: E402
from app.modules.structure.models import SpaceKind  # noqa: E402

_failures = 0


def check(label, cond):
    global _failures
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        _failures += 1


async def main():
    await init_models()
    today = date(2026, 7, 29)

    print("\n1) Build a signed installment deal starting in the past")
    async with SessionFactory() as db:
        cx = await structure_service.create_complex(db, sts.ComplexCreate(name="ЖК Acct"))
        block = await structure_service.create_block(db, sts.BlockCreate(complex_id=cx.id, name="B"))
        floor = await structure_service.create_floor(db, sts.FloorCreate(block_id=block.id, number=1))
        unit = await structure_service.create_unit(db, sts.UnitCreate(
            floor_id=floor.id, number="B-101", rooms=2, price_per_m2=Decimal("10000000"),
            parts=[sts.SpacePartIn(kind=SpaceKind.LIVING, m2=Decimal("60"))],
        ))
        client = await clients_service.create_client(db, cs.ClientCreate(full_name="Qarzdor Mijoz"))
        plan = await sales_service.create_plan(db, ss.PaymentPlanCreate(
            name="12 oy", deal_type=engine.DealType.INSTALLMENT,
            down_payment_percent=Decimal("20"), term_months=12,
        ))
        deal = await sales_service.create_deal(db, ss.DealCreate(unit_id=unit.id, client_id=client.id, plan_id=plan.id))
        deal_id, first_payment = deal.id, None

    async with SessionFactory() as db:
        deal = await sales_service.get_deal(db, deal_id)
        # Sign starting 2026-01-01 → down + Jan..Jun installments are before "today" (Jul 29).
        deal = await sales_service.sign_deal(db, deal, date(2026, 1, 1))
        first_payment = deal.payments[0].id

    print("\n2) Summary shows overdue")
    async with SessionFactory() as db:
        summ = await acct.summary(db, today)
        # price 600M, 12 months, 20% down. down=120M due 2026-01-01 (overdue),
        # + monthly ~40M on the 1st Feb..Jul overdue (6), plus down = 7 overdue.
        check(f"overdue_count = 7 (got {summ.overdue_count})", summ.overdue_count == 7)
        check(f"planned_total = 600M (got {summ.planned_total})", summ.planned_total == Decimal("600000000.00"))
        check("collected_total = 0 so far", summ.collected_total == Decimal("0"))
        check(f"outstanding = 600M (got {summ.outstanding_total})", summ.outstanding_total == Decimal("600000000.00"))

    print("\n3) Debtors lists the client")
    async with SessionFactory() as db:
        deb = await acct.debtors(db, today)
        check("1 debtor", len(deb) == 1)
        check("debtor name", deb[0].client_name == "Qarzdor Mijoz")
        check(f"overdue_count 7 (got {deb[0].overdue_count})", deb[0].overdue_count == 7)
        check("days_overdue > 0", deb[0].days_overdue > 0)

    print("\n4) Record the down payment → collected updates, overdue drops")
    async with SessionFactory() as db:
        p = await sales_service.get_payment(db, first_payment)
        await sales_service.record_payment(db, p, p.amount, method_id=None)

    async with SessionFactory() as db:
        summ = await acct.summary(db, today)
        check(f"collected_total = 120M down (got {summ.collected_total})", summ.collected_total == Decimal("120000000.00"))
        check(f"overdue_count now 6 (got {summ.overdue_count})", summ.overdue_count == 6)

    print("\n5) Register filters by status")
    async with SessionFactory() as db:
        overdue = await acct.register(db, today, "overdue")
        paid = await acct.register(db, today, "paid")
        check("6 overdue rows", len(overdue) == 6)
        check("1 paid row", len(paid) == 1)
        check("overdue rows carry days_overdue", all(r.overdue_days > 0 for r in overdue))

    print()
    if _failures:
        print(f"FAILED: {_failures} check(s)")
        raise SystemExit(1)
    print("ALL ACCOUNTING CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
