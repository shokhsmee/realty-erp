"""API contracts for the structure module.

Unit area & price are exposed as Pydantic `computed_field`s derived from the
space parts, so the API always reflects the parts with no stored duplication.
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.modules.structure import pricing
from app.modules.structure.models import (
    AdditionalKind,
    ComplexStatus,
    SpaceKind,
    UnitStatus,
)


# --------------------------------------------------------------------------- #
# Space parts
# --------------------------------------------------------------------------- #
class SpacePartIn(BaseModel):
    kind: SpaceKind
    m2: Decimal
    is_summable: bool = True
    price_factor: Decimal = Decimal("1")


class SpacePartOut(SpacePartIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --------------------------------------------------------------------------- #
# Units
# --------------------------------------------------------------------------- #
class UnitBase(BaseModel):
    number: str
    rooms: int = 1
    type_id: int | None = None
    price_per_m2: Decimal = Decimal("0")
    price_override: Decimal | None = None
    view: str | None = None
    decoration: str | None = None


class UnitCreate(UnitBase):
    floor_id: int
    status: UnitStatus = UnitStatus.FREE
    parts: list[SpacePartIn] = []


class UnitUpdate(BaseModel):
    number: str | None = None
    rooms: int | None = None
    type_id: int | None = None
    price_per_m2: Decimal | None = None
    price_override: Decimal | None = None
    view: str | None = None
    decoration: str | None = None
    status: UnitStatus | None = None
    # If provided, fully replaces the unit's space parts.
    parts: list[SpacePartIn] | None = None


class UnitOut(UnitBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    floor_id: int
    status: UnitStatus
    parts: list[SpacePartOut] = []

    @computed_field
    @property
    def total_m2(self) -> Decimal:
        return pricing.total_m2(self.parts)

    @computed_field
    @property
    def billable_m2(self) -> Decimal:
        return pricing.billable_m2(self.parts)

    @computed_field
    @property
    def price(self) -> Decimal:
        return pricing.unit_price(self.parts, self.price_per_m2, self.price_override)


# --------------------------------------------------------------------------- #
# Unit types
# --------------------------------------------------------------------------- #
class UnitTypeCreate(BaseModel):
    name: str
    default_rooms: int = 1
    total_m2: Decimal = Decimal("0")
    living_m2: Decimal = Decimal("0")
    kitchen_m2: Decimal = Decimal("0")
    description: str | None = None


class UnitTypeUpdate(BaseModel):
    name: str | None = None
    default_rooms: int | None = None
    total_m2: Decimal | None = None
    living_m2: Decimal | None = None
    kitchen_m2: Decimal | None = None
    description: str | None = None


class UnitTypeOut(UnitTypeCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    image: str | None = None


# --------------------------------------------------------------------------- #
# Floors / Blocks / Complexes
# --------------------------------------------------------------------------- #
class FloorCreate(BaseModel):
    block_id: int
    number: int


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    block_id: int
    number: int


class FloorWithUnits(FloorOut):
    units: list[UnitOut] = []


class BlockCreate(BaseModel):
    complex_id: int
    name: str


class BlockUpdate(BaseModel):
    name: str | None = None


class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    complex_id: int
    name: str


class BlockWithFloors(BlockOut):
    floors: list[FloorWithUnits] = []


class ComplexCreate(BaseModel):
    name: str
    address: str | None = None
    status: ComplexStatus = ComplexStatus.ACTIVE
    handover_date: date | None = None


class ComplexUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    status: ComplexStatus | None = None
    handover_date: date | None = None


class ComplexOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str | None
    status: ComplexStatus
    handover_date: date | None
    created_at: datetime


class ComplexTree(ComplexOut):
    blocks: list[BlockWithFloors] = []


# --------------------------------------------------------------------------- #
# Additionals
# --------------------------------------------------------------------------- #
class AdditionalCreate(BaseModel):
    complex_id: int
    kind: AdditionalKind
    number: str
    m2: Decimal = Decimal("0")
    price: Decimal = Decimal("0")
    status: UnitStatus = UnitStatus.FREE


class AdditionalUpdate(BaseModel):
    number: str | None = None
    m2: Decimal | None = None
    price: Decimal | None = None
    status: UnitStatus | None = None


class AdditionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    complex_id: int
    kind: AdditionalKind
    number: str
    m2: Decimal
    price: Decimal
    status: UnitStatus


# --------------------------------------------------------------------------- #
# Bulk scaffolding
# --------------------------------------------------------------------------- #
class BlockScaffold(BaseModel):
    """Generate `floors` × `units_per_floor` empty units under a block."""

    floors: int
    units_per_floor: int
    start_floor: int = 1
    rooms: int = 1
    price_per_m2: Decimal = Decimal("0")
