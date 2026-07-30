"""HTTP endpoints for the property structure.

Reads require `shaxmatka:view` (anyone who sells can browse the tree); structural
changes require `shaxmatka:manage` (admins & sales heads set buildings up).
"""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.deps import DbSession, require
from app.core.permissions import App, Level
from app.modules.structure import schemas as s
from app.modules.structure import service

view = Depends(require(App.SHAXMATKA, Level.VIEW))
manage = Depends(require(App.SHAXMATKA, Level.MANAGE))

LAYOUT_MEDIA = Path("media") / "layouts"

router = APIRouter(prefix="/structure", tags=["structure"])

_NOT_FOUND = lambda what: HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")  # noqa: E731


# --------------------------------------------------------------------------- #
# Complexes
# --------------------------------------------------------------------------- #
@router.get("/complexes", response_model=list[s.ComplexOut], dependencies=[view])
async def list_complexes(db: DbSession):
    return await service.list_complexes(db)


@router.post(
    "/complexes", response_model=s.ComplexOut, status_code=201, dependencies=[manage]
)
async def create_complex(payload: s.ComplexCreate, db: DbSession):
    return await service.create_complex(db, payload)


@router.get("/complexes/{complex_id}", response_model=s.ComplexOut, dependencies=[view])
async def get_complex(complex_id: int, db: DbSession):
    obj = await service.get_complex(db, complex_id)
    if obj is None:
        raise _NOT_FOUND("Complex")
    return obj


@router.get("/complexes/{complex_id}/tree", response_model=s.ComplexTree, dependencies=[view])
async def get_complex_tree(complex_id: int, db: DbSession):
    obj = await service.get_complex_tree(db, complex_id)
    if obj is None:
        raise _NOT_FOUND("Complex")
    return obj


@router.patch("/complexes/{complex_id}", response_model=s.ComplexOut, dependencies=[manage])
async def update_complex(complex_id: int, payload: s.ComplexUpdate, db: DbSession):
    obj = await service.get_complex(db, complex_id)
    if obj is None:
        raise _NOT_FOUND("Complex")
    return await service.update_complex(db, obj, payload)


@router.delete("/complexes/{complex_id}", status_code=204, dependencies=[manage])
async def delete_complex(complex_id: int, db: DbSession):
    obj = await service.get_complex(db, complex_id)
    if obj is None:
        raise _NOT_FOUND("Complex")
    await service.delete_complex(db, obj)


# --------------------------------------------------------------------------- #
# Blocks
# --------------------------------------------------------------------------- #
@router.post("/blocks", response_model=s.BlockOut, status_code=201, dependencies=[manage])
async def create_block(payload: s.BlockCreate, db: DbSession):
    return await service.create_block(db, payload)


@router.patch("/blocks/{block_id}", response_model=s.BlockOut, dependencies=[manage])
async def update_block(block_id: int, payload: s.BlockUpdate, db: DbSession):
    obj = await service.get_block(db, block_id)
    if obj is None:
        raise _NOT_FOUND("Block")
    return await service.update_block(db, obj, payload)


@router.delete("/blocks/{block_id}", status_code=204, dependencies=[manage])
async def delete_block(block_id: int, db: DbSession):
    obj = await service.get_block(db, block_id)
    if obj is None:
        raise _NOT_FOUND("Block")
    await service.delete_block(db, obj)


@router.post("/blocks/{block_id}/scaffold", dependencies=[manage])
async def scaffold_block(block_id: int, payload: s.BlockScaffold, db: DbSession):
    """Bulk-create floors × units under a block."""
    block = await service.get_block(db, block_id)
    if block is None:
        raise _NOT_FOUND("Block")
    created = await service.scaffold_block(db, block, payload)
    return {"created_units": created}


# --------------------------------------------------------------------------- #
# Floors & Units
# --------------------------------------------------------------------------- #
@router.post("/floors", response_model=s.FloorOut, status_code=201, dependencies=[manage])
async def create_floor(payload: s.FloorCreate, db: DbSession):
    return await service.create_floor(db, payload)


@router.post("/units", response_model=s.UnitOut, status_code=201, dependencies=[manage])
async def create_unit(payload: s.UnitCreate, db: DbSession):
    return await service.create_unit(db, payload)


@router.get("/units/{unit_id}", response_model=s.UnitOut, dependencies=[view])
async def get_unit(unit_id: int, db: DbSession):
    obj = await service.get_unit(db, unit_id)
    if obj is None:
        raise _NOT_FOUND("Unit")
    return obj


@router.patch("/units/{unit_id}", response_model=s.UnitOut, dependencies=[manage])
async def update_unit(unit_id: int, payload: s.UnitUpdate, db: DbSession):
    obj = await service.get_unit(db, unit_id)
    if obj is None:
        raise _NOT_FOUND("Unit")
    return await service.update_unit(db, obj, payload)


@router.delete("/units/{unit_id}", status_code=204, dependencies=[manage])
async def delete_unit(unit_id: int, db: DbSession):
    obj = await service.get_unit(db, unit_id)
    if obj is None:
        raise _NOT_FOUND("Unit")
    await service.delete_unit(db, obj)


# --------------------------------------------------------------------------- #
# Unit types
# --------------------------------------------------------------------------- #
@router.get("/unit-types", response_model=list[s.UnitTypeOut], dependencies=[view])
async def list_unit_types(db: DbSession):
    return await service.list_unit_types(db)


@router.post("/unit-types", response_model=s.UnitTypeOut, status_code=201, dependencies=[manage])
async def create_unit_type(payload: s.UnitTypeCreate, db: DbSession):
    return await service.create_unit_type(db, payload)


@router.patch("/unit-types/{type_id}", response_model=s.UnitTypeOut, dependencies=[manage])
async def update_unit_type(type_id: int, payload: s.UnitTypeUpdate, db: DbSession):
    obj = await service.get_unit_type(db, type_id)
    if obj is None:
        raise _NOT_FOUND("Layout")
    return await service.update_unit_type(db, obj, payload)


@router.delete("/unit-types/{type_id}", status_code=204, dependencies=[manage])
async def delete_unit_type(type_id: int, db: DbSession):
    obj = await service.get_unit_type(db, type_id)
    if obj is None:
        raise _NOT_FOUND("Layout")
    await service.delete_unit_type(db, obj)


@router.post("/unit-types/{type_id}/image", response_model=s.UnitTypeOut, dependencies=[manage])
async def upload_type_image(type_id: int, db: DbSession, file: UploadFile = File(...)):
    obj = await service.get_unit_type(db, type_id)
    if obj is None:
        raise _NOT_FOUND("Layout")
    LAYOUT_MEDIA.mkdir(parents=True, exist_ok=True)
    stored = LAYOUT_MEDIA / f"{type_id}_{uuid.uuid4().hex}_{file.filename}"
    stored.write_bytes(await file.read())
    return await service.set_type_image(db, obj, str(stored))


@router.get("/unit-types/{type_id}/image")
async def get_type_image(type_id: int, db: DbSession):
    obj = await service.get_unit_type(db, type_id)
    if obj is None or not obj.image or not os.path.exists(obj.image):
        raise _NOT_FOUND("Image")
    return FileResponse(obj.image)


# --------------------------------------------------------------------------- #
# Additionals
# --------------------------------------------------------------------------- #
@router.get(
    "/complexes/{complex_id}/additionals",
    response_model=list[s.AdditionalOut],
    dependencies=[view],
)
async def list_additionals(complex_id: int, db: DbSession):
    return await service.list_additionals(db, complex_id)


@router.post("/additionals", response_model=s.AdditionalOut, status_code=201, dependencies=[manage])
async def create_additional(payload: s.AdditionalCreate, db: DbSession):
    return await service.create_additional(db, payload)


@router.patch("/additionals/{additional_id}", response_model=s.AdditionalOut, dependencies=[manage])
async def update_additional(additional_id: int, payload: s.AdditionalUpdate, db: DbSession):
    obj = await service.get_additional(db, additional_id)
    if obj is None:
        raise _NOT_FOUND("Additional")
    return await service.update_additional(db, obj, payload)


@router.delete("/additionals/{additional_id}", status_code=204, dependencies=[manage])
async def delete_additional(additional_id: int, db: DbSession):
    obj = await service.get_additional(db, additional_id)
    if obj is None:
        raise _NOT_FOUND("Additional")
    await service.delete_additional(db, obj)
