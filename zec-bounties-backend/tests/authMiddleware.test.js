const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const prisma = require("../prisma/client");
const {
  authenticate,
  isAdmin,
  optionalAuthenticate,
  signSessionToken,
  extractBearerToken,
} = require("../middleware/auth");

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

test("extractBearerToken: accepts case-insensitive Bearer tokens and rejects non-Bearer or malformed headers", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("bearer   abc.def.ghi  "), "abc.def.ghi");
  assert.equal(extractBearerToken("BEARER tok123"), "tok123");

  for (const bad of [
    undefined,
    null,
    "",
    "Bearer",
    "Bearer   ",
    "Basic abc.def.ghi",
    "Token abc.def.ghi",
    "Bearer tok1 tok2",
    "abc.def.ghi",
  ]) {
    assert.equal(extractBearerToken(bad), null, `expected null for ${String(bad)}`);
  }
});

test("authenticate and signSessionToken: read JWT_SECRET dynamically after module load", async () => {
  const prevSecret = process.env.JWT_SECRET;
  const originalFindUnique = prisma.user.findUnique;
  process.env.JWT_SECRET = "dynamic-secret-run73";

  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    role: "HUNTER",
    isRobin: false,
  });

  try {
    const token = signSessionToken({ id: "u-dyn", role: "HUNTER" });
    const req = { headers: { authorization: `bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, "u-dyn");
  } finally {
    prisma.user.findUnique = originalFindUnique;
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }
});

test("authenticate: rejects non-Bearer Authorization scheme with 401 Unauthorized", async () => {
  const prevSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "scheme-secret-run73";
  const token = jwt.sign({ id: "u1", role: "HUNTER" }, process.env.JWT_SECRET);

  try {
    const req = { headers: { authorization: `Basic ${token}` } };
    const res = mockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body, "Unauthorized");
  } finally {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }
});

test("isAdmin: returns 403 instead of throwing when req.user is missing", () => {
  const req = {};
  const res = mockRes();
  let nextCalled = false;

  isAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Admins only" });
});

test("optionalAuthenticate: accepts lowercase bearer scheme and ignores non-Bearer headers", async () => {
  const prevSecret = process.env.JWT_SECRET;
  const originalFindUnique = prisma.user.findUnique;
  process.env.JWT_SECRET = "opt-secret-run73";
  const token = jwt.sign({ id: "u-opt", role: "CLIENT" }, process.env.JWT_SECRET);

  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    role: "CLIENT",
  });

  try {
    const reqBearer = { headers: { authorization: `bearer ${token}` } };
    let next1 = false;
    await optionalAuthenticate(reqBearer, mockRes(), () => {
      next1 = true;
    });
    assert.equal(next1, true);
    assert.equal(reqBearer.user.id, "u-opt");

    const reqBasic = { headers: { authorization: `Basic ${token}` } };
    let next2 = false;
    await optionalAuthenticate(reqBasic, mockRes(), () => {
      next2 = true;
    });
    assert.equal(next2, true);
    assert.equal(reqBasic.user, undefined);
  } finally {
    prisma.user.findUnique = originalFindUnique;
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }
});
