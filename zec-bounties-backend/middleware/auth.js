const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;
const prisma = require("../prisma/client");

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized");
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
}

function isAdmin(req, res, next) {
  if (req.user.role !== "ADMIN") return res.status(403).send("Admins only");
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

    if (!token) return next(); // no token — proceed as anonymous

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
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
module.exports = { authenticate, isAdmin, optionalAuthenticate };
