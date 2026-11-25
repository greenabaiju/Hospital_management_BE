const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const { sendOtpEmail } = require("../utils/sendEmail");
const handleControllerError = require("../utils/handleError");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_OTP_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function signToken(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
}

function sanitizePatient(patientDoc) {
  const obj = patientDoc.toObject ? patientDoc.toObject() : { ...patientDoc };
  delete obj.otp;
  delete obj.otpExpiresAt;
  delete obj.otpLastSentAt;
  delete obj.otpAttempts;
  delete obj.otpLockedUntil;
  return obj;
}

// 1. Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = signToken(admin._id, "admin");
    const safeAdmin = {
      id: admin._id,
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: "admin",
    };

    res.status(200).json({
      message: "Login successful",
      token,
      user: safeAdmin,
      admin: safeAdmin,
    });
  } catch (error) {
    return handleControllerError(res, error, "Login failed");
  }
};

// 2. Doctor Login (email or username + password)
const doctorLogin = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const rawIdentifier = email || username;

    if (!rawIdentifier || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const identifier = rawIdentifier.trim();
    const doctor = await Doctor.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier },
      ],
    }).populate("specialization", "name image");

    if (!doctor) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, doctor.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = signToken(doctor._id, "doctor");
    const doctorObj = doctor.toObject();
    delete doctorObj.password;
    doctorObj.role = "doctor";

    res.status(200).json({
      message: "Doctor login successful",
      token,
      user: doctorObj,
      doctor: doctorObj,
    });
  } catch (error) {
    return handleControllerError(res, error, "Login failed");
  }
};

// 3a. Patient Send OTP
const sendPatientOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let patient = await Patient.findOne({ email: normalizedEmail });

    const now = Date.now();

    if (patient?.otpLockedUntil && patient.otpLockedUntil.getTime() > now) {
      const waitSeconds = Math.ceil(
        (patient.otpLockedUntil.getTime() - now) / 1000
      );
      return res.status(429).json({
        message: `Too many failed attempts. Please wait ${waitSeconds} seconds before requesting a new OTP.`,
        retryAfterSeconds: waitSeconds,
      });
    }

    if (
      patient?.otpLastSentAt &&
      now - patient.otpLastSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (now - patient.otpLastSentAt.getTime())) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitSeconds} seconds before resending OTP.`,
        retryAfterSeconds: waitSeconds,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    if (!patient) {
      patient = new Patient({ email: normalizedEmail });
    }

    patient.otp = hashedOtp;
    patient.otpExpiresAt = new Date(now + OTP_EXPIRY_MS);
    patient.otpLastSentAt = new Date(now);
    patient.otpAttempts = 0;
    patient.otpLockedUntil = null;
    await patient.save();

    try {
      const mailResult = await sendOtpEmail({ to: normalizedEmail, otp });
      if (mailResult.previewUrl) {
        console.log(`Ethereal OTP email preview URL: ${mailResult.previewUrl}`);
      } else if (mailResult.mode === "mock") {
        console.log(`[DEV MOCK EMAIL] OTP for ${normalizedEmail}: ${otp}`);
      }
    } catch (mailError) {
      console.error("OTP email error:", mailError.message);
      patient.otp = null;
      patient.otpExpiresAt = null;
      patient.otpLastSentAt = null;
      await patient.save();

      return res.status(500).json({
        message: "Failed to send OTP email. Please check email configuration.",
      });
    }

    res.status(200).json({
      message: "A 6-digit OTP has been sent to your email address.",
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to process OTP request");
  }
};

// 3b. Patient Verify OTP
const verifyPatientOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    const cleanOtp = String(otp || "").trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        message: "Please enter a valid 6-digit OTP",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const patient = await Patient.findOne({ email: normalizedEmail });

    if (!patient) {
      return res.status(400).json({
        message: "No active OTP found. Please request a new OTP.",
      });
    }

    const now = Date.now();

    if (patient.otpLockedUntil && patient.otpLockedUntil.getTime() > now) {
      const waitSeconds = Math.ceil(
        (patient.otpLockedUntil.getTime() - now) / 1000
      );
      return res.status(429).json({
        message: `Too many incorrect attempts. Try again in ${waitSeconds} seconds.`,
        retryAfterSeconds: waitSeconds,
      });
    }

    if (!patient.otp || !patient.otpExpiresAt) {
      return res.status(400).json({
        message: "No active OTP found. Please request a new OTP.",
      });
    }

    if (patient.otpExpiresAt.getTime() < now) {
      patient.otp = null;
      patient.otpExpiresAt = null;
      await patient.save();

      return res.status(400).json({
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    const isMatch = await bcrypt.compare(cleanOtp, patient.otp);
    if (!isMatch) {
      patient.otpAttempts = (patient.otpAttempts || 0) + 1;

      if (patient.otpAttempts >= MAX_OTP_ATTEMPTS) {
        patient.otpLockedUntil = new Date(now + LOCK_DURATION_MS);
        patient.otp = null;
        patient.otpExpiresAt = null;
        await patient.save();

        return res.status(429).json({
          message:
            "Too many incorrect OTP attempts. Please wait 5 minutes before requesting a new OTP.",
        });
      }

      await patient.save();
      const remaining = MAX_OTP_ATTEMPTS - patient.otpAttempts;

      return res.status(401).json({
        message: `Invalid OTP. ${remaining} attempt(s) remaining.`,
        attemptsRemaining: remaining,
      });
    }

    patient.otp = null;
    patient.otpExpiresAt = null;
    patient.otpAttempts = 0;
    patient.otpLockedUntil = null;
    patient.isVerified = true;
    await patient.save();

    const token = signToken(patient._id, "patient");
    const safePatient = sanitizePatient(patient);

    res.status(200).json({
      message: "Patient login successful",
      token,
      user: safePatient,
      patient: safePatient,
    });
  } catch (error) {
    return handleControllerError(res, error, "OTP verification failed");
  }
};

// 4. Get Currently Authenticated User (/api/auth/me)
const getMe = async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role === "admin") {
      const admin = await Admin.findById(id).select("-password");
      if (!admin) return res.status(404).json({ message: "User not found" });
      return res.status(200).json({ user: admin });
    }

    if (role === "doctor") {
      const doctor = await Doctor.findById(id)
        .select("-password")
        .populate("specialization", "name image");
      if (!doctor) return res.status(404).json({ message: "User not found" });
      const doctorObj = doctor.toObject();
      doctorObj.role = "doctor";
      return res.status(200).json({ user: doctorObj });
    }

    if (role === "patient") {
      const patient = await Patient.findById(id).select(
        "-otp -otpExpiresAt -otpLastSentAt -otpAttempts -otpLockedUntil"
      );
      if (!patient) return res.status(404).json({ message: "User not found" });
      return res.status(200).json({ user: patient });
    }

    return res.status(403).json({ message: "Unknown user role" });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Failed to fetch authenticated user"
    );
  }
};

module.exports = {
  adminLogin,
  doctorLogin,
  sendPatientOtp,
  verifyPatientOtp,
  getMe,
};
