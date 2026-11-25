// Simple in-memory login rate limiter to prevent password brute-force attacks
function createLoginRateLimiter({
  name = "login",
  windowMs = 15 * 60 * 1000,
  maxAttempts = 5,
} = {}) {
  const attempts = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${name}:${clientIp}`;

    const record = attempts.get(key);

    // Clear expired window
    if (record && now > record.resetAt) {
      attempts.delete(key);
    }

    const active = attempts.get(key);
    if (active && active.count >= maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((active.resetAt - now) / 1000)
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      });
    }

    // Track failed login responses (4xx) and reset counter on successful login (200)
    res.on("finish", () => {
      if (res.statusCode === 200) {
        attempts.delete(key);
        return;
      }

      if (res.statusCode === 400 || res.statusCode === 401) {
        const current = attempts.get(key);
        if (!current || Date.now() > current.resetAt) {
          attempts.set(key, { count: 1, resetAt: Date.now() + windowMs });
        } else {
          current.count += 1;
        }
      }
    });

    next();
  };
}

const adminLoginLimiter = createLoginRateLimiter({
  name: "admin-login",
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  maxAttempts: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
});

const doctorLoginLimiter = createLoginRateLimiter({
  name: "doctor-login",
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  maxAttempts: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
});

module.exports = {
  createLoginRateLimiter,
  adminLoginLimiter,
  doctorLoginLimiter,
};
