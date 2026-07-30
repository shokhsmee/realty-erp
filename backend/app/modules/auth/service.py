"""Auth business logic: credential verification.

Token creation lives in core.security; here we only decide *whether* a login is
valid and hand back the user.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, needs_rehash, verify_password
from app.modules.users import service as users_service
from app.modules.users.models import User, UserStatus


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    """Return the user if credentials are valid and the account is active."""
    user = await users_service.get_by_email(db, email)
    if user is None or user.hashed_password is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if user.status != UserStatus.ACTIVE:
        return None

    # Transparently upgrade the hash if Argon2 params have strengthened.
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)
        await db.commit()

    return user


async def accept_invite_and_login(
    db: AsyncSession, token: str, password: str
) -> User | None:
    """Set the invited user's password, activate them, and return the user."""
    return await users_service.accept_invite(db, token, password)
