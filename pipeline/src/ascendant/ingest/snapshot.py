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


def _canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def _gz(data: bytes) -> bytes:
    return gzip.compress(data, compresslevel=9, mtime=0)


def take(date: dt.date | None = None) -> Path:
    date = date or dt.datetime.now(dt.UTC).date()
    out = SNAPSHOTS / date.isoformat()
    out.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": aa_api.USER_AGENT}
    with httpx.Client(headers=headers, timeout=60, follow_redirects=True) as client:
        api = json.loads(aa_api.fetch_models(client))
        board = aa_pages.extract(aa_pages.fetch_leaderboard_html(client))
    api["data"].sort(key=lambda r: r["id"])
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
