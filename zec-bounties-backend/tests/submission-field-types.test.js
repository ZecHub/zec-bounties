const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSubmissionRoute } = require("./helpers/submissionHarness");
const { loadSubmissionEditRoute } = require("./helpers/submissionEditHarness");
const { validateDeliverableUrl } = require("../utils/deliverableLinks");

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

for (const [label, deliverableUrl, error] of [
  ["non-http link", "javascript:alert(1)", "valid http:// or https:// URL"],
  ["more than five packed links", Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join(" "), "up to 5 deliverable links"],
]) {
  test(`submit: ${label} is a 400 and never reaches the database`, async () => {
    const route = loadSubmissionRoute(untouchedDb);
    const res = await route.submit(hunter, "bounty", { description: "Done", deliverableUrl });
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
    assert.match(res.body.error, new RegExp(error));
    assert.equal(route.effects.broadcasts.length, 0);
  });

  test(`edit submission: ${label} is a 400 and never reaches the database`, async () => {
    const route = loadSubmissionEditRoute(untouchedDb);
    const res = await route.edit(hunter, "submission", { description: "Done", deliverableUrl });
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
    assert.match(res.body.error, new RegExp(error));
    assert.equal(route.effects.broadcasts.length, 0);
  });
}

test("deliverable link validator accepts empty and boundary-valid values", () => {
  assert.equal(validateDeliverableUrl(null), null);
  assert.equal(validateDeliverableUrl("   "), null);
  assert.equal(validateDeliverableUrl(Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`).join(" ")), null);
  assert.equal(validateDeliverableUrl("https://example.com/a,https://example.com/b"), null);
  assert.equal(validateDeliverableUrl(Array(6).fill("https://example.com/same").join(" ")), null);
});
