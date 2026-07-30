"""Imports every module's models so they register on Base.metadata.

`init_models()` and Alembic both rely on this single import point. When you add
a new module with tables, add one import line here.
"""

from app.modules.users import models as users_models  # noqa: F401
from app.modules.structure import models as structure_models  # noqa: F401
from app.modules.clients import models as clients_models  # noqa: F401
from app.modules.sales import models as sales_models  # noqa: F401
from app.modules.crm import models as crm_models  # noqa: F401
from app.modules.settings import models as settings_models  # noqa: F401
