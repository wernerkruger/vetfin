# Deploy VetFin on a single AWS EC2 instance

Everything runs on **one EC2 server**: React frontend, API, Postgres database, and (optionally) HTTPS — all via Docker Compose.

```
Internet → EC2 (ports 80/443)
              └── Caddy (optional HTTPS)
                    └── nginx (web) → API (Node) → Postgres (db, volume)
```

## 1. Create the EC2 instance

In the [AWS EC2 console](https://console.aws.amazon.com/ec2/):

| Setting | Value |
|---------|--------|
| **AMI** | Ubuntu Server 24.04 LTS |
| **Instance type** | `t3.small` (2 vCPU, 2 GB RAM) |
| **Storage** | 30 GB gp3 |
| **Key pair** | Create or select one for SSH |

**Security group** — inbound rules:

| Port | Source | Purpose |
|------|--------|---------|
| 22 | Your IP | SSH |
| 80 | 0.0.0.0/0 | HTTP |
| 443 | 0.0.0.0/0 | HTTPS (when using a domain) |

After launch, allocate and associate an **Elastic IP** so the address does not change on stop/start.

## 2. SSH in and install Docker

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>

git clone <your-repo-url> VetFin
cd VetFin
chmod +x deploy/aws/ec2-setup.sh deploy/aws/deploy.sh
./deploy/aws/ec2-setup.sh
```

Log out and SSH back in (so your user is in the `docker` group).

## 3. Configure secrets

```bash
cd ~/VetFin
cp deploy/aws/.env.production.example api/.env
nano api/.env
```

Generate secrets on the server:

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

**Option A — Elastic IP only (no domain yet)**

```env
APP_ENV=production
PUBLIC_APP_URL=http://<ELASTIC_IP>
CORS_ORIGINS=http://<ELASTIC_IP>
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
JWT_SECRET=<generated>
DATA_ENCRYPTION_KEY=<generated>
```

**Option B — Custom domain with HTTPS**

Point a DNS **A record** at your Elastic IP first, then:

```env
APP_ENV=production
DOMAIN=app.yourdomain.com
PUBLIC_APP_URL=https://app.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
# ... same Plaid and secret values
```

## 4. Deploy

```bash
cd ~/VetFin
./deploy/aws/deploy.sh http    # Elastic IP / no domain
# or
./deploy/aws/deploy.sh https   # after DNS points to this server
```

Open the URL in a browser. Health check: `curl http://localhost/health`

## 5. Auto-start on reboot (recommended)

```bash
sudo cp deploy/aws/vetfin.service /etc/systemd/system/vetfin.service
# Edit if your home path is not /home/ubuntu/VetFin:
#   sudo nano /etc/systemd/system/vetfin.service

sudo systemctl daemon-reload
sudo systemctl enable vetfin
sudo systemctl start vetfin
```

For HTTPS, edit the service file and set `Environment=COMPOSE_PROFILES=https` before enabling.

## 6. Deploy updates

```bash
cd ~/VetFin
git pull
./deploy/aws/deploy.sh http   # or https
```

Postgres data is kept in the Docker volume `vetfin-pg` across rebuilds.

## Useful commands

```bash
./deploy/aws/deploy.sh logs     # follow logs
./deploy/aws/deploy.sh down     # stop everything

docker volume inspect vetfin_vetfin-pg     # database volume location
docker compose -f docker-compose.yml -f deploy/aws/docker-compose.ec2.yml ps
```

## Backup Postgres

```bash
docker compose -f docker-compose.yml -f deploy/aws/docker-compose.ec2.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backup-$(date +%Y%m%d).dump
```

Restore with `pg_restore --clean -U vetfin -d vetfin` inside the `db` container. Copy dumps off the instance regularly (S3, local machine, etc.).

## Moving existing SQLite data to Postgres (one-off)

Servers deployed before the Postgres switch still have their data in the old `vetfin_vetfin-data` volume. The new API **starts with an empty Postgres database** — copy the data over before (or right after) the first Postgres deploy:

```bash
cd ~/VetFin
set -a; source api/.env; set +a
COMPOSE="docker compose -f docker-compose.yml -f deploy/aws/docker-compose.ec2.yml"
$COMPOSE up -d db                                   # start only the database

docker run --rm --network vetfin_default \
  -v vetfin_vetfin-data:/sqlite:ro -v "$PWD/api":/app -w /app \
  --env-file api/.env -e DATABASE_URL= -e DB_HOST=db \
  node:22-bookworm-slim \
  sh -c "npm ci && npm run db:migrate-from-sqlite -- --truncate /sqlite/vetfin.sqlite"

./deploy/aws/deploy.sh http                         # or https
```

Check names first with `docker volume ls` and `docker network ls` (they're prefixed with the project folder name). The script runs in a single transaction and prints row counts for every table. Keep the old volume until you've checked the app.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Bind for :::80 failed: port is already allocated` | Something else is using port 80. Run `sudo ss -tlnp \| grep ':80 '` and `docker ps`. Often a leftover container from `docker compose up` without the EC2 overlay — run `./deploy/aws/deploy.sh down`, then `docker ps --filter publish=80 -q \| xargs -r docker stop`, and redeploy |
| `permission denied` on docker | Log out/in after `ec2-setup.sh`, or use `sudo docker` |
| API won't start | Check `docker compose ... logs api` — usually missing `DATA_ENCRYPTION_KEY` or Plaid keys, or the `db` container isn't healthy |
| `password authentication failed` | The Postgres password is set when the `vetfin-pg` volume is first created. Changing `DB_PASSWORD` later doesn't change it — use `ALTER USER` inside the `db` container |
| HTTPS certificate fails | Confirm DNS A record points to Elastic IP; ports 80 and 443 open |
| Site loads but API 502 | Wait for API health check: `docker compose ... ps` — api should be `healthy` |

## What runs where

| Component | Container | Data |
|-----------|-----------|------|
| React app | `web` (nginx) | Built into image |
| API | `api` (Node) | — |
| Postgres | `db` | Volume `vetfin-pg` |
| HTTPS | `caddy` or `caddy-http` | Volumes `caddy-data`, `caddy-config` |

All of this stays on a **single EC2 instance** — no ECS, RDS, or S3 required to go live.
