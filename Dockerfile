# syntax=docker/dockerfile:1.6

# -----------------------------------------------------------------------------
# Stage 1: Build — compile mediasoup worker + bundle mediasoup-client
# -----------------------------------------------------------------------------
FROM node:24-slim AS builder

WORKDIR /src

ENV NODE_ENV=production
ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Install all deps (esbuild is a devDependency required by postinstall)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Drop build-only packages from the final node_modules tree
RUN npm prune --omit=dev

COPY app ./app
COPY public ./public

# Use the shipped config template as the default production config
COPY app/src/config.template.js app/src/config.js

# -----------------------------------------------------------------------------
# Stage 2: Runtime — lightweight image (no compilers)
# -----------------------------------------------------------------------------
FROM node:24-slim AS runtime

WORKDIR /src

ENV NODE_ENV=production
ENV SERVER_LISTEN_IP=0.0.0.0
ENV SERVER_LISTEN_PORT=8080

# FFmpeg is optional (RTMP / recording helpers); keep it for feature parity
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /src/package.json ./package.json
COPY --from=builder --chown=node:node /src/package-lock.json ./package-lock.json
COPY --from=builder --chown=node:node /src/node_modules ./node_modules
COPY --from=builder --chown=node:node /src/app ./app
COPY --from=builder --chown=node:node /src/public ./public

# MeetFlow SQLite DB (mount a volume over /src/data in production)
RUN mkdir -p /src/data && chown -R node:node /src/data

USER node

EXPOSE 8080

CMD ["npm", "start"]
