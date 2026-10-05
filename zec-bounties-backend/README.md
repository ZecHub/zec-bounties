# Bounty Backend

This is the backend service for the Hackathon bounty management platform.
It provides APIs for authentication, bounty creation, task submissions, and payment management.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in the values for your machine:

```bash
cp .env.example .env
```

`.env.example` documents every variable the code reads. For a basic local
run you need `DATABASE_URL` (a local PostgreSQL database) and a running
Redis (the server connects on boot; `REDIS_URL` defaults to
`redis://localhost:6379`). Everything else is optional for local dev and
marked as such in the file.

### 3. Create the database

```bash
createdb zec_bounties
```

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Run the initial migration

```bash
npx prisma migrate dev --name init
```

### 6. Start the development server

```bash
npm run dev
```

The app will start on:

```
http://localhost:9000
```

(The port comes from `PORT` in `.env`, default `9000`. It must match the
frontend's dev `backendUrl` in `zec-bounties-frontend/lib/configENV.ts`.)

---

## Notes

- You need PostgreSQL running locally and reachable via `DATABASE_URL`
  (create the database first: `createdb zec_bounties`).
- You need Redis running locally and reachable via `REDIS_URL`
  (default `redis://localhost:6379`). The server connects to Redis on boot
  and will not start without it.
- Zcash payments additionally need Zebrad and Zaino installed. Check
  [Zechub Developers Resources](https://zechub.wiki/developers) to get started.
  Without them the API and UI still run; only actual ZEC transfers will fail.
- `npx prisma init` is only needed if you are scaffolding a new Prisma setup
  from scratch; a fresh clone already contains `prisma/`, so skip it.
