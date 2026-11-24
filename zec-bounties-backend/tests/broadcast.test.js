const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { initSSE, broadcast, getClientCount } = require("../helpers/broadcast");

function createMockSSE({ throwOnWrite = false, writableEnded = false, destroyed = false } = {}) {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.headers = {};
  res.chunks = [];
  res.flushed = false;
  res.writableEnded = writableEnded;
  res.destroyed = destroyed;
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.flushHeaders = () => {
    res.flushed = true;
  };
  res.write = (chunk) => {
    if (throwOnWrite) throw new Error("EPIPE");
    res.chunks.push(chunk);
    return true;
  };
  return { req, res };
}

test("initSSE sets headers, sends connected ping, registers client, and cleans up idempotently", () => {
  const { req, res } = createMockSSE();
  initSSE(req, res);

  assert.equal(res.headers["Content-Type"], "text/event-stream");
  assert.equal(res.headers["Cache-Control"], "no-cache");
  assert.equal(res.headers["Connection"], "keep-alive");
  assert.equal(res.flushed, true);
  assert.equal(res.chunks.length, 1);
  assert.equal(res.chunks[0], 'data: {"message":"connected"}\n\n');
  assert.equal(getClientCount(), 1);

  req.emit("close");
  res.emit("close");
  assert.equal(getClientCount(), 0);
});

test("initSSE does not register a client whose initial ping fails or is already closed", () => {
  const broken = createMockSSE({ throwOnWrite: true });
  initSSE(broken.req, broken.res);
  assert.equal(getClientCount(), 0);

  const ended = createMockSSE({ writableEnded: true });
  initSSE(ended.req, ended.res);
  assert.equal(getClientCount(), 0);
});

test("broadcast delivers to healthy clients and prunes throwing or ended clients without throwing", () => {
  const c1 = createMockSSE();
  const c2 = createMockSSE();
  const c3 = createMockSSE();
  initSSE(c1.req, c1.res);
  initSSE(c2.req, c2.res);
  initSSE(c3.req, c3.res);
  assert.equal(getClientCount(), 3);

  // c1 throws on next write; c2 is marked ended before broadcast
  c1.res.write = () => {
    throw new Error("socket write failed");
  };
  c2.res.writableEnded = true;

  const delivered = broadcast({ type: "bounty_updated", id: "b-1" });
  assert.equal(delivered, 1);
  assert.equal(getClientCount(), 1);
  assert.equal(c3.res.chunks.at(-1), 'data: {"type":"bounty_updated","id":"b-1"}\n\n');

  c3.req.emit("close");
  assert.equal(getClientCount(), 0);
});

test("broadcast handles undefined and unserializable circular payloads safely", () => {
  const { req, res } = createMockSSE();
  initSSE(req, res);

  assert.equal(broadcast(undefined), 1);
  assert.equal(res.chunks.at(-1), "data: null\n\n");

  const circular = {};
  circular.self = circular;
  assert.equal(broadcast(circular), 0);
  assert.equal(res.chunks.length, 2);

  req.emit("close");
  assert.equal(getClientCount(), 0);
});
