const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret-key-123";
const SECRET = process.env.JWT_SECRET;

const prisma = require("../prisma/client");
const { authenticate, isAdmin, loadAuthUser } = require("../middleware/auth");

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    send(body) {
      res.body = body;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test("authenticate: returns 401 when Authorization header is missing", async () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  await authenticate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body, "Unauthorized");
});

test("authenticate: returns 401 when token is invalid", async () => {
  const req = { headers: { authorization: "Bearer invalid.jwt.token" } };
  const res = mockRes();
  let nextCalled = false;

  await authenticate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body, "Invalid token");
});

test("authenticate: returns 401 User not found when user does not exist in DB", async () => {
  const token = jwt.sign({ id: "non-existent-user", role: "CLIENT" }, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => null;

  try {
    await authenticate(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body, "User not found");
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("authenticate: loads current database user role, ignoring stale JWT role", async () => {
  const token = jwt.sign({ id: "user-123", role: "CLIENT" }, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const dbUser = {
    id: "user-123",
    email: "test@example.com",
    role: "HUNTER",
    isRobin: false,
  };

  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async ({ where, select }) => {
    assert.equal(where.id, "user-123");
    assert.equal(select.password, undefined);
    assert.equal(select.role, true);
    return dbUser;
  };

  try {
    await authenticate(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.user.id, "user-123");
    assert.equal(req.user.role, "HUNTER");
    assert.equal(req.user.password, undefined);
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("authenticate: ADMIN JWT is not authorized after DB role drop", async () => {
  const token = jwt.sign({ id: "user-admin", role: "ADMIN" }, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();

  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({
    id: "user-admin",
    role: "HUNTER",
    isRobin: false,
  });

  try {
    await authenticate(req, res, () => {});
    assert.equal(req.user.role, "HUNTER");

    let nextCalled = false;
    isAdmin(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Admins only" });
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("isAdmin: permits ADMIN and rejects non-ADMIN", () => {
  const adminReq = { user: { role: "ADMIN" } };
  let adminNext = false;
  isAdmin(adminReq, {}, () => {
    adminNext = true;
  });
  assert.equal(adminNext, true);

  const hunterReq = { user: { role: "HUNTER" } };
  const res = mockRes();
  let hunterNext = false;
  isAdmin(hunterReq, res, () => {
    hunterNext = true;
  });
  assert.equal(hunterNext, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Admins only" });
});

test("loadAuthUser: does not request password", async () => {
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async ({ select }) => {
    assert.equal(select.password, undefined);
    assert.equal(select.id, true);
    assert.equal(select.role, true);
    return { id: "u1", role: "TEAM" };
  };
  try {
    const user = await loadAuthUser("u1");
    assert.equal(user.role, "TEAM");
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});
