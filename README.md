# Zec Bounties - Local Development Setup

Bounty Platform with Native ZEC Payments

The project consists of:

- **Frontend** – User interface built with Next.js.
- **Backend** – REST API for authentication, bounty management, submissions, and Zcash payments.

---

# Prerequisites

Before getting started, ensure you have the following installed:

- Node.js
- npm and/or Yarn
- PostgreSQL
- Redis
- Docker (optional, to run PostgreSQL and Redis; see below)
- Zebrad, Zaino and Zingo-cli (only for Zcash wallet and payment features; not needed to run the app locally)

For Zcash node setup, see the **ZecHub Developer Resources**:

https://zechub.wiki/developers

---

# Project Setup

## Backend

### 1. Navigate to the backend directory

```bash
cd zec-bounties-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start PostgreSQL and Redis

With Docker:

```bash
docker run -d --name zb-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zec_bounties -p 5432:5432 postgres:16-alpine
docker run -d --name zb-redis -p 6379:6379 redis:7
```

### 4. Create your `.env`

```bash
cp .env.example .env
npx web-push generate-vapid-keys
```

Paste the generated keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and set `JWT_SECRET`. See [Environment Variables](#environment-variables).

### 5. Create the database tables

```bash
npx prisma db push
```

### 6. Start the backend

```bash
npm run dev
```

The backend runs at:

```
http://localhost:9000
```

---

## Frontend

### 1. Navigate to the frontend directory

```bash
cd zec-bounties-frontend
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Start the development server

```bash
yarn dev
```

The frontend runs at:

```
http://localhost:3000
```

---

# Environment Variables

`zec-bounties-backend/.env.example` lists every variable the backend reads, each with a placeholder and a one-line description, marked `[required]` or `[optional]`. Copy it to `zec-bounties-backend/.env`.

For local development you only need:

- `DATABASE_URL`: PostgreSQL connection string (the example matches the Docker command above)
- `JWT_SECRET`: any long random string
- `PORT=9000`: matches the frontend's development backend URL in `zec-bounties-frontend/lib/configENV.ts`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`: the backend won't start without them; generate the keys with `npx web-push generate-vapid-keys`

Everything else (GitHub and Discord login, email, Pinata uploads, Zcash wallets and payments) can keep its example value or stay blank until you work on that feature.

---

# Development

Start the backend:

```bash
cd zec-bounties-backend
npm run dev
```

Start the frontend:

```bash
cd zec-bounties-frontend
yarn dev
```

Once both services are running, open:

```
Frontend: http://localhost:3000
Backend:  http://localhost:9000
```

## NOTES & LIMITATIONS

- Database: PostgreSQL (see the Docker command in the backend setup). Redis is also required.
- To reset the database: `docker rm -f zb-postgres`, start it again with the same `docker run` command, and re-run `npx prisma db push`.
- Zcash integration (payments, shielded tx, etc.) requires Zebrad + Zaino running and correctly configured in .env.
  Without them, bounty creation/submission UI may work but actual ZEC transfers will fail.
- GitHub login is used for authentication. Set up a GitHub OAuth App at https://github.com/settings/developers
  and use the Client ID/Secret. For quick testing you can temporarily bypass auth in code if needed.
- Both parts have their own lockfiles (yarn.lock / package-lock.json). Do not mix package managers.
- Production deployment uses Vercel for frontend (see https://bounties.zechub.wiki/).
- For issues or updates, check the subfolder README.md files or open issues on the GitHub repo.
- This setup guide is derived from repo structure and sub-READMEs (as of July 2026). Always verify commands work in your environment.

## TROUBLESHOOTING

- Prisma errors: Ensure you ran `npx prisma generate` after any schema changes.
- Port conflicts: the backend port is `PORT` in `zec-bounties-backend/.env` (9000 by default in `.env.example`); the frontend expects it at the URL in `zec-bounties-frontend/lib/configENV.ts`. Keep the two in step.
- Yarn issues: Delete node_modules + yarn.lock and re-run `yarn install`.
- Missing env vars: Double-check .env file location (must be in backend root) and restart backend.
- Zcash RPC connection refused: Confirm Zebrad is running, RPC is enabled on the URL/port in .env, and credentials match.

For the most up-to-date info, visit the GitHub repo: https://github.com/ZecHub/zec-bounties
