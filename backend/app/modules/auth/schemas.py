"""Auth request/response contracts."""

from pydantic import BaseModel, EmailStr

from app.modules.users.schemas import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class MeOut(BaseModel):
    """The current user plus everything the frontend needs to render the shell."""

    user: UserOut
    effective_access: dict[str, str]
    is_superuser: bool
