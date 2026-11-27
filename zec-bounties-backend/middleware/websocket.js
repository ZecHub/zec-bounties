const { redactBroadcastPayload } = require("../utils/privacy");

const clients = new Map(); // userId -> { ws, userId, userName }

// User fields that must never reach another user's socket. Every name here
// exists only on the User model, so dropping it by key is safe at any depth
// (createdByUser, assigneeUser, assignees[].user, full user rows, ...).
// sendToUser() is exempt: it only ever delivers to the data's owner.
const PRIVATE_USER_FIELDS = new Set([
  "email",
  "password",
  "z_address",
  "UA_address",
  "githubId",
  "discordUserId",
  "emailNotifications",
  "pushNotifications",
  "ofacVerified",
  "profileVisibility",
]);

function serializeForBroadcast(data) {
  // Clone-and-strip first so the same object can still be returned on the
  // HTTP response. The replacer stays as a second pass.
  return JSON.stringify(redactBroadcastPayload(data), (key, value) =>
    PRIVATE_USER_FIELDS.has(key) ? undefined : value,
  );
}

// Broadcast to all connected clients
function broadcast(data, excludeWs) {
  const message = serializeForBroadcast(data);
  console.log(message);
  clients.forEach((client) => {
    if (client.ws !== excludeWs && client.ws.readyState === 1) {
      client.ws.send(message);
    }
  });
}

// Broadcast only to a specific set of userIds — used for private-bounty
// events so the payload never reaches sockets outside that team's community.
function broadcastToUsers(data, userIds, excludeWs) {
  const message = serializeForBroadcast(data);
  const idSet = new Set(userIds);
  clients.forEach((client, userId) => {
    if (!idSet.has(userId)) return;
    if (client.ws !== excludeWs && client.ws.readyState === 1) {
      client.ws.send(message);
    }
  });
}

// Get WebSocket connection by userId
function getClientByUserId(userId) {
  const client = clients.get(userId);
  return client ? client.ws : null;
}

// Send a message to a specific user only (no broadcast)
function sendToUser(userId, type, payload) {
  const ws = getClientByUserId(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function handleWebSocket(ws, prisma, user) {
  // If this user already has a live connection, close the old one so a
  // stale/duplicate/hijacked socket can't keep receiving sendToUser events.
  const existing = clients.get(user.id);
  if (existing && existing.ws.readyState === 1) {
    existing.ws.close(4001, "Replaced by new connection");
  }

  const currentClient = { ws, userId: user.id, userName: user.name };
  clients.set(user.id, currentClient);

  ws.send(
    JSON.stringify({
      type: "joined",
      content: `Welcome, ${user.name}!`,
    }),
  );

  // No "joined"/"left" broadcast to other sockets: it told every signed-in
  // user who is online and under which name, including users who hide their
  // display name (profileVisibility.showDisplayName = false). The client never
  // showed these messages, and there is no chat (no Message model), so the old
  // "message" case below was removed too.

  console.log(`User ${user.name} connected. Total clients: ${clients.size}`);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    } catch (error) {
      console.error("WebSocket error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          content: "Server error",
        }),
      );
    }
  });

  ws.on("close", () => {
    // Only remove the map entry if it's still this socket — avoids a race
    // where an old socket's close event deletes a newer replacement client.
    if (clients.get(user.id)?.ws === ws) {
      clients.delete(user.id);
      console.log(
        `User ${user.name} disconnected. Total clients: ${clients.size}`,
      );
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (clients.get(user.id)?.ws === ws) {
      clients.delete(user.id);
    }
  });
}

// Broadcast to all clients except the sender (for shared events like new bounties)
function sendRealtimeUpdate(
  type,
  payload,
  excludeUserId = null,
  recipientUserIds = null,
) {
  const excludeWs = excludeUserId ? getClientByUserId(excludeUserId) : null;
  if (recipientUserIds) {
    broadcastToUsers({ type, payload }, recipientUserIds, excludeWs);
  } else {
    broadcast({ type, payload }, excludeWs);
  }
}

// The owner gets the full row. Everyone else gets only the id: their client
// uses the event to refetch bounties and users (bounty-context.tsx), and that
// REST refetch applies profileVisibility. Sending name/nickname/avatar here
// showed them to every signed-in user even when the owner hides them, because
// the rows passed in don't carry profileVisibility.
function sendUserUpdated(userId, user) {
  sendToUser(userId, "user_updated", user);
  sendRealtimeUpdate("user_updated", { id: user.id ?? userId }, userId);
}

module.exports = {
  handleWebSocket,
  sendRealtimeUpdate,
  sendToUser,
  sendUserUpdated,
  getClientByUserId,
};
