const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSubmissionRoute } = require("./helpers/submissionHarness");

test("blank work and incomplete onboarding never reach the database", async () => {
  const route = loadSubmissionRoute({});
  const blank = await route.submit({ id: "hunter", role: "HUNTER" }, "bounty", { description: "  " });
  assert.equal(blank.statusCode, 400);
  assert.equal(blank.body.error, "Work description is required");
  const client = await route.submit({ id: "client", role: "CLIENT" }, "bounty");
  assert.equal(client.statusCode, 403);
  assert.match(client.body.error, /onboarding/);
  assert.equal(route.effects.broadcasts.length, 0);
  assert.equal(route.effects.invalidations.length, 0);
});

for (const [code, expectedAttempts] of [["P2034", 3], ["P2003", 1]]) {
  test(`${code} failure has bounded retries and no success side effects`, async () => {
    let attempts = 0;
    const route = loadSubmissionRoute({
      async $transaction() {
        attempts++;
        throw Object.assign(new Error("Database write failed"), { code });
      },
    });
    const response = await route.submit({ id: "hunter", role: "HUNTER" }, "bounty");
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error, "Failed to submit work");
    assert.equal(attempts, expectedAttempts);
    assert.equal(route.effects.broadcasts.length, 0);
    assert.equal(route.effects.invalidations.length, 0);
  });
}
