# Contributing to ZEC Bounties

Thanks for helping build ZEC Bounties. Work on this repo is paid through the platform itself, so the process starts there, not on GitHub.

## 1. Propose the work first

1. Check the board at https://bounties.zechub.wiki for an existing bounty. New bounties are posted every Monday.
2. If the work is not listed, create a bounty with **New Bounty**: a clear title, description, acceptance criteria and a ZEC amount picked from the [Bounty amounts](docs/bounty-amounts.md) intervals.
3. **Wait for an admin to approve it before you start.** A new bounty stays in To Do with approval pending until then. See [Task statuses](docs/task-statuses.md).
4. Set a shielded Unified Address in your Profile so you can be paid — see [Addresses](docs/addresses.md).

Work started on an unapproved bounty may not be accepted or paid.

## 2. One PR per bounty

- Fork the repo and branch from `main`.
- Open one pull request per bounty, against `main`.
- Keep the PR to the bounty's scope. Unrelated fixes go in their own bounty and PR.

## 3. Branch and commit naming

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

## 4. Check your work before opening the PR

Frontend (`zec-bounties-frontend/`, uses Yarn):

```bash
yarn lint
yarn build
yarn test:a11y
```

Backend (`zec-bounties-backend/`, uses npm):

```bash
npm test
```

Run the checks for every part you changed. See the [README](README.md) for local setup. Do not mix package managers: the frontend uses `yarn.lock`, the backend uses `package-lock.json`.

If you change user-facing docs, update both the page in `zec-bounties-frontend/app/docs/<slug>/page.tsx` and its mirror in `docs/<slug>.md`.

## 5. What to put in the PR

- A link to the approved bounty on https://bounties.zechub.wiki
- A short summary of what changed and why
- Screenshots (or a short recording) for any UI change, ideally at mobile and desktop widths and in light and dark mode
- How you tested it

After the PR is merged, submit the PR link as your deliverable on the bounty.

## 6. Never commit secrets

Never commit `.env` files, API keys, tokens, wallet seed phrases, spending or viewing keys, or wallet data directories. Use placeholder values in examples and `.env.example`. If you commit a secret by mistake, tell a maintainer right away so it can be rotated — removing it in a later commit is not enough.

## Getting help

- ZecHub Discord (linked from https://zechub.wiki)
- [GitHub issues](https://github.com/ZecHub/zec-bounties/issues)
- [@ZecHub on X](https://x.com/ZecHub)
