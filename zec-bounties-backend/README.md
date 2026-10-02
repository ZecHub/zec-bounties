# Bounty Backend

This is the backend service for the Hackathon bounty management platform.  
It provides APIs for authentication, bounty creation, task submissions, and payment management.

---

## ✅ Prerequisites

- Node.js 20 or later, with npm
- PostgreSQL (the Prisma schema uses `provider = "postgresql"`)
- Redis (the server connects to it on startup)
- Docker, optionally, to run PostgreSQL and Redis with the commands below

Zebrad, Zaino and zingo-cli are only needed for Zcash wallet and payment features, not to run the app locally. See [Zechub Developers Resources](https://zechub.wiki/developers) to set them up.

---

## 🚀 Getting Started

Run these commands from the `zec-bounties-backend` directory.

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL and Redis

With Docker:

```bash
docker run -d --name zb-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zec_bounties -p 5432:5432 postgres:16-alpine
docker run -d --name zb-redis -p 6379:6379 redis:7
```

If you already run PostgreSQL and Redis, update `DATABASE_URL` and `REDIS_URL` in your `.env` to point at them.

### 3. Create your `.env`

```bash
cp .env.example .env
npx web-push generate-vapid-keys
```

Paste the two generated keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and set `JWT_SECRET` to a long random string (for example, the output of `openssl rand -hex 32`). The server won't start without the VAPID keys.

### 4. Create the database tables

```bash
npx prisma db push
```

This creates the tables from `prisma/schema.prisma` and generates the Prisma Client.

### 5. Start the development server

```bash
npm run dev
```

## The app will start on:

```
http://localhost:9000
```

The port comes from `PORT` in `.env`, and `.env.example` sets it to 9000 to match the frontend's development backend URL (`zec-bounties-frontend/lib/configENV.ts`). If `PORT` isn't set, `server.js` falls back to 9001 and the frontend won't reach the backend.

To check that it's running:

```bash
curl http://localhost:9000/api/bounties
```

On a fresh database, this returns `{"data":[],"total":0,"page":1,"limit":10}`.

## ⚙️ Environment Variables

`.env.example` lists every variable the backend reads, each with a placeholder and a one-line description, marked `[required]` or `[optional]`.

For local development you only need `DATABASE_URL`, `JWT_SECRET`, `PORT`, and the three `VAPID_*` values. Everything else (GitHub and Discord login, email, Pinata uploads, and Zcash wallets and payments) can keep its example value or stay blank until you work on that feature.
