# Assignee replacement regression

`POST /:id/assignees` replaces the entire requested roster. Two overlapping
administrator requests must leave one complete requested roster, including an
empty roster when the last request clears it. They must not persist the union of
two requests or leave a cancelled bounty with a nonempty roster.

The integration test loads the actual route and bounty helper source and uses
real Prisma transactions against PostgreSQL. It pauses the first transaction
after its real deletion, starts the second request and observes PostgreSQL's
blocking relationship before releasing the first. An initially empty roster
also permits the unchanged implementation's second deletion to finish before
release; the final persisted roster remains the assertion in either case.
No SQL result or roster operation is fabricated. Request users are authenticated
administrator/team-owner fixtures; email, Discord, cache and websocket delivery
are replaced with local recorders. This does not exercise the HTTP/authentication
middleware stack or a deployed database.

From `zec-bounties-backend`, install the locked dependencies with `npm ci`, then
run against an existing disposable local database whose name includes `test`:

```sh
TEST_DATABASE_URL='postgresql://test_user:test_password@127.0.0.1:5432/bounties_test' \
  node --test tests/assignee-replacement-postgres.test.js
```

The database account needs permission to create and drop schemas. Each process
creates its own schema using the checked-in Prisma schema, then drops it in
cleanup. It never loads `.env` or uses `DATABASE_URL` as the test target. Without
`TEST_DATABASE_URL`, this integration test is explicitly skipped.

Four regressions cover competing replacements, clear/replace in both orders,
and replacement of an initially empty roster. Five controls cover both
sequential orders, a real team-owner membership, denied creator permission and
rollback on an invalid assignee. Every case preserves existing pending work.

The parent-row lock serializes competing whole-roster replacements; reading
status and the notification roster after that lock avoids stale state following
a wait. The separate single-assignee deletion, application, submission, review
and payment routes are outside this test's concurrency guarantee.
