# syntax=docker/dockerfile:1

# --- Install dependencies (cached separately from source) -------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- Runtime ---------------------------------------------------------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
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
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
