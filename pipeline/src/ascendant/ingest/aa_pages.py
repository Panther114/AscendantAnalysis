"""Extracts the structured model/release data embedded in AA's leaderboard page.

The page is a Next.js app whose React Server Components payload is pushed through
`self.__next_f.push([1, "<json-escaped string>"])`. We decode and concatenate those
strings, then pull out every JSON object that starts with `{"id":` or `{"slug":` and
classify it by its shape.

Since 2026-11-16 the payload no longer names models itself: a model object is keyed by an
opaque AA `id`, points at its release via `release.slug`, and carries its effort variant in
`suffix`. `attach_slugs` restores the slug the rest of the pipeline uses by joining that `id`
against the Data API list, which still reports slugs; page-only models fall back to the
release slug plus their suffix.
"""

from __future__ import annotations

import json
import re

import httpx

LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models"
_PUSH = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')
_OBJ = re.compile(r'\{"(?:id|slug)":')
# 'Artificial Analysis Intelligence Index v5.0' -> '5.0'
_INDEX_VERSION = re.compile(r"Artificial Analysis Intelligence Index v(\d+(?:\.\d+)*)")
_NON_SLUG = re.compile(r"[^a-z0-9]+")


def fetch_leaderboard_html(client: httpx.Client) -> str:
    resp = client.get(LEADERBOARD_URL)
    resp.raise_for_status()
    return resp.text


def _kebab(text: str) -> str:
    return _NON_SLUG.sub("-", text.lower()).strip("-")


def _fallback_slug(model: dict) -> str:
    """Slug for a page model the API list does not contain.

    Variants share their release's slug and are told apart by suffix, the same way the API
    names them (`gpt-6-1-sol` vs `gpt-6-1-sol-high`).
    """
    base = model["release"]["slug"]
    suffix = model.get("suffix")
    return f"{base}-{_kebab(suffix)}" if suffix else base


def extract(html: str) -> dict:
    """Models (keyed by AA id) and releases (keyed by slug) from the page payload."""
    flight = "".join(json.loads('"' + c + '"') for c in _PUSH.findall(html))
    dec = json.JSONDecoder()
    models: dict[str, dict] = {}
    releases: dict[str, dict] = {}
    for m in _OBJ.finditer(flight):
        try:
            obj, _ = dec.raw_decode(flight, m.start())
        except json.JSONDecodeError:
            continue
        if isinstance(obj.get("release"), dict) and "shortName" in obj and "id" in obj:
            models.setdefault(obj["id"], obj)
        elif "slug" in obj and "releaseDate" in obj and "creator" in obj:
            releases.setdefault(obj["slug"], obj)
    if not models or not releases:
        raise RuntimeError("leaderboard payload changed: no model objects found")
    versions = sorted(set(_INDEX_VERSION.findall(flight)))
    if len(versions) != 1:
        raise RuntimeError(f"cannot determine the Intelligence Index version (found {versions})")
    return {
        "index_version": versions[0],
        "models": [models[k] for k in sorted(models)],
        "releases": [releases[k] for k in sorted(releases)],
    }


def attach_slugs(board: dict, api_rows: list[dict]) -> dict:
    """Adds `slug` to every page model and derives the model -> release map.

    The page alone cannot name a model, so the slug comes from the Data API row sharing its
    `id`. Page-only models (newer than the free API list, or variants it omits) keep a
    derived slug so the snapshot stays addressable; downstream views keyed by API rows
    simply ignore them.
    """
    by_id = {r["id"]: r["slug"] for r in api_rows}
    models: list[dict] = []
    release_of: dict[str, str] = {}
    for m in board["models"]:
        slug = by_id.get(m["id"]) or _fallback_slug(m)
        if slug in release_of:  # never let two page rows collide on one slug
            slug = f"{slug}-{m['id'][:8]}"
        release_of[slug] = m["release"]["slug"]
        models.append({**m, "slug": slug})
    return {
        **board,
        "models": sorted(models, key=lambda m: m["slug"]),
        "release_of": dict(sorted(release_of.items())),
    }
