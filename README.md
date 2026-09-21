# Zec Bounties - Local Development Setup

Bounty Platform with Native ZEC Payments

The project consists of:

- **Frontend** – User interface built with Next.js.
- **Backend** – REST API for authentication, bounty management, submissions, and Zcash payments.

---

# Prerequisites

Before getting started, ensure you have the following installed and running:

- Node.js
- npm
- PostgreSQL (running locally; you will create a `zec_bounties` database below)
- Redis (running locally; the backend connects to it on boot)

Zcash payments additionally need Zebrad, Zaino, and zingo-cli. Those are
only required for real ZEC transfers; the API and UI run without them.
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

### 3. Copy the environment file

```bash
cp .env.example .env
```

See the Environment Variables section below for what each value means.
At minimum, `DATABASE_URL` must point at your local PostgreSQL.

### 4. Create the database

```bash
createdb zec_bounties
```

(Or in psql: `CREATE DATABASE zec_bounties;`. The default `DATABASE_URL` in
`.env.example` expects a database named `zec_bounties` owned by the
`postgres` superuser with password `postgres`.)

### 5. Generate Prisma Client

```bash
npx prisma generate
```

### 6. Run the initial migration

```bash
npx prisma migrate dev --name init
```

### 7. Start the backend

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
npm install
```

### 3. Start the development server

```bash
npm run dev
```

The frontend runs at:

```
http://localhost:3000
```

---

# Environment Variables

The backend reads its config from a `.env` file. Step 3 above already
copies the template; this section documents the values:

```bash
cd zec-bounties-backend
cp .env.example .env   # already done in step 3 if you followed the order above
```

`.env.example` documents every variable the code reads (placeholders included).
Example of the key entries:

```env
PORT=9000

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zec_bounties"
JWT_SECRET="JWT_SECRET"

ZCASH_RPC_USER=rpcuser
ZCASH_RPC_PASS=rpcpassword
ZCASH_RPC_URL=http://localhost:8232
ZINGO_CLI=path/to/your/zingo-cli

# GitHub OAuth
GITHUB_CLIENT_ID=GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=GITHUB_CLIENT_SECRET

FRONTEND_URL=http://localhost:3000

SMTP_USER=mail
SMTP_PASS=password

NODE_ENV=development
DEV_EMAIL_FALLBACK=dev@example.com
```

Update these values to match your local environment.

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
npm run dev
```

Once both services are running, open:

```
Frontend: http://localhost:3000
Backend:  http://localhost:9000
```

## NOTES & LIMITATIONS

- Database: PostgreSQL, configured via `DATABASE_URL` in `zec-bounties-backend/.env`
  (copy `.env.example`). Prisma schema provider is `postgresql`.
- To reset DB: drop and recreate the database, then re-run `npx prisma migrate dev`.
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
- Port conflicts: Change ports in next.config.mjs (frontend) or server.js / .env (backend) if needed.
- Yarn issues: Delete node_modules + yarn.lock and re-run `yarn install`.
- Missing env vars: Double-check .env file location (must be in backend root) and restart backend.
- Zcash RPC connection refused: Confirm Zebrad is running, RPC is enabled on the URL/port in .env, and credentials match.

For the most up-to-date info, visit the GitHub repo: https://github.com/ZecHub/zec-bounties
