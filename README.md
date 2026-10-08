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
- Prisma
- Zebrad
- Zaino
- Zingo-cli

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

### 3. Initialize Prisma

```bash
npx prisma init
```

### 4. Generate Prisma Client

```bash
npx prisma generate
```

### 5. Run the initial migration

```bash
npx prisma migrate dev --name init
```

### 6. Push the database schema

```bash
npx prisma db push
```

Run `npx prisma db push` after pulling schema changes as well. Bounty records
store the advisory pre-check shown before suggestion submission so reviewers can
see the same result.

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

Create a `.env` file inside the backend directory (it is automatically created after running `npx prisma init`).

Example:

```env
USER="USER_NAME"

PORT=9000

DATABASE_URL="file:./dev.db" # For local setup
JWT_SECRET="JWT_SECRET"

ZCASH_RPC_USER=rpcuser
ZCASH_RPC_PASS=rpcpassword
ZCASH_RPC_URL=http://localhost:8232
ZINGO_CLI=path/to/your/zingo-cli

# GitHub OAuth
GITHUB_CLIENT_ID=GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=GITHUB_CLIENT_SECRET

FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:9000

SMTP_USER=mail
SMTP_PASS=password

NODE_ENV=development
DEV_EMAIL_FALLBACK=mail
```

Update these values to match your local environment.

## AI bounty suggestion review

Only bounty suggestions submitted by hunters run the AI review. Configure one
or more provider keys in the backend `.env`; the service tries OpenAI,
Anthropic, then Gemini, moving to the next configured provider if one fails:

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

All three keys are optional, but at least one is needed for AI judgment. Model
names can be overridden with `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and
`GEMINI_MODEL`. Duplicate search scores every bounty record locally, including
private, cancelled, pending, in-progress, in-review, and completed records.
The full title, description, and status of every bounty are sent with the
suggestion to the configured AI provider for duplicate judgment; this includes
private bounty text. The hunter sees only a generic indication that a
possibly matching bounty was previously submitted or completed, plus a
similarity score — never the matching bounty's title, description, or ID.
Admins and team managers see the same anonymized pre-check with the bounty. If
no provider is configured or all providers fail, local checks remain advisory
and submission is still allowed. No automated decision rejects a bounty.

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

- Database: SQLite (dev.db) for local use (Not Production). No external DB needed initially.
- To reset DB: delete dev.db and re-run `npx prisma db push`.
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
