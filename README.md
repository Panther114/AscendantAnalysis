# Ascendant Analysis

A deterministic **health index for AI labs**: how strong, competitive and current each lab's
model lineup is against its rivals, computed only from [Artificial Analysis](https://artificialanalysis.ai)
benchmarks, prices and speeds.

![Leaderboard](docs/screenshots/home.png)

| Lab page | Frontier map |
|---|---|
| ![Anthropic](docs/screenshots/lab-anthropic.png) | ![Frontier](docs/screenshots/frontier.png) |

```
pipeline/   Python: ingest → normalize → score → replay → export (uv)
web/        Next.js static site that renders the exported JSON
config/     methodology.v1.yaml (every constant), labs, overrides, perception reference
data/       content-hashed daily snapshots (committed)
```

## How the index works

`Health = 100 · Core · Momentum · Freshness`

- **Leadership:** lead over the best rival on intelligence, near-frontier cost efficiency,
  value-zone cost and speed (frontier ownership on a 1-point capability grid). Winning one axis
  is enough to score well.
- **Lineup:** each lab's best release per tier (frontier / mid / small, from price natural
  breaks fixed at launch), scored against rivals on intelligence, value residual and speed.
- **Core:** a soft-max of the two, so a specialist that wins its niche can still be healthy.
- **Momentum (×0.8–1.2):** the trend in at-release competitiveness between successive
  releases of the same product line.
- **Freshness (×0.6–1.0):** decays with a 60-day half-life after a 30-day grace period since
  the last *material* release.

The full write-up is on the site's Methodology page.

## Run it

```bash
cd pipeline
uv sync
uv run ascendant ingest        # needs AA_API_KEY (env var or ../.env)
uv run ascendant score         # print today's table
uv run ascendant verify        # determinism gate (shuffled inputs → identical hashes)
uv run ascendant export        # writes web/public/data/*.json
uv run pytest
```

```bash
cd web
npm ci
npm run dev                    # http://localhost:3000
npm run build                  # static site in web/out
```

## Determinism

Scoring is a pure function of (snapshot, config): pure-Python arithmetic, stable tie-breaks,
6-dp rounding at stage boundaries, and no wall-clock time. CI rebuilds the export three times,
twice with shuffled input order, and refuses to deploy unless the hashes match. Changing any
constant means bumping `methodology.version`.

## Automation

`.github/workflows/update.yml` runs daily. It ingests a snapshot, runs the tests and the
determinism gate, exports, commits the snapshot and deploys `web/out` to GitHub Pages. It needs
the repository secret `AA_API_KEY` and Pages set to "GitHub Actions".

Data: Artificial Analysis (attribution required by their API terms).
