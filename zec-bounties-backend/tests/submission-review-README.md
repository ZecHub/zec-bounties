# Concurrent submission review regression tests

Use a **disposable PostgreSQL database** with the backend Prisma schema. The test
requires an explicit URL and never falls back to `DATABASE_URL`:

```sh
DATABASE_URL="$TEST_DB_URL" npx prisma db push
SUBMISSION_REVIEW_TEST_DATABASE_URL="$TEST_DB_URL" npm test
```

Without `SUBMISSION_REVIEW_TEST_DATABASE_URL`, the database suite is explicitly
skipped. Fixtures have unique IDs and are removed after the run.

The harness executes the real review route and authorization helper, with real
Prisma clients on separate connections. Authentication middleware, cache, socket,
mail and notification services are substituted; this is not a full HTTP/auth test.

The concurrency tests pause actual database reads to force stale snapshots:

- An approval commits before a concurrent rejection/revision decision resumes.
  Upstream overwrites DONE with the earlier IN_REVIEW status, even though approved
  work remains. The corrected route retries a real PostgreSQL serialization
  conflict, rereads the bounty, and preserves DONE and its completion metadata.
- Two rejections each read the other entry as still pending. The retried one
  sees that nothing waits and nobody is assigned, so the bounty is cancelled
  instead of left In Review or In Progress with nobody on it.
- Two reviewers decide the same pending entry. The retried one sees the first
  decision and gets 409 instead of overwriting it.

The sequential cases pin the status rule after a rejection or revision: a DONE
bounty stays DONE, and a bounty with another approved entry keeps its current
status. Otherwise an entry still pending keeps the bounty In Review, a revision
returns it to In Progress, and a rejection returns it to In Progress while
assignees remain and cancels it when nobody is left. Removing the last assignee
of an In Progress bounty cancels it the same way. Reviewing an entry that is no
longer pending, any entry of a cancelled bounty, or rejecting or revising the
winner's own entry on a DONE bounty returns 409 and changes nothing.

Controls cover reverse commit order, sequential reviews, roster changes, review
metadata, global/team authorization, missing submissions and invalid status.
Injected failures after all writes verify real transaction rollback, bounded
P2034 retries, no retry for other errors, and no external success effects on failure.
Successful retries emit one pair of socket events, after commit.

These tests establish review-to-review consistency for the tested interleavings.
They do not redefine review policy, repair historical inconsistent rows, test
production load, or guarantee ordering of socket events from separate requests.
