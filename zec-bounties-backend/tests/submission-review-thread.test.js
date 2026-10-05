const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
const prisma = require("../prisma/client");
const router = require("../routes/submissionReview");

const users = {
  reviewer: { id: "reviewer", name: "Reviewer", role: "ADMIN" },
  creator: { id: "creator", name: "Creator", role: "CLIENT" },
  contributor: { id: "contributor", name: "Contributor", role: "HUNTER" },
  other: { id: "other", name: "Other", role: "HUNTER" },
};
const submissions = {
  first: { id: "first", submittedBy: "contributor", bounty: { id: "bounty-1", createdBy: "creator", teamId: null } },
  second: { id: "second", submittedBy: "other", bounty: { id: "bounty-2", createdBy: "creator", teamId: null } },
};
const messages = [];
let sequence = 0;
let contributorAssigned = true;

prisma.user.findUnique = async ({ where }) => users[where.id] || null;
prisma.workSubmission.findUnique = async ({ where }) => submissions[where.id] || null;
prisma.bountyAssignee.findUnique = async ({ where }) => contributorAssigned &&
  where.bountyId_userId.bountyId === "bounty-1" &&
  where.bountyId_userId.userId === "contributor" ? { id: "assignment" } : null;
prisma.submissionReviewMessage = {
  create: async ({ data }) => {
    const id = String(++sequence).padStart(4, "0");
    const message = {
      id, ...data, createdAt: new Date("2026-10-05T12:00:00Z"),
      author: { id: data.authorId, name: users[data.authorId].name, nickname: null, avatar: null },
    };
    messages.push(message);
    return message;
  },
  findMany: async ({ where, orderBy }) => {
    assert.deepEqual(orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
    return messages.filter((message) => message.submissionId === where.submissionId)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  },
};

const app = express();
app.use(express.json());
app.use("/api/bounties/submissions", router);

test("submission review thread enforces access, persistence, validation, and order", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/bounties/submissions`;
  const call = async (id, method, user, body) => {
    const response = await fetch(`${base}/${id}/review-thread`, {
      method,
      headers: {
        ...(user && { Authorization: `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET)}` }),
        ...(body && { "Content-Type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  };

  try {
    assert.equal((await call("first", "GET", null)).status, 401);
    assert.equal((await call("first", "POST", null, { body: "No" })).status, 401);
    assert.equal((await call("first", "POST", "other", { body: "No" })).status, 403);
    assert.equal((await call("first", "GET", "other")).status, 403);
    assert.equal((await call("second", "GET", "contributor")).status, 403);
    assert.equal((await call("second", "POST", "contributor", { body: "No" })).status, 403);
    assert.equal((await call("first", "POST", "reviewer", { body: "   " })).status, 400);
    assert.equal((await call("first", "POST", "reviewer", { body: 42 })).status, 400);
    assert.equal((await call("first", "POST", "reviewer", { body: "x".repeat(5001) })).status, 400);

    const feedback = await call("first", "POST", "reviewer", { body: " Please add tests. " });
    assert.equal(feedback.status, 201);
    assert.equal(feedback.data.body, "Please add tests.");
    const reply = await call("first", "POST", "contributor", { body: "Tests added." });
    assert.equal(reply.status, 201);
    assert.equal(reply.data.authorId, "contributor");

    const history = await call("first", "GET", "contributor");
    assert.equal(history.status, 200);
    assert.deepEqual(history.data.map(({ body }) => body), ["Please add tests.", "Tests added."]);
    assert.ok(history.data.every(({ submissionId }) => submissionId === "first"));
    assert.deepEqual((await call("second", "GET", "reviewer")).data, []);
    assert.equal((await call("second", "POST", "creator", { body: "Creator feedback" })).status, 201);
    assert.deepEqual((await call("second", "GET", "creator")).data.map(({ body }) => body), ["Creator feedback"]);
    assert.deepEqual((await call("first", "GET", "reviewer")).data.map(({ body }) => body), ["Please add tests.", "Tests added."]);
    contributorAssigned = false;
    assert.equal((await call("first", "GET", "contributor")).status, 200);
    assert.equal((await call("first", "POST", "contributor", { body: "No longer assigned" })).status, 403);
  } finally {
    server.close();
  }
});
