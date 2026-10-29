"""Extracts the structured model/release data embedded in AA's leaderboard page.

The page is a Next.js app whose React Server Components payload is pushed through
`self.__next_f.push([1, "<json-escaped string>"])`. We decode and concatenate those
strings, then pull out every JSON object that starts with `{"slug":` and classify it.
"""

from __future__ import annotations

import json
import re

import httpx

LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models"
_PUSH = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')
_OBJ = re.compile(r'\{"slug":')
# 'Artificial Analysis Intelligence Index v5.0' -> '5.0'
_INDEX_VERSION = re.compile(r"Artificial Analysis Intelligence Index v(\d+(?:\.\d+)*)")


def fetch_leaderboard_html(client: httpx.Client) -> str:
    resp = client.get(LEADERBOARD_URL)
    resp.raise_for_status()
    return resp.text


def extract(html: str) -> dict:
    flight = "".join(json.loads('"' + c + '"') for c in _PUSH.findall(html))
    dec = json.JSONDecoder()
    models: dict[str, dict] = {}
    releases: dict[str, dict] = {}
    release_of: dict[str, str] = {}
    for m in _OBJ.finditer(flight):
        try:
            obj, _ = dec.raw_decode(flight, m.start())
        except json.JSONDecodeError:
            continue
        slug = obj["slug"]
        if "shortName" in obj and "modelCreatorName" in obj:
            models.setdefault(slug, obj)
        elif "releaseDate" in obj and "creator" in obj:
            releases.setdefault(slug, obj)
        elif "releaseSlug" in obj:
            release_of.setdefault(slug, obj["releaseSlug"])
    if not models or not release_of:
        raise RuntimeError("leaderboard payload changed: no model objects found")
    versions = sorted(set(_INDEX_VERSION.findall(flight)))
    if len(versions) != 1:
        raise RuntimeError(f"cannot determine the Intelligence Index version (found {versions})")
    return {
        "index_version": versions[0],
        "models": [models[k] for k in sorted(models)],
        "releases": [releases[k] for k in sorted(releases)],
        "release_of": dict(sorted(release_of.items())),
    }
