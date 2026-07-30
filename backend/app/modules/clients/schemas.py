"""API contracts for contacts & clients."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


# --------------------------------------------------------------------------- #
# Contacts
# --------------------------------------------------------------------------- #
class ContactBase(BaseModel):
    phone: str | None = None
    phone2: str | None = None
    email: str | None = None
    source: str | None = None
    passport: str | None = None
    birthday: date | None = None
    address: str | None = None
    company: str | None = None
    position: str | None = None
    telegram: str | None = None
    notes: str | None = None


class ContactCreate(ContactBase):
    full_name: str


class ContactUpdate(ContactBase):
    full_name: str | None = None


class ContactAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    contact_id: int
    filename: str
    content_type: str
    size: int
    created_at: datetime


class ContactOut(ContactBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    photo: str | None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Clients
# --------------------------------------------------------------------------- #
class ClientCreate(BaseModel):
    full_name: str
    phone: str | None = None
    passport: str | None = None
    address: str | None = None
    contact_id: int | None = None
    manager_id: int | None = None


class ClientUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    passport: str | None = None
    address: str | None = None
    manager_id: int | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    phone: str | None
    passport: str | None
    address: str | None
    contact_id: int | None
    manager_id: int | None
    created_at: datetime
