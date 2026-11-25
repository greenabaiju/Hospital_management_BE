const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Specialization = require("../models/Specialization");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Prescription = require("../models/Prescription");
const handleControllerError = require("../utils/handleError");
const {
  isValidEmail,
  isValidPhone,
  getStartOfTodayUTC,
  parseStrictDateUTC,
  isAllowedStatusTransition,
  isValidDoctorImage,
} = require("../utils/validators");

// Public: List doctors (optional ?specialization=nameOrId&search=text)
const getPublicDoctors = async (req, res) => {
  try {
    const { specialization, search } = req.query;
    const filter = {};

    if (specialization && specialization !== "all") {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(specialization);
      if (isObjectId) {
        filter.specialization = specialization;
      } else {
        const specDoc = await Specialization.findOne({
          name: { $regex: new RegExp(`^${specialization.trim()}$`, "i") },
        });
        if (!specDoc) {
          return res.status(200).json({
            message: "Doctors fetched successfully",
            doctors: [],
          });
        }
        filter.specialization = specDoc._id;
      }
    }

    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }

    const doctors = await Doctor.find(filter)
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

// Public: Get single doctor by ID
const getPublicDoctorById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const doctor = await Doctor.findById(req.params.id)
      .select("-password")
      .populate("specialization", "name image description");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.status(200).json({
      message: "Doctor fetched successfully",
      doctor,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch doctor");
  }
};

// Protected: Get logged-in doctor profile
const getDoctorProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.doctor.id)
      .select("-password")
      .populate("specialization", "name image");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.status(200).json({
      message: "Doctor profile fetched successfully",
      doctor,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch doctor profile");
  }
};

// Protected: Update logged-in doctor profile
const updateDoctorProfile = async (req, res) => {
  try {
    const { name, email, phone, specialization, experience, bio, image } = req.body;

    if (!name || !email || !phone || !specialization) {
      return res.status(400).json({
        message: "Name, email, phone, and specialization are required",
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
      return res.status(400).json({ message: "Invalid specialization ID" });
    }

    const specExists = await Specialization.findById(specialization);
    if (!specExists) {
      return res.status(404).json({ message: "Selected specialization not found" });
    }

    const duplicateEmail = await Doctor.findOne({
      _id: { $ne: req.doctor.id },
      email: email.toLowerCase().trim(),
    });

    if (duplicateEmail) {
      return res.status(409).json({
        message: "Email is already in use by another doctor",
      });
    }

    const doctor = await Doctor.findById(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    doctor.name = name.trim();
    doctor.email = email.toLowerCase().trim();
    doctor.phone = String(phone).trim();
    doctor.specialization = specialization;
    doctor.experience = parsedExperience;
    doctor.bio = bio || "";
    if (image !== undefined) {
      doctor.image = image;
    }

    await doctor.save();

    const updated = await Doctor.findById(doctor._id)
      .select("-password")
      .populate("specialization", "name image");

    res.status(200).json({
      message: "Profile updated successfully",
      doctor: updated,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update doctor profile");
  }
};

// Protected: Get doctor availability
const getDoctorAvailability = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.doctor.id).select("availableDates");
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.status(200).json({
      availableDates: doctor.availableDates || [],
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch availability");
  }
};

// Protected: Update doctor availability
const updateDoctorAvailability = async (req, res) => {
  try {
    const { availableDates } = req.body;

    if (!Array.isArray(availableDates)) {
      return res.status(400).json({
        message: "availableDates must be an array",
      });
    }

    const todayStart = getStartOfTodayUTC();
    const uniqueDateStrs = new Set();

    for (const rawDate of availableDates) {
      const parsed = parseStrictDateUTC(rawDate);
      if (!parsed) {
        return res.status(400).json({
          message: "One or more availability dates are invalid",
        });
      }

      if (parsed.getTime() < todayStart.getTime()) {
        return res.status(400).json({
          message: "Past dates cannot be added to availability",
        });
      }

      const dateStr = parsed.toISOString().split("T")[0];
      if (uniqueDateStrs.has(dateStr)) {
        return res.status(400).json({
          message: "Duplicate availability dates are not allowed",
        });
      }
      uniqueDateStrs.add(dateStr);
    }

    const normalizedDates = Array.from(uniqueDateStrs)
      .sort()
      .map((dateStr) => new Date(`${dateStr}T00:00:00.000Z`));

    const doctor = await Doctor.findById(req.doctor.id);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Prevent removing any date that has active Pending/Confirmed appointments
    const activeAppointments = await Appointment.find({
      doctor: doctor._id,
      status: { $in: ["Pending", "Confirmed"] },
      date: { $gte: todayStart },
    }).select("date");

    const blockedDate = activeAppointments
      .map((app) => new Date(app.date).toISOString().split("T")[0])
      .find((dateStr) => !uniqueDateStrs.has(dateStr));

    if (blockedDate) {
      return res.status(400).json({
        message: `Cannot remove ${blockedDate} because active appointments exist on this date`,
      });
    }

    doctor.availableDates = normalizedDates;
    await doctor.save();

    res.status(200).json({
      message: "Availability updated successfully",
      availableDates: doctor.availableDates,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update availability");
  }
};

// Protected: Get assigned appointments for logged-in doctor (with optional search/date/status/filter)
const getDoctorAppointments = async (req, res) => {
  try {
    const { search, date, status, filter } = req.query;
    const query = { doctor: req.doctor.id };

    if (
      status &&
      ["Pending", "Confirmed", "Completed", "Cancelled"].includes(status)
    ) {
      query.status = status;
    }

    if (date && date.trim()) {
      const parsed = parseStrictDateUTC(date);
      if (!parsed) {
        return res.status(400).json({ message: "Invalid date filter" });
      }
      const end = new Date(parsed);
      end.setUTCHours(23, 59, 59, 999);
      query.date = { $gte: parsed, $lte: end };
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
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      const matchingPatients = await Patient.find({
        $or: [{ name: regex }, { email: regex }],
      }).select("_id");
      query.patient = { $in: matchingPatients.map((p) => p._id) };
    }

    const appointments = await Appointment.find(query)
      .populate("patient", "name email phone age gender address")
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

// Protected: Get single appointment details (with patient and prescription)
const getDoctorAppointmentById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const appointment = await Appointment.findOne({
      _id: req.params.appointmentId,
      doctor: req.doctor.id,
    })
      .populate("patient", "name email phone age gender address")
      .populate("specialization", "name")
      .populate("prescription");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    res.status(200).json({
      message: "Appointment details fetched successfully",
      appointment,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch appointment details");
  }
};

// Protected: Update appointment status
const updateDoctorAppointmentStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const { status } = req.body;
    const allowed = ["Pending", "Confirmed", "Completed", "Cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${allowed.join(", ")}`,
      });
    }

    const existing = await Appointment.findOne({
      _id: req.params.appointmentId,
      doctor: req.doctor.id,
    });

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
      .populate("patient", "name email phone age gender address")
      .populate("specialization", "name")
      .populate("prescription");

    res.status(200).json({
      message: "Appointment status updated",
      appointment,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to update appointment status");
  }
};

// Protected: Create or update prescription for an appointment
const saveDoctorPrescription = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    if (!mongoose.isValidObjectId(appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const { medicines, notes, followUpDate } = req.body;

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({
        message: "At least one medicine is required",
      });
    }

    const invalidMedicine = medicines.some(
      (item) => !item.name?.trim() || !item.dosage?.trim()
    );
    if (invalidMedicine) {
      return res.status(400).json({
        message: "Every medicine must have a name and dosage",
      });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctor: req.doctor.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const cleanedMedicines = medicines.map((item) => ({
      name: item.name.trim(),
      dosage: item.dosage.trim(),
      instructions: (item.instructions || "").trim(),
    }));

    let parsedFollowUp = null;
    if (followUpDate !== undefined && followUpDate !== null && String(followUpDate).trim() !== "") {
      parsedFollowUp = parseStrictDateUTC(followUpDate);
      if (!parsedFollowUp) {
        return res.status(400).json({
          message: "Invalid follow-up date",
        });
      }
      if (parsedFollowUp.getTime() < getStartOfTodayUTC().getTime()) {
        return res.status(400).json({
          message: "Follow-up date cannot be in the past",
        });
      }
    }

    let prescription = await Prescription.findOne({ appointment: appointment._id });
    const isUpdate = Boolean(prescription);

    if (prescription) {
      prescription.medicines = cleanedMedicines;
      prescription.notes = (notes || "").trim();
      prescription.followUpDate = parsedFollowUp;
      await prescription.save();
    } else {
      prescription = await Prescription.create({
        appointment: appointment._id,
        doctor: req.doctor.id,
        patient: appointment.patient,
        medicines: cleanedMedicines,
        notes: (notes || "").trim(),
        followUpDate: parsedFollowUp,
      });
    }

    appointment.prescription = prescription._id;
    if (appointment.status === "Pending" || appointment.status === "Confirmed") {
      appointment.status = "Completed";
    }
    await appointment.save();

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate
        ? "Prescription updated successfully"
        : "Prescription saved successfully",
      prescription,
      appointmentStatus: appointment.status,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to save prescription");
  }
};

// Protected: Delete prescription for an appointment
const deleteDoctorPrescription = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    if (!mongoose.isValidObjectId(appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctor: req.doctor.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const prescription = await Prescription.findOneAndDelete({
      appointment: appointment._id,
      doctor: req.doctor.id,
    });

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    appointment.prescription = null;
    await appointment.save();

    res.status(200).json({ message: "Prescription deleted successfully" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete prescription");
  }
};

module.exports = {
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
};
