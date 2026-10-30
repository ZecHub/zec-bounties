const { redactBroadcastPayload } = require("../utils/privacy");

const clients = new Map(); // userId -> Set of that user's sockets, one per tab or device

// Opening more sockets than this closes the user's oldest one with code 4001.
// The client does not reconnect after 4001, so tabs can't keep evicting
// each other.
const MAX_SOCKETS_PER_USER = 5;

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

function sendToSockets(sockets, message) {
  sockets.forEach((ws) => {
    if (ws.readyState === 1) ws.send(message);
  });
}

// Broadcast to all connected clients
function broadcast(data, excludeUserId) {
  const message = serializeForBroadcast(data);
  console.log(message);
  clients.forEach((sockets, userId) => {
    if (userId !== excludeUserId) sendToSockets(sockets, message);
  });
}

// Broadcast only to a specific set of userIds — used for private-bounty
// events so the payload never reaches sockets outside that team's community.
function broadcastToUsers(data, userIds, excludeUserId) {
  const message = serializeForBroadcast(data);
  const idSet = new Set(userIds);
  clients.forEach((sockets, userId) => {
    if (idSet.has(userId) && userId !== excludeUserId) {
      sendToSockets(sockets, message);
    }
  });
}

// Send a message to a specific user only (no broadcast), on each open tab
function sendToUser(userId, type, payload) {
  const sockets = clients.get(userId);
  if (sockets) sendToSockets(sockets, JSON.stringify({ type, payload }));
}

// Returns false if the socket was already removed (e.g. by the cap).
function removeSocket(userId, ws) {
  const sockets = clients.get(userId);
  if (!sockets?.delete(ws)) return false;
  if (sockets.size === 0) clients.delete(userId);
  return true;
}

function handleWebSocket(ws, prisma, user, tokenExp) {
  // Every tab or device keeps its own live socket. Past the cap, close the
  // oldest, so a user has at most MAX_SOCKETS_PER_USER (5) sockets open.
  let sockets = clients.get(user.id);
  if (!sockets) clients.set(user.id, (sockets = new Set()));
  while (sockets.size >= MAX_SOCKETS_PER_USER) {
    const [oldest] = sockets;
    sockets.delete(oldest);
    oldest.close(4001, "Too many open connections");
  }
  sockets.add(ws);

  // Close the socket when its sign-in token expires (`exp` is in seconds).
  // Delays past about 24 days overflow setTimeout and would fire at once.
  const expiryTimer =
    tokenExp &&
    setTimeout(
      () => ws.close(4002, "Session expired"),
      Math.min(tokenExp * 1000 - Date.now(), 2 ** 31 - 1),
    );

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
    user.id,
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
    clearTimeout(expiryTimer);
    // The user has left once their last socket closes. A socket the cap
    // already removed is skipped, so its late close event changes nothing.
    if (removeSocket(user.id, ws) && !clients.has(user.id)) {
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
    removeSocket(user.id, ws);
  });
}

// Broadcast to all clients except the sender (for shared events like new bounties).
// All of the sender's tabs are skipped: the acting tab already has the change
// from its HTTP response, and the server can't tell which tab that was.
function sendRealtimeUpdate(
  type,
  payload,
  excludeUserId = null,
  recipientUserIds = null,
) {
  if (recipientUserIds) {
    broadcastToUsers({ type, payload }, recipientUserIds, excludeUserId);
  } else {
    broadcast({ type, payload }, excludeUserId);
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
};
