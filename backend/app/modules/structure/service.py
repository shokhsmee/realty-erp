"""Structure-domain business logic (pure functions over an AsyncSession)."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.structure import models as m
from app.modules.structure import pricing
from app.modules.structure import schemas as s


def compute_price(unit: m.Unit) -> Decimal:
    """Server-side unit price (same formula the API exposes)."""
    return pricing.unit_price(unit.parts, unit.price_per_m2, unit.price_override)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _apply_parts(unit: m.Unit, parts: list[s.SpacePartIn]) -> None:
    """Replace a unit's space parts with the given list."""
    unit.parts.clear()
    for p in parts:
        unit.parts.append(
            m.SpacePart(
                kind=p.kind, m2=p.m2, is_summable=p.is_summable, price_factor=p.price_factor
            )
        )


# --------------------------------------------------------------------------- #
# Complex
# --------------------------------------------------------------------------- #
async def create_complex(db: AsyncSession, data: s.ComplexCreate) -> m.Complex:
    obj = m.Complex(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def list_complexes(db: AsyncSession) -> list[m.Complex]:
    result = await db.execute(select(m.Complex).order_by(m.Complex.name))
    return list(result.scalars().all())


async def get_complex(db: AsyncSession, complex_id: int) -> m.Complex | None:
    return await db.get(m.Complex, complex_id)


async def get_complex_tree(db: AsyncSession, complex_id: int) -> m.Complex | None:
    """Load a complex with blocks → floors → units (+ parts) in one go."""
    result = await db.execute(
        select(m.Complex)
        .where(m.Complex.id == complex_id)
        .options(
            selectinload(m.Complex.blocks)
            .selectinload(m.Block.floors)
            .selectinload(m.Floor.units)
            .selectinload(m.Unit.parts)
        )
    )
    return result.scalar_one_or_none()


async def update_complex(db: AsyncSession, obj: m.Complex, data: s.ComplexUpdate) -> m.Complex:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_complex(db: AsyncSession, obj: m.Complex) -> None:
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- #
# Block
# --------------------------------------------------------------------------- #
async def create_block(db: AsyncSession, data: s.BlockCreate) -> m.Block:
    obj = m.Block(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_block(db: AsyncSession, block_id: int) -> m.Block | None:
    return await db.get(m.Block, block_id)


async def update_block(db: AsyncSession, obj: m.Block, data: s.BlockUpdate) -> m.Block:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_block(db: AsyncSession, obj: m.Block) -> None:
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- #
# Floor
# --------------------------------------------------------------------------- #
async def create_floor(db: AsyncSession, data: s.FloorCreate) -> m.Floor:
    obj = m.Floor(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_floor(db: AsyncSession, floor_id: int) -> m.Floor | None:
    return await db.get(m.Floor, floor_id)


# --------------------------------------------------------------------------- #
# Unit
# --------------------------------------------------------------------------- #
async def create_unit(db: AsyncSession, data: s.UnitCreate) -> m.Unit:
    obj = m.Unit(**data.model_dump(exclude={"parts"}))
    _apply_parts(obj, data.parts)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_unit(db: AsyncSession, unit_id: int) -> m.Unit | None:
    return await db.get(m.Unit, unit_id)


async def update_unit(db: AsyncSession, obj: m.Unit, data: s.UnitUpdate) -> m.Unit:
    payload = data.model_dump(exclude_unset=True, exclude={"parts"})
    for field, value in payload.items():
        setattr(obj, field, value)
    if data.parts is not None:
        _apply_parts(obj, data.parts)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_unit(db: AsyncSession, obj: m.Unit) -> None:
    await db.delete(obj)
    await db.commit()


async def scaffold_block(db: AsyncSession, block: m.Block, params: s.BlockScaffold) -> int:
    """Create empty floors × units under a block. Returns units created."""
    created = 0
    for i in range(params.floors):
        floor_no = params.start_floor + i
        floor = m.Floor(block_id=block.id, number=floor_no)
        db.add(floor)
        await db.flush()  # assign floor.id
        for pos in range(1, params.units_per_floor + 1):
            db.add(
                m.Unit(
                    floor_id=floor.id,
                    number=f"{block.name}-{floor_no}{pos:02d}",
                    rooms=params.rooms,
                    price_per_m2=params.price_per_m2,
                )
            )
            created += 1
    await db.commit()
    return created


# --------------------------------------------------------------------------- #
# Unit types
# --------------------------------------------------------------------------- #
async def list_unit_types(db: AsyncSession) -> list[m.UnitType]:
    result = await db.execute(select(m.UnitType).order_by(m.UnitType.name))
    return list(result.scalars().all())


async def create_unit_type(db: AsyncSession, data: s.UnitTypeCreate) -> m.UnitType:
    obj = m.UnitType(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_unit_type(db: AsyncSession, type_id: int) -> m.UnitType | None:
    return await db.get(m.UnitType, type_id)


async def update_unit_type(db: AsyncSession, obj: m.UnitType, data: s.UnitTypeUpdate) -> m.UnitType:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def set_type_image(db: AsyncSession, obj: m.UnitType, path: str) -> m.UnitType:
    obj.image = path
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_unit_type(db: AsyncSession, obj: m.UnitType) -> None:
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- #
# Additionals
# --------------------------------------------------------------------------- #
async def list_additionals(db: AsyncSession, complex_id: int) -> list[m.Additional]:
    result = await db.execute(
        select(m.Additional).where(m.Additional.complex_id == complex_id).order_by(m.Additional.number)
    )
    return list(result.scalars().all())


async def create_additional(db: AsyncSession, data: s.AdditionalCreate) -> m.Additional:
    obj = m.Additional(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_additional(db: AsyncSession, additional_id: int) -> m.Additional | None:
    return await db.get(m.Additional, additional_id)


async def update_additional(db: AsyncSession, obj: m.Additional, data: s.AdditionalUpdate) -> m.Additional:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_additional(db: AsyncSession, obj: m.Additional) -> None:
    await db.delete(obj)
    await db.commit()
