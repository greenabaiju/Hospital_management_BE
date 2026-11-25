const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Doctor = require("../models/Doctor");
const Specialization = require("../models/Specialization");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Prescription = require("../models/Prescription");
const handleControllerError = require("../utils/handleError");
const {
  isValidEmail,
  isValidPhone,
  getStartOfTodayUTC,
  isAllowedStatusTransition,
  isValidDoctorImage,
} = require("../utils/validators");

const PATIENT_SAFE_SELECT =
  "-otp -otpExpiresAt -otpLastSentAt -otpAttempts -otpLockedUntil";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUtcDayRange(dateInput) {
  const parsed = new Date(`${String(dateInput).trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const end = new Date(parsed);
  end.setUTCHours(23, 59, 59, 999);
  return { start: parsed, end };
}

// Dashboard summary counts
const getDashboardStats = async (req, res) => {
  try {
    const todayStart = getStartOfTodayUTC();

    const [
      specializations,
      doctors,
      patients,
      appointments,
      prescriptions,
      upcomingAppointments,
      completedAppointments,
    ] = await Promise.all([
      Specialization.countDocuments(),
      Doctor.countDocuments(),
      Patient.countDocuments(),
      Appointment.countDocuments(),
      Prescription.countDocuments(),
      Appointment.countDocuments({
        status: { $in: ["Pending", "Confirmed"] },
        date: { $gte: todayStart },
      }),
      Appointment.countDocuments({ status: "Completed" }),
    ]);

    res.status(200).json({
      stats: {
        specializations,
        doctors,
        patients,
        appointments,
        prescriptions,
        upcomingAppointments,
        completedAppointments,
      },
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch dashboard stats");
  }
};

// ---------------- DOCTORS ----------------

const getAllDoctors = async (req, res) => {
  try {
    const { search, specialization } = req.query;
    const query = {};

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { username: regex },
        { phone: regex },
      ];
    }

    if (specialization && specialization.trim() && specialization !== "all") {
      if (mongoose.isValidObjectId(specialization.trim())) {
        query.specialization = specialization.trim();
      } else {
        const specDoc = await Specialization.findOne({
          name: {
            $regex: new RegExp(`^${escapeRegex(specialization.trim())}$`, "i"),
          },
        }).select("_id");
        if (!specDoc) {
          return res.status(200).json({
            message: "Doctors fetched successfully",
            doctors: [],
          });
        }
        query.specialization = specDoc._id;
      }
    }

    const doctors = await Doctor.find(query)
      .select("-password")
      .populate("specialization", "name image")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Doctors fetched successfully",
      doctors,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch doctors");
  }
};

const createDoctor = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      username,
      phone,
      specialization,
      experience,
      image,
      bio,
    } = req.body;

    if (!name || !email || !password || !username || !phone || !specialization) {
      return res.status(400).json({
        message: "Name, email, username, password, phone, and specialization are required",
      });
    }

    if (String(name).trim().length < 2) {
      return res.status(400).json({
        message: "Doctor name must be at least 2 characters",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        message: "Please enter a valid phone number (7 to 15 digits)",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const parsedExperience =
      experience !== undefined && experience !== "" ? Number(experience) : 0;
    if (Number.isNaN(parsedExperience) || parsedExperience < 0) {
      return res.status(400).json({
        message: "Experience cannot be negative",
      });
    }

    if (image !== undefined && !isValidDoctorImage(image)) {
      return res.status(400).json({
        message: "Please provide a valid HTTP/HTTPS image URL or base64 image",
      });
    }

    if (!mongoose.isValidObjectId(specialization)) {
      return res.status(400).json({
        message: "Invalid specialization ID",
      });
    }

    const specExists = await Specialization.findById(specialization);
    if (!specExists) {
      return res.status(404).json({
        message: "Selected specialization not found",
      });
    }

    const existingDoctor = await Doctor.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { username: username.trim() },
      ],
    });

    if (existingDoctor) {
      return res.status(409).json({
        message: "A doctor with this email or username already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const doctor = await Doctor.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      username: username.trim(),
      phone: String(phone).trim(),
      specialization,
      experience: parsedExperience,
      image: image || "",
      bio: bio || "",
    });

    const populated = await Doctor.findById(doctor._id)
      .select("-password")
      .populate("specialization", "name image");

    res.status(201).json({
      message: "Doctor added successfully",
      doctor: populated,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to add doctor");
  }
};

const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const {
      name,
      email,
      password,
      username,
      phone,
      specialization,
      experience,
      image,
      bio,
    } = req.body;

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    if (name !== undefined && String(name).trim().length < 2) {
      return res.status(400).json({ message: "Doctor name must be at least 2 characters" });
    }

    if (email !== undefined && !isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (phone !== undefined && !isValidPhone(phone)) {
      return res.status(400).json({ message: "Please enter a valid phone number (7 to 15 digits)" });
    }

    if (experience !== undefined && experience !== "") {
      const parsedExp = Number(experience);
      if (Number.isNaN(parsedExp) || parsedExp < 0) {
        return res.status(400).json({ message: "Experience cannot be negative" });
      }
    }

    if (password !== undefined && password.trim() && password.trim().length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    if (image !== undefined && !isValidDoctorImage(image)) {
      return res.status(400).json({
        message: "Please provide a valid HTTP/HTTPS image URL or base64 image",
      });
    }

    if (specialization) {
      if (!mongoose.isValidObjectId(specialization)) {
        return res.status(400).json({ message: "Invalid specialization ID" });
      }
      const specExists = await Specialization.findById(specialization);
      if (!specExists) {
        return res.status(404).json({ message: "Selected specialization not found" });
      }
    }

    if (email || username) {
      const duplicate = await Doctor.findOne({
        _id: { $ne: id },
        $or: [
          ...(email ? [{ email: email.toLowerCase().trim() }] : []),
          ...(username ? [{ username: username.trim() }] : []),
        ],
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Another doctor already uses this email or username",
        });
      }
    }

    if (name !== undefined) doctor.name = name.trim();
    if (email !== undefined) doctor.email = email.toLowerCase().trim();
    if (username !== undefined) doctor.username = username.trim();
    if (phone !== undefined) doctor.phone = String(phone).trim();
    if (specialization !== undefined) doctor.specialization = specialization;
    if (experience !== undefined && experience !== "") doctor.experience = Number(experience);
    if (image !== undefined) doctor.image = image;
    if (bio !== undefined) doctor.bio = bio;
    if (password && password.trim()) {
      doctor.password = await bcrypt.hash(password.trim(), 10);
    }

    await doctor.save();

    const updated = await Doctor.findById(doctor._id)
      .select("-password")
      .populate("specialization", "name image");

    res.status(200).json({
      message: "Doctor updated successfully",
      doctor: updated,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update doctor");
  }
};

const deleteDoctor = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const [appointmentCount, prescriptionCount] = await Promise.all([
      Appointment.countDocuments({ doctor: doctor._id }),
      Prescription.countDocuments({ doctor: doctor._id }),
    ]);

    if (appointmentCount > 0 || prescriptionCount > 0) {
      return res.status(400).json({
        message:
          "Cannot delete doctor with existing appointments or prescriptions",
      });
    }

    await Doctor.findByIdAndDelete(doctor._id);

    res.status(200).json({ message: "Doctor deleted successfully" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete doctor");
  }
};

// ---------------- PATIENTS ----------------

const getAllPatients = async (req, res) => {
  try {
    const { search, verified, gender } = req.query;
    const query = {};

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    if (verified === "true") query.isVerified = true;
    else if (verified === "false") query.isVerified = false;

    if (gender && ["Male", "Female", "Other"].includes(gender)) {
      query.gender = gender;
    }

    const patients = await Patient.find(query)
      .select(PATIENT_SAFE_SELECT)
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Patients fetched successfully",
      patients,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch patients");
  }
};

const updatePatient = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid patient ID" });
    }

    const { name, email, phone, age, gender, address } = req.body;
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (name !== undefined && String(name).trim().length < 2) {
      return res.status(400).json({ message: "Patient name must be at least 2 characters" });
    }

    if (email !== undefined) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      const duplicate = await Patient.findOne({
        _id: { $ne: patient._id },
        email: email.toLowerCase().trim(),
      });
      if (duplicate) {
        return res.status(409).json({ message: "Email is already used by another patient" });
      }
    }

    if (phone !== undefined && String(phone).trim() !== "" && !isValidPhone(phone)) {
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

    if (gender !== undefined && gender !== "" && !["Male", "Female", "Other"].includes(gender)) {
      return res.status(400).json({
        message: "Gender must be Male, Female, or Other",
      });
    }

    if (name !== undefined) patient.name = name.trim();
    if (email !== undefined) patient.email = email.toLowerCase().trim();
    if (phone !== undefined) patient.phone = String(phone).trim();
    if (age !== undefined && age !== "" && age !== null) patient.age = Number(age);
    if (gender !== undefined) patient.gender = gender;
    if (address !== undefined) patient.address = address.trim();

    await patient.save();

    const sanitized = await Patient.findById(patient._id).select(PATIENT_SAFE_SELECT);
    res.status(200).json({
      message: "Patient updated successfully",
      patient: sanitized,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update patient");
  }
};

const deletePatient = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid patient ID" });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const [appointmentCount, prescriptionCount] = await Promise.all([
      Appointment.countDocuments({ patient: patient._id }),
      Prescription.countDocuments({ patient: patient._id }),
    ]);

    if (appointmentCount > 0 || prescriptionCount > 0) {
      return res.status(400).json({
        message:
          "Cannot delete patient with existing appointments or prescriptions",
      });
    }

    await Patient.findByIdAndDelete(patient._id);

    res.status(200).json({ message: "Patient deleted successfully" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete patient");
  }
};

// ---------------- APPOINTMENTS ----------------

const getAllAppointments = async (req, res) => {
  try {
    const { search, status, date, doctorId, patientId, filter } = req.query;
    const query = {};

    if (status && ["Pending", "Confirmed", "Completed", "Cancelled"].includes(status)) {
      query.status = status;
    }

    if (doctorId) {
      if (!mongoose.isValidObjectId(doctorId)) {
        return res.status(400).json({ message: "Invalid doctor ID filter" });
      }
      query.doctor = doctorId;
    }

    if (patientId) {
      if (!mongoose.isValidObjectId(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID filter" });
      }
      query.patient = patientId;
    }

    if (date && date.trim()) {
      const range = buildUtcDayRange(date);
      if (!range) {
        return res.status(400).json({ message: "Invalid date filter" });
      }
      query.date = { $gte: range.start, $lte: range.end };
    } else if (filter === "upcoming") {
      query.status = { $in: ["Pending", "Confirmed"] };
      query.date = { $gte: getStartOfTodayUTC() };
    } else if (filter === "past") {
      query.$or = [
        { date: { $lt: getStartOfTodayUTC() } },
        { status: { $in: ["Completed", "Cancelled"] } },
      ];
    }

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      const [matchingPatients, matchingDoctors] = await Promise.all([
        Patient.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
        Doctor.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
      ]);

      const searchOr = [
        { patient: { $in: matchingPatients.map((p) => p._id) } },
        { doctor: { $in: matchingDoctors.map((d) => d._id) } },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    const appointments = await Appointment.find(query)
      .populate("patient", "name email phone age gender")
      .populate({
        path: "doctor",
        select: "name email phone specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("specialization", "name")
      .populate("prescription", "_id")
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({
      message: "Appointments fetched successfully",
      appointments,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch appointments");
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const { status } = req.body;
    const allowed = ["Pending", "Confirmed", "Completed", "Cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${allowed.join(", ")}`,
      });
    }

    const existing = await Appointment.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (!isAllowedStatusTransition(existing.status, status)) {
      return res.status(400).json({
        message: `Cannot change appointment status from ${existing.status} to ${status}`,
      });
    }

    existing.status = status;
    await existing.save();

    const appointment = await Appointment.findById(existing._id)
      .populate("patient", "name email phone age gender")
      .populate({
        path: "doctor",
        select: "name email phone specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("specialization", "name");

    res.status(200).json({
      message: "Appointment status updated",
      appointment,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update appointment status");
  }
};

const deleteAppointment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.prescription) {
      await Prescription.findByIdAndDelete(appointment.prescription);
    }

    res.status(200).json({ message: "Appointment deleted successfully" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete appointment");
  }
};

// ---------------- PRESCRIPTIONS ----------------

const getAllPrescriptions = async (req, res) => {
  try {
    const { search, date, doctorId, patientId } = req.query;
    const query = {};

    if (doctorId) {
      if (!mongoose.isValidObjectId(doctorId)) {
        return res.status(400).json({ message: "Invalid doctor ID filter" });
      }
      query.doctor = doctorId;
    }

    if (patientId) {
      if (!mongoose.isValidObjectId(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID filter" });
      }
      query.patient = patientId;
    }

    if (date && date.trim()) {
      const range = buildUtcDayRange(date);
      if (!range) {
        return res.status(400).json({ message: "Invalid prescription date filter" });
      }
      query.createdAt = { $gte: range.start, $lte: range.end };
    }

    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      const [matchingPatients, matchingDoctors] = await Promise.all([
        Patient.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
        Doctor.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
      ]);

      query.$or = [
        { patient: { $in: matchingPatients.map((p) => p._id) } },
        { doctor: { $in: matchingDoctors.map((d) => d._id) } },
        { "medicines.name": regex },
      ];
    }

    const prescriptions = await Prescription.find(query)
      .populate("patient", "name email phone age gender")
      .populate({
        path: "doctor",
        select: "name email specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("appointment", "date time status")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Prescriptions fetched successfully",
      prescriptions,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch prescriptions");
  }
};

const deletePrescription = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid prescription ID" });
    }

    const prescription = await Prescription.findByIdAndDelete(req.params.id);
    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    await Appointment.findByIdAndUpdate(prescription.appointment, {
      prescription: null,
    });

    res.status(200).json({ message: "Prescription deleted successfully" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete prescription");
  }
};

module.exports = {
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
};
