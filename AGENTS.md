# AGENTS.md

Instructions for coding agents working in `ZecHub/zec-bounties`.

This repository is the ZEC Bounties platform (https://bounties.zechub.wiki): a Next.js frontend and a Node API with Prisma, PostgreSQL, and Redis. Payouts are shielded ZEC on mainnet. Local setup is in the root [README.md](README.md).

## Layout

- `zec-bounties-frontend/` — Next.js UI. Package manager: Yarn (`yarn.lock`). Scripts: `yarn dev`, `yarn lint`, `yarn test:a11y`, `yarn test:pagination`.
- `zec-bounties-backend/` — API. Package manager: npm (`package-lock.json`). Scripts: `npm run dev`, `npm test` (`node --test tests/**/*.test.js`).
- `docs/` — markdown mirrors of the in-app guide. Each page also exists as `zec-bounties-frontend/app/docs/<slug>/page.tsx`. The sidebar is `NAV` in `zec-bounties-frontend/app/docs/layout.tsx`. The Start here list is `LINKS` in `zec-bounties-frontend/app/docs/page.tsx`. Change those together with `docs/README.md` and `docs/overview.md`.
- `zec-bounties-backend/prisma/schema.prisma` — source of truth for account roles, bounty status, and payment flags. Hunter-facing definitions: [docs/glossary.md](docs/glossary.md).

Do not mix package managers. The frontend also has a `pnpm-lock.yaml`; the README installs and runs it with Yarn.

## How people use the board

User workflow (sign in, apply, submit, get paid) is documented in [docs/contributors.md](docs/contributors.md) and served at `/docs/contributors`. Do not copy that guide into code comments or into this file.

## Limits

- Do not change payment, wallet, or auth behavior unless the task says so. Those paths live under `zec-bounties-backend/routes/transactions.js`, `zec-bounties-backend/helpers/zcash/`, and `zec-bounties-backend/middleware/auth.js`.
- Do not commit `.env` files, seeds, wallet files, or API keys.
- Do not bypass authentication, even for local testing.
- Do not edit `prisma/schema.prisma` unless the task is a schema change. If you do, run `npx prisma generate` in `zec-bounties-backend`.
- Live amounts and addresses are mainnet. Do not recommend transparent-only (`t1` / `t3`) payout addresses.

## Checks

From `zec-bounties-backend`: `npm test`.

From `zec-bounties-frontend`: `yarn lint`. Run `yarn test:a11y` or `yarn test:pagination` only when the change touches those flows.

Branch names, pull request expectations, and the AI-use note are in [CONTRIBUTING.md](CONTRIBUTING.md).
