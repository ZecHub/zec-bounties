# Application withdrawal PostgreSQL regression

Run from `zec-bounties-backend` with installed dependencies and the generated Prisma client:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/bounty_test' node --test tests/application-withdrawal-postgres.test.js
```

Use a disposable local database whose name contains `test`. The supplied database user needs permission to create and drop schemas. The test creates a unique schema, applies the actual repository Prisma schema and drops its schema in `finally`. It does not use the application's production database. Without `TEST_DATABASE_URL`, this integration test is explicitly skipped; supply it when verifying this correction.

The fixture loads the actual apply, administrator review and applicant withdrawal handlers, the real bounty helpers and Prisma. It creates applications through the supported apply handler with valid database users and bounties. Each race pauses after a real pending-application SQL read, then verifies a completed review or another withdrawal using an independent database client before resuming the older request.

Coverage includes acceptance and rejection before deletion, duplicate withdrawals, ordinary pending withdrawal, sequential reviewed applications, a missing application and another applicant. Assertions inspect persisted application review metadata, bounty status, assignees, returned responses, cache invalidations and realtime events. The integration tests use local recorders for cache, notification and websocket effects; authentication middleware and full HTTP transport are outside their scope. No existing frontend withdrawal button is assumed.
