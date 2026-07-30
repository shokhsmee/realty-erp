"""Property-structure tables — the tree everything else sells and shows.

    Complex ─┬─ Block ─── Floor ─── Unit ─── SpacePart[]
             └─ Additional[]   (parking / storeroom / commercial / park)

A Unit's total and price are DERIVED from its SpaceParts (see service.py); they
are not stored, so they can never drift out of sync with the parts.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class ComplexStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"


class UnitStatus(StrEnum):
    FREE = "free"
    HOLD = "hold"
    RESERVED = "reserved"
    SOLD = "sold"


class SpaceKind(StrEnum):
    LIVING = "living"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BALCONY = "balcony"
    BATHROOM = "bathroom"
    CORRIDOR = "corridor"
    TERRACE = "terrace"


class AdditionalKind(StrEnum):
    PARKING = "parking"
    STOREROOM = "storeroom"
    COMMERCIAL = "commercial"
    PARK = "park"


# --------------------------------------------------------------------------- #
# Tree
# --------------------------------------------------------------------------- #
class Complex(Base):
    __tablename__ = "complexes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    status: Mapped[ComplexStatus] = mapped_column(String(20), default=ComplexStatus.ACTIVE)
    handover_date: Mapped[date | None] = mapped_column(Date, default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    blocks: Mapped[list["Block"]] = relationship(
        back_populates="complex", cascade="all, delete-orphan", order_by="Block.name"
    )
    additionals: Mapped[list["Additional"]] = relationship(
        back_populates="complex", cascade="all, delete-orphan"
    )


class Block(Base):
    __tablename__ = "blocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("complexes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))

    complex: Mapped[Complex] = relationship(back_populates="blocks")
    floors: Mapped[list["Floor"]] = relationship(
        back_populates="block", cascade="all, delete-orphan", order_by="Floor.number"
    )


class Floor(Base):
    __tablename__ = "floors"

    id: Mapped[int] = mapped_column(primary_key=True)
    block_id: Mapped[int] = mapped_column(ForeignKey("blocks.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)

    block: Mapped[Block] = relationship(back_populates="floors")
    units: Mapped[list["Unit"]] = relationship(
        back_populates="floor", cascade="all, delete-orphan", order_by="Unit.number"
    )


class UnitType(Base):
    """Planirovka / layout ("building type") — the Flatris catalog of apartment
    layouts: a named plan with room count, areas and a floor-plan image, reused
    by every unit that shares it (studio, 1-xona, 2-xona, penthouse…).
    """

    __tablename__ = "unit_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    default_rooms: Mapped[int] = mapped_column(Integer, default=1)
    total_m2: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    living_m2: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    kitchen_m2: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    image: Mapped[str | None] = mapped_column(String(255), default=None)  # plan image path
    description: Mapped[str | None] = mapped_column(String(255), default=None)


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    floor_id: Mapped[int] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"), index=True)
    type_id: Mapped[int | None] = mapped_column(
        ForeignKey("unit_types.id", ondelete="SET NULL"), default=None
    )
    number: Mapped[str] = mapped_column(String(30))
    rooms: Mapped[int] = mapped_column(Integer, default=1)
    price_per_m2: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    # If set, wins over the computed price (manual override for a specific unit).
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    status: Mapped[UnitStatus] = mapped_column(String(20), default=UnitStatus.FREE, index=True)
    view: Mapped[str | None] = mapped_column(String(50), default=None)
    decoration: Mapped[str | None] = mapped_column(String(50), default=None)

    floor: Mapped[Floor] = relationship(back_populates="units")
    unit_type: Mapped[UnitType | None] = relationship(lazy="selectin")
    parts: Mapped[list["SpacePart"]] = relationship(
        back_populates="unit", cascade="all, delete-orphan", lazy="selectin"
    )


class SpacePart(Base):
    """A separately-sized area of a unit — living, kitchen, balcony…

    `is_summable` and `price_factor` let projects count e.g. balconies at 0.5×
    toward both area and price without touching code.
    """

    __tablename__ = "space_parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id", ondelete="CASCADE"), index=True)
    kind: Mapped[SpaceKind] = mapped_column(String(20))
    m2: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    is_summable: Mapped[bool] = mapped_column(Boolean, default=True)
    price_factor: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("1"))

    unit: Mapped[Unit] = relationship(back_populates="parts")


class Additional(Base):
    """Sellable non-apartment objects: parking, storeroom, commercial, park."""

    __tablename__ = "additionals"

    id: Mapped[int] = mapped_column(primary_key=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("complexes.id", ondelete="CASCADE"), index=True)
    kind: Mapped[AdditionalKind] = mapped_column(String(20))
    number: Mapped[str] = mapped_column(String(30))
    m2: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    status: Mapped[UnitStatus] = mapped_column(String(20), default=UnitStatus.FREE)

    complex: Mapped[Complex] = relationship(back_populates="additionals")
