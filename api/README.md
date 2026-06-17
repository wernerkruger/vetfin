# VetFin API

Backend service for Plaid integration (sandbox-first), modeled after patterns in Lawfi’s `lawfi-core`.

## Lawfi reference (passwords & Plaid)

| Concern | Lawfi approach |
|--------|----------------|
| Team passwords / Rails credentials | **[1Password](https://1password.com/)** — README points to vault item “Rails Master Key” |
| Deployed API secrets | **[Doppler](https://www.doppler.com/)** → synced to Fly.io |
| Local dev | **dotenv** — `.env.local` (see `lawfi-core/.env.test` for variable names) |
| Plaid code | `lib/lawfi/plaid/client.rb`, DI as `plaid.client`, `PLAID_ENVIRONMENT=sandbox` |

Plaid sandbox helpers in Lawfi: `sandbox_public_token`, `sandbox_processor_token`, institution `ins_109508` (First Platypus Bank).

## Setup

1. Create a [Plaid developer account](https://dashboard.plaid.com/) and copy **sandbox** keys.
2. Copy env template and fill in keys:

```bash
cd api
cp .env.example .env.local
# Edit .env.local — use the same variable names as Lawfi if you share a Doppler/1Password entry:
#   PLAID_CLIENT_ID, PLAID_CLIENT_SECRET (or PLAID_SECRET)
```

3. Install and run:

```bash
npm install
npm run dev
```

API base: `http://localhost:3001`

## Customer data storage

Applicant and Plaid data are stored in **SQLite** (default: `api/data/vetfin.sqlite`).

| Table | Contents |
|-------|----------|
| `customers` | Applicant id (`client_user_id`), optional email |
| `plaid_items` | Plaid `item_id`, encrypted `access_token`, institution |
| `bank_accounts` | Selected accounts, routing, encrypted account number, owners (JSON) |
| `bank_transactions` | Synced Plaid transactions per linked account |
| `vet_practices` | Partner clinic accounts (login, referral slug) |
| `customers.practice_id` | Links loan applicants to referring practice |

Set `DATA_ENCRYPTION_KEY` (16+ characters) in `.env` to encrypt Plaid tokens and account numbers at rest. Without it, values are stored in plaintext (dev only; a warning is logged on startup).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| POST | `/api/customers` | Body: `{ "clientUserId", "email?" }` → create/update customer |
| GET | `/api/customers/:id` | Customer + stored Plaid items + bank accounts |
| GET | `/api/plaid/status` | Plaid env, DB path, encryption flag |
| POST | `/api/plaid/link-token` | Body: `{ "customerId", "clientUserId?" }` → `{ linkToken }` |
| POST | `/api/plaid/exchange-public-token` | Body: `{ "customerId", "publicToken", ... }` → persists Plaid item |
| POST | `/api/plaid/sandbox/connect` | Body: `{ "customerId" }` — sandbox item without Link UI |
| POST | `/api/plaid/linked-accounts` | Body: `{ "customerId", "accountIds" }` → pull + save accounts + sync transactions |
| POST | `/api/plaid/transactions/sync` | Body: `{ "customerId", "accountIds?" }` → incremental transaction sync |
| GET | `/api/plaid/transactions?customerId=...` | List stored transactions (`bankAccountId`, `limit` optional) |
| GET | `/api/plaid/accounts?customerId=...` | List accounts for customer's latest item |
| POST | `/api/practices/signup` | Register vet practice → JWT + referral URL |
| POST | `/api/practices/login` | Practice portal login |
| GET | `/api/practices/me` | Practice profile + stats (Bearer token) |
| GET | `/api/practices/me/referrals` | Referred loan applications |
| GET | `/api/practices/me/qr-data` | Referral URL + QR as data URL |
| GET | `/api/referral/:slug` | Public practice info for apply page |
| POST | `/api/referral/:slug/apply` | Legacy: quick-start application |
| POST | `/api/borrowers/signup` | Create borrower account + draft application (`referralSlug`) |
| POST | `/api/borrowers/login` | Borrower login |
| PATCH | `/api/borrowers/me/profile` | US identity & address (Bearer) |
| GET | `/api/applications/current?referralSlug=` | Get/create draft application |
| PATCH | `/api/applications/:id/loan` | Loan amount, service, animal type |
| POST | `/api/applications/:id/plaid/*` | Plaid Link, exchange, link accounts (sandbox shortcut) |
| POST | `/api/applications/:id/submit` | Final submit |

Link and sandbox connect request Plaid **Transactions** alongside Auth and Identity. Existing items created before this change must reconnect via Link (update mode) to enable transaction access.

### Quick sandbox test (no Link UI)

```bash
# Mint sandbox public token
curl -s -X POST http://localhost:3001/api/plaid/sandbox/public-token | jq

# Exchange (paste publicToken from above)
curl -s -X POST http://localhost:3001/api/plaid/exchange-public-token \
  -H 'Content-Type: application/json' \
  -d '{"publicToken":"public-sandbox-..."}' | jq

# Fetch auth summary
curl -s "http://localhost:3001/api/plaid/auth?accessToken=access-sandbox-..." | jq
```

## Frontend

Point the Vite app at this API (`VITE_API_URL=http://localhost:3001`) when you add Plaid Link to the apply flow.
