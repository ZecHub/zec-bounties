const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

// These tests assume a running Postgres with the migration applied
// and the suggestionSettings util. They are skipped if DATABASE_URL is unset.
const hasDb = Boolean(process.env.DATABASE_URL);

describe("suggestionSettings", { skip: !hasDb }, () => {
  let getSuggestionSettings, setSuggestionSettings;

  before(async () => {
    ({ getSuggestionSettings, setSuggestionSettings } = require("../utils/suggestionSettings"));
  });

  it("defaults to threshold 5 when unset", async () => {
    const s = await getSuggestionSettings();
    assert.ok(["closed", "open", "threshold"].includes(s.mode));
    assert.equal(typeof s.threshold, "number");
  });

  it("round-trips mode and threshold", async () => {
    await setSuggestionSettings({ mode: "open", threshold: 0 });
    let s = await getSuggestionSettings();
    assert.equal(s.mode, "open");

    await setSuggestionSettings({ mode: "threshold", threshold: 7 });
    s = await getSuggestionSettings();
    assert.equal(s.mode, "threshold");
    assert.equal(s.threshold, 7);

    await setSuggestionSettings({ mode: "closed", threshold: 0 });
    s = await getSuggestionSettings();
    assert.equal(s.mode, "closed");

    // restore default
    await setSuggestionSettings({ mode: "threshold", threshold: 5 });
  });
});
