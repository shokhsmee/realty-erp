"""HTTP endpoints for the CRM (guarded by the `crm` app)."""

import os
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser, DbSession, require
from app.core.permissions import App, Level
from app.modules.crm import schemas as s
from app.modules.crm import service

MEDIA_ROOT = Path("media") / "crm"

view = Depends(require(App.CRM, Level.VIEW))
edit = Depends(require(App.CRM, Level.EDIT))
manage = Depends(require(App.CRM, Level.MANAGE))

router = APIRouter(prefix="/crm", tags=["crm"])


def _bad(exc: ValueError) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# --------------------------------------------------------------------------- #
# Pipelines & board
# --------------------------------------------------------------------------- #
@router.get("/pipelines", response_model=list[s.PipelineOut], dependencies=[view])
async def list_pipelines(db: DbSession, include_archived: bool = False):
    return await service.list_pipelines(db, include_archived)


@router.post("/pipelines", response_model=s.PipelineOut, status_code=201, dependencies=[manage])
async def create_pipeline(payload: s.PipelineCreate, db: DbSession):
    # New pipelines ship with default stages + lost reasons (amoCRM behaviour).
    return await service.create_pipeline_with_defaults(db, payload)


@router.post("/pipelines/{pipeline_id}/archive", response_model=s.PipelineOut, dependencies=[manage])
async def archive_pipeline(pipeline_id: int, db: DbSession, archived: bool = True):
    pipeline = await service.get_pipeline(db, pipeline_id)
    if pipeline is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    return await service.archive_pipeline(db, pipeline, archived)


@router.post("/pipelines/{pipeline_id}/stages", response_model=s.StageOut, status_code=201, dependencies=[manage])
async def create_stage(pipeline_id: int, payload: s.StageCreate, db: DbSession):
    if await service.get_pipeline(db, pipeline_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    return await service.create_stage(db, pipeline_id, payload)


@router.get("/board", response_model=s.BoardOut, dependencies=[view])
async def get_board(
    db: DbSession,
    pipeline_id: int | None = None,
    q: str | None = None,
    responsible_id: int | None = None,
    source: str | None = None,
    tag: str | None = None,
    min_budget: float | None = None,
    max_budget: float | None = None,
    no_task: bool = False,
    overdue: bool = False,
):
    filters = {
        "q": q,
        "responsible_id": responsible_id,
        "source": source,
        "tag": tag,
        "min_budget": Decimal(str(min_budget)) if min_budget is not None else None,
        "max_budget": Decimal(str(max_budget)) if max_budget is not None else None,
        "no_task": no_task,
        "overdue": overdue,
    }
    board = await service.get_board(db, pipeline_id, filters)
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No pipeline found")
    return board


# --------------------------------------------------------------------------- #
# Leads
# --------------------------------------------------------------------------- #
@router.post("/leads", response_model=s.LeadOut, status_code=201, dependencies=[edit])
async def create_lead(payload: s.LeadCreate, db: DbSession, user: CurrentUser):
    # Default the responsible to whoever creates the lead.
    if payload.manager_id is None:
        payload.manager_id = user.id
    try:
        return await service.create_lead(db, payload)
    except ValueError as exc:
        raise _bad(exc)


@router.patch("/leads/{lead_id}/move", response_model=s.LeadOut, dependencies=[edit])
async def move_lead(lead_id: int, payload: s.LeadMove, db: DbSession):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    try:
        return await service.move_lead(db, lead, payload.stage_id)
    except ValueError as exc:
        raise _bad(exc)


@router.patch("/leads/{lead_id}", response_model=s.LeadOut, dependencies=[edit])
async def update_lead(lead_id: int, payload: s.LeadUpdate, db: DbSession):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return await service.update_lead(db, lead, payload)


@router.delete("/leads/{lead_id}", status_code=204, dependencies=[edit])
async def delete_lead(lead_id: int, db: DbSession):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    await service.delete_lead(db, lead)


@router.post("/leads/{lead_id}/lost", response_model=s.LeadOut, dependencies=[edit])
async def mark_lost(lead_id: int, payload: s.LostRequest, db: DbSession):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return await service.mark_lost(db, lead, payload.reason)


@router.post("/leads/{lead_id}/interest", response_model=s.LeadOut, dependencies=[edit])
async def set_interest(lead_id: int, payload: s.InterestRequest, db: DbSession, user: CurrentUser):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    try:
        return await service.set_interest(db, lead, payload.unit_id, author_id=user.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.post("/leads/{lead_id}/link-deal", response_model=s.LeadOut, dependencies=[edit])
async def link_deal(lead_id: int, payload: s.LinkDealRequest, db: DbSession, user: CurrentUser):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    try:
        return await service.link_deal(db, lead, payload.deal_id, payload.won, author_id=user.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ------- Lost reasons -------
@router.get("/lost-reasons", response_model=list[s.LostReasonOut], dependencies=[view])
async def list_lost_reasons(db: DbSession, pipeline_id: int):
    return await service.list_lost_reasons(db, pipeline_id)


@router.post("/lost-reasons", response_model=s.LostReasonOut, status_code=201, dependencies=[manage])
async def create_lost_reason(payload: s.LostReasonCreate, db: DbSession):
    return await service.create_lost_reason(db, payload)


@router.delete("/lost-reasons/{reason_id}", status_code=204, dependencies=[manage])
async def delete_lost_reason(reason_id: int, db: DbSession):
    reason = await service.get_lost_reason(db, reason_id)
    if reason is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reason not found")
    await service.delete_lost_reason(db, reason)


# ------- Tags -------
@router.get("/tags", response_model=list[s.TagOut], dependencies=[view])
async def list_tags(db: DbSession):
    return await service.list_tags(db)


@router.post("/tags", response_model=s.TagOut, status_code=201, dependencies=[edit])
async def create_tag(payload: s.TagCreate, db: DbSession):
    return await service.create_tag(db, payload)


# ------- Task types -------
@router.get("/task-types", response_model=list[s.TaskTypeOut], dependencies=[view])
async def list_task_types(db: DbSession):
    return await service.list_task_types(db)


@router.post("/task-types", response_model=s.TaskTypeOut, status_code=201, dependencies=[edit])
async def create_task_type(payload: s.TaskTypeCreate, db: DbSession):
    return await service.create_task_type(db, payload)


# ------- Attachments (Fayllar) -------
@router.get("/leads/{lead_id}/files", response_model=list[s.AttachmentOut], dependencies=[view])
async def list_files(lead_id: int, db: DbSession):
    return await service.list_attachments(db, lead_id)


@router.post("/leads/{lead_id}/files", response_model=s.AttachmentOut, status_code=201, dependencies=[edit])
async def upload_file(lead_id: int, db: DbSession, file: UploadFile = File(...)):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    folder = MEDIA_ROOT / str(lead_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"{uuid.uuid4().hex}_{file.filename}"
    data = await file.read()
    stored.write_bytes(data)
    return await service.add_attachment(
        db, lead_id, file.filename or "file", file.content_type or "application/octet-stream", len(data), str(stored)
    )


@router.get("/files/{attachment_id}/download", dependencies=[view])
async def download_file(attachment_id: int, db: DbSession):
    att = await service.get_attachment(db, attachment_id)
    if att is None or not os.path.exists(att.path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return FileResponse(att.path, filename=att.filename, media_type=att.content_type)


@router.get("/contacts/{contact_id}/leads", response_model=list[s.LeadOut], dependencies=[view])
async def contact_leads(contact_id: int, db: DbSession):
    return await service.leads_for_contact(db, contact_id)


@router.get("/leads/{lead_id}", response_model=s.LeadDetail, dependencies=[view])
async def get_lead(lead_id: int, db: DbSession):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return await service.build_detail(db, lead)


# ------- Feed / timeline -------
@router.post("/leads/{lead_id}/events", response_model=s.EventOut, status_code=201, dependencies=[edit])
async def add_event(lead_id: int, payload: s.EventCreate, db: DbSession, user: CurrentUser):
    lead = await service.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return await service.add_event(db, lead, payload, author_id=user.id)


@router.post("/events/{event_id}/done", response_model=s.EventOut, dependencies=[edit])
async def complete_task(event_id: int, db: DbSession, done: bool = True):
    event = await service.get_event(db, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return await service.set_task_done(db, event, done)


# ------- Custom fields (lead body settings) -------
@router.get("/fields", response_model=list[s.FieldDefOut], dependencies=[view])
async def list_fields(db: DbSession, active_only: bool = True):
    return await service.list_fields(db, active_only)


@router.post("/fields", response_model=s.FieldDefOut, status_code=201, dependencies=[manage])
async def create_field(payload: s.FieldDefCreate, db: DbSession):
    return await service.create_field(db, payload)


@router.patch("/fields/{field_id}", response_model=s.FieldDefOut, dependencies=[manage])
async def update_field(field_id: int, payload: s.FieldDefUpdate, db: DbSession):
    field = await service.get_field(db, field_id)
    if field is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field not found")
    return await service.update_field(db, field, payload)


# ------- Automations -------
@router.get("/automations", response_model=list[s.AutomationOut], dependencies=[view])
async def list_automations(db: DbSession, pipeline_id: int):
    return await service.list_automations(db, pipeline_id)


@router.post("/automations", response_model=s.AutomationOut, status_code=201, dependencies=[manage])
async def create_automation(payload: s.AutomationCreate, db: DbSession):
    return await service.create_automation(db, payload)


@router.delete("/automations/{automation_id}", status_code=204, dependencies=[manage])
async def delete_automation(automation_id: int, db: DbSession):
    auto = await service.get_automation(db, automation_id)
    if auto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")
    await service.delete_automation(db, auto)


# ------- Stage editor (voronka settings) -------
@router.patch("/stages/{stage_id}", response_model=s.StageOut, dependencies=[manage])
async def update_stage(stage_id: int, payload: s.StageUpdate, db: DbSession):
    stage = await service.get_stage(db, stage_id)
    if stage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    return await service.update_stage(db, stage, payload)


@router.delete("/stages/{stage_id}", status_code=204, dependencies=[manage])
async def delete_stage(stage_id: int, db: DbSession):
    stage = await service.get_stage(db, stage_id)
    if stage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    try:
        await service.delete_stage(db, stage)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
