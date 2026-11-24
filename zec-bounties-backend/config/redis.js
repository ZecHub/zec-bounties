const { createClient } = require("redis");

const reconnectDelay = (retries) => {
  const attempt = Number.isFinite(retries) && retries >= 0 ? retries : 0;
  return Math.min((attempt + 1) * 100, 3000);
};

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: { reconnectStrategy: reconnectDelay },
});

redisClient.on("error", (err) => console.error("Redis error:", err));

let connectPromise = null;

const connectRedis = async () => {
  if (redisClient.isOpen) {
    return;
  }
  if (!connectPromise) {
    connectPromise = Promise.resolve(redisClient.connect())
      .then(() => {
        console.log("Redis connected");
      })
      .finally(() => {
        connectPromise = null;
      });
  }
  return connectPromise;
};

module.exports = { redisClient, connectRedis, reconnectDelay };
