"""Demo data in the Flatris style: currencies, a complex with two blocks, a
catalog of planirovkalar (layout "building types") each with a generated
floor-plan image, and units bound to those layouts with a realistic spread of
statuses so the shaxmatka looks alive.

    python -m scripts.seed_demo

Run after `scripts.seed`. Idempotent-ish: skips if a complex already exists.
"""

import asyncio
import random
from decimal import Decimal
from pathlib import Path

from app.core.database import SessionFactory, init_models
from app.modules.structure import schemas as s
from app.modules.structure import service
from app.modules.structure.models import AdditionalKind, SpaceKind, UnitStatus

LAYOUT_MEDIA = Path("media") / "layouts"

# name, rooms, total m², living m², kitchen m²
LAYOUTS = [
    ("Studiya", 1, 32, 20, 8),
    ("1-xonali", 1, 44, 26, 10),
    ("2-xonali", 2, 58, 32, 12),
    ("3-xonali", 3, 78, 44, 14),
    ("4-xonali", 4, 96, 58, 16),
]

# Per-floor position → layout index (which planirovka sits in each column line).
BLOCKS = {
    "A": {"floors": 12, "pattern": [0, 2, 3, 4, 2, 1]},  # 6 lines
    "B": {"floors": 9, "pattern": [1, 2, 3, 2, 1]},       # 5 lines
}

STATUS_WEIGHTS = [
    (UnitStatus.FREE, 0.55),
    (UnitStatus.RESERVED, 0.15),
    (UnitStatus.HOLD, 0.08),
    (UnitStatus.SOLD, 0.22),
]


def _plan_svg(name: str, rooms: int, total: float, living: float, kitchen: float) -> str:
    """A clean schematic floor plan — one big living room, kitchen, bathroom,
    and (rooms-1) bedrooms — labelled with areas. Blueprint aesthetic."""
    W, H = 440, 320
    wall = "#1f2937"
    fill = "#eef2f7"
    ink = "#334155"
    accent = "#2456C9"

    def room(x, y, w, h, label, area):
        return (
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" '
            f'stroke="{wall}" stroke-width="2"/>'
            f'<text x="{x + w / 2}" y="{y + h / 2 - 4}" text-anchor="middle" '
            f'font-family="monospace" font-size="13" fill="{ink}">{label}</text>'
            f'<text x="{x + w / 2}" y="{y + h / 2 + 13}" text-anchor="middle" '
            f'font-family="monospace" font-size="11" fill="{accent}">{area:g} m²</text>'
        )

    pad = 16
    rooms_svg = []
    # Living occupies the left half.
    rooms_svg.append(room(pad, pad, 220, H - 2 * pad, "Zal", living))
    # Right column: kitchen on top, bathroom, then bedrooms fill the rest.
    rx = pad + 220
    rw = W - rx - pad
    rooms_svg.append(room(rx, pad, rw, 90, "Oshxona", kitchen))
    rooms_svg.append(room(rx, pad + 90, rw, 60, "Hammom", 4))
    beds = max(rooms - 1, 0)
    if beds:
        bed_area = round((total - living - kitchen - 4) / beds, 1)
        bh = (H - 2 * pad - 150) / beds
        for i in range(beds):
            rooms_svg.append(
                room(rx, pad + 150 + i * bh, rw, bh, f"Yotoq {i + 1}", bed_area)
            )
    body = "".join(rooms_svg)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#ffffff"/>'
        f'<rect x="6" y="6" width="{W - 12}" height="{H - 12}" fill="none" '
        f'stroke="{accent}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5"/>'
        f"{body}"
        f'<text x="{W - 12}" y="{H - 12}" text-anchor="end" font-family="monospace" '
        f'font-size="12" font-weight="bold" fill="{wall}">{name} · {total:g} m²</text>'
        f"</svg>"
    )


def _parts_for(total: float, living: float, kitchen: float, rooms: int) -> list[s.SpacePartIn]:
    parts = [
        s.SpacePartIn(kind=SpaceKind.LIVING, m2=Decimal(str(living))),
        s.SpacePartIn(kind=SpaceKind.KITCHEN, m2=Decimal(str(kitchen))),
        s.SpacePartIn(kind=SpaceKind.BATHROOM, m2=Decimal("4")),
        s.SpacePartIn(kind=SpaceKind.BALCONY, m2=Decimal("5"), price_factor=Decimal("0.5")),
    ]
    remaining = total - living - kitchen - 4 - 5
    beds = max(rooms - 1, 1)
    if remaining > 0:
        each = round(remaining / beds, 1)
        for _ in range(beds):
            parts.append(s.SpacePartIn(kind=SpaceKind.BEDROOM, m2=Decimal(str(each))))
    return parts


def _pick_status(rng: random.Random) -> UnitStatus:
    r = rng.random()
    cum = 0.0
    for st, w in STATUS_WEIGHTS:
        cum += w
        if r <= cum:
            return st
    return UnitStatus.FREE


async def seed_currencies() -> None:
    """Base currency (UZS) + a USD rate. USD, being added last, is the default."""
    from datetime import date

    from app.modules.settings import schemas as cs
    from app.modules.settings import service as currency_service

    async with SessionFactory() as db:
        if await currency_service.list_currencies(db):
            print("currencies exist, skipping")
            return
        await currency_service.create_currency(
            db, cs.CurrencyCreate(code="UZS", name="Oʻzbek soʻmi", symbol="soʻm")
        )
        usd = await currency_service.create_currency(
            db, cs.CurrencyCreate(code="USD", name="US Dollar", symbol="$", rate=Decimal("12650"))
        )
        await currency_service.set_rate(db, usd.id, cs.RateIn(rate=Decimal("12650"), day=date.today()))
        print("currencies seeded: UZS (base), USD (default)")


async def seed_demo() -> None:
    await init_models()
    await seed_currencies()
    rng = random.Random(42)
    async with SessionFactory() as db:
        if await service.list_complexes(db):
            print("demo complex exists, skipping")
            return

        # --- Planirovkalar (layout catalog) with generated plan images ---
        LAYOUT_MEDIA.mkdir(parents=True, exist_ok=True)
        layouts = []  # (type_obj, tuple)
        for (name, rooms, total, living, kitchen) in LAYOUTS:
            lt = await service.create_unit_type(
                db,
                s.UnitTypeCreate(
                    name=name, default_rooms=rooms,
                    total_m2=Decimal(str(total)), living_m2=Decimal(str(living)),
                    kitchen_m2=Decimal(str(kitchen)),
                    description=f"{rooms}-xonali planirovka, {total:g} m²",
                ),
            )
            svg = _plan_svg(name, rooms, total, living, kitchen)
            path = LAYOUT_MEDIA / f"seed_{lt.id}.svg"
            path.write_text(svg, encoding="utf-8")
            await service.set_type_image(db, lt, str(path))
            layouts.append((lt, (name, rooms, total, living, kitchen)))

        # --- Complex + blocks + units bound to layouts ---
        cx = await service.create_complex(
            db, s.ComplexCreate(name="ЖК Bunyodkor", address="Toshkent, Yunusobod")
        )
        base_price = 12_000_000
        total_units = 0
        for bname, cfg in BLOCKS.items():
            block = await service.create_block(db, s.BlockCreate(complex_id=cx.id, name=bname))
            pattern = cfg["pattern"]
            for floor_no in range(1, cfg["floors"] + 1):
                floor = await service.create_floor(db, s.FloorCreate(block_id=block.id, number=floor_no))
                for pos, layout_idx in enumerate(pattern, start=1):
                    lt, (lname, rooms, total, living, kitchen) = layouts[layout_idx]
                    # Higher floors a touch pricier; ground floor cheaper.
                    ppm = base_price + (floor_no - 1) * 60_000
                    status = UnitStatus.FREE if floor_no == 1 and pos == 1 else _pick_status(rng)
                    await service.create_unit(
                        db,
                        s.UnitCreate(
                            floor_id=floor.id,
                            number=f"{bname}-{floor_no}{pos:02d}",
                            rooms=rooms,
                            type_id=lt.id,
                            price_per_m2=Decimal(str(ppm)),
                            status=status,
                            view=rng.choice(["hovli", "koʻcha", "park"]),
                            parts=_parts_for(total, living, kitchen, rooms),
                        ),
                    )
                    total_units += 1

        # --- Additionals (parking) ---
        for i in range(1, 13):
            await service.create_additional(
                db,
                s.AdditionalCreate(
                    complex_id=cx.id, kind=AdditionalKind.PARKING,
                    number=f"P-{i:02d}", m2=Decimal("13"), price=Decimal("50000000"),
                    status=UnitStatus.SOLD if i % 4 == 0 else UnitStatus.FREE,
                ),
            )

        print(
            f"demo seeded: {cx.name} · {len(layouts)} planirovka · "
            f"{len(BLOCKS)} blok · {total_units} xonadon"
        )


if __name__ == "__main__":
    asyncio.run(seed_demo())
