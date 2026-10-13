#!/bin/sh
# One update run: clone, fetch a snapshot, test, verify, export, commit, push.
# Same steps as update.ps1 minus the site build (the website service builds after the push).
#
# Environment:
#   AA_API_KEY     Artificial Analysis API key (required)
#   GITHUB_TOKEN   fine-grained token with Contents: read & write on the repo (required unless DRY_RUN=1)
#   GITHUB_REPO    owner/name (default Panther114/AscendantAnalysis)
#   GIT_BRANCH     branch to update (default main)
#   GIT_NAME, GIT_EMAIL   commit identity (default Panther114 + GitHub noreply)
#   DRY_RUN=1      do everything except push
set -eu

REPO="${GITHUB_REPO:-Panther114/AscendantAnalysis}"
BRANCH="${GIT_BRANCH:-main}"
WORK="${WORK_DIR:-/tmp/ascendant}"

[ -n "${AA_API_KEY:-}" ] || { echo "AA_API_KEY is not set" >&2; exit 1; }
[ -n "${GITHUB_TOKEN:-}" ] || [ "${DRY_RUN:-0}" = 1 ] || { echo "GITHUB_TOKEN is not set" >&2; exit 1; }

step() { echo "==> $*"; }

rm -rf "$WORK"
step "Clone $REPO@$BRANCH"
git clone --quiet --depth 1 --branch "$BRANCH" "${REPO_URL:-https://github.com/$REPO.git}" "$WORK"

cd "$WORK/pipeline"
step "Fetch snapshot from Artificial Analysis"
uv run --frozen ascendant ingest
step "Tests"
uv run --frozen pytest -q
step "Determinism check"
uv run --frozen ascendant verify
step "Export site data"
uv run --frozen ascendant export

cd "$WORK"
git add data/snapshots web/public/data
if git diff --cached --quiet; then
  echo "No data changes; nothing to publish."
  exit 0
fi
date=$(ls data/snapshots | sort | tail -n 1)
git -c user.name="${GIT_NAME:-Panther114}" \
    -c user.email="${GIT_EMAIL:-194656470+Panther114@users.noreply.github.com}" \
    commit --quiet -m "data: snapshot $date"
git --no-pager show --stat --oneline HEAD | head -n 20

if [ "${DRY_RUN:-0}" = 1 ]; then
  echo "DRY_RUN=1: not pushing."
  exit 0
fi
step "Push (the website service redeploys)"
# The token goes in a header, never in a URL, so it cannot appear in logs or error messages.
auth=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')
git -c http.https://github.com/.extraheader="AUTHORIZATION: basic $auth" \
    push --quiet "https://github.com/$REPO.git" "HEAD:$BRANCH"
echo "Done."
