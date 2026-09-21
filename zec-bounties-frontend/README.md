# Bounty Frontend

This is the frontend interface for the Hackathon bounty management platform.
It provides a user-friendly UI for authentication, browsing bounties, submitting work, and tracking rewards.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

(Upstream docs use `yarn install` / `yarn dev`; `npm` works the same.)

### 2. Start the development server

```bash
npm run dev
```

The app will start on:

```
http://localhost:3000
```

---

## Backend

The frontend talks to the backend API. In development it expects the backend
at `http://localhost:9000` (see `lib/configENV.ts`). Start it first by
following `zec-bounties-backend/README.md`, then open
`http://localhost:3000` in your browser.

## Optional: push notifications

`lib/push.ts` reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. It is only needed if you
want to test web-push subscribe locally; the app boots fine without it. To
enable it, create a `.env.local` file in this directory:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same value as VAPID_PUBLIC_KEY in the backend .env>
```
