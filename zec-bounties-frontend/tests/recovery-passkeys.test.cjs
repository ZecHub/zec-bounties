const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function b64urlHelper(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function loadRecoveryPasskeys({ apiImpl, startAuthImpl } = {}) {
  const filename = path.resolve(__dirname, "..", "lib/recovery-passkeys.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "./payout-passkeys") {
      return {
        api: apiImpl || (async () => ({})),
        b64url: b64urlHelper,
      };
    }
    if (specifier === "@simplewebauthn/browser") {
      return {
        startAuthentication: startAuthImpl || (async () => ({ id: "assertion-1" })),
      };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  };
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      require: customRequire,
      TextEncoder,
      crypto: crypto.webcrypto,
      Uint8Array,
      ArrayBuffer,
    },
    { filename },
  );
  return mod.exports;
}

test("signRecoveryApproval URL-encodes IDs, verifies SHA-256 challenge, and returns assertion", async () => {
  const teamId = "team/alpha?1";
  const approvalId = "req#2026/11";
  const payload = {
    approval: approvalId,
    team: teamId,
    requester: "alice",
    threshold: 2,
    approvers: ["alice", "bob"],
  };
  const message = JSON.stringify(payload);
  const challenge = crypto.createHash("sha256").update(message).digest("base64url");

  const apiCalls = [];
  let confirmedMsg = null;
  let authArgs = null;

  const { signRecoveryApproval } = loadRecoveryPasskeys({
    apiImpl: async (url, init) => {
      apiCalls.push({ url, init });
      return { challengeId: "ch-rec-1", message, options: { challenge } };
    },
    startAuthImpl: async (args) => {
      authArgs = args;
      return { id: "webauthn-ok" };
    },
  });

  const result = await signRecoveryApproval(teamId, approvalId, (m) => {
    confirmedMsg = m;
    return true;
  });

  assert.equal(
    apiCalls[0].url,
    "/teams/team%2Falpha%3F1/wallet/recovery/requests/req%232026%2F11/challenge",
  );
  assert.equal(apiCalls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(JSON.stringify(confirmedMsg)), payload);
  assert.deepEqual(JSON.parse(JSON.stringify(authArgs)), { optionsJSON: { challenge } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    challengeId: "ch-rec-1",
    assertion: { id: "webauthn-ok" },
  });
});

test("signRecoveryApproval rejects missing fields and unparseable or non-object payloads", async () => {
  let nextResp = { challengeId: "", message: "{}", options: { challenge: "x" } };
  const { signRecoveryApproval } = loadRecoveryPasskeys({
    apiImpl: async () => nextResp,
  });

  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", () => true),
    /invalid recovery challenge/i,
  );

  nextResp = { challengeId: "ch-1", message: null, options: { challenge: "x" } };
  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", () => true),
    /invalid recovery challenge/i,
  );

  const badJson = "{broken";
  nextResp = {
    challengeId: "ch-2",
    message: badJson,
    options: { challenge: crypto.createHash("sha256").update(badJson).digest("base64url") },
  };
  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", () => true),
    /could not be parsed/i,
  );

  const nullJson = "null";
  nextResp = {
    challengeId: "ch-3",
    message: nullJson,
    options: { challenge: crypto.createHash("sha256").update(nullJson).digest("base64url") },
  };
  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", () => true),
    /could not be parsed/i,
  );
});

test("signRecoveryApproval rejects challenge mismatch, ID mismatch, and user cancellation without authenticating", async () => {
  let authCalled = false;
  let nextResp = null;

  const { signRecoveryApproval } = loadRecoveryPasskeys({
    apiImpl: async () => nextResp,
    startAuthImpl: async () => {
      authCalled = true;
      return { id: "should-not-run" };
    },
  });

  const validMsg = JSON.stringify({
    approval: "a1",
    team: "t1",
    requester: "alice",
    threshold: 2,
    approvers: ["alice", "bob"],
  });
  const validChallenge = crypto.createHash("sha256").update(validMsg).digest("base64url");

  nextResp = { challengeId: "ch-1", message: validMsg, options: { challenge: "tampered" } };
  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", () => true),
    /challenge does not match/i,
  );

  nextResp = { challengeId: "ch-2", message: validMsg, options: { challenge: validChallenge } };
  await assert.rejects(
    () => signRecoveryApproval("other-team", "a1", () => true),
    /request details do not match/i,
  );

  await assert.rejects(
    () => signRecoveryApproval("t1", "a1", async () => false),
    /approval cancelled/i,
  );

  assert.equal(authCalled, false);
});
