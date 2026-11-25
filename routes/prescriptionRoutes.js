const express = require("express");
const router = express.Router();

const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const {
  getPrescriptionByAppointmentId,
} = require("../controllers/prescriptionController");

router.get(
  "/:appointmentId",
  verifyToken,
  requireRole("patient", "doctor", "admin"),
  getPrescriptionByAppointmentId
);

module.exports = router;
