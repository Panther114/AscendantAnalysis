# Scheduled updater (Railway cron service). Each run clones the repo, fetches a fresh
# Artificial Analysis snapshot, tests + verifies + rescores, and pushes the data commit.
# That push is what redeploys the website service; this container exits when done.

FROM ghcr.io/astral-sh/uv:0.13.0 AS uv

FROM python:3.12-alpine3.23
RUN apk add --no-cache git
COPY --from=uv /uv /usr/local/bin/uv

# Dependencies are installed into the image once, so a run downloads nothing but the data.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_CACHE_DIR=/opt/uv-cache \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1
COPY pipeline/ /tmp/pipeline/
RUN cd /tmp/pipeline && uv sync --frozen && rm -rf /tmp/pipeline

COPY cron/run.sh /usr/local/bin/ascendant-update
RUN chmod +x /usr/local/bin/ascendant-update
CMD ["ascendant-update"]
