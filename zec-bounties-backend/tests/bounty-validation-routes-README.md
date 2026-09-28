# Bounty validation route regressions

Run `npm test` from `zec-bounties-backend`. Tests exercise the real general
create, team create and edit handlers with the shared validators, replacing
authentication, persistence and outbound integrations with local fixtures.
They verify rejected input produces no write or notification, and that accepted
numeric strings are normalized. Existing deadlines do not block partial edits
that omit the deadline field.

The PostgreSQL checks require an explicit disposable database:

```sh
npx prisma generate
DATABASE_URL="$BOUNTY_VALIDATION_TEST_DATABASE_URL" npx prisma db push
npm test
```

Set `BOUNTY_VALIDATION_TEST_DATABASE_URL` explicitly before these commands; the
test never falls back to the application's `DATABASE_URL`. It creates unique
fixtures and deletes only those fixtures. These checks prove invalid amounts
do not reach persisted rows, optional categories remain nullable, and accepted
string amounts/dates survive real Prisma writes. They do not test real HTTP
authentication, notifications or wallets. Without the variable, this test is
reported as skipped.
