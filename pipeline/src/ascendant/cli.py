from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import sys
from pathlib import Path

from ascendant import config, export, normalize
from ascendant.ingest import snapshot
from ascendant.paths import SNAPSHOTS, WEB_DATA
from ascendant.scoring import Engine


def _snapshot_dir(arg: str | None) -> Path:
    return SNAPSHOTS / arg if arg else snapshot.latest()


def _universe(arg: str | None, shuffle_seed: int | None = None):
    manifest, api, board = snapshot.load(_snapshot_dir(arg))
    if shuffle_seed is not None:  # determinism check: input order must not matter
        rng = random.Random(shuffle_seed)
        rng.shuffle(api["data"])
        rng.shuffle(board["models"])
        rng.shuffle(board["releases"])
    cfg = config.load()
    return manifest, normalize.build(manifest, api, board, cfg), cfg


def cmd_ingest(args: argparse.Namespace) -> None:
    date = dt.date.fromisoformat(args.date) if args.date else None
    print(f"snapshot written: {snapshot.take(date)}")


def cmd_score(args: argparse.Namespace) -> None:
    _, u, cfg = _universe(args.snapshot)
    date = dt.date.fromisoformat(args.date) if args.date else u.snapshot_date
    scores = Engine(u, cfg).score_all(date)
    print(f"Ascendant Health Index  methodology {cfg.version}  as of {date}\n")
    print(f"{'#':>3} {'lab':24} {'health':>6}  {'band':11} {'FL':>5} {'LS':>5} {'M':>5} {'F':>5}")
    for i, s in enumerate(scores[: args.top], 1):
        name = u.labs[s.lab].name
        print(f"{i:>3} {name:24} {s.health:6.1f}  {s.band:11} {s.leadership:5.2f} "
              f"{s.lineup:5.2f} {s.momentum:5.2f} {s.freshness_multiplier:5.2f}")


def cmd_export(args: argparse.Namespace) -> None:
    manifest, u, cfg = _universe(args.snapshot)
    files = export.build(u, cfg, manifest, with_sensitivity=not args.fast)
    out = Path(args.out) if args.out else WEB_DATA
    export.write(files, out)
    h = json.loads(files["manifest.json"])["hash"]
    print(f"exported {len(files)} files to {out}  hash {h}")


def cmd_verify(args: argparse.Namespace) -> int:
    hashes = []
    for seed in (None, 1, 2):
        manifest, u, cfg = _universe(args.snapshot, seed)
        files = export.build(u, cfg, manifest, with_sensitivity=False)
        hashes.append(json.loads(files["manifest.json"])["hash"])
    ok = len(set(hashes)) == 1
    print(("OK" if ok else "FAIL") + f": export hashes {hashes}")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ascendant", description="Ascendant Analysis pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("ingest", help="fetch AA API + leaderboard into a dated snapshot")
    s.add_argument("--date", help="override snapshot date (YYYY-MM-DD)")
    s.set_defaults(fn=cmd_ingest)

    s = sub.add_parser("score", help="print the Health Index table")
    s.add_argument("--snapshot", help="snapshot directory name (default: latest)")
    s.add_argument("--date", help="as-of date (default: snapshot date)")
    s.add_argument("--top", type=int, default=25)
    s.set_defaults(fn=cmd_score)

    s = sub.add_parser("export", help="write site JSON")
    s.add_argument("--snapshot")
    s.add_argument("--out", help=f"output directory (default: {WEB_DATA})")
    s.add_argument("--fast", action="store_true", help="skip sensitivity analysis")
    s.set_defaults(fn=cmd_export)

    s = sub.add_parser("verify", help="determinism gate: identical output under shuffled input")
    s.add_argument("--snapshot")
    s.set_defaults(fn=cmd_verify)

    args = p.parse_args(argv)
    return args.fn(args) or 0


if __name__ == "__main__":
    sys.exit(main())
