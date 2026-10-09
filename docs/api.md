# API

The site talks to a separate backend. These are the methods a hunter, creator, or integrator actually needs. Admin wallet and payout routes exist, but they are not a public integration surface.

Production base: `https://zechub.zone`

Local base: `http://localhost:9000`

Send JSON. Authenticated methods take `Authorization: Bearer <jwt>`. The GitHub login flow sets that token. Do not put it in a query string.

## How to call it

Public read, no token:

```bash
curl -sS "https://zechub.zone/api/leaderboard?limit=25"
curl -sS "https://zechub.zone/api/users/<id-or-nickname>/public"
curl -sS "https://zechub.zone/api/bounties"
```

Authenticated write:

```bash
curl -sS -X POST "https://zechub.zone/api/bounties/apply" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bountyId":"<id>","message":"I can take this."}'
```

Chain query values are `MAIN`, `TEST`, and `ALL`. Non-MAIN on the public leaderboard returns 403 unless the caller is an admin.

## Auth

Mounted at `/auth`, not `/api`.

| Method | Path | Auth | Use |
|--------|------|------|-----|
| GET | `/auth/github` | no | Start GitHub login |
| GET | `/auth/github/callback` | no | OAuth callback |
| GET | `/auth/discord` | no | Start Discord connect |
| GET | `/auth/discord/callback` | no | Discord callback |
| DELETE | `/auth/discord` | yes | Disconnect Discord |
| GET | `/auth/verify` | no | Check a session token |
| GET | `/auth/me` | session | Current user |
| PATCH | `/auth/update-nickname` | yes | Set nickname |
| PATCH | `/auth/select-role` | yes | Hunter or team at onboarding |
| PATCH | `/auth/update-ua-address` | yes | Register payout UA |
| PATCH | `/auth/update-zaddress` | yes | Register shielded address |
| POST | `/auth/verify-uaddress` | yes | Check a UA before saving |
| POST | `/auth/verify-zaddress` | yes | Check a z-address before saving |
| PATCH | `/auth/update-email-notifications` | yes | Email toggle |
| POST | `/auth/recovery/request-otp` | yes | Account recovery |
| POST | `/auth/recovery/verify-otp` | yes | Account recovery |

Never send a seed phrase or spending key. Payouts use the registered receive address only. See [Privacy & payments](privacy-payments.md).

## Public and optional-auth reads

| Method | Path | Auth | Use |
|--------|------|------|-----|
| GET | `/api/leaderboard` | optional | Hunter ranks. Query: `timeRange=all\|30d\|90d`, `chain`, `limit` (max 100) |
| GET | `/api/users/:idOrNickname/public` | optional | Privacy-filtered profile. Owner or admin may pass `?full=1` |
| GET | `/api/bounties` | optional | Open board. Private team bounties are filtered for non-admins |
| GET | `/api/bounties/categories` | no | Category list |
| GET | `/api/teams/:teamId/overview` | optional | Public team overview |

`GET /api/users/:idOrNickname/public` is the privacy boundary. Flags live on `profileVisibility`. Missing keys are false, except `showAvatar` and `showDisplayName`, which default true.

| Flag | Default | Hidden means |
|------|---------|----------------|
| `showDisplayName` | true | `displayName` is `Anonymous contributor`; `name` and `nickname` omitted |
| `showAvatar` | true | `avatar` omitted |
| `showCompleted` | false | completed and submitted counts omitted |
| `showEarnings` | false | `totalEarned` omitted |
| `showCreated` | false | created count omitted |
| `showCompletionRate` | false | rate omitted |
| `showRecentBounties` | false | recent bounty lists omitted |
| `showBio` | false | bio omitted |
| `showBadges` | false | badges omitted |
| `showRole` | false | role omitted |
| `showGithub` | false | GitHub id omitted |
| `showAddressType` | false | address type omitted |
| `showMemberSince` | false | join date omitted |

Owner and admin viewers still receive the private block. Everyone else gets the filtered object.

## Signed-in hunter and creator methods

All require a bearer token.

| Method | Path | Use |
|--------|------|-----|
| POST | `/api/bounties/apply` | Apply to a bounty |
| GET | `/api/bounties/my-applications` | Your applications |
| POST | `/api/bounties/:id/submit` | Submit work |
| GET | `/api/bounties/my-submissions` | Your submissions |
| PATCH | `/api/bounties/:id/status` | Move status when you are allowed to |
| GET | `/api/bounties/:id/submissions` | Submissions on a bounty you can see |
| GET | `/api/bounties/:bountyId/applications` | Applications on a bounty you can review |
| PUT | `/api/bounties/applications/:applicationId` | Accept or reject an application |
| POST | `/api/bounties` | Create a bounty |
| POST | `/api/bounties/:id/assignees` | Assign a hunter |
| DELETE | `/api/bounties/:id/assignees/:userId` | Remove an assignee |
| GET | `/api/users/me/profile-settings` | Your visibility flags |
| PATCH | `/api/users/me/profile` | Update bio and `profileVisibility` |
| GET | `/api/users/search` | Find a user you are allowed to assign |
| GET | `/api/kpis/top-contributors` | KPI board. Query: `timeRange`, `chain`, `rankBy=completed\|earned` |
| POST | `/api/notifications/push/subscribe` | Register a push endpoint |
| POST | `/api/notifications/push/unsubscribe` | Remove it |

Team membership, team wallet, and team verification routes are under `/api/teams` and require a token. They are for members of that team, not anonymous clients.

## Admin-only

These return 401 or 403 for a normal hunter. Do not build a public client against them.

- Bounty approval, unassigned queue, full user export, payment export
- `/api/kpis` badge edits and admin KPI reports
- `/api/transactions` balance, rescan, authorize-payment (claim-before-send). `mark-paid`, `pay`, and the batch/instant flag routes are removed
- `/api/zcash/info` and `/api/zcash/params/all`
- `GET /api/users/:idOrNickname/staff-bounties?chain=MAIN|TEST&openOffset=&historyOffset=` — open bounties and history (created, assigned, applied) for any user. Requires `authenticate` + `isAdmin` (role loaded from the database). 401 without a token. Non-admins get 403 JSON `{ error: "Admins only" }` before any user lookup. Lookup is id, then unique nickname, then name only when exactly one user has that name (409 if several). Pages of 100, with `openNextOffset` / `historyNextOffset` when more rows exist. Response omits email, payout addresses, github id, and description, and ignores `profileVisibility`.

## Security to consider

Treat the UI as a view, not a privacy control. A blurred name or a "Hidden Hunter" label does not mean the response was redacted.

- `GET /api/users/:idOrNickname/public` honors `profileVisibility`.
- `GET /api/leaderboard` does not. It is public, cached for about 60 seconds, and currently returns `id`, `name`, `nickname`, `avatar`, `completed`, `earned`, and `points` for hunters on the board. `points` is derived from `earned`, so hiding `earned` alone would still leak it. A fix has to redact before the cache write, or the cached body will keep serving the raw row.
- `GET /api/kpis/top-contributors` is authenticated. It nulls `totalEarned` unless `showEarnings` is true, and strips payout addresses for non-admins. It still returns name, nickname, avatar, and completed count. It is a different route from `/api/leaderboard`.
- Non-MAIN leaderboard queries are admin-only. Do not assume `chain=TEST` or `chain=ALL` works anonymously.
- Websocket events are a separate channel. An open change scopes those events and strips private user fields. HTTP responses are unchanged by that change. Do not assume a socket payload is as filtered as the public profile.
- CORS allows credentialed browser calls from the configured origins. A token in `localStorage` is readable by any script on the page. Do not paste a bearer token into a third-party site.
- Wallet import and pay routes can move funds. Call them only from an authenticated session you control. The API does not need, and must not receive, a seed.

If a response includes a field the public profile omits for that user, the endpoint is wrong. File it against the route, not the page that renders it.
