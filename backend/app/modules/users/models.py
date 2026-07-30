"""Users-domain tables: Role, User, and per-app access overrides.

    Role.default_access   -> {app: level}   (the preset)
    UserAppAccess         -> per-user, per-app override rows
    effective access      = role defaults, then overrides layered on top
"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserStatus(StrEnum):
    INVITED = "invited"   # created, awaiting password set
    ACTIVE = "active"
    DISABLED = "disabled"


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255), default=None)
    # True for built-in roles that ship with the system (protected from deletion).
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # {app: level} preset defaults for this role.
    default_access: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    users: Mapped[list["User"]] = relationship(back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), default=None)
    full_name: Mapped[str] = mapped_column(String(150))
    hashed_password: Mapped[str | None] = mapped_column(String(255), default=None)

    status: Mapped[UserStatus] = mapped_column(String(20), default=UserStatus.INVITED)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    twofa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    base_role_id: Mapped[int | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), default=None
    )

    # Single-use token for the invite / set-password flow.
    invite_token: Mapped[str | None] = mapped_column(String(255), default=None, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    role: Mapped[Role | None] = relationship(back_populates="users", lazy="selectin")
    access_overrides: Mapped[list["UserAppAccess"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE


class UserAppAccess(Base):
    """One row per user per app that overrides the role's default level."""

    __tablename__ = "user_app_access"
    __table_args__ = (UniqueConstraint("user_id", "app", name="uq_user_app"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    app: Mapped[str] = mapped_column(String(30))
    level: Mapped[str] = mapped_column(String(20))

    user: Mapped[User] = relationship(back_populates="access_overrides")
