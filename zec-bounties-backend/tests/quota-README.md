# Weekly bounty quota regression tests

From `zec-bounties-backend`, run `npm ci` and `npm test`. The unit/route tests
cover quota responses, administrator exemption, bounded serialization retries,
other database errors, tier overrides and notifications. They replace external
services with local test doubles and never load the application's environment.

The PostgreSQL test is opt-in. Point `QUOTA_TEST_DATABASE_URL` at a **disposable
test database**, generate the Prisma client, and apply this repository's schema:

```sh
npx prisma generate
DATABASE_URL="$QUOTA_TEST_DATABASE_URL" npx prisma db push
npm test
```

Set the test variable explicitly; the test never falls back to `DATABASE_URL`.
It creates uniquely identified users, teams and bounties and removes its own
fixtures in cleanup. It does not start the application, send notifications,
access wallets, or make production requests.

The integration test uses two independent Prisma clients. A barrier after each
request's first real quota count forces both requests to see the same available
slot. PostgreSQL must serialize the check and insert; the losing request retries
and returns the ordinary 429 quota response. The test exercises the general,
team and mixed routes, both quota tiers, two available Gold slots, and rollback
of a failed nested assignment write. Without the fix, each last-slot scenario
returns two 201 responses. The default unit-only run explicitly reports the
PostgreSQL test as skipped when no test database is configured.
