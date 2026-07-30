"""Single registration point for all module routers.

Adding a section = importing its router and calling include_router once. No other
file needs to change.
"""

from fastapi import APIRouter

from app.modules.accounting.router import router as accounting_router
from app.modules.auth.router import router as auth_router
from app.modules.clients.router import contacts_router, router as clients_router
from app.modules.crm.router import router as crm_router
from app.modules.realtime.router import router as realtime_router
from app.modules.sales.router import router as sales_router
from app.modules.settings.router import router as settings_router
from app.modules.structure.router import router as structure_router
from app.modules.users.router import roles_router, router as users_router

api_router = APIRouter(prefix="/api")

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(roles_router)
api_router.include_router(structure_router)
api_router.include_router(clients_router)
api_router.include_router(contacts_router)
api_router.include_router(sales_router)
api_router.include_router(crm_router)
api_router.include_router(accounting_router)
api_router.include_router(settings_router)
api_router.include_router(realtime_router)
