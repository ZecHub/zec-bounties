const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSubmissionRoute } = require("./helpers/submissionHarness");
const { loadSubmissionEditRoute } = require("./helpers/submissionEditHarness");

// Any database access means the request got past validation.
const untouchedDb = new Proxy({}, {
  get(_, name) {
    return () => { throw new Error(`database reached: ${String(name)}`); };
  },
});

const hunter = { id: "hunter", role: "HUNTER" };

const badBodies = [
  ["numeric description", { description: 123 }],
  ["array description", { description: ["Done"] }],
  ["array of links", { description: "Done", deliverableUrl: ["https://a.example", "https://b.example"] }],
  ["numeric link", { description: "Done", deliverableUrl: 42 }],
];

for (const [label, body] of badBodies) {
  test(`submit: ${label} is a 400 and never reaches the database`, async () => {
    const route = loadSubmissionRoute(untouchedDb);
    const res = await route.submit(hunter, "bounty", body);
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
    assert.equal(route.effects.broadcasts.length, 0);
  });

  test(`edit submission: ${label} is a 400 and never reaches the database`, async () => {
    const route = loadSubmissionEditRoute(untouchedDb);
    const res = await route.edit(hunter, "submission", body);
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
    assert.equal(route.effects.broadcasts.length, 0);
  });
}
