import { test, expect } from "@playwright/test";
import { computeHasMoreBounties } from "../bounty-pagination";

const PAGE_SIZE = 10;

test.describe("computeHasMoreBounties", () => {
  // The regression this fix targets: with 25 total and 20 already loaded, a
  // refresh (reset) shows the first 10 but must still report more to load.
  test("refresh after a partial load still allows reaching every bounty", () => {
    expect(
      computeHasMoreBounties({
        reset: true,
        previousCount: 20,
        incomingCount: 10,
        total: 25,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(true);
  });

  test("appending the next page reports more while pages remain", () => {
    expect(
      computeHasMoreBounties({
        reset: false,
        previousCount: 10,
        incomingCount: 10,
        total: 25,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(true);
  });

  test("a short final page stops loading", () => {
    expect(
      computeHasMoreBounties({
        reset: false,
        previousCount: 20,
        incomingCount: 5,
        total: 25,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(false);
  });

  test("a single full page equal to the total stops loading", () => {
    expect(
      computeHasMoreBounties({
        reset: true,
        previousCount: 0,
        incomingCount: 10,
        total: 10,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(false);
  });

  test("empty results settle without another load attempt", () => {
    expect(
      computeHasMoreBounties({
        reset: true,
        previousCount: 0,
        incomingCount: 0,
        total: 0,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(false);
  });

  test("empty results ignore a stale previous count", () => {
    expect(
      computeHasMoreBounties({
        reset: true,
        previousCount: 40,
        incomingCount: 0,
        total: 0,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(false);
  });

  test("a fresh first page with many remaining reports more", () => {
    expect(
      computeHasMoreBounties({
        reset: true,
        previousCount: 0,
        incomingCount: 10,
        total: 100,
        pageSize: PAGE_SIZE,
      }),
    ).toBe(true);
  });
});
