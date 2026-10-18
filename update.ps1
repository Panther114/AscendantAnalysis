# Refreshes the index locally and publishes it. the GitHub Actions workflow redeploys on push.
#   ./update.ps1            fetch today's snapshot, rescore, commit, push
#   ./update.ps1 -NoPush    same, but leave the commit unpushed
#   ./update.ps1 -NoFetch   rescore the latest existing snapshot (e.g. after a config change)
param([switch]$NoPush, [switch]$NoFetch)
# Failures are detected via each tool's exit code (npm/uv write harmless notices to stderr,
# which Windows PowerShell would otherwise treat as errors).
$root = $PSScriptRoot
$env:Path = "$HOME\.local\bin;$env:Path"

function Step($name, [scriptblock]$cmd) {
  Write-Host "==> $name" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

Push-Location "$root\pipeline"
try {
  if (-not $NoFetch) {
    Step "Fetch snapshot from Artificial Analysis" { uv run ascendant ingest }
    # Audit only: flags drift, dead sources and stale reviews; never edits config/coding_plans.yaml.
    Write-Host "==> Audit coding-plan data" -ForegroundColor Cyan
    uv run ascendant plans-check
  }
  Step "Tests" { uv run pytest -q }
  Step "Determinism check" { uv run ascendant verify }
  Step "Export site data" { uv run ascendant export }
} finally { Pop-Location }

Push-Location "$root\web"
try { Step "Build check" { npm run build } } finally { Pop-Location }

Push-Location $root
try {
  git add data/snapshots data/plans web/public/data
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Write-Host "No data changes; nothing to publish."; exit 0 }
  $date = (Get-ChildItem data/snapshots -Directory | Sort-Object Name | Select-Object -Last 1).Name
  Step "Commit" { git commit -m "data: snapshot $date" }
  if (-not $NoPush) { Step "Push (GitHub Pages redeploys)" { git push } }
} finally { Pop-Location }
Write-Host "Done." -ForegroundColor Green
