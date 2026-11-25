const Patient = require("../models/Patient");
const handleControllerError = require("../utils/handleError");
const { isValidPhone } = require("../utils/validators");

const PATIENT_SAFE_SELECT =
  "-otp -otpExpiresAt -otpLastSentAt -otpAttempts -otpLockedUntil";

// Get logged-in patient profile
const getPatientProfile = async (req, res) => {
  try {
    const patient = await Patient.findById(req.patient.id).select(
      PATIENT_SAFE_SELECT
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.status(200).json({
      message: "Patient profile fetched successfully",
      patient,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch patient profile");
  }
};

// Update logged-in patient's own profile
const updatePatientProfile = async (req, res) => {
  try {
    const { name, phone, age, gender, address } = req.body;

    const patient = await Patient.findById(req.patient.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (name !== undefined && String(name).trim().length < 2) {
      return res.status(400).json({
        message: "Name must be at least 2 characters long",
      });
    }

    if (
      phone !== undefined &&
      String(phone).trim() !== "" &&
      !isValidPhone(phone)
    ) {
      return res.status(400).json({
        message: "Please enter a valid phone number (7 to 15 digits)",
      });
    }

    if (age !== undefined && age !== "" && age !== null) {
      const parsedAge = Number(age);
      if (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > 150) {
        return res.status(400).json({
          message: "Age must be a valid number between 0 and 150",
        });
      }
    }

    if (
      gender !== undefined &&
      gender !== "" &&
      !["Male", "Female", "Other"].includes(gender)
    ) {
      return res.status(400).json({
        message: "Gender must be Male, Female, or Other",
      });
    }

    if (name !== undefined) patient.name = name.trim();
    if (phone !== undefined) patient.phone = String(phone).trim();
    if (age !== undefined && age !== "" && age !== null) {
      patient.age = Number(age);
    } else if (age === "" || age === null) {
      patient.age = undefined;
    }
    if (gender !== undefined) patient.gender = gender;
    if (address !== undefined) patient.address = String(address).trim();

    await patient.save();

    const sanitized = await Patient.findById(patient._id).select(
      PATIENT_SAFE_SELECT
    );

    res.status(200).json({
      message: "Profile updated successfully",
      patient: sanitized,
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Failed to update patient profile"
    );
  }
};

module.exports = {
  getPatientProfile,
  updatePatientProfile,
};
