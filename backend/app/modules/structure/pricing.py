"""Pure pricing formulas for units — the single definition of how m² and price
are derived from space parts. Imported by both schemas (API output) and services
(backend logic) so the rule lives in exactly one place.

`parts` is any iterable of objects exposing `.m2` and `.price_factor` (Decimals) —
works for both ORM SpacePart and Pydantic SpacePartOut.
"""

from decimal import Decimal, ROUND_HALF_UP

_CENTS = Decimal("0.01")


def _round(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP)


def total_m2(parts) -> Decimal:
    """Physical area — every part at face value."""
    return _round(sum((p.m2 for p in parts), Decimal("0")))


def billable_m2(parts) -> Decimal:
    """Area used for pricing — parts weighted by price_factor."""
    return _round(sum((p.m2 * p.price_factor for p in parts), Decimal("0")))


def unit_price(parts, price_per_m2: Decimal, override: Decimal | None) -> Decimal:
    """Override if set, else billable_m² × price_per_m²."""
    if override is not None:
        return _round(override)
    return _round(billable_m2(parts) * price_per_m2)
