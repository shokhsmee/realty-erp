"""Bootstrap the database: create tables, default roles, and the first admin.

Run once after the DB is up:

    python -m scripts.seed

Idempotent — safe to run repeatedly; it skips anything that already exists.
"""

import asyncio

from app.core.config import settings
from app.core.database import SessionFactory, init_models
from app.core.permissions import App, Level
from app.core.security import hash_password
from app.modules.users import service
from app.modules.users.models import User, UserStatus

# Level shorthands for readability of the matrix below.
N, V, E, M = Level.NONE, Level.VIEW, Level.EDIT, Level.MANAGE

# Default per-app access for each built-in role (mirrors the Settings UI matrix).
#                        showroom shaxmatka deals crm  clients acct dash settings
ROLE_MATRIX: dict[str, tuple] = {
    "administrator": (M, M, M, M, M, M, M, M),
    "sales_head":    (V, M, M, M, E, V, V, N),
    "sales_manager": (V, E, E, E, E, N, N, N),
    "accountant":    (N, V, V, N, V, M, V, N),
    "marketing":     (E, V, N, E, V, N, V, N),
    "call_center":   (V, V, N, E, V, N, N, N),
    "viewer":        (V, V, V, V, V, V, V, N),
}

ROLE_NAMES: dict[str, str] = {
    "administrator": "Administrator",
    "sales_head": "Sotuv boshligʻi",
    "sales_manager": "Sotuv menejeri",
    "accountant": "Buxgalter",
    "marketing": "Marketing",
    "call_center": "Call-center",
    "viewer": "Koʻruvchi (Viewer)",
}

_APPS_ORDER = [
    App.SHOWROOM, App.SHAXMATKA, App.DEALS, App.CRM,
    App.CLIENTS, App.ACCOUNTING, App.DASHBOARD, App.SETTINGS,
]


def _access_map(levels: tuple) -> dict[str, str]:
    return {app.value: lvl.value for app, lvl in zip(_APPS_ORDER, levels)}


async def seed() -> None:
    await init_models()

    async with SessionFactory() as db:
        # --- Roles ---
        for key, levels in ROLE_MATRIX.items():
            if await service.get_role_by_key(db, key):
                print(f"role '{key}' exists, skipping")
                continue
            from app.modules.users.schemas import RoleCreate

            await service.create_role(
                db,
                RoleCreate(
                    key=key,
                    name=ROLE_NAMES[key],
                    default_access=_access_map(levels),
                ),
                is_system=True,
            )
            print(f"created role '{key}'")

        # --- First admin ---
        if await service.get_by_email(db, settings.FIRST_ADMIN_EMAIL):
            print("admin user exists, skipping")
        else:
            admin_role = await service.get_role_by_key(db, "administrator")
            admin = User(
                email=settings.FIRST_ADMIN_EMAIL,
                full_name=settings.FIRST_ADMIN_NAME,
                hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
                status=UserStatus.ACTIVE,
                is_superuser=True,
                base_role_id=admin_role.id if admin_role else None,
            )
            db.add(admin)
            await db.commit()
            print(f"created admin: {settings.FIRST_ADMIN_EMAIL}")

        await _seed_sales_config(db)
        await _seed_crm(db)

    print("seed complete.")


async def _seed_crm(db) -> None:
    """Default sales pipeline with amoCRM-style stages."""
    from app.modules.crm import service as crm_service
    from app.modules.crm.schemas import PipelineCreate, StageCreate

    if await crm_service.list_pipelines(db):
        return

    pipeline = await crm_service.create_pipeline(db, PipelineCreate(name="Sotuv", is_default=True))
    stage_defs = [
        StageCreate(name="Yangi", position=0, color="info"),
        StageCreate(name="Aloqa qilindi", position=1, color="accent"),
        StageCreate(name="Uchrashuv", position=2, color="warn"),
        StageCreate(name="Shartnoma", position=3, color="accent"),
        StageCreate(name="Yutdi", position=4, color="ok", is_won=True),
        StageCreate(name="Yutqazdi", position=5, color="crit", is_lost=True),
    ]
    stages = [await crm_service.create_stage(db, pipeline.id, sd) for sd in stage_defs]
    print(f"created CRM pipeline '{pipeline.name}' with {len(stages)} stages")

    # Custom fields on the lead card (lead body settings).
    from app.modules.crm.schemas import AutomationCreate, FieldDefCreate
    from app.modules.crm.models import AutomationAction, FieldType

    fields = [
        FieldDefCreate(key="phone", label="Telefon", field_type=FieldType.TEXT, position=0),
        FieldDefCreate(
            key="rooms", label="Xona soni", field_type=FieldType.SELECT,
            options=["1", "2", "3", "4+"], position=1,
        ),
        FieldDefCreate(key="visit_date", label="Kelish sanasi", field_type=FieldType.DATE, position=2),
    ]
    for fd in fields:
        await crm_service.create_field(db, fd)

    # Default lost reasons for the pipeline.
    from app.modules.crm.schemas import LostReasonCreate, TagCreate, TaskTypeCreate

    for i, text in enumerate(["Juda qimmat", "Ehtiyoj yoʻqoldi", "Shartlar toʻgʻri kelmadi", "Boshqasini tanladi"]):
        await crm_service.create_lost_reason(db, LostReasonCreate(pipeline_id=pipeline.id, text=text, position=i))

    # Default task types + a few starter tags.
    for name, icon in [("Qoʻngʻiroq", "☎"), ("Uchrashuv", "◫"), ("Xat", "✉"), ("Follow-up", "◔")]:
        await crm_service.create_task_type(db, TaskTypeCreate(name=name, icon=icon))
    for text, color in [("VIP", "ok"), ("Issiq", "crit"), ("Sovuq", "info")]:
        await crm_service.create_tag(db, TagCreate(text=text, color=color))

    # Automation: entering "Aloqa qilindi" creates a call-back task.
    await crm_service.create_automation(
        db,
        AutomationCreate(
            pipeline_id=pipeline.id,
            trigger_stage_id=stages[1].id,
            action=AutomationAction.CREATE_TASK,
            config={"text": "Mijozga qoʻngʻiroq qilish", "due_days": 1},
        ),
    )
    print(f"created {len(fields)} CRM fields + 1 automation")


async def _seed_sales_config(db) -> None:
    """Default payment methods and plans (deal types with settings)."""
    from decimal import Decimal

    from app.modules.sales import service as sales_service
    from app.modules.sales.engine import DealType
    from app.modules.sales.schemas import PaymentMethodCreate, PaymentPlanCreate

    if not await sales_service.list_methods(db):
        methods = [
            ("cash", "Naqd / Cash"),
            ("bank_transfer", "Bank oʻtkazma"),
            ("card", "Karta / Terminal"),
            ("payme", "Payme"),
            ("click", "Click"),
            ("uzum", "Uzum"),
            ("credit", "Bank krediti"),
        ]
        for key, name in methods:
            await sales_service.create_method(db, PaymentMethodCreate(key=key, name=name))
        print(f"created {len(methods)} payment methods")

    if not await sales_service.list_plans(db):
        plans = [
            PaymentPlanCreate(name="Naqt", deal_type=DealType.CASH),
            PaymentPlanCreate(
                name="Boʻlib toʻlash 12 oy", deal_type=DealType.INSTALLMENT,
                down_payment_percent=Decimal("30"), term_months=12,
            ),
            PaymentPlanCreate(
                name="Boʻlib toʻlash 24 oy +15%", deal_type=DealType.INSTALLMENT,
                down_payment_percent=Decimal("30"), term_months=24, markup_percent=Decimal("15"),
            ),
            PaymentPlanCreate(
                name="Kredit", deal_type=DealType.MORTGAGE, down_payment_percent=Decimal("30"),
            ),
        ]
        for plan in plans:
            await sales_service.create_plan(db, plan)
        print(f"created {len(plans)} payment plans")


if __name__ == "__main__":
    asyncio.run(seed())
