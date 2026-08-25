require("dotenv").config();
const cron = require("node-cron");
const express = require("express");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { createServer } = require("http");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { handleWebSocket } = require("./middleware/websocket");
const { WebSocketServer } = require("ws");
const prisma = require("./prisma/client");
const { connectRedis } = require("./config/redis");

const app = express();
const server = createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const allowedOrigins = [
  FRONTEND_URL,
  "https://zec-bounties-frontend.vercel.app",
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "Server is running",
    endpoints: ["/auth", "/api/bounties", "/api/transactions"],
  });
});

app.use("/auth", require("./routes/auth"));
app.use("/api/bounties", require("./routes/bounties"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/zcash", require("./routes/zcash"));
app.use("/api/teams", require("./routes/teams"));
app.use("/api/kpis", require("./routes/kpis"));
app.use("/api/users", require("./routes/users"));
app.use("/api/notifications", require("./routes/notifications"));

// WebSocket server
// SECURITY FIX (S2): reject the upgrade before a socket is ever handed to
// handleWebSocket unless the caller presents a valid JWT for a real user.
// Identity is derived here, server-side, from the verified token — the
// client can no longer just claim a userId.
const wss = new WebSocketServer({
  server,
  verifyClient: async (info, done) => {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      // Accept the token either as ?token=... or via Sec-WebSocket-Protocol,
      // since browsers can't set custom headers on the WS handshake.
      const token =
        url.searchParams.get("token") ||
        info.req.headers["sec-websocket-protocol"];

      if (!token) {
        return done(false, 401, "Unauthorized");
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user) {
        return done(false, 401, "Unauthorized");
      }

      // Stash the verified user on the upgrade request so the
      // 'connection' handler can trust it without re-parsing anything
      // the client sent.
      info.req.authenticatedUser = user;
      done(true);
    } catch (err) {
      done(false, 401, "Unauthorized");
    }
  },
});

wss.on("connection", (ws, req) => {
  handleWebSocket(ws, prisma, req.authenticatedUser);
});

// Middleware to attach wss to request object
app.use((req, res, next) => {
  req.wss = wss;
  next();
});

// Start server
const PORT = process.env.PORT || 9001;
server.listen(PORT, async () => {
  await connectRedis();
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  wss.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down gracefully...");
  wss.close();
  await prisma.$disconnect();
  process.exit(0);
});
