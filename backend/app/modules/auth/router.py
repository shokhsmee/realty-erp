"""Authentication endpoints: login, refresh, current user, accept-invite."""

import jwt
from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.modules.auth import service
from app.modules.auth.schemas import (
    AcceptInviteRequest,
    AccessToken,
    LoginRequest,
    MeOut,
    RefreshRequest,
    TokenPair,
)
from app.modules.users import service as users_service
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: DbSession):
    user = await service.authenticate(db, str(payload.email), payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=AccessToken)
async def refresh(payload: RefreshRequest, db: DbSession):
    try:
        data = decode_token(payload.refresh_token, expected_type="refresh")
        user_id = int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = await users_service.get_with_access(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User unavailable")
    return AccessToken(access_token=create_access_token(user.id))


@router.get("/me", response_model=MeOut)
async def me(current: CurrentUser):
    return MeOut(
        user=UserOut.model_validate(current),
        effective_access=users_service.effective_access(current),
        is_superuser=current.is_superuser,
    )


@router.post("/accept-invite", response_model=TokenPair)
async def accept_invite(payload: AcceptInviteRequest, db: DbSession):
    user = await service.accept_invite_and_login(db, payload.token, payload.password)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or used invite token")
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
