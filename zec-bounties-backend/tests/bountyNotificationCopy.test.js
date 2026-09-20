const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isReservedBounty,
  buildBountyNotificationCopy,
} = require("../helpers/bountyNotificationCopy");

// A HUNTER creates a bounty and self-assigns (routes/bounties.js:365-372).
const reservedBounty = {
  id: "b1",
  title: "Make Play All continue through the Distributed Databases visualizer",
  bountyAmount: 150,
  assignee: "hunter-1",
  formattedDescription: "<p>desc</p>",
  timeToComplete: "2026-10-01",
};

// An ADMIN creates an unassigned bounty — anyone onboarded may apply.
const openBounty = {
  id: "b2",
  title: "Fix the ZEC price ticker",
  bountyAmount: 50,
  assignee: null,
  formattedDescription: "<p>desc</p>",
  timeToComplete: "2026-10-01",
};

test("reserved detection follows the assignee that POST /apply gates on", () => {
  assert.equal(isReservedBounty(reservedBounty), true);
  assert.equal(isReservedBounty(openBounty), false);
  assert.equal(isReservedBounty(null), false);
});

test("reserved bounty is not advertised as available", () => {
  const copy = buildBountyNotificationCopy(reservedBounty, "hunterone");

  assert.equal(copy.reserved, true);
  assert.equal(copy.push.title, "New Bounty Created");
  assert.notEqual(copy.push.title, "New Bounty Available");
  assert.match(copy.push.body, /no other applicants/);
  assert.doesNotMatch(copy.push.body, /ZEC$/);

  assert.match(copy.email.subject, /\(reserved\)/);
  assert.match(copy.email.text, /not accepting other applicants/);
  assert.doesNotMatch(
    copy.email.html,
    /open to applicants/,
    "a reserved bounty must not carry an apply call-to-action",
  );
});

test("open bounty keeps the original claimable copy", () => {
  const copy = buildBountyNotificationCopy(openBounty, "adminuser");

  assert.equal(copy.reserved, false);
  assert.equal(copy.push.title, "New Bounty Available");
  assert.equal(copy.push.body, "Fix the ZEC price ticker — 50 ZEC");
  assert.equal(copy.email.subject, "New Bounty Created: Fix the ZEC price ticker");
  assert.match(copy.email.text, /A new bounty has been created/);
  assert.match(copy.email.html, /open to applicants/);
});

test("open bounty copy is byte-identical to the pre-fix strings", () => {
  const copy = buildBountyNotificationCopy(openBounty, "adminuser");

  assert.equal(
    copy.email.text,
    `A new bounty has been created.\n\nCreated by: adminuser\n\nTitle: ${openBounty.title}\nAmount: ${openBounty.bountyAmount}`,
  );
  assert.match(copy.email.html, /<h2>New Bounty Created<\/h2>/);
  assert.match(copy.email.html, /<p><strong>Amount:<\/strong> 50 ZEC<\/p>/);
});