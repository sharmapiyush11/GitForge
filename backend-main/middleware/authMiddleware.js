const jwt = require("jsonwebtoken");

function getJwtSecret() {
  return process.env.JWT_SECRET_KEY || "gitforge_dev_secret_change_in_prod";
}

function extractToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function authenticateToken(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication token required" });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      req.userId = decoded.id;
    } catch {
      req.userId = null;
    }
  }
  next();
}

module.exports = {
  getJwtSecret,
  authenticateToken,
  optionalAuth,
};
