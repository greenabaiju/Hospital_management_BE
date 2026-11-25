
const jwt = require("jsonwebtoken");

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
};

const verifyToken = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        message: "Access denied. No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (decoded.role === "admin") req.admin = decoded;
    if (decoded.role === "doctor") req.doctor = decoded;
    if (decoded.role === "patient") req.patient = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: "Access denied. Insufficient permissions",
    });
  }
  next();
};

const adminAuth = (req, res, next) => {
  verifyToken(req, res, () => {
    requireRole("admin")(req, res, next);
  });
};

const doctorAuth = (req, res, next) => {
  verifyToken(req, res, () => {
    requireRole("doctor")(req, res, next);
  });
};

const patientAuth = (req, res, next) => {
  verifyToken(req, res, () => {
    requireRole("patient")(req, res, next);
  });
};

// Default export preserves existing admin-only usage while enforcing admin role
const authMiddleware = adminAuth;
authMiddleware.verifyToken = verifyToken;
authMiddleware.requireRole = requireRole;
authMiddleware.adminAuth = adminAuth;
authMiddleware.doctorAuth = doctorAuth;
authMiddleware.patientAuth = patientAuth;

module.exports = authMiddleware;
