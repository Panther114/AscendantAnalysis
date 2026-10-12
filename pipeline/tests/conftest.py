from __future__ import annotations

import datetime as dt

import pytest

from ascendant import config as config_mod
from ascendant.normalize import Lab, Release, Universe, Variant


def variant(slug: str, lab: str, release: str, date: dt.date, intelligence: float,
            cost: float | None, speed: float | None = 100.0, price: float | None = None) -> Variant:
    return Variant(
        id=slug, slug=slug, name=slug, short_name=slug, lab=lab, release=release, date=date,
        intelligence=intelligence, estimated=False, reasoning=True, open_weights=False,
        price_in=None, price_out=None, price_blend=price if price is not None else cost,
        cost_per_task=cost, cost_per_task_imputed=False, cost=cost, speed=speed,
    )


def release(slug: str, lab: str, date: dt.date, line: str,
            points: list[tuple[float, float | None]], price: float | None,
            speed: float | None = 100.0) -> Release:
    vs = tuple(
        variant(f"{slug}-{i}", lab, slug, date, intel, cost, speed, price)
        for i, (intel, cost) in enumerate(points)
    )
    return Release(slug=slug, name=slug, lab=lab, date=date, line=line, variants=vs,
                   open_weights=False, price_blend=price)


def universe(releases: list[Release], snapshot_date: dt.date) -> Universe:
    labs = {r.lab: Lab(r.lab, r.lab.title(), "#888888", None) for r in releases}
    return Universe(
        snapshot_date=snapshot_date,
        labs=dict(sorted(labs.items())),
        releases=sorted(releases, key=lambda r: (r.date, r.slug)),
    )


D = dt.date


@pytest.fixture
def cfg():
    return config_mod.load()


@pytest.fixture
def market() -> list[Release]:
    """A small three-tier market with five labs."""
    return [
        # Alpha: full lineup, leads intelligence
        release("alpha-big-2", "alpha", D(2026, 8, 1), "Alpha Big", [(40, 6.0), (50, 12.0)], 10.0),
        release("alpha-mid-2", "alpha", D(2026, 8, 5), "Alpha Mid", [(35, 2.0), (44, 4.0)], 3.0),
        release("alpha-small-2", "alpha", D(2026, 8, 9), "Alpha Small", [(30, 0.3)], 0.3),
        # Beta: full lineup, cheaper but weaker
        release("beta-big-1", "beta", D(2026, 7, 1), "Beta Big", [(45, 5.0)], 9.0),
        release("beta-mid-1", "beta", D(2026, 7, 1), "Beta Mid", [(40, 1.0)], 2.5),
        release("beta-small-1", "beta", D(2026, 7, 1), "Beta Small", [(26, 0.2)], 0.25),
        # Gamma: cheap specialist
        release("gamma-flash-1", "gamma", D(2026, 6, 1), "Gamma Flash", [(30, 0.10)], 0.2),
        release("gamma-flash-2", "gamma", D(2026, 8, 20), "Gamma Flash", [(36, 0.08)], 0.2),
        # Delta: declining flagship line
        release("delta-1", "delta", D(2026, 5, 1), "Delta", [(42, 4.0)], 8.0),
        release("delta-2", "delta", D(2026, 7, 15), "Delta", [(43, 6.0)], 8.0),
        release("delta-3", "delta", D(2026, 8, 25), "Delta", [(41, 9.0)], 8.0),
        # Epsilon: filler
        release("eps-a", "eps", D(2026, 3, 1), "Eps A", [(20, 0.5)], 0.6),
        release("eps-b", "eps", D(2026, 3, 1), "Eps B", [(25, 1.5)], 1.8),
    ]
