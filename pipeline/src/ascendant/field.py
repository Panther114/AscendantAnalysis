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
    price_breaks: tuple[float, float]  # USD/1M: mid from the first, frontier from the second
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


def tier_of(release: Release, cfg: Config) -> str | None:
    """Tier of a release, from its own blended price against fixed cut-offs.

    The tier depends on nothing but the release itself and the methodology constants, so
    it can't move when other models appear, are repriced or are backdated in the data.
    """
    override = (cfg.overrides.get("tiers") or {}).get(release.slug)
    if override:
        return override
    if not release.price_blend:
        return None
    tc = cfg.m("tiers")
    if release.price_blend >= tc["frontier_min_price"]:
        return "frontier"
    if release.price_blend >= tc["mid_min_price"]:
        return "mid"
    return "small"


def _active(universe: Universe, date: dt.date, cfg: Config) -> list[Release]:
    """Releases in play on `date`: per product line, those no later sibling has superseded.

    A later release supersedes an earlier one in its line unless it is more than
    `supersede_gap` points weaker, so a weak side release (a ChatGPT, vision or instruct cut,
    which may sort after its flagship on the same day) can't hide the flagship.
    """
    fc = cfg.m("field")
    shelf = dt.timedelta(days=fc["shelf_life_days"])
    gap = fc["supersede_gap"]
    lines: dict[tuple[str, str], list[Release]] = {}
    for r in universe.releases:  # sorted by (date, slug)
        if r.date > date or r.intelligence < fc["min_intelligence"]:
            continue
        heads = lines.setdefault((r.lab, r.line), [])
        heads[:] = [h for h in heads if r.intelligence < h.intelligence - gap]
        heads.append(r)
    return sorted((r for heads in lines.values() for r in heads if date - r.date <= shelf),
                  key=lambda r: r.slug)


def launch_tiers(universe: Universe, cfg: Config) -> dict[str, str | None]:
    """Tier of every release. A release keeps its tier for life (see `tier_of`)."""
    return {r.slug: tier_of(r, cfg) for r in universe.releases}


def build(universe: Universe, date: dt.date, cfg: Config) -> Field:
    active = _active(universe, date, cfg)
    tier = {r.slug: tier_of(r, cfg) for r in active}
    tc = cfg.m("tiers")
    breaks = (float(tc["mid_min_price"]), float(tc["frontier_min_price"]))

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
