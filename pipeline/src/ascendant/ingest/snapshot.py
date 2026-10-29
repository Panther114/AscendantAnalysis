"""Content-addressed daily snapshots: data/snapshots/<date>/{api_models,leaderboard}.json.gz + manifest."""

from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path

import httpx

from ascendant.ingest import aa_api, aa_pages
from ascendant.paths import SNAPSHOTS

FILES = ("api_models.json.gz", "leaderboard.json.gz")
MIN_BOARD_COVERAGE = 0.9  # share of API slugs that must have a leaderboard model object


def _canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def _gz(data: bytes) -> bytes:
    return gzip.compress(data, compresslevel=9, mtime=0)


def check_coverage(api: dict, board: dict, minimum: float = MIN_BOARD_COVERAGE) -> None:
    """Refuses a leaderboard payload that covers far fewer models than the API returned.

    A partial scrape (e.g. AA moving models out of the embedded payload) would otherwise be
    committed and published, silently stripping colors, flags and grouping from the missing ones.
    """
    api_slugs = {r["slug"] for r in api["data"]}
    if not api_slugs:
        raise RuntimeError("API returned no models")
    covered = len(api_slugs & {m["slug"] for m in board["models"]})
    if covered < minimum * len(api_slugs):
        raise RuntimeError(
            f"leaderboard covers {covered}/{len(api_slugs)} API models "
            f"({covered / len(api_slugs):.0%} < {minimum:.0%}); refusing partial snapshot"
        )


# Page fields measured on the Intelligence Index scale; they are meaningless under another version.
INDEX_SCALE_FIELDS = ("intelligenceIndex", "intelligenceIndexCostPerTask")


def backfill(api: dict, board: dict, prior: dict | None) -> dict:
    """Fills API models missing from the leaderboard page with their prior snapshot's object.

    Since 2026-10-17 AA embeds only current models in the page; deprecated ones are served
    separately (encrypted), so they drop out of the scrape. Deprecation is permanent, so their
    last scraped object is carried forward and flagged deprecated. Carried slugs are recorded
    under board["carried"].

    A prior snapshot taken under a different Intelligence Index version (or before the version
    was recorded) has its index-scale fields cleared on carry: AA rescores models on every
    major version, so a carried v4 score or cost per task would otherwise sit beside v5 ones.
    """
    have = {m["slug"] for m in board["models"]}
    old = {m["slug"]: m for m in (prior or {}).get("models", [])}
    same_scale = (prior or {}).get("index_version") == board.get("index_version")
    carried = sorted(r["slug"] for r in api["data"] if r["slug"] not in have and r["slug"] in old)

    def carry(slug: str) -> dict:
        obj = {**old[slug], "deprecated": True}
        if not same_scale:
            obj.update({f: None for f in INDEX_SCALE_FIELDS}, intelligenceIndexIsEstimated=False)
        return obj

    models = board["models"] + [carry(s) for s in carried]
    return {**board, "models": sorted(models, key=lambda m: m["slug"]), "carried": carried}


def _prior_board(date: dt.date) -> dict | None:
    dirs = sorted(p for p in SNAPSHOTS.iterdir()
                  if p.name < date.isoformat() and (p / "manifest.json").exists())
    return load(dirs[-1])[2] if dirs else None


def take(date: dt.date | None = None) -> Path:
    date = date or dt.datetime.now(dt.UTC).date()
    out = SNAPSHOTS / date.isoformat()
    headers = {"User-Agent": aa_api.USER_AGENT}
    with httpx.Client(headers=headers, timeout=60, follow_redirects=True) as client:
        api = json.loads(aa_api.fetch_models(client))
        board = aa_pages.extract(aa_pages.fetch_leaderboard_html(client))
    board = backfill(api, board, _prior_board(date))
    check_coverage(api, board)
    api["data"].sort(key=lambda r: r["id"])
    out.mkdir(parents=True, exist_ok=True)
    payloads = {"api_models.json.gz": _canonical(api), "leaderboard.json.gz": _canonical(board)}
    manifest = {"date": date.isoformat(), "files": {}}
    for name, raw in payloads.items():
        (out / name).write_bytes(_gz(raw))
        manifest["files"][name] = hashlib.sha256(raw).hexdigest()
    manifest["hash"] = hashlib.sha256(_canonical(manifest["files"])).hexdigest()
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return out


def latest() -> Path:
    dirs = sorted(p for p in SNAPSHOTS.iterdir() if (p / "manifest.json").exists())
    if not dirs:
        raise FileNotFoundError("no snapshots; run `ascendant ingest`")
    return dirs[-1]


def load(path: Path) -> tuple[dict, dict, dict]:
    """Returns (manifest, api, leaderboard) after verifying content hashes."""
    manifest = json.loads((path / "manifest.json").read_text(encoding="utf-8"))
    loaded = []
    for name in FILES:
        raw = gzip.decompress((path / name).read_bytes())
        if hashlib.sha256(raw).hexdigest() != manifest["files"][name]:
            raise ValueError(f"hash mismatch for {path / name}")
        loaded.append(json.loads(raw))
    return manifest, loaded[0], loaded[1]
