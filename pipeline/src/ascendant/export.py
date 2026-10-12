"""Exports the scored universe as versioned, canonical JSON for the website.

Everything here is a pure function of (snapshot, config): no wall-clock time, sorted keys,
fixed float rounding, so the same inputs produce byte-identical files.
"""

from __future__ import annotations

import copy
import dataclasses
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from ascendant import stats
from ascendant.config import Config
from ascendant.field import TIERS
from ascendant.normalize import Universe
from ascendant.replay import run as run_replay
from ascendant.scoring import Engine, LabScore

SCHEMA_VERSION = 1


def _dump(obj: Any) -> bytes:
    return (json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def _lab_payload(s: LabScore) -> dict:
    return dataclasses.asdict(s)


def _ownership(engine: Engine, date) -> dict:
    """Cheapest model reaching each capability level (frontier max minus 0..value_zone end)."""
    f = engine.field(date)
    lc = engine.cfg.m("leadership")
    top = f.frontier_intelligence
    costed = [v for v in f.variants() if v.cost is not None]
    levels = []
    g = 0.0
    while g <= lc["value_zone"][1] + 1e-9:
        lvl = top - g
        reach = sorted((v for v in costed if v.intelligence >= lvl), key=lambda v: (v.cost, v.slug))
        owner = reach[0] if reach else None
        runner = next((v for v in reach if owner and v.lab != owner.lab), None)
        levels.append({
            "gap": stats.rnd(g),
            "level": stats.rnd(lvl),
            "owner": owner.lab if owner else None,
            "variant": owner.slug if owner else None,
            "cost": owner.cost if owner else None,
            "runner_up": runner.lab if runner else None,
            "runner_up_cost": runner.cost if runner else None,
            "margin": stats.rnd(math.log(runner.cost / owner.cost)) if runner else None,
            "zone": "efficiency" if g <= lc["efficiency_zone"][1] else "value",
        })
        g += lc["level_step"]
    return {"frontier": top, "levels": levels}


def _field_payload(engine: Engine, date) -> dict:
    f = engine.field(date)
    rels = []
    for r in f.active:
        rels.append({
            "slug": r.slug,
            "name": r.name,
            "lab": r.lab,
            "line": r.line,
            "date": r.date.isoformat(),
            "tier": f.tier.get(r.slug),
            "open_weights": r.open_weights,
            "price_blend": r.price_blend,
            "intelligence": r.intelligence,
            "variants": [
                {
                    "slug": v.slug,
                    "name": v.short_name,
                    "intelligence": v.intelligence,
                    "estimated": v.estimated,
                    "reasoning": v.reasoning,
                    "cost": v.cost,
                    "cost_per_task": v.cost_per_task,
                    "cost_per_task_imputed": v.cost_per_task_imputed,
                    "price_in": v.price_in,
                    "price_out": v.price_out,
                    "speed": v.speed,
                    "value_residual": stats.rnd(f.value_residual(v)),
                }
                for v in r.variants
            ],
        })
    tiers = {}
    for t in TIERS:
        slots = sorted(engine.tier_scores(f, t).items(), key=lambda kv: kv[1].rank)
        tiers[t] = [
            {"lab": lab, "release": s.release, "variant": s.variant, "score": stats.rnd(s.score),
             "rank": s.rank, "pct_intelligence": stats.rnd(s.pct_intelligence),
             "pct_value": stats.rnd(s.pct_value), "pct_speed": stats.rnd(s.pct_speed)}
            for lab, s in slots
        ]
    return {
        "date": date.isoformat(),
        "frontier_intelligence": f.frontier_intelligence,
        "price_breaks": list(f.price_breaks),
        "value_coef": [stats.rnd(x) for x in f.value_coef],
        "releases": rels,
        "tiers": tiers,
    }


def _history_payload(series) -> dict:
    dates = [d.isoformat() for d, _ in series]
    labs: dict[str, dict[str, list]] = {}
    for i, (_, scores) in enumerate(series):
        for s in scores:
            row = labs.setdefault(s.lab, {k: [None] * len(dates) for k in
                                          ("health", "leadership", "lineup", "momentum",
                                           "freshness", "rank")})
            row["health"][i] = s.health
            row["leadership"][i] = s.leadership
            row["lineup"][i] = s.lineup
            row["momentum"][i] = s.momentum
            row["freshness"][i] = s.freshness_multiplier
        for rank, s in enumerate(scores, 1):
            labs[s.lab]["rank"][i] = rank
    return {"dates": dates, "labs": labs}


SENSITIVITY_PARAMS = [
    ("core", "max_weight"),
    ("lineup", "max_weight"),
    ("lineup", "w_intelligence"),
    ("lineup", "w_value"),
    ("leadership", "max_weight"),
    ("leadership", "tau_intelligence"),
    ("leadership", "tau_log_cost"),
    ("leadership", "speed_weight"),
    ("momentum", "span"),
    ("momentum", "tau_trend"),
    ("momentum", "recency_half_life_days"),
    ("freshness", "half_life_days"),
    ("freshness", "floor"),
]


def sensitivity(u: Universe, cfg: Config, top_n: int = 15) -> dict:
    """Rank stability of today's top labs when each weight moves +/-20% (one at a time)."""
    base = Engine(u, cfg).score_all(u.snapshot_date)
    labs = [s.lab for s in base[:top_n]]
    base_rank = {s.lab: i for i, s in enumerate(base, 1)}
    ranks: dict[str, list[int]] = {lab: [base_rank[lab]] for lab in labs}
    healths: dict[str, list[float]] = {s.lab: [s.health] for s in base[:top_n]}
    runs = []
    for section, key in SENSITIVITY_PARAMS:
        for factor in (0.8, 1.2):
            m = copy.deepcopy(cfg.methodology)
            val = m[section][key] * factor
            if section == "freshness" and key == "floor":
                val = min(val, 0.95)
            m[section][key] = val
            alt = dataclasses.replace(cfg, methodology=m)
            scores = Engine(u, alt).score_all(u.snapshot_date)
            pos = {s.lab: (i, s.health) for i, s in enumerate(scores, 1)}
            for lab in labs:
                ranks[lab].append(pos[lab][0])
                healths[lab].append(pos[lab][1])
            runs.append({"param": f"{section}.{key}", "factor": factor,
                         "top": [s.lab for s in scores[:5]]})
    return {
        "labs": [
            {"lab": lab, "rank": base_rank[lab], "rank_min": min(ranks[lab]),
             "rank_max": max(ranks[lab]), "health": healths[lab][0],
             "health_min": min(healths[lab]), "health_max": max(healths[lab])}
            for lab in labs
        ],
        "runs": runs,
    }


def perception_diff(scores: list[LabScore], series, cfg: Config) -> list[dict]:
    by = {s.lab: s for s in scores}
    hist = _history_payload(series)
    out = []
    for lab, exp in (cfg.perception.get("expectations") or {}).items():
        s = by.get(lab)
        row = {"lab": lab, "note": exp.get("note"), "checks": []}
        if s is None:
            row["checks"].append({"check": "in scope", "expected": True, "actual": False,
                                  "ok": False})
            out.append(row)
            continue
        if "band" in exp:
            row["checks"].append({"check": "band", "expected": exp["band"], "actual": s.band,
                                  "ok": exp["band"] == s.band})
        if "trend" in exp:
            h = [x for x in hist["labs"][lab]["health"][-13:] if x is not None]
            delta = round(h[-1] - max(h), 1) if h else 0.0
            actual = "down" if delta <= -10 else ("up" if h and h[-1] - min(h) >= 10 else "flat")
            row["checks"].append({"check": "13-week trend", "expected": exp["trend"],
                                  "actual": actual, "detail": f"{delta:+.1f} vs 13-week high",
                                  "ok": exp["trend"] == actual})
        if "stale" in exp:
            stale = s.freshness < 0.5
            row["checks"].append({"check": "stale", "expected": exp["stale"], "actual": stale,
                                  "detail": f"{s.days_since_material} days since material release",
                                  "ok": exp["stale"] == stale})
        out.append(row)
    return out


def build(u: Universe, cfg: Config, manifest: dict, with_sensitivity: bool = True) -> dict[str, bytes]:
    engine = Engine(u, cfg)
    series = run_replay(engine)
    today = u.snapshot_date
    scores = series[-1][1]
    prev = series[-2][1] if len(series) > 1 else []
    prev_by = {s.lab: (i, s.health) for i, s in enumerate(prev, 1)}
    order = cfg.labs.get("palette_order") or []
    labs_meta = {
        lab: {"name": u.labs[lab].name, "aa_color": u.labs[lab].color, "logo": u.labs[lab].logo,
              "slot": order.index(lab) + 1 if lab in order else None}
        for lab in sorted({s.lab for _, sc in series for s in sc} | set(engine.by_lab))
    }
    prev_scores = {s.lab: s for s in prev}
    board = []
    for i, s in enumerate(scores, 1):
        p = prev_by.get(s.lab)
        d = _lab_payload(s)
        d["rank"] = i
        d["prev_rank"] = p[0] if p else None
        d["prev_health"] = p[1] if p else None
        ps = prev_scores.get(s.lab)
        d["prev"] = None if ps is None else {
            "core": ps.core, "leadership": ps.leadership, "lineup": ps.lineup,
            "momentum": ps.momentum, "freshness_multiplier": ps.freshness_multiplier,
        }
        board.append(d)
    release_index = {
        r.slug: {"name": r.name, "lab": r.lab, "date": r.date.isoformat(), "line": r.line,
                 "tier": engine.tiers.get(r.slug), "intelligence": r.intelligence,
                 "price_blend": r.price_blend, "open_weights": r.open_weights,
                 "material": engine.at_release(r)[1],
                 "competitiveness": stats.rnd(engine.at_release(r)[0])}
        for r in u.releases
        if r.date >= series[0][0] - dt.timedelta(days=365)
    }
    files = {
        "meta.json": {
            "schema": SCHEMA_VERSION,
            "methodology": cfg.version,
            "snapshot_date": today.isoformat(),
            "snapshot_hash": manifest["hash"],
            "cost_model": u.cost_model,
            "counts": {"releases": len(u.releases), "labs_ranked": len(scores),
                       "variants": sum(len(r.variants) for r in u.releases)},
            "methodology_config": cfg.methodology,
            "attribution": "Data: Artificial Analysis (https://artificialanalysis.ai)",
        },
        "labs.json": labs_meta,
        "leaderboard.json": board,
        "releases.json": release_index,
        "history.json": _history_payload(series),
        "field.json": _field_payload(engine, today),
        "ownership.json": _ownership(engine, today),
        "perception.json": perception_diff(scores, series, cfg),
    }
    if with_sensitivity:
        files["sensitivity.json"] = sensitivity(u, cfg)
    out = {name: _dump(obj) for name, obj in files.items()}
    digest = hashlib.sha256(b"".join(hashlib.sha256(v).digest() for _, v in sorted(out.items())))
    out["manifest.json"] = _dump({
        "files": {k: hashlib.sha256(v).hexdigest() for k, v in sorted(out.items())},
        "hash": digest.hexdigest(),
        "snapshot_hash": manifest["hash"],
        "methodology": cfg.version,
    })
    return out


def write(files: dict[str, bytes], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (out_dir / name).write_bytes(data)
