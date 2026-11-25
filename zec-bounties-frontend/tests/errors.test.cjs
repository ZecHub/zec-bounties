const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadErrorsModule() {
  const filename = path.resolve(__dirname, "..", "lib/errors.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    { module: mod, exports: mod.exports, Error },
    { filename },
  );
  return mod.exports;
}

const { getErrorMessage } = loadErrorsModule();

describe("getErrorMessage", () => {
  it("prioritizes response.data error/message on Axios-style Error subclasses over generic Error.message", () => {
    const axiosWithError = Object.assign(
      new Error("Request failed with status code 400"),
      { response: { data: { error: "  Bounty already paid  " } } },
    );
    assert.equal(getErrorMessage(axiosWithError), "Bounty already paid");

    const axiosWithMessage = Object.assign(
      new Error("Request failed with status code 422"),
      { response: { data: { message: "Invalid Zcash address" } } },
    );
    assert.equal(getErrorMessage(axiosWithMessage), "Invalid Zcash address");

    const axiosWithText = Object.assign(
      new Error("Request failed with status code 502"),
      { response: { data: "  Bad Gateway from upstream  " } },
    );
    assert.equal(getErrorMessage(axiosWithText), "Bad Gateway from upstream");
  });

  it("extracts nested err.error before generic Error.message and trims values", () => {
    const apiErr = Object.assign(new Error("Generic failure"), {
      error: "  Rate limit exceeded  ",
    });
    assert.equal(getErrorMessage(apiErr), "Rate limit exceeded");
    assert.equal(getErrorMessage({ error: "  Forbidden  " }), "Forbidden");
    assert.equal(getErrorMessage({ message: "  Timeout  " }), "Timeout");
    assert.equal(getErrorMessage("  Plain string error  "), "Plain string error");
  });

  it("falls back when Error.message or payload fields are blank whitespace", () => {
    assert.equal(getErrorMessage(new Error("   "), "Custom fallback"), "Custom fallback");
    assert.equal(getErrorMessage(new Error(""), "Custom fallback"), "Custom fallback");
    assert.equal(
      getErrorMessage({ response: { data: { error: "   ", message: "" } } }),
      "Something went wrong",
    );
    assert.equal(getErrorMessage("   "), "Something went wrong");
    assert.equal(getErrorMessage(null), "Something went wrong");
    assert.equal(getErrorMessage(undefined), "Something went wrong");
  });

  it("returns standard Error.message when no richer API payload is present", () => {
    assert.equal(getErrorMessage(new Error("  Network offline  ")), "Network offline");
  });
});
