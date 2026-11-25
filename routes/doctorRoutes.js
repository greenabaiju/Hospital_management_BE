const express = require("express");
const router = express.Router();

const { doctorAuth } = require("../middleware/authMiddleware");
const { doctorLoginLimiter } = require("../middleware/rateLimitMiddleware");
const { doctorLogin } = require("../controllers/authController");
const {
  getPublicDoctors,
  getPublicDoctorById,
  getDoctorProfile,
  updateDoctorProfile,
  getDoctorAvailability,
  updateDoctorAvailability,
  getDoctorAppointments,
  getDoctorAppointmentById,
  updateDoctorAppointmentStatus,
  saveDoctorPrescription,
  deleteDoctorPrescription,
} = require("../controllers/doctorController");

// Doctor Auth
router.post("/login", doctorLoginLimiter, doctorLogin);

// Logged-in Doctor Profile & Availability
router.get("/profile", doctorAuth, getDoctorProfile);
router.put("/profile", doctorAuth, updateDoctorProfile);
router.get("/availability", doctorAuth, getDoctorAvailability);
router.put("/availability", doctorAuth, updateDoctorAvailability);

router.get("/appointments", doctorAuth, getDoctorAppointments);
router.get(
  "/appointments/:appointmentId",
  doctorAuth,
  getDoctorAppointmentById,
);
router.put(
  "/appointments/:appointmentId/status",
  doctorAuth,
  updateDoctorAppointmentStatus,
);
router.post(
  "/appointments/:appointmentId/prescription",
  doctorAuth,
  saveDoctorPrescription,
);
router.delete(
  "/appointments/:appointmentId/prescription",
  doctorAuth,
  deleteDoctorPrescription,
);

router.get("/", getPublicDoctors);
router.get("/:id", getPublicDoctorById);

module.exports = router;
