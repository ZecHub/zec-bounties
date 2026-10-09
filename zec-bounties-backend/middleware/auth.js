const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;
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

function signSessionToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, {
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
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized");
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = await loadAuthUser(decoded.id);
    if (!user) return res.status(401).send("User not found");
    req.user = user;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
}

function isAdmin(req, res, next) {
  if (req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admins only" });
  next();
}

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    console.log(
      "optionalAuthenticate: authHeader present?",
      !!authHeader,
      "token present?",
      !!token,
    );

    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
  AUTH_USER_SELECT,
};
