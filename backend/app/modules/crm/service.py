"""CRM business logic: pipelines, stages, leads, and the Kanban board."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.realtime import publish_lead_update
from app.modules.clients import service as clients_service
from app.modules.clients.schemas import ContactCreate
from app.modules.crm import models as m, schemas as s


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Pipelines & stages
# --------------------------------------------------------------------------- #
async def list_pipelines(db: AsyncSession, include_archived: bool = False) -> list[m.Pipeline]:
    stmt = select(m.Pipeline).order_by(m.Pipeline.position, m.Pipeline.id)
    if not include_archived:
        stmt = stmt.where(m.Pipeline.archived.is_(False))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_pipeline(db: AsyncSession, pipeline_id: int) -> m.Pipeline | None:
    return await db.get(m.Pipeline, pipeline_id)


async def default_pipeline(db: AsyncSession) -> m.Pipeline | None:
    result = await db.execute(
        select(m.Pipeline)
        .where(m.Pipeline.archived.is_(False))
        .order_by(m.Pipeline.is_default.desc(), m.Pipeline.position)
    )
    return result.scalars().first()


async def get_stage(db: AsyncSession, stage_id: int) -> m.Stage | None:
    return await db.get(m.Stage, stage_id)


async def stages_of(db: AsyncSession, pipeline_id: int) -> list[m.Stage]:
    result = await db.execute(
        select(m.Stage).where(m.Stage.pipeline_id == pipeline_id).order_by(m.Stage.position)
    )
    return list(result.scalars().all())


async def create_pipeline(db: AsyncSession, data: s.PipelineCreate) -> m.Pipeline:
    obj = m.Pipeline(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


# amoCRM-style defaults given to every new pipeline created from the UI.
_DEFAULT_STAGES = [
    ("Yangi", "info", False, False),
    ("Aloqa", "accent", False, False),
    ("Taklif", "warn", False, False),
    ("Muzokara", "accent", False, False),
    ("Yutdi", "ok", True, False),
    ("Yutqazdi", "crit", False, True),
]
_DEFAULT_LOST_REASONS = ["Juda qimmat", "Ehtiyoj yoʻqoldi", "Shartlar toʻgʻri kelmadi", "Boshqasini tanladi"]


async def create_pipeline_with_defaults(db: AsyncSession, data: s.PipelineCreate) -> m.Pipeline:
    pipeline = await create_pipeline(db, data)
    for i, (name, color, won, lost) in enumerate(_DEFAULT_STAGES):
        db.add(m.Stage(pipeline_id=pipeline.id, name=name, color=color, position=i, is_won=won, is_lost=lost))
    for i, text in enumerate(_DEFAULT_LOST_REASONS):
        db.add(m.LostReason(pipeline_id=pipeline.id, text=text, position=i))
    await db.commit()
    await db.refresh(pipeline)
    return pipeline


async def archive_pipeline(db: AsyncSession, pipeline: m.Pipeline, archived: bool = True) -> m.Pipeline:
    pipeline.archived = archived
    if archived:
        pipeline.is_default = False
    await db.commit()
    await db.refresh(pipeline)
    return pipeline


# --------------------------------------------------------------------------- #
# Lost reasons
# --------------------------------------------------------------------------- #
async def list_lost_reasons(db: AsyncSession, pipeline_id: int) -> list[m.LostReason]:
    result = await db.execute(
        select(m.LostReason).where(m.LostReason.pipeline_id == pipeline_id).order_by(m.LostReason.position, m.LostReason.id)
    )
    return list(result.scalars().all())


async def create_lost_reason(db: AsyncSession, data: s.LostReasonCreate) -> m.LostReason:
    obj = m.LostReason(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_lost_reason(db: AsyncSession, reason_id: int) -> m.LostReason | None:
    return await db.get(m.LostReason, reason_id)


async def delete_lost_reason(db: AsyncSession, reason: m.LostReason) -> None:
    await db.delete(reason)
    await db.commit()


# --------------------------------------------------------------------------- #
# Lead delete / lost
# --------------------------------------------------------------------------- #
async def delete_lead(db: AsyncSession, lead: m.Lead) -> None:
    pipeline_id = lead.pipeline_id
    await db.delete(lead)
    await db.commit()
    await publish_lead_update(pipeline_id)


async def mark_lost(db: AsyncSession, lead: m.Lead, reason: str | None) -> m.Lead:
    lead.status = m.LeadStatus.LOST
    lead.lost_reason = reason
    # Move to the pipeline's lost stage if one exists.
    result = await db.execute(
        select(m.Stage).where(m.Stage.pipeline_id == lead.pipeline_id, m.Stage.is_lost.is_(True)).limit(1)
    )
    lost_stage = result.scalars().first()
    if lost_stage:
        lead.stage_id = lost_stage.id
    db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.SYSTEM, text=f"Rad etildi: {reason or '—'}"))
    await db.commit()
    await db.refresh(lead)
    await publish_lead_update(lead.pipeline_id)
    return lead


async def create_stage(db: AsyncSession, pipeline_id: int, data: s.StageCreate) -> m.Stage:
    obj = m.Stage(pipeline_id=pipeline_id, **data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


# --------------------------------------------------------------------------- #
# Board
# --------------------------------------------------------------------------- #
async def get_board(
    db: AsyncSession, pipeline_id: int | None, filters: dict | None = None
) -> s.BoardOut | None:
    pipeline = (
        await get_pipeline(db, pipeline_id) if pipeline_id else await default_pipeline(db)
    )
    if pipeline is None:
        return None

    stages = await stages_of(db, pipeline.id)
    result = await db.execute(
        select(m.Lead)
        .where(m.Lead.pipeline_id == pipeline.id)
        .order_by(m.Lead.created_at.desc())
    )
    leads = list(result.scalars().all())
    leads = _apply_filters(leads, filters or {})

    board_stages = [
        s.StageWithLeads(
            **s.StageOut.model_validate(stage).model_dump(),
            leads=[s.LeadOut.model_validate(l) for l in leads if l.stage_id == stage.id],
        )
        for stage in stages
    ]
    return s.BoardOut(pipeline=s.PipelineOut.model_validate(pipeline), stages=board_stages)


# --------------------------------------------------------------------------- #
# Leads
# --------------------------------------------------------------------------- #
async def get_lead(db: AsyncSession, lead_id: int) -> m.Lead | None:
    return await db.get(m.Lead, lead_id)


async def leads_for_contact(db: AsyncSession, contact_id: int) -> list[m.Lead]:
    result = await db.execute(
        select(m.Lead).where(m.Lead.contact_id == contact_id).order_by(m.Lead.created_at.desc())
    )
    return list(result.scalars().all())


async def create_lead(db: AsyncSession, data: s.LeadCreate) -> m.Lead:
    pipeline = (
        await get_pipeline(db, data.pipeline_id)
        if data.pipeline_id
        else await default_pipeline(db)
    )
    if pipeline is None:
        raise ValueError("No pipeline available")

    stage_id = data.stage_id
    if stage_id is None:
        stages = await stages_of(db, pipeline.id)
        if not stages:
            raise ValueError("Pipeline has no stages")
        stage_id = stages[0].id

    # Optionally spin up a contact from a bare name.
    contact_id = data.contact_id
    if contact_id is None and data.contact_name:
        contact = await clients_service.create_contact(
            db,
            ContactCreate(
                full_name=data.contact_name,
                phone=data.contact_phone,
                email=data.contact_email,
                source=data.source,
            ),
        )
        contact_id = contact.id

    lead = m.Lead(
        pipeline_id=pipeline.id,
        stage_id=stage_id,
        title=data.title,
        budget=data.budget,
        source=data.source,
        contact_id=contact_id,
        unit_id=data.unit_id,
        manager_id=data.manager_id,
    )
    db.add(lead)
    await db.flush()
    db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.CREATED, text="Lead yaratildi"))
    await db.commit()
    await db.refresh(lead)
    await publish_lead_update(lead.pipeline_id)
    return lead


async def _run_automations(db: AsyncSession, lead: m.Lead, stage: m.Stage) -> None:
    """Execute active rules triggered by entering `stage` (digital pipeline)."""
    result = await db.execute(
        select(m.Automation).where(
            m.Automation.pipeline_id == lead.pipeline_id,
            m.Automation.trigger_stage_id == stage.id,
            m.Automation.active.is_(True),
        )
    )
    for auto in result.scalars().all():
        text = (auto.config or {}).get("text", "")
        if auto.action == m.AutomationAction.CREATE_TASK:
            due_days = int((auto.config or {}).get("due_days", 1))
            db.add(
                m.LeadEvent(
                    lead_id=lead.id,
                    kind=m.EventKind.TASK,
                    text=text or "Vazifa",
                    due_at=_now() + timedelta(days=due_days),
                    meta={"auto": True},
                )
            )
        elif auto.action == m.AutomationAction.ADD_NOTE:
            db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.NOTE, text=text, meta={"auto": True}))


async def move_lead(db: AsyncSession, lead: m.Lead, stage_id: int) -> m.Lead:
    """Move a lead to another stage; won/lost stages update its status."""
    stage = await get_stage(db, stage_id)
    if stage is None or stage.pipeline_id != lead.pipeline_id:
        raise ValueError("Target stage is not in this lead's pipeline")

    lead.stage_id = stage.id
    if stage.is_won:
        lead.status = m.LeadStatus.WON
    elif stage.is_lost:
        lead.status = m.LeadStatus.LOST
    else:
        lead.status = m.LeadStatus.OPEN
    db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.STAGE_CHANGE, text=f"Bosqich: {stage.name}"))
    await _run_automations(db, lead, stage)
    await db.commit()
    await db.refresh(lead)
    await publish_lead_update(lead.pipeline_id)
    return lead


_TAG_PALETTE = ["accent", "info", "warn", "ok", "crit"]


async def _ensure_tags(db: AsyncSession, texts: list[str]) -> None:
    """Create catalog entries (with a rotating color) for any new tag names."""
    if not texts:
        return
    existing = {t.text for t in (await db.execute(select(m.CrmTag))).scalars().all()}
    n = len(existing)
    for text in texts:
        if text and text not in existing:
            db.add(m.CrmTag(text=text, color=_TAG_PALETTE[n % len(_TAG_PALETTE)]))
            existing.add(text)
            n += 1


async def update_lead(db: AsyncSession, lead: m.Lead, data: s.LeadUpdate) -> m.Lead:
    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(lead, field, value)
    if "tags" in payload:
        await _ensure_tags(db, payload["tags"] or [])
    await db.commit()
    await db.refresh(lead)
    return lead


# --------------------------------------------------------------------------- #
# Tags catalog
# --------------------------------------------------------------------------- #
async def list_tags(db: AsyncSession) -> list[m.CrmTag]:
    result = await db.execute(select(m.CrmTag).order_by(m.CrmTag.text))
    return list(result.scalars().all())


async def create_tag(db: AsyncSession, data: s.TagCreate) -> m.CrmTag:
    existing = (await db.execute(select(m.CrmTag).where(m.CrmTag.text == data.text))).scalars().first()
    if existing:
        existing.color = data.color
        await db.commit()
        await db.refresh(existing)
        return existing
    obj = m.CrmTag(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


# --------------------------------------------------------------------------- #
# Task types
# --------------------------------------------------------------------------- #
async def list_task_types(db: AsyncSession) -> list[m.TaskType]:
    result = await db.execute(select(m.TaskType).order_by(m.TaskType.id))
    return list(result.scalars().all())


async def create_task_type(db: AsyncSession, data: s.TaskTypeCreate) -> m.TaskType:
    existing = (await db.execute(select(m.TaskType).where(m.TaskType.name == data.name))).scalars().first()
    if existing:
        return existing
    obj = m.TaskType(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


# --------------------------------------------------------------------------- #
# Attachments
# --------------------------------------------------------------------------- #
async def add_attachment(db: AsyncSession, lead_id: int, filename: str, content_type: str, size: int, path: str) -> m.LeadAttachment:
    obj = m.LeadAttachment(lead_id=lead_id, filename=filename, content_type=content_type, size=size, path=path)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def list_attachments(db: AsyncSession, lead_id: int) -> list[m.LeadAttachment]:
    result = await db.execute(
        select(m.LeadAttachment).where(m.LeadAttachment.lead_id == lead_id).order_by(m.LeadAttachment.created_at.desc())
    )
    return list(result.scalars().all())


async def get_attachment(db: AsyncSession, attachment_id: int) -> m.LeadAttachment | None:
    return await db.get(m.LeadAttachment, attachment_id)


def _apply_filters(leads: list[m.Lead], f: dict) -> list[m.Lead]:
    """In-memory filtering (dataset is per-pipeline and small)."""
    q = (f.get("q") or "").strip().lower()
    if q:
        leads = [l for l in leads if q in (l.title or "").lower()]
    if f.get("responsible_id"):
        leads = [l for l in leads if l.manager_id == f["responsible_id"]]
    if f.get("source"):
        leads = [l for l in leads if (l.source or "") == f["source"]]
    if f.get("tag"):
        leads = [l for l in leads if f["tag"] in (l.tags or [])]
    if f.get("min_budget") is not None:
        leads = [l for l in leads if l.budget >= f["min_budget"]]
    if f.get("max_budget") is not None:
        leads = [l for l in leads if l.budget <= f["max_budget"]]
    if f.get("no_task"):
        leads = [l for l in leads if not any(e.kind == m.EventKind.TASK and not e.done for e in l.events)]
    if f.get("overdue"):
        now = _now()
        leads = [
            l for l in leads
            if any(e.kind == m.EventKind.TASK and not e.done and e.due_at and e.due_at < now for e in l.events)
        ]
    return leads


# --------------------------------------------------------------------------- #
# Lead feed (timeline)
# --------------------------------------------------------------------------- #
async def add_event(
    db: AsyncSession, lead: m.Lead, data: s.EventCreate, author_id: int | None
) -> m.LeadEvent:
    event = m.LeadEvent(
        lead_id=lead.id,
        kind=data.kind,
        text=data.text,
        due_at=data.due_at,
        meta=data.meta,
        author_id=author_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    await publish_lead_update(lead.pipeline_id)
    return event


async def get_event(db: AsyncSession, event_id: int) -> m.LeadEvent | None:
    return await db.get(m.LeadEvent, event_id)


async def set_task_done(db: AsyncSession, event: m.LeadEvent, done: bool) -> m.LeadEvent:
    event.done = done
    await db.commit()
    await db.refresh(event)
    return event


async def build_detail(db: AsyncSession, lead: m.Lead) -> s.LeadDetail:
    contact_name = None
    if lead.contact_id:
        contact = await clients_service.get_contact(db, lead.contact_id)
        contact_name = contact.full_name if contact else None
    stage = await get_stage(db, lead.stage_id)
    # Query events explicitly (the relationship may be expired after a refresh).
    result = await db.execute(
        select(m.LeadEvent)
        .where(m.LeadEvent.lead_id == lead.id)
        .order_by(m.LeadEvent.created_at.desc(), m.LeadEvent.id.desc())
    )
    events = result.scalars().all()

    # Linked property / sale connection.
    unit_number = deal_state = deal_total = None
    if lead.unit_id:
        from app.modules.structure import service as structure_service
        u = await structure_service.get_unit(db, lead.unit_id)
        unit_number = u.number if u else None
    if lead.deal_id:
        from app.modules.sales import models as sales_m
        deal = await db.get(sales_m.Deal, lead.deal_id)
        if deal:
            deal_state, deal_total = deal.state, deal.total

    base = s.LeadOut.model_validate(lead).model_dump()
    return s.LeadDetail(
        **base,
        contact_name=contact_name,
        stage_name=stage.name if stage else None,
        unit_number=unit_number,
        deal_state=deal_state,
        deal_total=deal_total,
        events=[s.EventOut.model_validate(e) for e in events],
    )


# --------------------------------------------------------------------------- #
# Sales connection — interest, booking, sale (won)
# --------------------------------------------------------------------------- #
async def set_interest(db: AsyncSession, lead: m.Lead, unit_id: int, author_id: int | None = None) -> m.Lead:
    """Mark a lead interested in a unit (no deal yet)."""
    from app.modules.structure import service as structure_service

    unit = await structure_service.get_unit(db, unit_id)
    if unit is None:
        raise ValueError("Unit not found")
    lead.unit_id = unit_id
    db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.SYSTEM,
                       text=f"Qiziqish bildirildi: xonadon {unit.number}", author_id=author_id))
    await db.commit()
    await db.refresh(lead)
    await publish_lead_update(lead.pipeline_id)
    return lead


async def link_deal(db: AsyncSession, lead: m.Lead, deal_id: int, won: bool, author_id: int | None = None) -> m.Lead:
    """Attach a created sales deal to the lead. If it's a real sale (won), also
    move the lead to its pipeline's won stage."""
    from app.modules.sales import models as sales_m
    from app.modules.structure import service as structure_service

    deal = await db.get(sales_m.Deal, deal_id)
    if deal is None:
        raise ValueError("Deal not found")
    lead.deal_id = deal_id
    lead.unit_id = deal.unit_id
    unit = await structure_service.get_unit(db, deal.unit_id)
    num = unit.number if unit else deal.unit_id
    verb = "Sotuv rasmiylashtirildi" if won else "Bron qilindi"
    db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.SYSTEM,
                       text=f"{verb}: {num} · bitim #{deal_id}", author_id=author_id,
                       meta={"deal_id": deal_id, "unit_id": deal.unit_id}))
    if won:
        result = await db.execute(
            select(m.Stage).where(m.Stage.pipeline_id == lead.pipeline_id, m.Stage.is_won.is_(True)).order_by(m.Stage.position)
        )
        won_stage = result.scalars().first()
        if won_stage:
            lead.stage_id = won_stage.id
            lead.status = m.LeadStatus.WON
            db.add(m.LeadEvent(lead_id=lead.id, kind=m.EventKind.STAGE_CHANGE, text=f"Bosqich: {won_stage.name}"))
    await db.commit()
    await db.refresh(lead)
    await publish_lead_update(lead.pipeline_id)
    return lead


# --------------------------------------------------------------------------- #
# Custom fields (lead body settings)
# --------------------------------------------------------------------------- #
async def list_fields(db: AsyncSession, active_only: bool = True) -> list[m.CrmFieldDef]:
    stmt = select(m.CrmFieldDef).order_by(m.CrmFieldDef.position, m.CrmFieldDef.id)
    if active_only:
        stmt = stmt.where(m.CrmFieldDef.active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_field(db: AsyncSession, field_id: int) -> m.CrmFieldDef | None:
    return await db.get(m.CrmFieldDef, field_id)


async def create_field(db: AsyncSession, data: s.FieldDefCreate) -> m.CrmFieldDef:
    obj = m.CrmFieldDef(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_field(db: AsyncSession, field: m.CrmFieldDef, data: s.FieldDefUpdate) -> m.CrmFieldDef:
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(field, k, v)
    await db.commit()
    await db.refresh(field)
    return field


# --------------------------------------------------------------------------- #
# Automations
# --------------------------------------------------------------------------- #
async def list_automations(db: AsyncSession, pipeline_id: int) -> list[m.Automation]:
    result = await db.execute(
        select(m.Automation).where(m.Automation.pipeline_id == pipeline_id).order_by(m.Automation.id)
    )
    return list(result.scalars().all())


async def create_automation(db: AsyncSession, data: s.AutomationCreate) -> m.Automation:
    obj = m.Automation(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_automation(db: AsyncSession, automation_id: int) -> m.Automation | None:
    return await db.get(m.Automation, automation_id)


async def delete_automation(db: AsyncSession, automation: m.Automation) -> None:
    await db.delete(automation)
    await db.commit()


# --------------------------------------------------------------------------- #
# Stage editor (voronka settings)
# --------------------------------------------------------------------------- #
async def update_stage(db: AsyncSession, stage: m.Stage, data: s.StageUpdate) -> m.Stage:
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(stage, k, v)
    await db.commit()
    await db.refresh(stage)
    return stage


async def delete_stage(db: AsyncSession, stage: m.Stage) -> None:
    count = await db.execute(
        select(m.Lead).where(m.Lead.stage_id == stage.id).limit(1)
    )
    if count.scalars().first() is not None:
        raise ValueError("Stage has leads; move them first")
    await db.delete(stage)
    await db.commit()
