"""Audit of the hand-maintained coding-plan data (config/coding_plans.yaml).

Never edits the plan file. It
  1. fetches Devforth's crowd-measured plan limits (https://devforth.io/agents-for-code/, limits
     metered with the `letmecode` CLI and published as API-equivalent USD per 5h / 7d / 30d
     window), derives the implied monthly multiplier for every plan that names a `devforth`
     slug, and records the drift against the pinned value;
  2. probes every cited source URL, so dead or moved sources are noticed;
  3. flags plans whose `verified` date is older than `stale_after_days`.
The result is written to data/plans/check.json (committed, read by the export).
"""

from __future__ import annotations

import datetime as dt
import json

import httpx

from ascendant import plans as plans_mod
from ascendant.ingest.aa_api import USER_AGENT

DEVFORTH_DATA = "https://devforth.io/agents-for-code/__data.json"
WEEKS_PER_MONTH = 365.25 / 12 / 7  # Devforth's monthly value is the 7-day window x ~4.35
DRIFT_TOLERANCE = 0.25  # relative difference that is flagged for review
STALE_AFTER_DAYS = 90


def _devalue(payload: dict) -> dict:
    """Decodes a SvelteKit `__data.json` node (devalue: values are indices into a flat array)."""
    node = [n for n in payload["nodes"] if n and n.get("type") == "data"][-1]["data"]

    def h(i: int):
        if i < 0:
            return None
        v = node[i]
        if isinstance(v, dict):
            return {k: h(x) for k, x in v.items()}
        if isinstance(v, list):
            return [h(x) for x in v]
        return v

    return h(0)


def devforth_values(data: dict) -> dict[str, dict]:
    """Plan slug -> {price, monthly value per model class, confirmed date, updated}."""
    out = {}
    for p in data.get("plans") or []:
        price = ((p.get("pricePerMonth") or {}).get("monthly") or {}).get("amountUsd")
        classes: dict[str, float] = {}
        for w in p.get("limitWindows") or []:
            cls = w.get("modelClass") or "All"
            if w["period"] == "7d":
                v = w["value"] * WEEKS_PER_MONTH
            elif w["period"] == "30d":
                v = w["value"] * 365.25 / 12 / 30
            else:
                continue
            classes[cls] = min(classes.get(cls, v), v)
        out[p["slug"]] = {
            "price_usd": price,
            "monthly_value_usd": {k: round(v, 2) for k, v in sorted(classes.items())},
            "multiplier": {k: round(v / price, 3) for k, v in sorted(classes.items())}
            if price else {},
            "confirmed": p.get("limitLastConfirmedAt"),
            "updated": p.get("updatedAt"),
        }
    return out


def _probe(client: httpx.Client, url: str) -> dict:
    try:
        r = client.get(url)
        return {"url": url, "status": r.status_code, "ok": r.status_code < 400}
    except httpx.HTTPError as e:
        return {"url": url, "status": None, "ok": False, "error": type(e).__name__}


def run(today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(dt.UTC).date()
    raw = plans_mod.load_plans()
    stale_after = int(raw.get("stale_after_days", STALE_AFTER_DAYS))
    headers = {"User-Agent": USER_AGENT.replace("lab health index", "coding-plan audit")}
    with httpx.Client(headers=headers, timeout=30, follow_redirects=True) as client:
        try:
            resp = client.get(DEVFORTH_DATA)
            resp.raise_for_status()
            df = devforth_values(_devalue(resp.json()))
            df_error = None
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            df, df_error = {}, f"{type(e).__name__}: {e}"
        urls = sorted({s["url"] for p in raw.get("plans") or [] for s in p.get("sources") or []})
        probes = {u: _probe(client, u) for u in urls}

    plans = []
    for p in raw.get("plans") or []:
        row = {"id": p["id"], "verified": str(p["verified"]), "flags": []}
        age = (today - dt.date.fromisoformat(str(p["verified"]))).days
        row["age_days"] = age
        if age > stale_after:
            row["flags"].append(f"not re-verified for {age} days")
        dead = [s["url"] for s in p.get("sources") or [] if not probes[s["url"]]["ok"]]
        if dead:
            row["flags"].append(f"{len(dead)} source URL(s) unreachable")
        row["dead_sources"] = dead
        slug = p.get("devforth")
        if slug:
            d = df.get(slug)
            if d is None:
                row["flags"].append("Devforth no longer lists this plan" if not df_error
                                    else "Devforth unavailable")
            else:
                cls = p.get("devforth_class", "All")
                implied = d["multiplier"].get(cls)
                # Compare with what Devforth showed at review time when that was recorded (the
                # pinned value may deliberately differ from Devforth); a move there means the
                # plan's limits changed and the entry needs a fresh review.
                base = p.get("devforth_baseline") or p.get("default_multiplier")
                row["devforth"] = {**d, "class": cls, "implied": implied, "baseline": base,
                                   "pinned": p.get("default_multiplier")}
                if implied and base:
                    drift = implied / base - 1
                    row["devforth"]["drift"] = round(drift, 3)
                    if abs(drift) > DRIFT_TOLERANCE:
                        row["flags"].append(
                            f"Devforth moved to x{implied:.1f} from x{base:.1f} at review "
                            f"({drift:+.0%})")
        plans.append(row)
    return {
        "checked": today.isoformat(),
        "devforth": {"url": DEVFORTH_DATA, "error": df_error, "plans": len(df)},
        "drift_tolerance": DRIFT_TOLERANCE,
        "stale_after_days": stale_after,
        "sources": {"total": len(probes), "unreachable": sum(not v["ok"] for v in probes.values())},
        "plans": sorted(plans, key=lambda r: r["id"]),
    }


def write(result: dict) -> None:
    plans_mod.CHECK_FILE.parent.mkdir(parents=True, exist_ok=True)
    plans_mod.CHECK_FILE.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n",
                                    encoding="utf-8")
