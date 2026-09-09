# VetFin

Veterinary bill financing for pet owners and partner clinics. Monorepo:

| Directory | Stack | Role |
|-----------|--------|------|
| `web/` | React + Vite | Marketing site, apply flow, borrower & practice portals |
| `api/` | Node + Express + SQLite | Auth, loan applications, Plaid |
| `Analysis/` | Python | Clinic data enrichment (optional) |

## Local development

Keep **local** and **AWS** env files separate. Local uses `APP_ENV=development` and localhost URLs; the EC2 box uses `APP_ENV=production` and your public host (see [Environment: local vs production](#environment-local-vs-production)).

**API**

```bash
cd api
cp .env.example .env           # localhost PUBLIC_APP_URL / CORS
# optional: cp .env.local.example .env.local  # locks localhost even if .env is wrong
npm install
npm run dev                    # http://localhost:3001
```

**Web**

```bash
cd web
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

See `api/README.md` for API endpoints and data model.

## Deploy to AWS (single EC2 instance)

**Full step-by-step guide:** [`deploy/aws/README.md`](deploy/aws/README.md)

Quick summary:

1. Launch **Ubuntu 24.04** EC2 (`t3.small`, 30 GB disk) with security group ports **22**, **80**, **443**.
2. Attach an **Elastic IP**.
3. On the server:

```bash
git clone <your-repo> VetFin && cd VetFin
./deploy/aws/ec2-setup.sh          # install Docker — then log out/in
cp deploy/aws/.env.production.example api/.env && nano api/.env
./deploy/aws/deploy.sh http        # or `https` when you have a domain
```

4. Optional: enable auto-start on reboot with `deploy/aws/vetfin.service`.

Everything (web, API, SQLite, optional HTTPS) runs on that one instance via Docker Compose.

Test the same stack locally before deploying:

```bash
cp api/.env.example api/.env   # set DATA_ENCRYPTION_KEY + JWT_SECRET
docker compose up --build      # http://localhost
```

---

## Production architecture

The app is packaged as **two Docker containers** on one host:

```
                    ┌─────────────────────────────────────┐
  Internet ────────►│  Caddy (EC2 only, optional HTTPS)   │
                    └──────────────┬──────────────────────┘
                    ┌──────────────▼──────────────────────┐
                    │  web (nginx) — React SPA            │
                    │  proxies /api → api                 │
                    └──────────────┬──────────────────────┘
                    ┌──────────────▼──────────────────────┐
                    │  api (Node) — SQLite on volume      │
                    └─────────────────────────────────────┘
```

- **Single domain** — nginx serves the SPA and forwards `/api/*` to the API.
- **SQLite** — Docker volume `vetfin-data` on the EC2 instance.
- **Secrets** — `api/.env` on the server (never commit).

---

## Environment: local vs production

| | Local (`npm run dev`) | Local Docker | AWS EC2 |
|--|----------------------|--------------|---------|
| Env file | `api/.env` from `.env.example` | same, with `PUBLIC_APP_URL=http://localhost` | `api/.env` from `deploy/aws/.env.production.example` |
| `APP_ENV` | `development` (default) | `development` / unset | **`production`** (required) |
| `PUBLIC_APP_URL` | `http://localhost:5173` | `http://localhost` | Elastic IP or `https://your.domain` |
| `CORS_ORIGINS` | localhost Vite origins | `http://localhost` | same as public URL |
| `NODE_ENV` | unset | `production` (Compose) | `production` |

**Rules**

- Never put your AWS Elastic IP in the laptop `api/.env` used for Vite. Optional `api/.env.local` always overrides with localhost (see `.env.local.example`).
- On the server, only use the production example (`APP_ENV=production`). `deploy/aws/deploy.sh` refuses localhost URLs and missing `APP_ENV=production`.
- In development, the API **ignores** a non-localhost `PUBLIC_APP_URL` and uses `http://localhost:5173` so QR/referral links stay local.

## Environment variables reference

| Variable | Where | Purpose |
|----------|--------|---------|
| `APP_ENV` | API | `development` (local) or `production` (AWS) — controls public URL / CORS behaviour |
| `PLAID_CLIENT_ID` | API | Plaid app id |
| `PLAID_SECRET` | API | Plaid secret |
| `PLAID_ENV` | API | `sandbox` or `production` |
| `JWT_SECRET` | API | Signs borrower & practice tokens (≥32 chars) |
| `DATA_ENCRYPTION_KEY` | API | Encrypts Plaid tokens at rest (≥16 chars; **required** when `NODE_ENV=production`) |
| `PUBLIC_APP_URL` | API | Referral links & QR codes |
| `CORS_ORIGINS` | API | Comma-separated allowed browser origins |
| `DATABASE_PATH` | API | SQLite path (`/data/vetfin.sqlite` in Docker) |
| `VITE_API_URL` | Web build | API base URL; leave empty for same-origin `/api` in Docker/AWS |

`NODE_ENV=production` safety checks:

- Refuses to start without `DATA_ENCRYPTION_KEY`
- Refuses default `JWT_SECRET`

`APP_ENV=production` safety checks:

- Refuses localhost `PUBLIC_APP_URL`

## AWS checklist before go-live

- [ ] Unique `JWT_SECRET` and `DATA_ENCRYPTION_KEY` (not committed to git)
- [ ] `PUBLIC_APP_URL` and `CORS_ORIGINS` match your real HTTPS URL
- [ ] Plaid production keys and `PLAID_ENV=production` when ready
- [ ] HTTPS enabled (Caddy, ALB + ACM, or CloudFront)
- [ ] Security group restricts SSH to your IP
- [ ] Back up the SQLite Docker volume regularly (see `deploy/aws/README.md`)

## Project scripts

```bash
# API
cd api && npm run build && npm start

# Web
cd web && npm run build    # output in web/dist/

# Full stack (Docker)
docker compose up --build
```

## License

Proprietary — VetFin.
