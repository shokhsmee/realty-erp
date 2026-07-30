"""People tables, deliberately split (TZ §07):

- Contact : anyone in the CRM funnel — a lead, an inquiry, a person.
- Client  : someone who has (or had) a deal. A Contact becomes a Client when a
            deal is signed. Kept as its own table so client-only data (passport,
            responsible manager) doesn't clutter every lead.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30), default=None, index=True)
    phone2: Mapped[str | None] = mapped_column(String(30), default=None)
    email: Mapped[str | None] = mapped_column(String(255), default=None)
    source: Mapped[str | None] = mapped_column(String(50), default=None)  # instagram, telegram…

    # Personal data.
    passport: Mapped[str | None] = mapped_column(String(30), default=None)
    birthday: Mapped[date | None] = mapped_column(Date, default=None)
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    company: Mapped[str | None] = mapped_column(String(150), default=None)
    position: Mapped[str | None] = mapped_column(String(100), default=None)
    telegram: Mapped[str | None] = mapped_column(String(80), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    photo: Mapped[str | None] = mapped_column(String(500), default=None)  # stored file path

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attachments: Mapped[list["ContactAttachment"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )


class ContactAttachment(Base):
    __tablename__ = "contact_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    contact: Mapped[Contact] = relationship(back_populates="attachments")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30), default=None, index=True)
    passport: Mapped[str | None] = mapped_column(String(30), default=None)
    address: Mapped[str | None] = mapped_column(String(255), default=None)

    # Link back to the originating contact, if any.
    contact_id: Mapped[int | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), default=None
    )
    # Sales manager responsible for this client.
    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
