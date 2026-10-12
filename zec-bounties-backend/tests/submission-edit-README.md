# Atomic submission edits

Run `npm test` in `zec-bounties-backend`. The concurrency integration tests require
an explicitly configured disposable PostgreSQL database with the Prisma schema:

```sh
# Set SUBMISSION_EDIT_TEST_DATABASE_URL to the disposable database first.
npx prisma generate
DATABASE_URL="$SUBMISSION_EDIT_TEST_DATABASE_URL" npx prisma db push
npm test
```

The tests never fall back to the application's `DATABASE_URL`. They create
UUID-scoped fixtures and delete only those fixtures. Without the dedicated
variable, the integration suite reports a skip.

The real edit handler runs with two independent Prisma clients. After the edit's
eligibility read, the second client commits an approval or bounty status change
before the edit writes. Assertions verify a conflict response, preservation of
approved content and review fields, rollback of revision edits on completed or
cancelled bounties, and no outgoing notifications on conflicts. A newer review
with the same needs_revision status also invalidates the old edit. Controls
cover valid pending/revision edits, the 15-minute window, ownership and missing
records. Five race cases fail against the unchanged upstream handler.

Authentication, caches and outbound services are substituted. These checks do
not exercise HTTP authentication, a browser, or a real wallet. Review policy and
reviewer UI freshness are outside this change: the guard prevents an edit based
on old eligibility from overwriting a review that already committed.
