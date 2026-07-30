"""API contracts for the CRM module."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.modules.crm.models import (
    AutomationAction,
    EventKind,
    FieldType,
    LeadStatus,
)


# --------------------------------------------------------------------------- #
# Leads
# --------------------------------------------------------------------------- #
class LeadCreate(BaseModel):
    title: str
    budget: Decimal = Decimal("0")
    source: str | None = None
    pipeline_id: int | None = None   # defaults to the default pipeline
    stage_id: int | None = None      # defaults to the pipeline's first stage
    contact_id: int | None = None
    unit_id: int | None = None
    manager_id: int | None = None
    # Convenience: create a contact from these and link it (quick-add).
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None


class LeadUpdate(BaseModel):
    title: str | None = None
    budget: Decimal | None = None
    source: str | None = None
    manager_id: int | None = None
    unit_id: int | None = None
    deal_id: int | None = None
    contact_id: int | None = None
    tags: list[str] | None = None
    custom: dict | None = None


class LeadMove(BaseModel):
    stage_id: int


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pipeline_id: int
    stage_id: int
    contact_id: int | None
    unit_id: int | None
    deal_id: int | None = None
    manager_id: int | None
    title: str
    budget: Decimal
    source: str | None
    status: LeadStatus
    lost_reason: str | None = None
    tags: list = []
    custom: dict = {}
    created_at: datetime


# --------------------------------------------------------------------------- #
# Lead feed (timeline / chat history)
# --------------------------------------------------------------------------- #
class EventCreate(BaseModel):
    kind: EventKind = EventKind.NOTE
    text: str = ""
    due_at: datetime | None = None
    meta: dict = {}


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    kind: EventKind
    text: str
    author_id: int | None
    due_at: datetime | None
    done: bool
    meta: dict
    created_at: datetime


class LeadDetail(LeadOut):
    contact_name: str | None = None
    stage_name: str | None = None
    unit_number: str | None = None
    deal_state: str | None = None
    deal_total: Decimal | None = None
    events: list[EventOut] = []


class InterestRequest(BaseModel):
    unit_id: int


class LinkDealRequest(BaseModel):
    deal_id: int
    won: bool = False


# --------------------------------------------------------------------------- #
# Custom fields (lead body settings)
# --------------------------------------------------------------------------- #
class FieldDefCreate(BaseModel):
    key: str
    label: str
    field_type: FieldType = FieldType.TEXT
    options: list[str] = []
    required: bool = False
    position: int = 0


class FieldDefUpdate(BaseModel):
    label: str | None = None
    options: list[str] | None = None
    required: bool | None = None
    position: int | None = None
    active: bool | None = None


class FieldDefOut(FieldDefCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    active: bool


# --------------------------------------------------------------------------- #
# Automations (digital pipeline)
# --------------------------------------------------------------------------- #
class AutomationCreate(BaseModel):
    pipeline_id: int
    trigger_stage_id: int
    action: AutomationAction
    config: dict = {}   # {text, due_days}
    active: bool = True


class AutomationOut(AutomationCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --------------------------------------------------------------------------- #
# Stages / Pipelines
# --------------------------------------------------------------------------- #
class StageCreate(BaseModel):
    name: str
    description: str = ""
    position: int = 0
    color: str = "muted"
    is_won: bool = False
    is_lost: bool = False


class StageUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    position: int | None = None
    color: str | None = None


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pipeline_id: int
    name: str
    description: str = ""
    position: int
    color: str
    is_won: bool
    is_lost: bool


class StageWithLeads(StageOut):
    leads: list[LeadOut] = []

    @computed_field
    @property
    def count(self) -> int:
        return len(self.leads)

    @computed_field
    @property
    def total_budget(self) -> Decimal:
        return sum((l.budget for l in self.leads), Decimal("0"))


class PipelineCreate(BaseModel):
    name: str
    is_default: bool = False


class PipelineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    is_default: bool
    archived: bool = False
    position: int


class LostReasonCreate(BaseModel):
    pipeline_id: int
    text: str
    position: int = 0


class LostReasonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pipeline_id: int
    text: str
    position: int


class LostRequest(BaseModel):
    reason: str | None = None


class TagCreate(BaseModel):
    text: str
    color: str = "accent"


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    color: str


class TaskTypeCreate(BaseModel):
    name: str
    icon: str = "◔"


class TaskTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    icon: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    filename: str
    content_type: str
    size: int
    created_at: datetime


class BoardOut(BaseModel):
    """A pipeline with its stages, each carrying its leads — the Kanban payload."""

    pipeline: PipelineOut
    stages: list[StageWithLeads]
