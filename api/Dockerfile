# VetFin API — production image (Node + better-sqlite3)
# Build context: repository root (see docker-compose.yml)
FROM node:22-bookworm-slim AS build

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

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATABASE_PATH=/data/vetfin.sqlite

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3

COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
