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

  broadcast(
    {
      type: "system",
      content: `${user.name} joined the chat`,
    },
    ws,
  );

  console.log(`User ${user.name} connected. Total clients: ${clients.size}`);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "message": {
          if (!message.content) {
            ws.send(
              JSON.stringify({
                type: "error",
                content: "Invalid message format",
              }),
            );
            break;
          }

          // userId comes from the authenticated `user`, never from the
          // client-sent message.
          const savedMessage = await prisma.message.create({
            data: {
              content: message.content,
              userId: user.id,
            },
            include: { user: true },
          });

          const responseData = {
            type: "message",
            id: savedMessage.id,
            content: savedMessage.content,
            userName: savedMessage.user.name,
            userId: savedMessage.userId,
            createdAt: savedMessage.createdAt,
          };

          broadcast(responseData);
          break;
        }

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
      broadcast({
        type: "system",
        content: `${user.name} left the chat`,
      });
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

// Profile fields other users may see when someone's account changes. Their
// clients only use the event to refresh bounty and user lists.
const PUBLIC_USER_UPDATE_FIELDS = ["id", "name", "nickname", "avatar", "role"];

// The owner gets the full row; everyone else gets the public profile fields
// so nickname and avatar changes still show up for them.
function sendUserUpdated(userId, user) {
  sendToUser(userId, "user_updated", user);
  const publicUser = {};
  for (const field of PUBLIC_USER_UPDATE_FIELDS) {
    if (user[field] !== undefined) publicUser[field] = user[field];
  }
  sendRealtimeUpdate("user_updated", publicUser, userId);
}

module.exports = {
  handleWebSocket,
  sendRealtimeUpdate,
  sendToUser,
  sendUserUpdated,
  getClientByUserId,
};
