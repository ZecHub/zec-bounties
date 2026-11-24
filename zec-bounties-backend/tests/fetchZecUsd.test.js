const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  monthKey,
  parseWikiDate,
  parseClosingPrice,
  aggregateMonthlyPrices,
} = require("../scripts/fetch-zec-usd");

describe("fetch-zec-usd helpers", () => {
  it("parses valid YYYY/MM/DD dates and rejects invalid calendar dates", () => {
    assert.deepEqual(parseWikiDate("2026/02/28"), {
      year: 2026,
      month: 2,
      day: 28,
    });
    assert.deepEqual(parseWikiDate(" 2026/11/5 "), {
      year: 2026,
      month: 11,
      day: 5,
    });
    assert.equal(parseWikiDate("2026/02/31"), null);
    assert.equal(parseWikiDate("2026/13/01"), null);
    assert.equal(parseWikiDate("2026-11-01"), null);
    assert.equal(parseWikiDate(null), null);
    assert.equal(parseWikiDate(20261101), null);
  });

  it("rejects blank, null, boolean, and non-positive closing prices", () => {
    assert.equal(parseClosingPrice("42.5"), 42.5);
    assert.equal(parseClosingPrice(55), 55);
    assert.equal(parseClosingPrice(""), null);
    assert.equal(parseClosingPrice("   "), null);
    assert.equal(parseClosingPrice(null), null);
    assert.equal(parseClosingPrice(undefined), null);
    assert.equal(parseClosingPrice(false), null);
    assert.equal(parseClosingPrice(true), null);
    assert.equal(parseClosingPrice(0), null);
    assert.equal(parseClosingPrice(-10), null);
    assert.equal(parseClosingPrice("NaN"), null);
  });

  it("sorts observations by day so close reflects the last day of the month", () => {
    const rows = [
      { Dates: "2026/10/25", Closing_Price: "50" },
      { Dates: "2026/10/04", Closing_Price: "30" },
      { Dates: "2026/10/18", Closing_Price: "40" },
    ];
    const out = aggregateMonthlyPrices(rows, new Date("2026-11-10T00:00:00Z"));
    assert.equal(out.length, 1);
    assert.equal(out[0].month, monthKey(2026, 9));
    assert.equal(out[0].avg, 40);
    assert.equal(out[0].close, 50);
    assert.equal(out[0].provisional, false);
  });

  it("skips corrupt rows without injecting zero prices and marks current UTC month provisional", () => {
    const rows = [
      null,
      { Dates: "2026/11/01", Closing_Price: "" },
      { Dates: "2026/11/08", Closing_Price: null },
      { Dates: "2026/02/31", Closing_Price: "99" },
      { Dates: "2026/11/15", Closing_Price: "60" },
      { Dates: "2026/11/02", Closing_Price: "40" },
      { Dates: "2026/09/20", Closing_Price: "25" },
    ];
    const out = aggregateMonthlyPrices(rows, new Date("2026-11-24T12:00:00Z"));
    assert.deepEqual(out, [
      { month: "2026-09-01", avg: 25, close: 25, provisional: false },
      { month: "2026-11-01", avg: 50, close: 60, provisional: true },
    ]);
  });

  it("throws when input is not an array", () => {
    assert.throws(() => aggregateMonthlyPrices(null), /expected an array/);
    assert.throws(() => aggregateMonthlyPrices({}), /expected an array/);
  });
});
