"""HTTP endpoints for users & roles.

Thin layer: validate input, call the service, shape the response. All routes are
guarded by the `settings` app permission, since user administration lives there.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUser, DbSession, require
from app.core.permissions import App, Level
from app.modules.users import service
from app.modules.users.models import UserStatus
from app.modules.users.schemas import (
    InviteResult,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserBrief,
    UserDetailOut,
    UserInvite,
    UserOut,
    UserUpdate,
)

# ------- guards (reused across routes) -------
settings_view = Depends(require(App.SETTINGS, Level.VIEW))
settings_manage = Depends(require(App.SETTINGS, Level.MANAGE))

router = APIRouter(prefix="/users", tags=["users"])
roles_router = APIRouter(prefix="/roles", tags=["roles"])


def _detail(user) -> UserDetailOut:
    base = UserOut.model_validate(user).model_dump()
    return UserDetailOut(
        **base,
        effective_access=service.effective_access(user),
        access_overrides=service.overrides_map(user),
    )


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
@router.get("", response_model=list[UserOut], dependencies=[settings_view])
async def list_users(db: DbSession):
    return await service.list_users(db)


@router.get("/assignable", response_model=list[UserBrief])
async def assignable_users(db: DbSession, _: CurrentUser):
    """Names any authenticated user can pick from (e.g. lead responsible)."""
    return await service.list_users(db)


@router.post(
    "",
    response_model=InviteResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[settings_manage],
)
async def invite_user(payload: UserInvite, db: DbSession):
    if await service.get_by_email(db, str(payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user, token = await service.create_invite(db, payload)
    return InviteResult(user=UserOut.model_validate(user), invite_token=token)


@router.get("/{user_id}", response_model=UserDetailOut, dependencies=[settings_view])
async def get_user(user_id: int, db: DbSession):
    user = await service.get_with_access(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return _detail(user)


@router.patch("/{user_id}", response_model=UserDetailOut, dependencies=[settings_manage])
async def update_user(user_id: int, payload: UserUpdate, db: DbSession):
    user = await service.get_with_access(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user = await service.update_user(db, user, payload)
    return _detail(user)


@router.post("/{user_id}/deactivate", response_model=UserOut, dependencies=[settings_manage])
async def deactivate_user(user_id: int, db: DbSession):
    user = await service.get_with_access(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return await service.set_status(db, user, UserStatus.DISABLED)


@router.post("/{user_id}/activate", response_model=UserOut, dependencies=[settings_manage])
async def activate_user(user_id: int, db: DbSession):
    user = await service.get_with_access(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return await service.set_status(db, user, UserStatus.ACTIVE)


# --------------------------------------------------------------------------- #
# Roles
# --------------------------------------------------------------------------- #
@roles_router.get("", response_model=list[RoleOut], dependencies=[settings_view])
async def list_roles(db: DbSession):
    return await service.list_roles(db)


@roles_router.post(
    "", response_model=RoleOut, status_code=status.HTTP_201_CREATED, dependencies=[settings_manage]
)
async def create_role(payload: RoleCreate, db: DbSession):
    if await service.get_role_by_key(db, payload.key):
        raise HTTPException(status.HTTP_409_CONFLICT, "Role key already exists")
    return await service.create_role(db, payload)


@roles_router.patch("/{role_id}", response_model=RoleOut, dependencies=[settings_manage])
async def update_role(role_id: int, payload: RoleUpdate, db: DbSession):
    role = await service.get_role(db, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return await service.update_role(db, role, payload)
