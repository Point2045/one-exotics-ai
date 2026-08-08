# Highline Index

Live arbitrage radar for highline cars — Ferrari, Lamborghini, Aston Martin, G-Class, and Porsche 911 variants. Real U.S. listings are normalized, valued against active-market cohorts, and ranked by estimated net executable edge with provenance intelligence (days-on-market, accidents, owners, use history, CPO).

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, TanStack Query
- **Backend**: Hono + tRPC 11 (Node), Drizzle ORM (MySQL-compatible)
- **Data**: Auto.dev Vehicle Listings API, NHTSA vPIC VIN decoder

## Run locally

```sh
npm install
npm run dev        # http://localhost:3000
npm run check      # typecheck
npm run build      # vite build + server bundle (dist/)
npm start          # production server on :3000
```

## Deploy to Vercel

The repo is Vercel-ready: `server.ts` is the zero-config Hono entry and `vercel.json` wires the build (`npm run build` → static frontend from `dist/public`, serverless API with a 300s max duration so full provider refreshes complete).

1. Push this repo to GitHub, then in Vercel: **Add New → Project → Import** the repository. No settings to change — build command, output directory, and function config come from `vercel.json`.
2. Set these environment variables in **Project → Settings → Environment Variables** (Production):

| Variable | Notes |
| --- | --- |
| `AUTO_DEV_API_KEY` | Real key from auto.dev — required for live listings |
| `APP_ID` / `APP_SECRET` | Any non-empty value (only used by optional platform auth) |
| `DATABASE_URL` | Any well-formed `mysql://…` URL. If unreachable, the app automatically runs on its in-memory store and labels this in the UI |

3. Deploy, open the site, and press **Refresh listings** on the Deal Radar to pull live inventory.

**Serverless caveats**: without a reachable database, inventory lives in each function instance's memory and re-seeds on cold start. For persistent data, point `DATABASE_URL` at any reachable MySQL-compatible database (e.g. TiDB Cloud Serverless) — boot-time migrations in `db/migrations` create the schema automatically.

## Deploy with Docker (any container host)

The included `Dockerfile` builds the full-stack app and serves it on port 3000:

```sh
docker build -t highline-index .
docker run -p 3000:3000 -e AUTO_DEV_API_KEY=… -e APP_ID=x -e APP_SECRET=x -e DATABASE_URL=mysql://… highline-index
```

## Notes

- API keys are server-side only — never expose them with a `VITE_` prefix.
- Arbitrage estimates are decision support, not guarantees. Verify title, condition, service history, fees, taxes, and exit liquidity before acting.
