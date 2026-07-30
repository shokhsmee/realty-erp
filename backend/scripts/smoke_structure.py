"""Smoke test for the structure module — runs on a throwaway SQLite DB."""

import asyncio
import os
import tempfile
from decimal import Decimal

_db_path = os.path.join(tempfile.mkdtemp(), "smoke_structure.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.modules.structure import schemas as s  # noqa: E402
from app.modules.structure import service  # noqa: E402
from app.modules.structure.models import SpaceKind  # noqa: E402

_failures = 0


def check(label, cond):
    global _failures
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        _failures += 1


async def main():
    await init_models()

    print("\n1) Build the tree")
    async with SessionFactory() as db:
        cx = await service.create_complex(db, s.ComplexCreate(name="ЖК Bunyodkor"))
        block = await service.create_block(db, s.BlockCreate(complex_id=cx.id, name="B"))
        created = await service.scaffold_block(
            db, block, s.BlockScaffold(floors=4, units_per_floor=6, price_per_m2=Decimal("12000000"))
        )
        check(f"scaffold created 24 units (got {created})", created == 24)

    print("\n2) Unit with separated m² parts → computed price")
    async with SessionFactory() as db:
        block = (await service.list_complexes(db))  # noqa: F841
        # fetch a floor via the tree
        tree = await service.get_complex_tree(db, cx.id)
        floor = tree.blocks[0].floors[0]
        unit = await service.create_unit(
            db,
            s.UnitCreate(
                floor_id=floor.id, number="B-999", rooms=3,
                price_per_m2=Decimal("12000000"),
                parts=[
                    s.SpacePartIn(kind=SpaceKind.LIVING, m2=Decimal("24.5")),
                    s.SpacePartIn(kind=SpaceKind.KITCHEN, m2=Decimal("12")),
                    s.SpacePartIn(kind=SpaceKind.BEDROOM, m2=Decimal("16")),
                    s.SpacePartIn(kind=SpaceKind.BALCONY, m2=Decimal("6"), price_factor=Decimal("0.5")),
                    s.SpacePartIn(kind=SpaceKind.BATHROOM, m2=Decimal("4.5")),
                ],
            ),
        )
        out = s.UnitOut.model_validate(unit)
        check(f"total_m² = 63.00 (physical) (got {out.total_m2})", out.total_m2 == Decimal("63.00"))
        check(f"billable_m² = 60.00 (balcony ×0.5) (got {out.billable_m2})", out.billable_m2 == Decimal("60.00"))
        check(f"price = 720,000,000 (got {out.price})", out.price == Decimal("720000000.00"))

    print("\n3) Price override wins")
    async with SessionFactory() as db:
        u = await service.get_unit(db, unit.id)
        u = await service.update_unit(db, u, s.UnitUpdate(price_override=Decimal("999000000")))
        out = s.UnitOut.model_validate(u)
        check(f"override respected (got {out.price})", out.price == Decimal("999000000.00"))

    print("\n4) Additionals (parking)")
    async with SessionFactory() as db:
        from app.modules.structure.models import AdditionalKind
        await service.create_additional(
            db, s.AdditionalCreate(complex_id=cx.id, kind=AdditionalKind.PARKING, number="P-01", price=Decimal("50000000"))
        )
        adds = await service.list_additionals(db, cx.id)
        check("1 parking additional listed", len(adds) == 1 and adds[0].kind == "parking")

    print("\n5) Tree loads nested (blocks→floors→units)")
    async with SessionFactory() as db:
        tree = await service.get_complex_tree(db, cx.id)
        total_units = sum(len(f.units) for b in tree.blocks for f in b.floors)
        check(f"tree has 25 units total (got {total_units})", total_units == 25)

    print()
    if _failures:
        print(f"FAILED: {_failures} check(s)")
        raise SystemExit(1)
    print("ALL STRUCTURE CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
