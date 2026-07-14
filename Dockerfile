# syntax=docker/dockerfile:1

# --- Install dependencies (cached separately from source) -------------------------------
FROM oven/bun:1-bookworm-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- Runtime ---------------------------------------------------------------------------
# Use a slimmer Debian-based bun image for the runtime to reduce vulnerable Alpine packages
FROM oven/bun:1-buster-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=25001 \
    CONFIG_PATH=/data/config.json

# Dependencies and application source.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY public ./public

# Persist the dashboard-written config outside the image layer.
RUN mkdir -p /data && chown -R bun:bun /data /app
VOLUME ["/data"]

USER bun
EXPOSE 25001

CMD ["bun", "run", "src/index.ts"]
