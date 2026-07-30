"""CRM tables (amoCRM-style): pipelines → stages → leads.

    Pipeline (voronka) ── Stage[] (columns) ── Lead[] (cards)

A lead lives in exactly one stage of one pipeline. Moving it between stages is
the core interaction; won/lost are just stages flagged as terminal.
"""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LeadStatus(StrEnum):
    OPEN = "open"
    WON = "won"
    LOST = "lost"


class EventKind(StrEnum):
    """Entries in a lead's timeline (the amoCRM-style feed)."""

    CREATED = "created"
    NOTE = "note"
    TASK = "task"
    CALL = "call"
    MEETING = "meeting"
    MESSAGE_IN = "message_in"
    MESSAGE_OUT = "message_out"
    STAGE_CHANGE = "stage_change"
    SYSTEM = "system"


class FieldType(StrEnum):
    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    DATE = "date"


class AutomationAction(StrEnum):
    CREATE_TASK = "create_task"
    ADD_NOTE = "add_note"


class Pipeline(Base):
    __tablename__ = "pipelines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    stages: Mapped[list["Stage"]] = relationship(
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="Stage.position",
    )


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(255), default="")  # stage hint (podskazka)
    position: Mapped[int] = mapped_column(Integer, default=0)
    # A design-token name the frontend maps to a color: info/warn/ok/crit/accent/muted.
    color: Mapped[str] = mapped_column(String(20), default="muted")
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False)

    pipeline: Mapped[Pipeline] = relationship(back_populates="stages")


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="RESTRICT"), index=True)
    contact_id: Mapped[int | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), default=None
    )
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="SET NULL"), default=None
    )
    # Linked sales deal once the lead converts to a sale/booking.
    deal_id: Mapped[int | None] = mapped_column(
        ForeignKey("deals.id", ondelete="SET NULL"), default=None
    )
    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    title: Mapped[str] = mapped_column(String(150))
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    source: Mapped[str | None] = mapped_column(String(50), default=None)
    status: Mapped[LeadStatus] = mapped_column(String(20), default=LeadStatus.OPEN, index=True)
    lost_reason: Mapped[str | None] = mapped_column(String(150), default=None)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    custom: Mapped[dict] = mapped_column(JSON, default=dict)  # {field_key: value}

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    events: Mapped[list["LeadEvent"]] = relationship(
        back_populates="lead",
        cascade="all, delete-orphan",
        order_by="LeadEvent.created_at.desc()",
        lazy="selectin",
    )


class LeadEvent(Base):
    """One entry in a lead's feed/timeline — note, task, call, message, etc."""

    __tablename__ = "lead_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    kind: Mapped[EventKind] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text, default="")
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    # Task-specific fields.
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="events")


class CrmFieldDef(Base):
    """Admin-defined custom field on the lead card ('lead body settings')."""

    __tablename__ = "crm_field_defs"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True)
    label: Mapped[str] = mapped_column(String(100))
    field_type: Mapped[FieldType] = mapped_column(String(20), default=FieldType.TEXT)
    options: Mapped[list] = mapped_column(JSON, default=list)  # for SELECT
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Automation(Base):
    """Digital-pipeline rule: when a lead enters a stage, run an action."""

    __tablename__ = "automations"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id", ondelete="CASCADE"), index=True)
    trigger_stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"), index=True)
    action: Mapped[AutomationAction] = mapped_column(String(30))
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # {text, due_days}
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class LostReason(Base):
    """Creatable reason a deal was lost (shown when marking a lead lost)."""

    __tablename__ = "lost_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, default=0)


class CrmTag(Base):
    """Account-wide tag with a color (design token)."""

    __tablename__ = "crm_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(20), default="accent")


class TaskType(Base):
    """Creatable task type (Qoʻngʻiroq, Uchrashuv, …)."""

    __tablename__ = "task_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    icon: Mapped[str] = mapped_column(String(8), default="◔")


class LeadAttachment(Base):
    """A file attached to a lead (shown in the Fayllar tab)."""

    __tablename__ = "lead_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
