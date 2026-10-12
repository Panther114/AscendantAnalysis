"""Regenerates tests/golden/health.json from the latest snapshot (top 15 labs)."""

import json
from pathlib import Path

from ascendant import config, normalize
from ascendant.ingest import snapshot
from ascendant.scoring import Engine

path = snapshot.latest()
manifest, api, board = snapshot.load(path)
cfg = config.load()
u = normalize.build(manifest, api, board, cfg)
scores = Engine(u, cfg).score_all(u.snapshot_date)[:15]
out = Path(__file__).parent / "golden" / "health.json"
out.parent.mkdir(exist_ok=True)
out.write_text(
    json.dumps(
        {"snapshot": path.name, "methodology": cfg.version,
         "health": {s.lab: s.health for s in scores}},
        indent=2,
    ) + "\n",
    encoding="utf-8",
)
print(f"wrote {out}")
