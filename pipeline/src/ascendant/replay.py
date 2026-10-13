"""Daily as-of replay: health of every in-scope lab on each day up to the snapshot date.

Uses only releases dated <= each day, scored on the snapshot's (current) index version
and prices, so the series is labelled "reconstructed".
"""

from __future__ import annotations

import datetime as dt

from ascendant.scoring import Engine, LabScore


def dates(engine: Engine) -> list[dt.date]:
    rc = engine.cfg.m("replay")
    d = dt.date.fromisoformat(rc["start"])
    end = engine.u.snapshot_date
    out = []
    while d < end:
        out.append(d)
        d += dt.timedelta(days=rc["step_days"])
    out.append(end)
    return out


def run(engine: Engine) -> list[tuple[dt.date, list[LabScore]]]:
    return [(d, engine.score_all(d)) for d in dates(engine)]
