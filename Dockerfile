# Two stages: Node builds the static site on Railway's builder; the running container is
# only static-web-server (a tiny Rust file server: ~8 MB RAM, near-zero idle CPU).
# The scored data is committed in web/public/data, so no API key or pipeline runs here.

FROM node:24-alpine3.23 AS build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Pre-compress text assets once so the server never compresses per request.
RUN apk add --no-cache brotli \
 && find out -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.txt' -o -name '*.svg' \) -size +1k \
      -exec gzip -9 -k {} \; -exec brotli -q 11 -k {} \;

FROM joseluisq/static-web-server:2.44.0-alpine
COPY --from=build /web/out /public
COPY sws.toml /etc/sws.toml
ENV SERVER_CONFIG_FILE=/etc/sws.toml \
    SERVER_ROOT=/public \
    SERVER_ERROR_PAGE_404=/public/404.html \
    SERVER_COMPRESSION=false \
    SERVER_COMPRESSION_STATIC=true \
    SERVER_CACHE_CONTROL_HEADERS=true \
    SERVER_SECURITY_HEADERS=true \
    SERVER_HEALTH=true \
    SERVER_LOG_LEVEL=error \
    SERVER_THREADS_MULTIPLIER=1 \
    SERVER_MAX_BLOCKING_THREADS=4
EXPOSE 8080
# Railway injects PORT; fall back to 8080 locally. Replaces the image's entrypoint script.
ENTRYPOINT ["/bin/sh", "-c", "exec static-web-server --port \"${PORT:-8080}\""]
CMD []
