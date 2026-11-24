const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadBountyMerge() {
  const filename = path.resolve(__dirname, "../lib/bounty-merge.ts");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const module = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
  return module.exports;
}

test("bountyUpdatedAt returns 0 for invalid dates and mergeBounty ignores updates with malformed updatedAt", () => {
  const { bountyUpdatedAt, mergeBounty } = loadBountyMerge();
  assert.equal(bountyUpdatedAt({ updatedAt: "not-a-date" }), 0);
  assert.equal(bountyUpdatedAt({ updatedAt: undefined }), 0);

  const current = {
    id: "b1",
    status: "IN_PROGRESS",
    updatedAt: "2026-10-01T13:00:00.000Z",
  };
  const badUpdate = {
    id: "b1",
    status: "DONE",
    updatedAt: "not-a-date",
  };
  assert.equal(mergeBounty(current, badUpdate), current);
});

test("mergeBounty strips private fields when update omits user and clears assignee on explicit null", () => {
  const { mergeBounty } = loadBountyMerge();
  const privateUser = {
    id: "u1",
    name: "Alice",
    email: "alice@example.invalid",
    z_address: "zs1secret",
    UA_address: "u1secret",
  };
  const current = {
    id: "b2",
    status: "IN_PROGRESS",
    updatedAt: "2026-10-01T13:00:00.000Z",
    assigneeUser: privateUser,
    createdByUser: privateUser,
  };

  // Explicit undefined assigneeUser in partial update must still strip private fields from current
  const partialUpdate = {
    id: "b2",
    status: "IN_REVIEW",
    updatedAt: "2026-10-01T13:05:00.000Z",
    assigneeUser: undefined,
  };
  const merged = mergeBounty(current, partialUpdate);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.assigneeUser)), {
    id: "u1",
    name: "Alice",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(merged.createdByUser)), {
    id: "u1",
    name: "Alice",
  });

  // Explicit null assigneeUser clears assignment instead of restoring stale current.assigneeUser
  const unassigned = mergeBounty(current, {
    id: "b2",
    status: "TO_DO",
    updatedAt: "2026-10-01T13:10:00.000Z",
    assigneeUser: null,
  });
  assert.equal(unassigned.assigneeUser, undefined);
});
