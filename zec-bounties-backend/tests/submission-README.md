# Work-submission regression tests

`npm test` runs request-validation and retry-bound tests without a database.
The PostgreSQL suite is opt-in; it never falls back to `DATABASE_URL`.

Use a **disposable PostgreSQL database**, generate the pinned Prisma client,
and apply this checkout's schema before running:

```sh
npm ci --ignore-scripts
npx prisma generate
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/disposable' npx prisma db push
SUBMISSION_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/disposable' npm test
```

The harness executes the actual submission handler and onboarding guard.
Authentication, cache, and notifications are substituted; no real wallet,
email, Discord, or production database is used. This is not an HTTP/auth test.
Fixtures have unique IDs and cleanup only deletes this run's records.

Two separate Prisma clients force both eligibility reads to complete before
either request writes. On upstream `c2941ca`, one user's concurrent requests
both succeed and create two pending submissions. After the fix, one succeeds
and the other gets the existing duplicate-submission error. Different assigned
users still both succeed. Another schedule completes the bounty after the
eligibility read: upstream reopens it as IN_REVIEW; the fix retries from a fresh
snapshot, rejects the stale submission, and leaves it DONE.

Coverage also includes missing/unapproved/cancelled/completed bounties,
unassigned users, existing pending/approved/rejected work, rollback after a
failed bounty update, bounded serialization retries, and post-commit effects.
The existing assignment and resubmission policies are unchanged.
