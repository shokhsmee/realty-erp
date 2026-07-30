"""Users-domain business logic.

Pure functions over an AsyncSession — no FastAPI types here. Routers call these;
so can scripts, tests, and other modules.
"""

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import merge_access
from app.core.security import hash_password
from app.modules.users.models import Role, User, UserAppAccess, UserStatus
from app.modules.users.schemas import RoleCreate, RoleUpdate, UserInvite, UserUpdate


# --------------------------------------------------------------------------- #
# Access computation
# --------------------------------------------------------------------------- #
def effective_access(user: User) -> dict[str, str]:
    """Merge the user's role defaults with their per-app overrides."""
    role_defaults = user.role.default_access if user.role else {}
    overrides = {o.app: o.level for o in user.access_overrides}
    return merge_access(role_defaults, overrides)


def overrides_map(user: User) -> dict[str, str]:
    return {o.app: o.level for o in user.access_overrides}


def _replace_overrides(user: User, overrides: dict) -> None:
    """Replace a user's override rows with the given {app: level} map."""
    user.access_overrides.clear()
    for app, level in overrides.items():
        user.access_overrides.append(
            UserAppAccess(app=str(app), level=str(level))
        )


# --------------------------------------------------------------------------- #
# User queries
# --------------------------------------------------------------------------- #
async def get_with_access(db: AsyncSession, user_id: int) -> User | None:
    """Load a user with role + overrides eagerly (selectin on the mapper)."""
    return await db.get(User, user_id)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_invite_token(db: AsyncSession, token: str) -> User | None:
    result = await db.execute(select(User).where(User.invite_token == token))
    return result.scalar_one_or_none()


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


# --------------------------------------------------------------------------- #
# User mutations
# --------------------------------------------------------------------------- #
async def create_invite(db: AsyncSession, data: UserInvite) -> tuple[User, str]:
    """Create an INVITED user and return (user, invite_token)."""
    token = secrets.token_urlsafe(32)
    user = User(
        email=str(data.email),
        full_name=data.full_name,
        phone=data.phone,
        base_role_id=data.base_role_id,
        status=UserStatus.INVITED,
        invite_token=token,
    )
    _replace_overrides(user, data.access_overrides)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user, token


async def accept_invite(db: AsyncSession, token: str, password: str) -> User | None:
    """Set the password for an invited user and activate them."""
    user = await get_by_invite_token(db, token)
    if user is None or user.status != UserStatus.INVITED:
        return None
    user.hashed_password = hash_password(password)
    user.status = UserStatus.ACTIVE
    user.invite_token = None
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.base_role_id is not None:
        user.base_role_id = data.base_role_id
    if data.access_overrides is not None:
        _replace_overrides(user, data.access_overrides)
    await db.commit()
    await db.refresh(user)
    return user


async def set_status(db: AsyncSession, user: User, status: UserStatus) -> User:
    user.status = status
    await db.commit()
    await db.refresh(user)
    return user


# --------------------------------------------------------------------------- #
# Roles
# --------------------------------------------------------------------------- #
async def list_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role).order_by(Role.id))
    return list(result.scalars().all())


async def get_role(db: AsyncSession, role_id: int) -> Role | None:
    return await db.get(Role, role_id)


async def get_role_by_key(db: AsyncSession, key: str) -> Role | None:
    result = await db.execute(select(Role).where(Role.key == key))
    return result.scalar_one_or_none()


async def create_role(db: AsyncSession, data: RoleCreate, *, is_system: bool = False) -> Role:
    role = Role(
        key=data.key,
        name=data.name,
        description=data.description,
        is_system=is_system,
        default_access={str(k): str(v) for k, v in data.default_access.items()},
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


async def update_role(db: AsyncSession, role: Role, data: RoleUpdate) -> Role:
    if data.name is not None:
        role.name = data.name
    if data.description is not None:
        role.description = data.description
    if data.default_access is not None:
        role.default_access = {str(k): str(v) for k, v in data.default_access.items()}
    await db.commit()
    await db.refresh(role)
    return role
