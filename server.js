
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const validateEnv = require("./config/validateEnv");

const adminRoutes = require("./routes/adminRoutes");
const specializationRoutes = require("./routes/specializationRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");

const app = express();

// Middleware
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((origin) => origin.trim())
  : true;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Auth Routes
app.use("/api/auth", authRoutes);

// Admin Routes
app.use("/api/admin", adminRoutes);

// Specialization Routes
app.use("/api/specializations", specializationRoutes);

// Doctor Routes
app.use("/api/doctors", doctorRoutes);

// Patient Routes
app.use("/api/patients", patientRoutes);

// Appointment Routes
app.use("/api/appointments", appointmentRoutes);

// Prescription Routes
app.use("/api/prescriptions", prescriptionRoutes);

// Home Route
app.get("/", (req, res) => {
  res.send("MediCore Hospital Management API Running");
});

// 404 JSON Fallback
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Global Express Error Handler
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      message: "Request payload is too large",
    });
  }

  if (err instanceof SyntaxError && err?.status === 400 && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON payload",
    });
  }

  if (err?.name === "ValidationError") {
    const firstMessage = Object.values(err.errors || {})[0]?.message;
    return res.status(400).json({
      message: firstMessage || "Validation failed",
    });
  }

  return res.status(err?.status || 500).json({
    message: "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
