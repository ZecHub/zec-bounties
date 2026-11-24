const jwt = require("jsonwebtoken");
const prisma = require("../prisma/client");

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  role: true,
  avatar: true,
  z_address: true,
  UA_address: true,
  isRobin: true,
  isManOfSteel: true,
  ofacVerified: true,
  emailNotifications: true,
  discordUsername: true,
};

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function extractBearerToken(authHeader) {
  if (typeof authHeader !== "string") return null;
  const match = authHeader.trim().match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function signSessionToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, getJwtSecret(), {
    expiresIn: "7d",
  });
}

async function loadAuthUser(id) {
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: AUTH_USER_SELECT,
  });
}

async function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers?.authorization);
  if (!token) return res.status(401).send("Unauthorized");
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await loadAuthUser(decoded.id);
    if (!user) return res.status(401).send("User not found");
    req.user = user;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
}

function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admins only" });
  next();
}

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    const token = extractBearerToken(authHeader);

    console.log(
      "optionalAuthenticate: authHeader present?",
      !!authHeader,
      "token present?",
      !!token,
    );

    if (!token) return next();

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await loadAuthUser(decoded.id);
    if (user) req.user = user;
    else
      console.log(
        "optionalAuthenticate: token valid but no user found for id",
        decoded.id,
      );
  } catch (err) {
    console.log(
      "optionalAuthenticate: token verify/lookup failed:",
      err.message,
    );
  }
  next();
};

module.exports = {
  authenticate,
  isAdmin,
  optionalAuthenticate,
  signSessionToken,
  loadAuthUser,
  extractBearerToken,
  AUTH_USER_SELECT,
};
