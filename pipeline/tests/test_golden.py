"""Golden test against the committed real snapshot.

If a methodology or code change moves these numbers on purpose, regenerate with
`uv run python tests/regen_golden.py` and review the diff in the PR.
"""

import json
from pathlib import Path

import pytest

from ascendant import config, normalize
from ascendant.ingest import snapshot
from ascendant.paths import SNAPSHOTS
from ascendant.scoring import Engine

GOLDEN = Path(__file__).parent / "golden" / "health.json"


def current() -> dict:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    path = SNAPSHOTS / data["snapshot"]
    if not path.exists():
        pytest.skip(f"snapshot {data['snapshot']} not present")
    manifest, api, board = snapshot.load(path)
    cfg = config.load()
    u = normalize.build(manifest, api, board, cfg, snapshot.legacy_api(cfg))
    scores = Engine(u, cfg).score_all(u.snapshot_date)
    return data, {s.lab: s.health for s in scores}, cfg.version


def test_golden_health():
    data, got, version = current()
    assert version == data["methodology"]
    assert {lab: got.get(lab) for lab in data["health"]} == data["health"]
