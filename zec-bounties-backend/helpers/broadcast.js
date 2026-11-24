// helpers/broadcast.js
const clients = [];

function removeClient(res) {
  const idx = clients.indexOf(res);
  if (idx !== -1) clients.splice(idx, 1);
}

function isWritableClient(res) {
  return Boolean(
    res &&
      typeof res.write === "function" &&
      !res.writableEnded &&
      !res.destroyed,
  );
}

function initSSE(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // send initial ping
  try {
    if (!isWritableClient(res)) return;
    res.write(`data: ${JSON.stringify({ message: "connected" })}\n\n`);
  } catch {
    return;
  }

  if (!clients.includes(res)) {
    clients.push(res);
  }

  const cleanup = () => removeClient(res);
  if (req && typeof req.on === "function") {
    req.on("close", cleanup);
  }
  if (typeof res.on === "function") {
    res.on("close", cleanup);
  }
}

function broadcast(data) {
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return 0;
  }
  if (serialized === undefined) {
    serialized = "null";
  }

  const payload = `data: ${serialized}\n\n`;
  let delivered = 0;
  for (const res of [...clients]) {
    if (!isWritableClient(res)) {
      removeClient(res);
      continue;
    }
    try {
      res.write(payload);
      delivered += 1;
    } catch {
      removeClient(res);
    }
  }
  return delivered;
}

function getClientCount() {
  return clients.length;
}

module.exports = { initSSE, broadcast, getClientCount };
