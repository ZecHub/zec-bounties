# Contributing to ZEC Bounties

Thanks for helping build ZEC Bounties. The goal is to teach Zcash, bring in new contributors, and pay useful work in shielded ZEC.


## Opening a pull request

You can open a PR without a bounty. We review and merge on merit.

- Fork the repo and branch from `main`.
- Open the PR against `main`.
- Keep it to one change. Unrelated fixes go in their own PR.

Small, obvious fixes (typos, broken links, one-line bugs) can be a PR with no further process.

For large or risky changes (auth, payouts, privacy, schema, multi-file features), open a bounty first so scope is agreed before review. The PR can still be opened; deep review waits on the bounty.

## Getting paid

To be paid, the work needs an approved bounty. Hunters can suggest one on the platform if their account is allowed to (see [Bounty suggestions](docs/bounty-suggestions.md)); admins and team users can create bounties directly. Link the PR as the deliverable.

Admins decide who can suggest: nobody (closed), any onboarded hunter (open), or hunters with at least a set number of completed bounties (threshold, 5 by default). If the New Bounty button is disabled, its tooltip tells you why.

To suggest a bounty:

1. Click New Bounty on https://bounties.zechub.wiki
2. Give it a clear title, description, and acceptance criteria
3. Pick a ZEC amount from the bands in [Bounty amounts](docs/bounty-amounts.md)
4. Link the PR (open or merged) as the deliverable
5. Set a shielded Unified Address in your Profile — see [Addresses](docs/addresses.md)
6. Bounties follow a weekly cadence and may take up to 7 days for payment to be processed.

A maintainer will approve it, adjust the amount to the correct band, or decline it. No approved bounty, no payout.

You can open the bounty before you start (recommended for large work) or after the PR is up. Team-user and admin-created bounties are approved on creation. Hunter suggestions stay pending until review. See [Task statuses](docs/task-statuses.md).

After the bounty is Done, payouts are batched and usually go out the following Sunday to the UA in your Profile.

If you cannot suggest yet, open the PR and note that you'd like it considered for a contributor reward, or apply to open bounties on the board.

Duplicates of an existing bounty or PR are not paid, even if the code is fine.

## Branch and commit naming

Branches use a type prefix and a short kebab-case description:

```
docs/local-setup-fresh-clone
fix/bounty-pagination-refresh
```

Commit messages are short and imperative. A type prefix with an optional scope is preferred:

```
feat(admin): search profiles and bounties from the navbar
fix: bounty pagination after refresh and live insertions
docs(faq): add first-bounty question
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## Check your work

Frontend (`zec-bounties-frontend/`):

```bash
npx tsc --noEmit
npx next build
```

Backend (`zec-bounties-backend/`):

```bash
npx prisma generate
npm test
```

Linting is not configured yet (`yarn lint` will fail; ignore it).

Run the checks for every part you changed. See the [README](README.md) for local setup. Do not mix package managers: the frontend uses `yarn.lock`, the backend uses `package-lock.json`.

If you change user-facing docs, update both the page in `zec-bounties-frontend/app/docs/<slug>/page.tsx` and its mirror in `docs/<slug>.md`. Root files (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`) have no in-app mirror.

## What to put in the PR

- A short summary of what changed and why
- How you tested it
- Screenshots (or a short recording) for any UI change, ideally at mobile and desktop widths and in light and dark mode
- Bounty link, if you have one or plan to file one

A PR with no repro, no test notes, or a diff that does not match the description will be closed.

## Never commit secrets

Never commit `.env` files, API keys, tokens, wallet seed phrases, spending or viewing keys, or wallet data directories. Use placeholder values in examples and `.env.example`. If you commit a secret by mistake, tell a maintainer right away so it can be rotated. Removing it in a later commit is not enough.

## Security

Do not open a public issue or PR for security problems. Report them privately. See [SECURITY.md](SECURITY.md).

## Getting help

- ZecHub Discord (linked from https://zechub.wiki)
- [GitHub issues](https://github.com/ZecHub/zec-bounties/issues)
- [@ZecHub on X](https://x.com/ZecHub)
