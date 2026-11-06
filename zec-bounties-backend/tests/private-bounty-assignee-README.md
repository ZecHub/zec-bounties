# Private bounty assignee visibility

`POST /:id/assignees` does not require team membership, so a hunter outside a
private team can be assigned to one of its bounties. That assignee must be able
to read the bounty (`GET /:id`, `GET /:id/assignees`), find it in `GET /`, and
receive its realtime events. Users who are neither the creator, an admin, a
team member nor an assignee must still get 404.

`private-bounty-assignees.test.js` runs with `npm test` and needs no database.
It covers `GET /:id`, `GET /:id/assignees` and the broadcast audience; the
`GET /` filter is left to the PostgreSQL test.
`private-bounty-assignee-postgres.test.js` loads the actual routes and helpers
on real Prisma queries, so the `GET /` filter is checked by PostgreSQL itself.
It covers an assignee added through `POST /:id/assignees`, the legacy
`assignee` column on its own, `PUT /:id` moving an assigned bounty into a
private team, and access ending when the assignee is removed. Cache, mail,
Discord and websocket delivery are replaced with local recorders.

From `zec-bounties-backend`, run against an existing disposable local database
whose name includes `test`:

```sh
TEST_DATABASE_URL='postgresql://test_user:test_password@127.0.0.1:5432/bounties_test' \
  node --test tests/private-bounty-assignee-postgres.test.js
```

The database account needs permission to create and drop schemas. The test
creates its own schema from the checked-in Prisma schema and drops it in
cleanup. Without `TEST_DATABASE_URL` it is skipped.
