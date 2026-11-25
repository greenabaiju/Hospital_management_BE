const express = require("express");
const router = express.Router();

const { patientAuth } = require("../middleware/authMiddleware");
const {
  createAppointment,
  getBookedSlots,
  getPatientAppointments,
  cancelPatientAppointment,
} = require("../controllers/appointmentController");

router.post("/", patientAuth, createAppointment);
router.get("/booked-slots", patientAuth, getBookedSlots);
router.get("/patient", patientAuth, getPatientAppointments);
router.put("/:id/cancel", patientAuth, cancelPatientAppointment);

module.exports = router;
