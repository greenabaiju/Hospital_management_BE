const WEAK_JWT_SECRETS = new Set([
  "secret",
  "jwt_secret",
  "your_jwt_secret",
  "your_jwt_secret_key",
  "your_long_random_secret_key",
  "changeme",
  "password",
  "123456",
  "test",
]);

function validateEnv() {
  const errors = [];
  const mongoUri = (process.env.MONGO_URI || "").trim();
  const jwtSecret = (process.env.JWT_SECRET || "").trim();

  if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
    errors.push("MONGO_URI is missing or still set to a placeholder value.");
  }

  if (!jwtSecret) {
    errors.push("JWT_SECRET is missing.");
  } else if (WEAK_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
    errors.push("JWT_SECRET cannot be a weak or placeholder value.");
  } else if (jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long.");
  }

  if (errors.length > 0) {
    console.error("Environment configuration error:");
    errors.forEach((msg) => console.error(`- ${msg}`));
    process.exit(1);
  }
}

module.exports = validateEnv;
