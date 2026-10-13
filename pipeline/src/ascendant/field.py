"""The competitive field as of a date D: active releases, tiers and value regressions.

Only releases dated <= D are visible. Within each (lab, product line) only the newest
release is active, and it drops out after `shelf_life_days` without a successor.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass

from ascendant import stats
from ascendant.config import Config
from ascendant.normalize import Release, Universe, Variant

TIERS = ("frontier", "mid", "small")


@dataclass(frozen=True)
class Field:
    date: dt.date
    active: tuple[Release, ...]  # sorted by slug
    tier: dict[str, str | None]  # release slug -> tier
    price_breaks: tuple[float, ...]  # USD/1M, ascending; frontier >= last, mid >= second-last
    value_coef: tuple[float, float]  # I ~ a + b * log(cost)
    speed_coef: tuple[float, float] | None  # log(speed) ~ a + b * I
    frontier_intelligence: float

    def variants(self) -> list[Variant]:
        return [v for r in self.active for v in r.variants]

    def value_residual(self, v: Variant) -> float | None:
        if v.cost is None:
            return None
        a, b = self.value_coef
        return v.intelligence - (a + b * math.log(v.cost))

    def speed_residual(self, v: Variant) -> float | None:
        if v.speed is None or self.speed_coef is None:
            return None
        a, b = self.speed_coef
        return math.log(v.speed) - (a + b * v.intelligence)


def _assign_tiers(
    active: list[Release], cfg: Config
) -> tuple[dict[str, str | None], tuple[float, ...]]:
    tc = cfg.m("tiers")
    priced = [r for r in active if r.price_blend]
    tier: dict[str, str | None] = {r.slug: None for r in active}
    if len(priced) < 3:
        return tier, ()
    k = min(tc["jenks_k"], len(priced))
    logp = [math.log(r.price_blend) for r in priced]
    breaks = stats.jenks_breaks(logp, k)  # k-1 upper bounds of lower classes
    fb, mb = tc["frontier_bands"], tc["mid_bands"]
    frontier_min = breaks[-fb] if len(breaks) >= fb else math.inf
    mid_min = breaks[-(fb + mb)] if len(breaks) >= fb + mb else -math.inf

    def band(lp: float) -> str:
        if lp > frontier_min:
            return "frontier"
        if lp > mid_min:
            return "mid"
        return "small"

    for r in priced:
        tier[r.slug] = band(math.log(r.price_blend))

    # Flagship promotion: a lab's most intelligent active line moves mid -> frontier when it
    # lands within `flagship_promotion_gap` points of the field's best model.
    cut = max(r.intelligence for r in active) - tc["flagship_promotion_gap"]
    by_lab: dict[str, list[Release]] = {}
    for r in priced:
        by_lab.setdefault(r.lab, []).append(r)
    for rs in by_lab.values():
        flagship = max(rs, key=lambda r: (r.intelligence, r.slug))
        if tier[flagship.slug] == "mid" and flagship.intelligence >= cut:
            tier[flagship.slug] = "frontier"

    for slug, t in (cfg.overrides.get("tiers") or {}).items():
        if slug in tier:
            tier[slug] = t
    price_breaks = tuple(stats.rnd(math.exp(b)) for b in (mid_min, frontier_min))
    return tier, price_breaks


def _active(universe: Universe, date: dt.date, cfg: Config) -> list[Release]:
    fc = cfg.m("field")
    shelf = dt.timedelta(days=fc["shelf_life_days"])
    newest: dict[tuple[str, str], Release] = {}
    for r in universe.releases:  # sorted by (date, slug), so later wins
        if r.date > date or r.intelligence < fc["min_intelligence"]:
            continue
        newest[(r.lab, r.line)] = r
    return sorted((r for r in newest.values() if date - r.date <= shelf), key=lambda r: r.slug)


def launch_tiers(universe: Universe, cfg: Config) -> dict[str, str | None]:
    """Tier of every release as assigned in the field on its own release date.

    A release keeps its launch tier for life: tiers describe the competitive role a model
    was launched into, and re-cutting them on every replay date would make releases flap between tiers.
    """
    out: dict[str, str | None] = {}
    for d in sorted({r.date for r in universe.releases}):
        active = _active(universe, d, cfg)
        tier, _ = _assign_tiers(active, cfg)
        for r in active:
            if r.date == d:
                out[r.slug] = tier[r.slug]
    for slug, t in (cfg.overrides.get("tiers") or {}).items():
        out[slug] = t
    return out


def build(
    universe: Universe, date: dt.date, cfg: Config, tiers: dict[str, str | None] | None = None
) -> Field:
    active = _active(universe, date, cfg)
    tier, breaks = _assign_tiers(active, cfg)
    if tiers is not None:
        tier = {r.slug: tiers.get(r.slug) for r in active}

    vs = [v for r in active for v in r.variants]
    costed = [v for v in vs if v.cost is not None]
    if len(costed) >= 3:
        c = stats.ols([[math.log(v.cost)] for v in costed], [v.intelligence for v in costed])
        value_coef = (c[0], c[1])
    else:
        value_coef = (stats.fsum_mean([v.intelligence for v in vs]) if vs else 0.0, 0.0)
    timed = [v for v in vs if v.speed is not None]
    speed_coef = None
    if len(timed) >= 3:
        c = stats.ols([[v.intelligence] for v in timed], [math.log(v.speed) for v in timed])
        speed_coef = (c[0], c[1])

    return Field(
        date=date,
        active=tuple(active),
        tier=tier,
        price_breaks=breaks,
        value_coef=value_coef,
        speed_coef=speed_coef,
        frontier_intelligence=max((r.intelligence for r in active), default=0.0),
    )
