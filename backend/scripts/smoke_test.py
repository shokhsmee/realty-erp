"""Standalone smoke test — verifies the auth/RBAC slice end to end on SQLite.

Run:  python -m scripts.smoke_test
It sets a throwaway SQLite DB via env before importing the app, so it needs no
Postgres. Not a replacement for real tests — a fast confidence check.
"""

import asyncio
import os
import tempfile

# Configure a temp SQLite DB BEFORE importing anything that reads settings.
_db_path = os.path.join(tempfile.mkdtemp(), "smoke.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "production"  # silence SQL echo
os.environ["SECRET_KEY"] = "smoke-secret"

from app.core.database import SessionFactory, init_models  # noqa: E402
from app.core.deps import require  # noqa: E402
from app.core.permissions import App, Level  # noqa: E402
from app.core.security import create_access_token, decode_token  # noqa: E402
from app.modules.auth import service as auth_service  # noqa: E402
from app.modules.users import service as users_service  # noqa: E402
from app.modules.users.schemas import UserInvite  # noqa: E402
from fastapi import HTTPException  # noqa: E402

PASS, FAIL = "  ✓", "  ✗"
_failures = 0


def check(label: str, condition: bool) -> None:
    global _failures
    print(f"{PASS if condition else FAIL} {label}")
    if not condition:
        _failures += 1


async def main() -> None:
    await init_models()

    # Seed roles + admin using the real seed logic.
    from scripts.seed import ROLE_MATRIX, ROLE_NAMES, _access_map
    from app.modules.users.models import User, UserStatus
    from app.modules.users.schemas import RoleCreate
    from app.core.security import hash_password

    async with SessionFactory() as db:
        for key, levels in ROLE_MATRIX.items():
            await users_service.create_role(
                db, RoleCreate(key=key, name=ROLE_NAMES[key], default_access=_access_map(levels)),
                is_system=True,
            )
        admin_role = await users_service.get_role_by_key(db, "administrator")
        db.add(User(
            email="admin@example.com", full_name="Admin",
            hashed_password=hash_password("admin12345"),
            status=UserStatus.ACTIVE, is_superuser=True, base_role_id=admin_role.id,
        ))
        await db.commit()

    print("\n1) Roles seeded")
    async with SessionFactory() as db:
        roles = await users_service.list_roles(db)
        check(f"7 roles created (got {len(roles)})", len(roles) == 7)

    print("\n2) Admin login + tokens")
    async with SessionFactory() as db:
        admin = await auth_service.authenticate(db, "admin@example.com", "admin12345")
        check("correct password authenticates", admin is not None)
        bad = await auth_service.authenticate(db, "admin@example.com", "wrong")
        check("wrong password rejected", bad is None)
        token = create_access_token(admin.id)
        decoded = decode_token(token, expected_type="access")
        check("access token round-trips", int(decoded["sub"]) == admin.id)
        try:
            decode_token(token, expected_type="refresh")
            check("access token rejected as refresh", False)
        except Exception:
            check("access token rejected as refresh", True)

    print("\n3) Effective access (role defaults)")
    async with SessionFactory() as db:
        admin = await users_service.get_by_email(db, "admin@example.com")
        admin = await users_service.get_with_access(db, admin.id)
        acc = users_service.effective_access(admin)
        check("admin has manage on accounting", acc["accounting"] == "manage")

    print("\n4) Invite a sales manager + per-app override")
    async with SessionFactory() as db:
        sm_role = await users_service.get_role_by_key(db, "sales_manager")
        # Override: give this manager VIEW on dashboard (role default is none).
        user, invite_token = await users_service.create_invite(
            db,
            UserInvite(
                email="manager@realty.uz", full_name="Jamshid",
                base_role_id=sm_role.id,
                access_overrides={App.DASHBOARD: Level.VIEW},
            ),
        )
        check("invited user starts INVITED", user.status == "invited")

    async with SessionFactory() as db:
        activated = await users_service.accept_invite(db, invite_token, "manager123")
        check("accept-invite activates user", activated is not None and activated.status == "active")

    async with SessionFactory() as db:
        mgr = await users_service.get_by_email(db, "manager@realty.uz")
        mgr = await users_service.get_with_access(db, mgr.id)
        acc = users_service.effective_access(mgr)
        check("manager: shaxmatka=edit (role default)", acc["shaxmatka"] == "edit")
        check("manager: dashboard=view (override beats none)", acc["dashboard"] == "view")
        check("manager: settings=none", acc["settings"] == "none")

    print("\n5) require() guard enforcement")
    async with SessionFactory() as db:
        mgr = await users_service.get_by_email(db, "manager@realty.uz")
        mgr = await users_service.get_with_access(db, mgr.id)

        # Allowed: manager needs EDIT on shaxmatka.
        guard_ok = require(App.SHAXMATKA, Level.EDIT)
        try:
            await guard_ok(mgr)
            check("manager allowed shaxmatka:edit", True)
        except HTTPException:
            check("manager allowed shaxmatka:edit", False)

        # Denied: manager may not MANAGE settings.
        guard_deny = require(App.SETTINGS, Level.MANAGE)
        try:
            await guard_deny(mgr)
            check("manager denied settings:manage", False)
        except HTTPException as e:
            check("manager denied settings:manage", e.status_code == 403)

    print()
    if _failures:
        print(f"SMOKE TEST FAILED: {_failures} check(s) failed")
        raise SystemExit(1)
    print("ALL CHECKS PASSED ✅")


if __name__ == "__main__":
    asyncio.run(main())
