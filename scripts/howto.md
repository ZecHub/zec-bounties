# Access audit

Checks ZEC Bounties for unauthenticated access and privacy leaks.

- **UI** — real Chromium. Client-side redirects to `/login` count as private.
- **API** — plain HTTP. 401/403 is private. Reachable without a token is public.
- **Leaks** — compares `/api/users/:id/public` flags to what the leaderboard and bounty list actually return.

Public = red. Private = green. Leaks and mismatches fail the run (exit 1).

## Setup

```bash
npm i -D playwright
npx playwright install chromium
```

Put the script at `scripts/access-audit.mjs`.

## Run locally

```bash
FRONTEND=http://localhost:3000 BACKEND=http://localhost:9000 node scripts/access-audit.mjs
```

## Run against production

```bash
FRONTEND=https://bounties.zechub.wiki BACKEND=https://zechub.zone node scripts/access-audit.mjs
```

## Output

Writes `access-audit.html` in the current directory. Open it in a browser.

Terminal also prints a summary and any mismatches.

## What a leak looks like

The script fetches the leaderboard, then each user’s public profile. If a flag is off but the list still returns the field, that row is a leak:

- `showDisplayName` false but name is not `Anonymous contributor`
- `showAvatar` false but avatar is present
- `showCompleted` false but `completed` is a number
- `showEarnings` false but `earned` is a number
- `points` present when completed or earned is hidden

Same check for `createdByUser` and `assigneeUser` on `/api/bounties`.

## CI

The script exits 1 on any mismatch or leak. Upload `access-audit.html` as an artifact so a failed run is readable.

```yaml
- run: npm i -D playwright && npx playwright install chromium --with-deps
- run: FRONTEND=http://localhost:3000 BACKEND=http://localhost:9001 node scripts/access-audit.mjs
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: access-audit
    path: access-audit.html
```

Start the frontend and backend before the audit step. Adjust ports and env to match your setup.
