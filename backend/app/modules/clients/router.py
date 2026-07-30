"""HTTP endpoints for contacts & clients (guarded by the `clients` app)."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.deps import DbSession, require
from app.core.permissions import App, Level
from app.modules.clients import schemas as s
from app.modules.clients import service

view = Depends(require(App.CLIENTS, Level.VIEW))
edit = Depends(require(App.CLIENTS, Level.EDIT))

MEDIA_ROOT = Path("media") / "contacts"

router = APIRouter(prefix="/clients", tags=["clients"])
contacts_router = APIRouter(prefix="/contacts", tags=["contacts"])


# --------------------------------------------------------------------------- #
# Contacts
# --------------------------------------------------------------------------- #
@contacts_router.get("", response_model=list[s.ContactOut], dependencies=[view])
async def list_contacts(db: DbSession):
    return await service.list_contacts(db)


@contacts_router.post("", response_model=s.ContactOut, status_code=201, dependencies=[edit])
async def create_contact(payload: s.ContactCreate, db: DbSession):
    return await service.create_contact(db, payload)


@contacts_router.patch("/{contact_id}", response_model=s.ContactOut, dependencies=[edit])
async def update_contact(contact_id: int, payload: s.ContactUpdate, db: DbSession):
    obj = await service.get_contact(db, contact_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return await service.update_contact(db, obj, payload)


# ------- Photo -------
@contacts_router.post("/{contact_id}/photo", response_model=s.ContactOut, dependencies=[edit])
async def upload_photo(contact_id: int, db: DbSession, file: UploadFile = File(...)):
    contact = await service.get_contact(db, contact_id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    folder = MEDIA_ROOT / str(contact_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"photo_{uuid.uuid4().hex}_{file.filename}"
    stored.write_bytes(await file.read())
    return await service.set_photo(db, contact, str(stored))


@contacts_router.get("/{contact_id}/photo")
async def get_photo(contact_id: int, db: DbSession):
    contact = await service.get_contact(db, contact_id)
    if contact is None or not contact.photo or not os.path.exists(contact.photo):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No photo")
    return FileResponse(contact.photo)


# ------- Files -------
@contacts_router.get("/{contact_id}/files", response_model=list[s.ContactAttachmentOut], dependencies=[view])
async def list_files(contact_id: int, db: DbSession):
    return await service.list_attachments(db, contact_id)


@contacts_router.post("/{contact_id}/files", response_model=s.ContactAttachmentOut, status_code=201, dependencies=[edit])
async def upload_file(contact_id: int, db: DbSession, file: UploadFile = File(...)):
    contact = await service.get_contact(db, contact_id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    folder = MEDIA_ROOT / str(contact_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"{uuid.uuid4().hex}_{file.filename}"
    data = await file.read()
    stored.write_bytes(data)
    return await service.add_attachment(db, contact_id, file.filename or "file", file.content_type or "application/octet-stream", len(data), str(stored))


@contacts_router.get("/files/{attachment_id}/download", dependencies=[view])
async def download_file(attachment_id: int, db: DbSession):
    att = await service.get_attachment(db, attachment_id)
    if att is None or not os.path.exists(att.path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return FileResponse(att.path, filename=att.filename, media_type=att.content_type)


# --------------------------------------------------------------------------- #
# Clients
# --------------------------------------------------------------------------- #
@router.get("", response_model=list[s.ClientOut], dependencies=[view])
async def list_clients(db: DbSession):
    return await service.list_clients(db)


@router.post("", response_model=s.ClientOut, status_code=201, dependencies=[edit])
async def create_client(payload: s.ClientCreate, db: DbSession):
    return await service.create_client(db, payload)


@router.get("/{client_id}", response_model=s.ClientOut, dependencies=[view])
async def get_client(client_id: int, db: DbSession):
    obj = await service.get_client(db, client_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return obj


@router.patch("/{client_id}", response_model=s.ClientOut, dependencies=[edit])
async def update_client(client_id: int, payload: s.ClientUpdate, db: DbSession):
    obj = await service.get_client(db, client_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return await service.update_client(db, obj, payload)
