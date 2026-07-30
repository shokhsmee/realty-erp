"""RBAC vocabulary — the single source of truth for access control.

Everything (roles, the settings UI, endpoint guards) references these constants
so apps and levels are never spelled as loose strings elsewhere.
"""

from enum import StrEnum


class App(StrEnum):
    """The modules a user can be granted access to."""

    SHOWROOM = "showroom"
    SHAXMATKA = "shaxmatka"
    DEALS = "deals"
    CRM = "crm"
    CLIENTS = "clients"
    ACCOUNTING = "accounting"
    DASHBOARD = "dashboard"
    SETTINGS = "settings"


class Level(StrEnum):
    """Access levels, ordered from least to most privileged."""

    NONE = "none"
    VIEW = "view"
    EDIT = "edit"
    MANAGE = "manage"


# Ordinal ranking used for comparisons (higher == more access).
_ORDER: list[Level] = [Level.NONE, Level.VIEW, Level.EDIT, Level.MANAGE]
LEVEL_RANK: dict[Level, int] = {lvl: i for i, lvl in enumerate(_ORDER)}

# Every app defaults to NONE unless a role grants more.
DEFAULT_ACCESS: dict[str, str] = {app.value: Level.NONE.value for app in App}


def satisfies(current: str, required: str) -> bool:
    """True if `current` level meets or exceeds `required`."""
    return LEVEL_RANK[Level(current)] >= LEVEL_RANK[Level(required)]


def merge_access(role_defaults: dict[str, str], overrides: dict[str, str]) -> dict[str, str]:
    """Compute effective per-app access.

    Start from the full app list (all NONE), layer the role's defaults, then the
    user's per-app overrides. Most specific wins.
    """
    effective = dict(DEFAULT_ACCESS)
    effective.update(role_defaults or {})
    effective.update(overrides or {})
    return effective
