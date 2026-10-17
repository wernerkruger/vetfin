# VetFin API — production image (Node + Postgres via `pg`)
# Build context: repository root (see docker-compose.yml)
FROM node:22-bookworm-slim AS build

# Build tools only needed if better-sqlite3 (dev dependency, used by the one-off
# SQLite→Postgres migration script) has to compile from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src
COPY Analysis/wowvets_clinics.csv ./data/wowvets_clinics.csv
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
