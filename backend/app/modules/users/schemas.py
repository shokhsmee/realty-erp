"""Pydantic request/response contracts for the users module.

These are the shapes the API speaks — deliberately decoupled from ORM models.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.permissions import App, Level


# --------------------------------------------------------------------------- #
# Roles
# --------------------------------------------------------------------------- #
class RoleBase(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_]+$", max_length=50)
    name: str
    description: str | None = None
    # {app: level}; missing apps default to "none".
    default_access: dict[App, Level] = Field(default_factory=dict)


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    default_access: dict[App, Level] | None = None


class RoleOut(RoleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_system: bool


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
class UserBrief(BaseModel):
    """Minimal user info any authenticated user may see (for assignment)."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: str | None = None


class UserInvite(UserBase):
    """Admin creates a user; they set their own password via the invite link."""

    base_role_id: int | None = None
    access_overrides: dict[App, Level] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    base_role_id: int | None = None
    # Full replacement of this user's per-app overrides.
    access_overrides: dict[App, Level] | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    is_superuser: bool
    twofa_enabled: bool
    base_role_id: int | None
    last_active_at: datetime | None
    created_at: datetime


class UserDetailOut(UserOut):
    """User plus the computed effective access map (what the UI edits)."""

    effective_access: dict[str, str]
    access_overrides: dict[str, str]


class InviteResult(BaseModel):
    user: UserOut
    invite_token: str  # hand to the frontend / email as a set-password link
