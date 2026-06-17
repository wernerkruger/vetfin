# VetFin — Marketing site

Landing page for VetFin, veterinary bill financing at the point of care.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Plaid sandbox test UI

With the API running (`cd ../api && npm run dev`):

1. Open [http://localhost:5173/plaid-test](http://localhost:5173/plaid-test) (or use **Plaid test** in the header).
2. Click **Connect bank account** and complete Link, or **Skip Link** for an API-only sandbox token.
3. In Link, search **First Platypus Bank** and sign in with `user_good` / `pass_good`.

Optional: copy `web/.env.example` to `web/.env.local` if the API is not on port 3001.

## Build for production

```bash
npm run build
npm run preview
```

Static files are output to `dist/` and can be deployed to any static host (Netlify, Vercel, S3, etc.).

## Structure

- `src/components/` — page sections (hero, how it works, audiences, trust, CTA, footer)
- Application flow, Plaid, and credit integrations will live in a separate app later; this repo is the public parent site only.
