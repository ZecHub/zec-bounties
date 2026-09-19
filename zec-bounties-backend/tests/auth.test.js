const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret-key-123";
const SECRET = process.env.JWT_SECRET;

const prisma = require("../prisma/client");
const { authenticate, isAdmin } = require("../middleware/auth");

test("authenticate: returns 401 when Authorization header is missing", async () => {
  const req = { headers: {} };
  let statusSent, bodySent;
  const res = {
    status: (s) => {
      statusSent = s;
      return { send: (b) => { bodySent = b; } };
    },
  };
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusSent, 401);
  assert.strictEqual(bodySent, "Unauthorized");
});

test("authenticate: returns 401 when token is invalid", async () => {
  const req = { headers: { authorization: "Bearer invalid.jwt.token" } };
  let statusSent, bodySent;
  const res = {
    status: (s) => {
      statusSent = s;
      return { send: (b) => { bodySent = b; } };
    },
  };
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusSent, 401);
  assert.strictEqual(bodySent, "Invalid token");
});

test("authenticate: returns 401 User not found when user does not exist in DB", async () => {
  const token = jwt.sign({ id: "non-existent-user", role: "CLIENT" }, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let statusSent, bodySent;
  const res = {
    status: (s) => {
      statusSent = s;
      return { send: (b) => { bodySent = b; } };
    },
  };
  let nextCalled = false;

  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => null;

  try {
    await authenticate(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSent, 401);
    assert.strictEqual(bodySent, "User not found");
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("authenticate: loads current database user role, updating stale JWT role", async () => {
  const token = jwt.sign({ id: "user-123", role: "CLIENT" }, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let nextCalled = false;
  const res = { status: () => ({ send: () => {} }) };

  const dbUser = {
    id: "user-123",
    email: "test@example.com",
    role: "HUNTER",
    isRobin: false,
  };

  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async ({ where }) => {
    assert.strictEqual(where.id, "user-123");
    return dbUser;
  };

  try {
    await authenticate(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.user.id, "user-123");
    assert.strictEqual(req.user.role, "HUNTER");
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("isAdmin: permits ADMIN and rejects non-ADMIN", () => {
  const adminReq = { user: { role: "ADMIN" } };
  let adminNext = false;
  isAdmin(adminReq, {}, () => { adminNext = true; });
  assert.strictEqual(adminNext, true);

  const hunterReq = { user: { role: "HUNTER" } };
  let statusSent, bodySent;
  const res = {
    status: (s) => {
      statusSent = s;
      return { send: (b) => { bodySent = b; } };
    },
  };
  let hunterNext = false;
  isAdmin(hunterReq, res, () => { hunterNext = true; });
  assert.strictEqual(hunterNext, false);
  assert.strictEqual(statusSent, 403);
  assert.strictEqual(bodySent, "Admins only");
});
