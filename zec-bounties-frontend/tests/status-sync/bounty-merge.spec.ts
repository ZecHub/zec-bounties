import { test, expect } from "@playwright/test";
import { mergeBounty } from "../../lib/bounty-merge";
import type { Bounty } from "../../lib/types";

function record(overrides: Record<string, unknown> = {}): Bounty {
  return {
    id: "merge-fixture",
    status: "IN_PROGRESS",
    updatedAt: "2026-10-01T13:00:00.000Z",
    ...overrides,
  } as Bounty;
}

test("merging strips private fields at every depth and preserves public data", () => {
  const publicUser = { id: "fixture-user", name: "Hunter", nickname: "Tester", avatar: null };
  const privateUser = { ...publicUser, email: "fixture@example.invalid",
    z_address: "fixture-shielded", UA_address: "fixture-unified" };
  const deadline = new Date("2099-10-01T00:00:00.000Z");
  const current = record({ createdByUser: privateUser, timeToComplete: deadline });
  const update = record({
    status: "IN_REVIEW",
    email: "fixture@example.invalid", z_address: "fixture-shielded", UA_address: "fixture-unified",
    assigneeUser: privateUser,
    assignees: [{ userId: publicUser.id, user: privateUser }],
    workSubmissions: [{ submitterUser: privateUser, reviewerUser: privateUser }],
  });

  const merged = mergeBounty(current, update);
  expect(merged).toEqual({
    id: "merge-fixture", status: "IN_REVIEW", updatedAt: current.updatedAt,
    createdByUser: publicUser, timeToComplete: deadline,
    assigneeUser: publicUser,
    assignees: [{ userId: publicUser.id, user: publicUser }],
    workSubmissions: [{ submitterUser: publicUser, reviewerUser: publicUser }],
  });
  expect(merged.timeToComplete).toBe(deadline);
  expect(current.createdByUser).toEqual(privateUser);
  expect(update.assigneeUser).toEqual(privateUser);
});

for (const updatedAt of [undefined, null, ""]) {
  test(`an update with updatedAt=${String(updatedAt)} keeps the current record`, () => {
    const current = record();
    expect(mergeBounty(current, record({ updatedAt, status: "DONE" }))).toBe(current);
  });
}

test("an older update keeps the current record", () => {
  const current = record();
  expect(mergeBounty(current, record({
    updatedAt: "2026-10-01T12:59:59.000Z", status: "DONE",
  }))).toBe(current);
});

for (const updatedAt of ["2026-10-01T13:00:00.000Z", "2026-10-01T13:00:01.000Z"]) {
  test(`a versioned update at ${updatedAt} is applied`, () => {
    const current = record({ title: "Keep this title" });
    expect(mergeBounty(current, record({ updatedAt, status: "DONE" }))).toEqual({
      ...current, updatedAt, status: "DONE",
    });
  });
}

test("a dated update can replace an unversioned current record", () => {
  const update = record({ status: "DONE" });
  expect(mergeBounty(record({ updatedAt: undefined }), update)).toEqual(update);
});
