const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  hideOtherUsersEmails,
  withoutOtherUsersEmails,
} = require("../middleware/hideOtherUsersEmails");

// Shaped like a team bounty response: creator, assignees, applicants and an
// activity actor, each a user row with an email.
function bountyPayload() {
  return {
    id: "bounty-1",
    title: "Fix the docs",
    createdByUser: { id: "creator", name: "Creator", email: "c@example.com" },
    assigneeUser: {
      id: "hunter",
      email: "h@example.com",
      z_address: "zs1hunter",
    },
    assignees: [{ user: { id: "hunter", email: "h@example.com" } }],
    applications: [
      { id: "app-1", applicantUser: { id: "other", email: "o@example.com" } },
    ],
    activity: [{ type: "APPROVED", actor: { id: "admin", email: "a@x.org" } }],
  };
}

function emailsIn(value, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === "email") found.push(child);
    emailsIn(child, found);
  }
  return found;
}

test("a signed-in user keeps their own email and loses everyone else's", () => {
  const out = withoutOtherUsersEmails(bountyPayload(), "hunter");
  assert.deepEqual(emailsIn(out), ["h@example.com", "h@example.com"]);
  assert.equal(out.assigneeUser.z_address, "zs1hunter");
  assert.equal(out.title, "Fix the docs");
});

test("an anonymous caller gets no emails at all", () => {
  assert.deepEqual(emailsIn(withoutOtherUsersEmails(bountyPayload())), []);
});

test("non-object bodies pass through unchanged", () => {
  assert.equal(withoutOtherUsersEmails("ok", "hunter"), "ok");
  assert.equal(withoutOtherUsersEmails(null, "hunter"), null);
});

// The filter is mounted before the router, so it must read req.user at send
// time, after the route's own auth middleware has run.
async function request(user) {
  const app = express();
  const router = express.Router();
  router.get("/", (req, res) => {
    req.user = user;
    res.json(bountyPayload());
  });
  router.get("/send", (req, res) => {
    req.user = user;
    res.send(bountyPayload());
  });
  app.use("/api/bounties", hideOtherUsersEmails, router);

  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/bounties`;
    const [json, send] = await Promise.all(
      [base, `${base}/send`].map((url) => fetch(url).then((r) => r.json())),
    );
    return { json, send };
  } finally {
    server.close();
  }
}

test("a hunter sees only their own email, through res.json and res.send", async () => {
  const { json, send } = await request({ id: "hunter", role: "HUNTER" });
  assert.deepEqual(emailsIn(json), ["h@example.com", "h@example.com"]);
  assert.deepEqual(emailsIn(send), ["h@example.com", "h@example.com"]);
});

test("a team user sees no other user's email", async () => {
  const { json } = await request({ id: "creator", role: "TEAM" });
  assert.deepEqual(emailsIn(json), ["c@example.com"]);
});

test("an admin still sees every email", async () => {
  const { json } = await request({ id: "admin", role: "ADMIN" });
  assert.equal(emailsIn(json).length, 5);
});
