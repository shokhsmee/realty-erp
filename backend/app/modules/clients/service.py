"""Clients-domain logic (pure functions over an AsyncSession)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.clients import models as m
from app.modules.clients import schemas as s


# --------------------------------------------------------------------------- #
# Contacts
# --------------------------------------------------------------------------- #
async def list_contacts(db: AsyncSession) -> list[m.Contact]:
    result = await db.execute(select(m.Contact).order_by(m.Contact.created_at.desc()))
    return list(result.scalars().all())


async def get_contact(db: AsyncSession, contact_id: int) -> m.Contact | None:
    return await db.get(m.Contact, contact_id)


async def create_contact(db: AsyncSession, data: s.ContactCreate) -> m.Contact:
    obj = m.Contact(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_contact(db: AsyncSession, obj: m.Contact, data: s.ContactUpdate) -> m.Contact:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


# --------------------------------------------------------------------------- #
# Clients
# --------------------------------------------------------------------------- #
async def list_clients(db: AsyncSession) -> list[m.Client]:
    result = await db.execute(select(m.Client).order_by(m.Client.created_at.desc()))
    return list(result.scalars().all())


async def get_client(db: AsyncSession, client_id: int) -> m.Client | None:
    return await db.get(m.Client, client_id)


async def create_client(db: AsyncSession, data: s.ClientCreate) -> m.Client:
    obj = m.Client(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_client(db: AsyncSession, obj: m.Client, data: s.ClientUpdate) -> m.Client:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def set_photo(db: AsyncSession, contact: m.Contact, path: str) -> m.Contact:
    contact.photo = path
    await db.commit()
    await db.refresh(contact)
    return contact


async def add_attachment(db: AsyncSession, contact_id: int, filename: str, content_type: str, size: int, path: str) -> m.ContactAttachment:
    obj = m.ContactAttachment(contact_id=contact_id, filename=filename, content_type=content_type, size=size, path=path)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def list_attachments(db: AsyncSession, contact_id: int) -> list[m.ContactAttachment]:
    from sqlalchemy import select
    result = await db.execute(
        select(m.ContactAttachment).where(m.ContactAttachment.contact_id == contact_id).order_by(m.ContactAttachment.created_at.desc())
    )
    return list(result.scalars().all())


async def get_attachment(db: AsyncSession, attachment_id: int) -> m.ContactAttachment | None:
    return await db.get(m.ContactAttachment, attachment_id)


async def convert_contact(db: AsyncSession, contact: m.Contact, **overrides) -> m.Client:
    """Promote a contact to a client (used when a deal is signed)."""
    client = m.Client(
        full_name=overrides.get("full_name", contact.full_name),
        phone=overrides.get("phone", contact.phone),
        contact_id=contact.id,
        manager_id=overrides.get("manager_id"),
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client
