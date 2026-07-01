# Build and runtime must share glibc — better-sqlite3/node-pty native addons and
# Playwright headless export (distro Chromium) both fail on Alpine→bookworm copy.
ARG NODE_IMAGE=docker.io/library/node:24-bookworm-slim
ARG RUNTIME_IMAGE=docker.io/library/node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}
ENV NO_PROXY=${NO_PROXY}
ENV CI=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
COPY scripts/check-teamver-vendor.mjs ./scripts/check-teamver-vendor.mjs
COPY packages ./packages
COPY tools ./tools
COPY apps/daemon/package.json ./apps/daemon/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY e2e/package.json ./e2e/package.json
# @teamver/app-sdk — file:../../vendor/teamver/app-sdk.tgz (apps/web)
COPY vendor/teamver ./vendor/teamver
RUN corepack enable && \
    corepack prepare pnpm@10.33.2 --activate && \
    pnpm install --frozen-lockfile

COPY apps ./apps
# Teamver Design docker image — embed static export (SSR-safe via teamverViteEnv + process.env)
ENV VITE_TEAMVER_EMBED=1
ENV VITE_TEAMVER_BRAND_TITLE="Teamver Design"
ENV VITE_TEAMVER_BRAND_SUBTITLE="AI Design Studio"
ARG VITE_TEAMVER_SITE_URL=https://design.teamver.com
ARG VITE_TEAMVER_OG_IMAGE_URL=https://teamver.com/images/teamver_og_img_v0.png
ENV VITE_TEAMVER_SITE_URL=${VITE_TEAMVER_SITE_URL}
ENV VITE_TEAMVER_OG_IMAGE_URL=${VITE_TEAMVER_OG_IMAGE_URL}
# BYOK streaming — daemon message PUT throttle (ms). Override via deploy .env (rebuild required).
ARG VITE_MESSAGE_PERSIST_THROTTLE_MS=5000
ENV VITE_MESSAGE_PERSIST_THROTTLE_MS=${VITE_MESSAGE_PERSIST_THROTTLE_MS}
RUN pnpm --filter @open-design/contracts build && \
    pnpm --filter @open-design/registry-protocol build && \
    pnpm --filter @open-design/daemon build && \
    pnpm --filter @open-design/web build && \
    pnpm --filter @open-design/daemon deploy --legacy --prod /app/deploy/daemon && \
    pnpm store prune && \
    rm -rf \
      /root/.cache \
      /root/.local/share/pnpm/store \
      /app/deploy/daemon/node_modules/.cache \
      /app/deploy/daemon/node_modules/@types \
      /app/deploy/daemon/node_modules/.pnpm/@types+* \
      /app/deploy/daemon/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps \
      /app/deploy/daemon/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src && \
    find /app/deploy/daemon/node_modules -type d \( \
      -name test -o \
      -name tests -o \
      -name "__tests__" -o \
      -name docs -o \
      -name doc -o \
      -name example -o \
      -name examples -o \
      -name ".github" \
    \) -prune -exec rm -rf '{}' + && \
    find /app/deploy/daemon/node_modules -type f \( \
      -name "*.md" -o \
      -name "*.markdown" -o \
      -name "*.d.ts" -o \
      -name "*.d.cts" -o \
      -name "*.d.mts" -o \
      -name "*.map" -o \
      -name "*.tsbuildinfo" -o \
      -name "binding.gyp" \
    \) -delete

# Stage-2 assets — copied into the build stage so the runtime stage
# can pull them via --from=build instead of reaching back into the
# build context.  This lets the Dockerfile work when the build context
# differs from the repo root (Railway, CI runners with a subdirectory
# context, etc.).
COPY skills ./skills
COPY design-systems ./design-systems
COPY craft ./craft
COPY prompt-templates ./prompt-templates
COPY assets ./assets
COPY plugins/_official ./plugins/_official

FROM ${RUNTIME_IMAGE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    poppler-utils \
    chromium \
    fonts-freefont-ttf \
    fonts-noto-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 open-design \
    && useradd -u 1001 -g open-design -M -s /usr/sbin/nologin open-design

WORKDIR /app
COPY --from=build --chown=open-design:open-design /app/deploy/daemon ./apps/daemon
COPY --from=build --chown=open-design:open-design /app/apps/web/out ./apps/web/out
COPY --from=build --chown=open-design:open-design /app/skills ./skills
COPY --from=build --chown=open-design:open-design /app/design-systems ./design-systems
COPY --from=build --chown=open-design:open-design /app/craft ./craft
COPY --from=build --chown=open-design:open-design /app/prompt-templates ./prompt-templates
COPY --from=build --chown=open-design:open-design /app/assets/frames ./assets/frames
COPY --from=build --chown=open-design:open-design /app/assets/community-pets ./assets/community-pets
# Plan §3.J4 / spec §23.3.5 — bundled atom plugins registered on
# daemon boot. The directory contains `plugins/_official/atoms/<atom>/`
# pairs (SKILL.md + open-design.json); registerBundledPlugins() walks
# it on startup so the container ships with first-party atoms reachable
# via the same registry path third-party plugins use.
COPY --from=build --chown=open-design:open-design /app/plugins/_official ./plugins/_official

RUN mkdir -p /app/.od && \
    chown -R open-design:open-design /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=192
ENV OD_BIND_HOST=0.0.0.0
ENV OD_PORT=7456
ENV OD_EXPORT_CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 7456

USER open-design
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/daemon/dist/cli.js", "--no-open"]
