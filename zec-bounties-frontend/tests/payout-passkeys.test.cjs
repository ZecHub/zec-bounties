const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadPayoutPasskeys({ fetchImpl, localStorageImpl, startAuthImpl } = {}) {
  const filename = path.resolve(__dirname, "..", "lib/payout-passkeys.ts");
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
    if (specifier === "./configENV") {
      return { backendUrl: "https://api.example.test" };
    }
    if (specifier === "@simplewebauthn/browser") {
      return {
        startRegistration: async () => ({ id: "reg-1" }),
        startAuthentication: startAuthImpl || (async () => ({ id: "auth-1" })),
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
      fetch: fetchImpl,
      localStorage: localStorageImpl,
      Headers,
      TextEncoder,
      btoa,
      crypto: crypto.webcrypto,
      Uint8Array,
      ArrayBuffer,
    },
    { filename },
  );
  return mod.exports;
}

test("b64url encodes ArrayBuffer, Uint8Array slices, and large buffers (>100KB) without stack overflow", () => {
  const { b64url } = loadPayoutPasskeys();
  const sample = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x01]);
  assert.equal(b64url(sample.buffer), "-__-AAE");
  assert.equal(b64url(sample.subarray(1, 4)), "__4A");

  const large = new Uint8Array(120_000);
  for (let i = 0; i < large.length; i++) large[i] = i & 0xff;
  const encoded = b64url(large.buffer);
  assert.equal(encoded, Buffer.from(large).toString("base64url"));
});

test("api preserves caller-supplied headers, merges auth token, and handles restricted localStorage", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: Object.fromEntries(new Headers(init.headers).entries()), method: init.method });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { api, revokePayoutKey } = loadPayoutPasskeys({
    fetchImpl,
    localStorageImpl: { getItem: () => "tok-123" },
  });

  await api("/test", { method: "POST", headers: { "X-Custom": "abc" } });
  assert.equal(calls[0].url, "https://api.example.test/api/test");
  assert.equal(calls[0].headers["x-custom"], "abc");
  assert.equal(calls[0].headers["content-type"], "application/json");
  assert.equal(calls[0].headers["authorization"], "Bearer tok-123");

  await revokePayoutKey("key/with spaces?x=1");
  assert.equal(
    calls[1].url,
    "https://api.example.test/api/payout-keys/key%2Fwith%20spaces%3Fx%3D1",
  );
  assert.equal(calls[1].method, "DELETE");

  const brokenStorage = loadPayoutPasskeys({
    fetchImpl,
    localStorageImpl: {
      getItem: () => {
        throw new Error("SecurityError");
      },
    },
  });
  await brokenStorage.api("/public");
  assert.equal(calls[2].headers["authorization"], undefined);
});

test("signPayoutVote encodes roundId, verifies SHA-256 challenge, and rejects malformed payloads", async () => {
  const roundId = "round/2026-11";
  const candidateId = "exec-1";
  const voteMsg = JSON.stringify({
    round: roundId,
    chain: "MAIN",
    totalZat: "100000000",
    items: [],
    executor: candidateId,
    expiresAt: "2026-12-01T00:00:00Z",
  });
  const validChallenge = crypto.createHash("sha256").update(voteMsg).digest("base64url");

  let nextResponse = {
    challengeId: "ch-1",
    message: voteMsg,
    options: { challenge: validChallenge },
  };
  let requestedUrl = "";

  const { signPayoutVote } = loadPayoutPasskeys({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => nextResponse };
    },
  });

  const signed = await signPayoutVote(roundId, candidateId, () => true);
  assert.equal(
    requestedUrl,
    "https://api.example.test/api/payout-proposals/round%2F2026-11/vote/options",
  );
  assert.equal(signed.challengeId, "ch-1");

  nextResponse = { challengeId: "ch-2", message: null, options: { challenge: validChallenge } };
  await assert.rejects(
    () => signPayoutVote(roundId, candidateId, () => true),
    /invalid vote challenge/i,
  );

  const badJson = "{not-json";
  nextResponse = {
    challengeId: "ch-3",
    message: badJson,
    options: { challenge: crypto.createHash("sha256").update(badJson).digest("base64url") },
  };
  await assert.rejects(
    () => signPayoutVote(roundId, candidateId, () => true),
    /could not be parsed/i,
  );
});
