"""Smoke test for CRM v2 — feed, automations, custom fields, filters, stages."""

import asyncio
import os
import tempfile
from decimal import Decimal

_db_path = os.path.join(tempfile.mkdtemp(), "smoke_crm2.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.modules.crm import schemas as s, service  # noqa: E402
from app.modules.crm.models import EventKind  # noqa: E402

_failures = 0


def check(label, cond):
    global _failures
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        _failures += 1


async def main():
    await init_models()

    print("\n1) Seed pipeline + fields + automation")
    async with SessionFactory() as db:
        from scripts.seed import _seed_crm

        await _seed_crm(db)
        fields = await service.list_fields(db)
        check(f"3 custom fields (got {len(fields)})", len(fields) == 3)
        board = await service.get_board(db, None)
        autos = await service.list_automations(db, board.pipeline.id)
        check("1 automation seeded", len(autos) == 1)
        aloqa = board.stages[1]

    print("\n2) Create lead → has 'created' event")
    async with SessionFactory() as db:
        lead = await service.create_lead(db, s.LeadCreate(title="Alisher", budget=Decimal("800000000"), source="instagram"))
        lead_id = lead.id
        detail = await service.build_detail(db, lead)
        check("feed has created event", any(e.kind == EventKind.CREATED for e in detail.events))

    print("\n3) Add a note + a task to the feed")
    async with SessionFactory() as db:
        lead = await service.get_lead(db, lead_id)
        await service.add_event(db, lead, s.EventCreate(kind=EventKind.NOTE, text="Qiziqmoqda"), author_id=None)
        await service.add_event(db, lead, s.EventCreate(kind=EventKind.CALL, text="Qoʻngʻiroq qilindi"), author_id=None)
    async with SessionFactory() as db:
        detail = await service.build_detail(db, await service.get_lead(db, lead_id))
        check("note in feed", any(e.text == "Qiziqmoqda" for e in detail.events))
        check("call in feed", any(e.kind == EventKind.CALL for e in detail.events))

    print("\n4) Move to 'Aloqa qilindi' → stage_change + automation task")
    async with SessionFactory() as db:
        lead = await service.get_lead(db, lead_id)
        await service.move_lead(db, lead, aloqa.id)
    async with SessionFactory() as db:
        detail = await service.build_detail(db, await service.get_lead(db, lead_id))
        check("stage_change event added", any(e.kind == EventKind.STAGE_CHANGE for e in detail.events))
        auto_task = [e for e in detail.events if e.kind == EventKind.TASK and e.meta.get("auto")]
        check("automation created a task", len(auto_task) == 1)
        check("auto task has due date", auto_task and auto_task[0].due_at is not None)

    print("\n5) Custom field value + filters")
    async with SessionFactory() as db:
        lead = await service.get_lead(db, lead_id)
        await service.update_lead(db, lead, s.LeadUpdate(custom={"rooms": "3"}, tags=["vip"]))
    async with SessionFactory() as db:
        lead = await service.get_lead(db, lead_id)
        check("custom field saved", lead.custom.get("rooms") == "3")
        # filters
        board_q = await service.get_board(db, None, {"q": "alish"})
        board_tag = await service.get_board(db, None, {"tag": "vip"})
        board_src = await service.get_board(db, None, {"source": "telegram"})
        n_q = sum(st.count for st in board_q.stages)
        n_tag = sum(st.count for st in board_tag.stages)
        n_src = sum(st.count for st in board_src.stages)
        check(f"search 'alish' finds 1 (got {n_q})", n_q == 1)
        check(f"tag 'vip' finds 1 (got {n_tag})", n_tag == 1)
        check(f"source 'telegram' finds 0 (got {n_src})", n_src == 0)

    print("\n6) Stage editor: rename + guarded delete")
    async with SessionFactory() as db:
        board = await service.get_board(db, None)
        empty_stage = next(st for st in board.stages if st.count == 0 and not st.is_won and not st.is_lost)
        stage = await service.get_stage(db, empty_stage.id)
        renamed = await service.update_stage(db, stage, s.StageUpdate(name="Qayta nomlangan"))
        check("stage renamed", renamed.name == "Qayta nomlangan")
        # try to delete the stage holding the lead → should raise
        held = await service.get_stage(db, aloqa.id)
        try:
            await service.delete_stage(db, held)
            check("delete guarded when stage has leads", False)
        except ValueError:
            check("delete guarded when stage has leads", True)

    print()
    if _failures:
        print(f"FAILED: {_failures} check(s)")
        raise SystemExit(1)
    print("ALL CRM v2 CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
