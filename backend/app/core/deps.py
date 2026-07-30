"""Reusable FastAPI dependencies: DB session, current user, and RBAC guards.

The star of this file is `require(app, action)` — attach it to any endpoint to
enforce that the caller has at least `action` level on `app`.
"""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.permissions import App, Level, satisfies
from app.core.security import decode_token
from app.modules.users import service as users_service
from app.modules.users.models import User

# Reads the "Authorization: Bearer <token>" header.
_bearer = HTTPBearer(auto_error=True)

DbSession = Annotated[AsyncSession, Depends(get_session)]

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> User:
    """Resolve the authenticated, active user from the access token."""
    try:
        payload = decode_token(creds.credentials, expected_type="access")
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR

    user = await users_service.get_with_access(db, user_id)
    if user is None:
        raise _CREDENTIALS_ERROR
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User is not active"
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require(app: App, action: Level):
    """Build a dependency enforcing `action` level on `app`.

    Usage:
        @router.post(..., dependencies=[Depends(require(App.SHAXMATKA, Level.EDIT))])
    """

    async def _guard(user: CurrentUser) -> User:
        if user.is_superuser:
            return user
        effective = users_service.effective_access(user)
        if not satisfies(effective.get(app.value, Level.NONE.value), action.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{action.value}' on '{app.value}'",
            )
        return user

    return _guard
