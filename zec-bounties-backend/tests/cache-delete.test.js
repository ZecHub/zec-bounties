const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const delCommand = require("@redis/client/dist/lib/commands/DEL").default;

function harness(initialKeys, batches = []) {
  const keys = new Set(initialKeys);
  const calls = [];
  const redisClient = {
    // Use the installed client's command parser so the fake cannot accidentally
    // accept rest arguments that node-redis itself ignores.
    async del(...args) {
      const command = [];
      delCommand.parseCommand({
        push: (...values) => command.push(...values),
        pushKeys: values => command.push(...(Array.isArray(values) ? values : [values])),
      }, ...args);
      calls.push(command);
      return command.slice(1).reduce((count, key) => count + Number(keys.delete(key)), 0);
    },
    async *scanIterator() {
      yield* batches;
    },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, "../utils/cache.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      assert.equal(name, "../config/redis");
      return { redisClient };
    },
    console,
    Date,
  }, { filename });
  return { ...module.exports, keys, calls, redisClient };
}

test("deleting assignee caches removes both admin and user snapshots", async () => {
  const h = harness(["assignees:admin:b1", "assignees:user:b1", "other"]);
  await h.delCache("assignees:admin:b1", "assignees:user:b1");
  assert.deepEqual([...h.keys], ["other"]);
  assert.equal(h.calls.length, 1);
});

test("invalidating the user directory clears public and admin snapshots", async () => {
  const h = harness(["users:all", "users:public", "other"]);
  await h.invalidateUserDirectory();
  assert.deepEqual([...h.keys], ["other"]);
  assert.equal(h.calls.length, 1);
});

test("pattern deletion removes keys from every SCAN batch", async () => {
  const h = harness(["bounty:a", "bounty:b", "bounty:c", "other"], [
    ["bounty:a", "bounty:b"], [], ["bounty:c"],
  ]);
  await h.deleteCacheByPattern("bounty:*");
  assert.deepEqual([...h.keys], ["other"]);
  assert.equal(h.calls.length, 1);
});

test("single-key deletion and an empty key list remain valid", async () => {
  const h = harness(["one"]);
  await h.delCache();
  assert.equal(h.calls.length, 0);
  await h.delCache("one");
  assert.equal(h.keys.size, 0);
  assert.equal(h.calls.length, 1);
});

test("an empty scan sends no DEL command", async () => {
  const h = harness(["other"], [[]]);
  await h.deleteCacheByPattern("bounty:*");
  assert.deepEqual([...h.keys], ["other"]);
  assert.equal(h.calls.length, 0);
});

test("pattern deletion also supports iterators yielding individual keys", async () => {
  const h = harness(["bounty:a", "bounty:b"], ["bounty:a", "bounty:b"]);
  await h.deleteCacheByPattern("bounty:*");
  assert.equal(h.keys.size, 0);
});
