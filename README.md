# Realty ERP / CRM

Property-developer platform: interactive showroom, shaxmatka, installment/mortgage
sales, amoCRM-style funnel, and accounting. Backend is **FastAPI + PostgreSQL**;
frontend is **React + TypeScript + Vite** (Blueprint OS design, light theme).

## Frontend

```bash
cd frontend
cp .env.example .env        # optional; dev proxies /api → :8000 by default
npm install
npm run dev                 # http://localhost:5173
```

The dev server proxies `/api` to the backend on `:8000`, so run the backend first
(below) and log in with the seeded admin. `npm run build` type-checks and bundles.
Feature-modular, mirroring the backend: `src/features/<domain>/`, shared `src/lib`
(api client + auth), and `src/components/ui` (Blueprint OS primitives).

This repo is built as **feature-modules**: every business domain lives in its own
self-contained folder so new sections drop in without touching existing ones.

---

## Architecture at a glance

```
realty-erp/
├── docker-compose.yml          # Postgres + API for local dev
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app + lifespan (wires everything)
│   │   ├── api.py              # single place where module routers are registered
│   │   ├── core/               # SHARED infra — imported by every module
│   │   │   ├── config.py       # env-driven settings
│   │   │   ├── database.py     # async engine, session, declarative Base
│   │   │   ├── security.py     # Argon2 password hashing + JWT encode/decode
│   │   │   ├── permissions.py  # RBAC vocabulary: apps, access levels
│   │   │   └── deps.py         # DI: get_db, get_current_user, require(app, action)
│   │   └── modules/            # ONE FOLDER PER DOMAIN — the important part
│   │       ├── users/          # User, Role, per-app access
│   │       ├── auth/           # login / refresh / me / accept-invite
│   │       ├── structure/      # Complex→Block→Floor→Unit, types, m² parts, additionals
│   │       ├── clients/        # Contact vs Client (separated)
│   │       └── sales/          # payment methods, plans, deals, schedule engine
│   └── scripts/
│       ├── seed.py             # default roles + admin + payment methods/plans
│       ├── seed_demo.py        # optional demo complex/units to explore
│       ├── smoke_test.py       # auth/RBAC checks
│       ├── smoke_structure.py  # structure/pricing checks
│       └── smoke_sales.py      # schedule engine + full deal lifecycle checks
```

### The module contract

Every module under `app/modules/<name>/` follows the same shape, so any developer
can predict where things are:

| File         | Responsibility                                              |
|--------------|-------------------------------------------------------------|
| `models.py`  | SQLAlchemy tables for this domain only                      |
| `schemas.py` | Pydantic request/response models (the API contract)         |
| `service.py` | Business logic — pure functions over a DB session, no HTTP  |
| `router.py`  | HTTP endpoints; thin — validates, calls service, returns    |

**Rule:** routers never contain business logic, services never touch `Request`/
`Response`. This keeps every layer testable and every module swappable.

### Adding the next section (e.g. `sales`)

1. `mkdir backend/app/modules/sales` and add the four files above.
2. Import its models in `scripts/seed.py`/migrations so tables are created.
3. Register its router in **one line** in `app/api.py`.

That's it — no other file changes. This is what "sections separated" buys us.

---

## Access control (RBAC)

- **Apps** (modules a user can be granted access to): `showroom`, `shaxmatka`,
  `deals`, `crm`, `clients`, `accounting`, `dashboard`, `settings`.
- **Levels** (ordered): `none < view < edit < manage`.
- A user has a **base role** (preset defaults per app) plus optional **per-app
  overrides**. Effective level = `override if set else role default`.
- Endpoints declare what they need: `Depends(require("shaxmatka", "edit"))`.

See `core/permissions.py` and `modules/users/service.py:effective_access`.

---

## Run it

```bash
cd realty-erp
cp backend/.env.example backend/.env
docker compose up --build
```

Then:

```bash
# create tables + seed default roles and an admin user
docker compose exec api python -m scripts.seed
# optional: add a demo complex with a scaffolded block to explore
docker compose exec api python -m scripts.seed_demo
```

- API docs (Swagger): http://localhost:8000/docs
- Default admin login: `admin@realty.uz` / `admin12345` (change immediately)

### Run without Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)   # or set DATABASE_URL to a local Postgres
python -m scripts.seed
uvicorn app.main:app --reload
```
