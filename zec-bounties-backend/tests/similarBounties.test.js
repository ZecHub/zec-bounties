const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeTitle,
  tokenize,
  titleSimilarity,
  rankSimilar,
  SIMILARITY_THRESHOLD,
  MAX_RESULTS,
} = require("../helpers/similarBounties");

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    assert.equal(
      normalizeTitle("ZecWeekly Indonesian Translation Vol.34"),
      "zecweekly indonesian translation vol 34",
    );
  });
  it("collapses whitespace", () => {
    assert.equal(normalizeTitle("  Add   a   page  "), "add a page");
  });
  it("handles slashes as separators", () => {
    assert.equal(
      normalizeTitle("Add a FROST / threshold custody explainer page"),
      "add a frost threshold custody explainer page",
    );
  });
  it("returns empty for non-strings", () => {
    assert.equal(normalizeTitle(undefined), "");
    assert.equal(normalizeTitle(null), "");
    assert.equal(normalizeTitle(42), "");
  });
});

describe("tokenize", () => {
  it("drops stop words", () => {
    assert.deepEqual(tokenize("Add a new explainer page"), ["explainer"]);
  });
  it("falls back to all tokens when every token is a stop word", () => {
    assert.deepEqual(tokenize("add a new page"), ["add", "a", "new", "page"]);
  });
});

describe("titleSimilarity", () => {
  it("scores identical titles 1", () => {
    const t = "ZecWeekly Indonesian Translation Vol.34";
    assert.equal(titleSimilarity(t, t), 1);
  });

  it("scores titles differing only in punctuation and case 1", () => {
    assert.equal(
      titleSimilarity("ZecWeekly Indonesian Translation Vol.34", "zecweekly indonesian translation vol 34"),
      1,
    );
  });

  it("catches the real near-miss duplicate from the board", () => {
    const score = titleSimilarity(
      "Add a FROST / threshold custody explainer page",
      "Add a FROST threshold custody explainer",
    );
    assert.ok(score >= SIMILARITY_THRESHOLD, `expected >= threshold, got ${score}`);
  });

  it("scores unrelated titles below the threshold", () => {
    const score = titleSimilarity(
      "ZecWeekly Indonesian Translation Vol.34",
      "Build an RSS feed for the bounty board",
    );
    assert.ok(score < SIMILARITY_THRESHOLD, `expected < threshold, got ${score}`);
  });

  it("ranks an exact repost above a different volume of the same series", () => {
    const subject = "ZecWeekly Indonesian Translation Vol.34";
    const repost = titleSimilarity(subject, "ZecWeekly Indonesian Translation Vol.34");
    const neighbour = titleSimilarity(subject, "ZecWeekly Indonesian Translation Vol.33");
    assert.ok(
      repost > neighbour,
      `repost ${repost} should outrank sequence neighbour ${neighbour}`,
    );
  });

  it("returns 0 when either title is empty", () => {
    assert.equal(titleSimilarity("", "anything"), 0);
    assert.equal(titleSimilarity("anything", ""), 0);
  });
});

describe("rankSimilar", () => {
  const candidates = [
    { id: "a", title: "ZecWeekly Indonesian Translation Vol.34", status: "DONE" },
    { id: "b", title: "ZecWeekly Indonesian Translation Vol.33", status: "DONE" },
    { id: "c", title: "ZecWeekly Indonesian Translation Vol.32", status: "DONE" },
    { id: "d", title: "ZecWeekly Indonesian Translation Vol.31", status: "DONE" },
    { id: "e", title: "Build an RSS feed for the bounty board", status: "TO_DO" },
  ];

  it("puts the exact duplicate first", () => {
    const out = rankSimilar("ZecWeekly Indonesian Translation Vol.34", candidates);
    assert.equal(out[0].id, "a");
  });

  it("never returns more than MAX_RESULTS", () => {
    const out = rankSimilar("ZecWeekly Indonesian Translation Vol.34", candidates);
    assert.ok(out.length <= MAX_RESULTS, `got ${out.length}`);
  });

  it("excludes unrelated bounties", () => {
    const out = rankSimilar("ZecWeekly Indonesian Translation Vol.34", candidates);
    assert.ok(!out.some((c) => c.id === "e"));
  });

  it("passes candidate fields through so the caller can show status", () => {
    const out = rankSimilar("ZecWeekly Indonesian Translation Vol.34", candidates);
    assert.equal(out[0].status, "DONE");
    assert.ok(typeof out[0].similarity === "number");
  });

  it("returns nothing for an empty title", () => {
    assert.deepEqual(rankSimilar("", candidates), []);
    assert.deepEqual(rankSimilar("   ", candidates), []);
  });

  it("tolerates junk candidates", () => {
    assert.deepEqual(rankSimilar("anything", null), []);
    assert.deepEqual(rankSimilar("anything", [null, {}, { id: 1 }]), []);
  });

  it("is deterministic for equal scores", () => {
    const tied = [
      { id: "z", title: "explainer page for custody" },
      { id: "y", title: "explainer page for custody" },
    ];
    const first = rankSimilar("explainer page for custody", tied);
    const second = rankSimilar("explainer page for custody", tied);
    assert.deepEqual(first.map((c) => c.id), second.map((c) => c.id));
  });
});
