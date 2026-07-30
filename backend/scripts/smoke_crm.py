"""Smoke test for the CRM module — pipeline/stages, leads, board, move."""

import asyncio
import os
import tempfile
from decimal import Decimal

_db_path = os.path.join(tempfile.mkdtemp(), "smoke_crm.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.modules.crm import schemas as s, service  # noqa: E402

_failures = 0


def check(label, cond):
    global _failures
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        _failures += 1


async def main():
    await init_models()

    print("\n1) Seed pipeline + stages")
    async with SessionFactory() as db:
        from scripts.seed import _seed_crm

        await _seed_crm(db)
        board = await service.get_board(db, None)
        check("default pipeline 'Sotuv'", board.pipeline.name == "Sotuv")
        check(f"6 stages (got {len(board.stages)})", len(board.stages) == 6)
        check("first stage 'Yangi'", board.stages[0].name == "Yangi")

    print("\n2) Create leads into first stage")
    async with SessionFactory() as db:
        await service.create_lead(db, s.LeadCreate(title="Alisher", budget=Decimal("820000000"), source="instagram", contact_name="Alisher K."))
        await service.create_lead(db, s.LeadCreate(title="Dilnoza", budget=Decimal("640000000"), source="telegram"))
        board = await service.get_board(db, None)
        first = board.stages[0]
        check(f"2 leads in 'Yangi' (got {first.count})", first.count == 2)
        check(f"stage total budget 1.46B (got {first.total_budget})", first.total_budget == Decimal("1460000000"))

    print("\n3) Contact auto-created from contact_name")
    async with SessionFactory() as db:
        from app.modules.clients import service as clients_service
        contacts = await clients_service.list_contacts(db)
        check("1 contact created", len(contacts) == 1 and contacts[0].full_name == "Alisher K.")

    print("\n4) Move a lead to the 'Yutdi' (won) stage")
    async with SessionFactory() as db:
        board = await service.get_board(db, None)
        lead_id = board.stages[0].leads[0].id
        won_stage = next(st for st in board.stages if st.is_won)
        lead = await service.get_lead(db, lead_id)
        moved = await service.move_lead(db, lead, won_stage.id)
        check("lead moved to won stage", moved.stage_id == won_stage.id)
        check("lead status = won", moved.status == "won")

    async with SessionFactory() as db:
        board = await service.get_board(db, None)
        yangi = board.stages[0]
        yutdi = next(st for st in board.stages if st.is_won)
        check(f"'Yangi' now has 1 (got {yangi.count})", yangi.count == 1)
        check(f"'Yutdi' now has 1 (got {yutdi.count})", yutdi.count == 1)

    print()
    if _failures:
        print(f"FAILED: {_failures} check(s)")
        raise SystemExit(1)
    print("ALL CRM CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
