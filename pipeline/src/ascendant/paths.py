from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "config"
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
DERIVED = DATA / "derived"
WEB_DATA = ROOT / "web" / "public" / "data"
