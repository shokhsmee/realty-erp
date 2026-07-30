"""FastAPI application entrypoint.

Wires configuration, CORS, the aggregated API router, and (in development) creates
tables on startup. Business logic lives in modules — this file stays small.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings
from app.core.database import init_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In development, auto-create tables. Production uses Alembic migrations.
    if settings.is_dev:
        await init_models()
    yield


app = FastAPI(
    title="Realty ERP API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
