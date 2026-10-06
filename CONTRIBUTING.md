# Contributing

This file is for people changing the code. To use the board (browse, apply, deliver, get paid), follow [Contributors](https://bounties.zechub.wiki/docs/contributors).

## Pull requests

1. Branch from `main`. Use a short prefix: `docs/`, `fix/`, or `feat/`.
2. One concern per pull request.
3. If the work is a bounty, link the bounty and satisfy its acceptance criteria in the pull request body.
4. User-facing docs stay in sync: `docs/<slug>.md`, `zec-bounties-frontend/app/docs/<slug>/page.tsx`, the sidebar `NAV` in `app/docs/layout.tsx`, the Start here `LINKS` in `app/docs/page.tsx`, and the table in `docs/README.md`.

## Checks

- Backend (`zec-bounties-backend`, npm): `npm test`
- Frontend (`zec-bounties-frontend`, Yarn): `yarn lint`
- Playwright (`yarn test:a11y`, `yarn test:pagination`) when the change touches accessibility or the bounty board pagination.

Do not mix npm and Yarn in the same package. Setup commands are in the root README.

## What not to change unless the task says so

Payment sending, wallet configuration, authentication, and `prisma/schema.prisma`. Do not commit secrets.

## AI-assisted changes

> **Maintainer: edit or delete this section before merge.** It is a proposal, not an adopted policy.

AI-assisted pull requests are welcome when the author has read the diff, can explain it, and did not commit secrets or unverified changes to payment, wallet, or auth code. Say in the pull request that an AI tool was used.
