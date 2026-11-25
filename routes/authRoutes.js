const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const {
  adminLoginLimiter,
  doctorLoginLimiter,
} = require("../middleware/rateLimitMiddleware");
const {
  adminLogin,
  doctorLogin,
  sendPatientOtp,
  verifyPatientOtp,
  getMe,
} = require("../controllers/authController");

router.post("/admin/login", adminLoginLimiter, adminLogin);
router.post("/doctor/login", doctorLoginLimiter, doctorLogin);
router.post("/patient/send-otp", sendPatientOtp);
router.post("/patient/verify-otp", verifyPatientOtp);
router.get("/me", verifyToken, getMe);

module.exports = router;
