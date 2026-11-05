"""Artificial Analysis free Data API client (attribution required: https://artificialanalysis.ai).

The v2 Data API replaced the retired `/api/v2/data/llms/models` endpoint (HTTP 410). The free
endpoint `/api/v2/language/models/free` is paginated and returns a reduced shape, so `normalize_v2`
converts it to the row layout the rest of the pipeline (and every stored snapshot) uses.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterable

import httpx

from ascendant.paths import ROOT

API_URL = "https://artificialanalysis.ai/api/v2/language/models/free"
USER_AGENT = "AscendantAnalysis/0.1 (+https://github.com/Panther114/AscendantAnalysis; lab health index)"
MAX_PAGES = 200  # safety bound; the catalogue is a few pages

_ROW_KEYS = ("id", "name", "slug", "release_date", "model_creator", "evaluations", "pricing",
             "performance")


def load_api_key() -> str:
    """Key from AA_API_KEY, or from the git-ignored repo `.env` for local runs.

    No other source is read: machine-wide fallbacks (e.g. the Windows registry) could silently
    supply a stale key issued for the retired API.
    """
    key = os.environ.get("AA_API_KEY", "").strip()
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "AA_API_KEY" and value.strip():
                return value.strip().strip('"').strip("'")
    raise RuntimeError("AA_API_KEY not found in environment or .env")


def creator_slug(creator: dict, known: dict[str, str]) -> str:
    """Creator slug: the API's own if given, else the one already recorded for this creator id.

    The free shape carries only `id` and `name`; slugs cannot be derived from names reliably
    ("Amazon" is `aws`), so the id -> slug map is built from earlier snapshots. A creator never
    seen before gets a kebab-case slug from its name.
    """
    if creator.get("slug"):
        return creator["slug"]
    if creator["id"] in known:
        return known[creator["id"]]
    return re.sub(r"[^a-z0-9]+", "-", creator["name"].lower()).strip("-")


def normalize_v2(rows: Iterable[dict], known_slugs: dict[str, str]) -> list[dict]:
    """Converts free-tier v2 rows to the pipeline's model-row layout, validating each row."""
    out = []
    for r in rows:
        missing = [k for k in _ROW_KEYS if k not in r]
        if missing:
            raise RuntimeError(f"AA API row {r.get('slug')!r} lacks {missing}: format changed")
        c = r["model_creator"]
        evals = r["evaluations"] or {}
        if "artificial_analysis_intelligence_index" not in evals:
            raise RuntimeError("AA API: evaluations lack artificial_analysis_intelligence_index")
        perf = r["performance"] or {}
        out.append({
            "id": r["id"],
            "name": r["name"],
            "slug": r["slug"],
            "release_date": r["release_date"],
            "model_creator": None if c is None else {
                "id": c["id"], "name": c["name"], "slug": creator_slug(c, known_slugs)},
            "evaluations": evals,
            "pricing": r["pricing"] or {},
            "median_output_tokens_per_second": perf.get("median_output_tokens_per_second"),
            "median_time_to_first_token_seconds": perf.get("median_time_to_first_token_seconds"),
        })
    return out


def fetch_models(client: httpx.Client, known_slugs: dict[str, str] | None = None) -> dict:
    """Fetches every page of the free language-model list; returns {data, index_version, tier}."""
    headers = {"x-api-key": load_api_key()}
    rows: list[dict] = []
    version = tier = None
    for page in range(1, MAX_PAGES + 1):
        resp = client.get(API_URL, params={"page": page}, headers=headers)
        if resp.status_code in (401, 403):
            raise RuntimeError(
                f"AA API rejected the key (HTTP {resp.status_code}); issue a current key at "
                "https://artificialanalysis.ai/api-key-management-redirect and update AA_API_KEY"
            )
        resp.raise_for_status()
        body = resp.json()
        if not isinstance(body.get("data"), list) or "pagination" not in body:
            raise RuntimeError("AA API response lacks data/pagination: format changed")
        rows += body["data"]
        version = body.get("intelligence_index_version", version)
        tier = body.get("tier", tier)
        if not body["pagination"]["has_more"]:
            break
    else:
        raise RuntimeError(f"AA API pagination did not terminate after {MAX_PAGES} pages")
    slugs = [r["slug"] for r in rows]
    if len(slugs) != len(set(slugs)):
        raise RuntimeError("AA API returned duplicate model slugs across pages")
    return {"data": normalize_v2(rows, known_slugs or {}), "index_version": version, "tier": tier}
