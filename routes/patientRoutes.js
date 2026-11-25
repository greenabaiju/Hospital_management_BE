const express = require("express");
const router = express.Router();

const { patientAuth } = require("../middleware/authMiddleware");
const {
  getPatientProfile,
  updatePatientProfile,
} = require("../controllers/patientController");

router.get("/profile", patientAuth, getPatientProfile);
router.put("/profile", patientAuth, updatePatientProfile);

module.exports = router;
