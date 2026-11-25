
const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const authMiddleware = require("../middleware/authMiddleware");
const { adminLoginLimiter } = require("../middleware/rateLimitMiddleware");
const handleControllerError = require("../utils/handleError");
const { adminLogin } = require("../controllers/authController");
const {
  getDashboardStats,
  getAllDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getAllPatients,
  updatePatient,
  deletePatient,
  getAllAppointments,
  updateAppointmentStatus,
  deleteAppointment,
  getAllPrescriptions,
  deletePrescription,
} = require("../controllers/adminController");


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Allow open registration only for the very first admin; afterwards require an existing admin token
const requireAdminIfExists = async (req, res, next) => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      return next();
    }
    return authMiddleware(req, res, next);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify admin registration access",
      error: error.message,
    });
  }
};

router.post("/register", requireAdminIfExists, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const existingAdmin = await Admin.findOne({ email: normalizedEmail });

    if (existingAdmin) {
      return res.status(409).json({
        message: "Admin already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    await newAdmin.save();

    res.status(201).json({
      message: "Admin registered successfully",
    });

  } catch (error) {
    return handleControllerError(res, error, "Registration failed");
  }
});

router.post("/login", adminLoginLimiter, adminLogin);



router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    res.status(200).json({
      message: "Admin profile fetched successfully",
      admin,
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch admin profile",
      error: error.message,
    });
  }
});

// Dashboard stats
router.get("/stats", authMiddleware, getDashboardStats);

// Doctor management
router.get("/doctors", authMiddleware, getAllDoctors);
router.post("/doctors", authMiddleware, createDoctor);
router.put("/doctors/:id", authMiddleware, updateDoctor);
router.delete("/doctors/:id", authMiddleware, deleteDoctor);

// Patient management
router.get("/patients", authMiddleware, getAllPatients);
router.put("/patients/:id", authMiddleware, updatePatient);
router.delete("/patients/:id", authMiddleware, deletePatient);

// Appointment management
router.get("/appointments", authMiddleware, getAllAppointments);
router.put("/appointments/:id/status", authMiddleware, updateAppointmentStatus);
router.delete("/appointments/:id", authMiddleware, deleteAppointment);

// Prescription management
router.get("/prescriptions", authMiddleware, getAllPrescriptions);
router.delete("/prescriptions/:id", authMiddleware, deletePrescription);

module.exports = router;
