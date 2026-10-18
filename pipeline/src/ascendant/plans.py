"""Cost & Plans: Intelligence vs. cost per task, with coding-plan subsidies.

The model side is read straight from the snapshot: every current (non-deprecated) model that
Artificial Analysis publishes a measured cost per Intelligence Index task for. The plan side is
`config/coding_plans.yaml`, a reviewed, hand-maintained file: subsidy multipliers are estimates
from public sources and are never updated automatically. `check` only compares them with an
independent, crowd-measured source and probes every cited URL, so drift and dead sources surface
in CI and on the site without silently changing a number.

Subsidy multiplier M for (plan, model) = API-equivalent value of the plan's monthly allowance
for that model / the plan's monthly price. Subsidized cost per task = API cost per task / M.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any

import yaml

from ascendant import stats
from ascendant.config import Config
from ascendant.paths import CONFIG, DATA

PLANS_FILE = CONFIG / "coding_plans.yaml"
CHECK_FILE = DATA / "plans" / "check.json"

# Reasoning-effort labels as AA prints them inside a model name's parentheses.
EFFORTS = ("Max", "Xhigh", "High", "Medium", "Low", "Minimal", "Reasoning", "Non-reasoning")
_PAREN = re.compile(r"\(([^)]*)\)")


def effort(name: str) -> str:
    """'Claude Opus 5.5 (Max, Default Fallback)' -> 'Max'; no effort in the name -> 'Default'."""
    for group in _PAREN.findall(name):
        for tok in group.split(","):
            t = tok.strip().lower()
            for e in EFFORTS:
                if t == e.lower():
                    return e
    return "Default"


def _plain(x: Any) -> Any:
    """YAML turns bare dates into date objects; keep everything JSON-ready (ISO strings)."""
    if isinstance(x, dict):
        return {k: _plain(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_plain(v) for v in x]
    return x.isoformat() if isinstance(x, dt.date) else x


def load_plans() -> dict[str, Any]:
    return _plain(yaml.safe_load(PLANS_FILE.read_text(encoding="utf-8")) or {})


def models(api: dict, board: dict, cfg: Config) -> list[dict]:
    """Current models with a measured cost per task, one row per AA variant (reasoning effort)."""
    aliases: dict[str, str] = cfg.labs.get("aliases") or {}
    creator = {r["slug"]: aliases.get(r["model_creator"]["slug"], r["model_creator"]["slug"])
               for r in api["data"]}
    rel_name = {r["slug"]: r.get("name") for r in board["releases"]}
    release_of: dict[str, str] = board["release_of"]
    rows = []
    for m in board["models"]:
        cpt = m.get("intelligenceIndexCostPerTask")
        intel = m.get("intelligenceIndex")
        slug = m["slug"]
        if m.get("deprecated") or not cpt or cpt <= 0 or intel is None or slug not in creator:
            continue
        release = release_of.get(slug, slug)
        rows.append({
            "slug": slug,
            "name": m["name"],
            "release": release,
            "release_name": rel_name.get(release) or _PAREN.sub("", m["name"]).strip(),
            "lab": creator[slug],
            "effort": effort(m["name"]),
            "intelligence": stats.rnd(float(intel)),
            "estimated": bool(m.get("intelligenceIndexIsEstimated")),
            "cost_per_task": stats.rnd(float(cpt)),
            "price_in": m.get("price1mInputTokens"),
            "price_out": m.get("price1mOutputTokens"),
            "open_weights": bool(m.get("isOpenWeights")),
        })
    return sorted(rows, key=lambda r: r["slug"])


def _plan_payload(p: dict, known_releases: set[str], min_price: float) -> dict:
    default = p.get("default_multiplier")
    lineup = []
    for e in p.get("models") or []:
        mult = e.get("multiplier", default)
        lineup.append({
            "name": e["name"],
            "release": e.get("release"),
            "in_snapshot": e.get("release") in known_releases,
            "multiplier": stats.rnd(mult) if mult is not None else None,
            "basis": e.get("basis") or p.get("default_basis"),
            "confidence": e.get("confidence") or p.get("confidence"),
        })
    price = float(p["price_usd"])
    return {
        "id": p["id"],
        "provider": p["provider"],
        "product": p["product"],
        "plan": p["plan"],
        "region": p["region"],
        "price_usd": price,
        "price_local": p.get("price_local"),
        "billing": p.get("billing"),
        "quota": p.get("quota"),
        "tools": p.get("tools") or [],
        "verified": str(p["verified"]),
        "confidence": p.get("confidence"),
        "default_multiplier": stats.rnd(default) if default is not None else None,
        "default_basis": p.get("default_basis"),
        "caveats": p.get("caveats"),
        "sources": p.get("sources") or [],
        "devforth": p.get("devforth"),
        "eligible": price >= min_price and not p.get("exclude_reason"),
        "exclude_reason": p.get("exclude_reason")
        or (f"priced under ${min_price:g}/month" if price < min_price else None),
        "models": lineup,
    }


def best_plans(rows: list[dict], plans: list[dict]) -> dict[str, dict]:
    """Per variant slug: the eligible plan with the largest multiplier (ties: cheaper, then id)."""
    out: dict[str, dict] = {}
    for r in rows:
        cands = []
        for p in plans:
            if not p["eligible"]:
                continue
            for e in p["models"]:
                if e["release"] == r["release"] and e["multiplier"]:
                    cands.append((-e["multiplier"], p["price_usd"], p["id"], e["multiplier"]))
        if cands:
            c = min(cands)
            out[r["slug"]] = {"plan": c[2], "multiplier": c[3],
                              "cost_per_task": stats.rnd(r["cost_per_task"] / c[3])}
    return out


def validate(raw: dict) -> list[str]:
    """Structural problems in coding_plans.yaml (empty list = valid)."""
    errs = []
    ids = set()
    for p in raw.get("plans") or []:
        pid = p.get("id", "?")
        if pid in ids:
            errs.append(f"{pid}: duplicate id")
        ids.add(pid)
        for k in ("provider", "product", "plan", "region", "price_usd", "verified", "sources"):
            if not p.get(k):
                errs.append(f"{pid}: missing {k}")
        if p.get("region") not in ("global", "china"):
            errs.append(f"{pid}: region must be global or china")
        for s in p.get("sources") or []:
            if not str(s.get("url", "")).startswith("https://"):
                errs.append(f"{pid}: source without https url")
        for e in p.get("models") or []:
            m = e.get("multiplier", p.get("default_multiplier"))
            if m is not None and m <= 0:
                errs.append(f"{pid}/{e.get('name')}: multiplier must be positive")
    return errs


def build(api: dict, board: dict, cfg: Config, snapshot_date: dt.date) -> dict:
    raw = load_plans()
    errs = validate(raw)
    if errs:
        raise ValueError("coding_plans.yaml: " + "; ".join(errs))
    rows = models(api, board, cfg)
    known = {r["release"] for r in rows}
    min_price = float(raw.get("min_price_usd", 10))
    plans = sorted((_plan_payload(p, known, min_price) for p in raw.get("plans") or []),
                   key=lambda p: (p["region"], p["provider"], p["price_usd"], p["id"]))
    check = json.loads(CHECK_FILE.read_text(encoding="utf-8")) if CHECK_FILE.exists() else None
    return {
        "date": snapshot_date.isoformat(),
        "reviewed": str(raw.get("reviewed")),
        "min_price_usd": min_price,
        "fx": raw.get("fx") or {},
        "definition": raw.get("definition"),
        "models": rows,
        "plans": plans,
        "best": best_plans(rows, plans),
        "check": check,
    }
