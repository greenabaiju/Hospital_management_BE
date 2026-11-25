const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const handleControllerError = require("../utils/handleError");
const {
  getStartOfTodayUTC,
  parseStrictDateUTC,
} = require("../utils/validators");

const ALLOWED_TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
];

function normalizeTimeSlot(rawTime) {
  if (typeof rawTime !== "string") return "";
  return rawTime.trim().replace(/\s+/g, " ").toUpperCase();
}

// 1. POST /api/appointments - Book a new appointment (Patient only)
const createAppointment = async (req, res) => {
  try {
    const doctorId = req.body.doctorId || req.body.doctor;
    const { date, time, reason } = req.body;

    if (!doctorId || !date || !time) {
      return res.status(400).json({
        message: "Doctor, date, and time slot are required",
      });
    }

    if (!mongoose.isValidObjectId(doctorId)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const parsedDate = parseStrictDateUTC(date);
    if (!parsedDate) {
      return res.status(400).json({ message: "Invalid appointment date" });
    }

    const todayStart = getStartOfTodayUTC();
    if (parsedDate.getTime() < todayStart.getTime()) {
      return res.status(400).json({
        message: "Appointments cannot be booked for past dates",
      });
    }

    const normalizedTime = normalizeTimeSlot(time);
    if (!ALLOWED_TIME_SLOTS.includes(normalizedTime)) {
      return res.status(400).json({
        message: `Invalid time slot. Allowed slots: ${ALLOWED_TIME_SLOTS.join(", ")}`,
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const targetDateStr = parsedDate.toISOString().split("T")[0];
    const isDoctorAvailable = (doctor.availableDates || []).some(
      (availDate) => new Date(availDate).toISOString().split("T")[0] === targetDateStr
    );

    if (!isDoctorAvailable) {
      return res.status(400).json({
        message: "Doctor is not available on the selected date",
      });
    }

    // Fast pre-check (database partial unique index guarantees race-condition protection)
    const existingSlot = await Appointment.findOne({
      doctor: doctor._id,
      date: parsedDate,
      time: normalizedTime,
      status: { $in: ["Pending", "Confirmed", "Completed"] },
    });

    if (existingSlot) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another slot.",
      });
    }

    const created = await Appointment.create({
      patient: req.patient.id,
      doctor: doctor._id,
      specialization: doctor.specialization,
      date: parsedDate,
      time: normalizedTime,
      status: "Confirmed",
      reason: typeof reason === "string" ? reason.trim() : "",
    });

    const populated = await Appointment.findById(created._id)
      .populate({
        path: "doctor",
        select: "name image experience specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("specialization", "name");

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment: populated,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another slot.",
      });
    }
    return handleControllerError(res, error, "Failed to book appointment");
  }
};

// 2. GET /api/appointments/booked-slots?doctorId=...&date=...
const getBookedSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        message: "doctorId and date query parameters are required",
      });
    }

    if (!mongoose.isValidObjectId(doctorId)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const parsedDate = parseStrictDateUTC(date);
    if (!parsedDate) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const appointments = await Appointment.find({
      doctor: doctorId,
      date: parsedDate,
      status: { $ne: "Cancelled" },
    }).select("time -_id");

    res.status(200).json({
      bookedSlots: appointments.map((a) => a.time),
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch booked slots");
  }
};

// 3. GET /api/appointments/patient?filter=upcoming|past
const getPatientAppointments = async (req, res) => {
  try {
    const { filter } = req.query;
    const query = { patient: req.patient.id };
    const todayStart = getStartOfTodayUTC();

    if (filter === "upcoming") {
      query.status = { $in: ["Pending", "Confirmed"] };
      query.date = { $gte: todayStart };
    } else if (filter === "past") {
      query.$or = [
        { date: { $lt: todayStart } },
        { status: { $in: ["Completed", "Cancelled"] } },
      ];
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: "doctor",
        select: "name image experience specialization",
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

// 4. PUT /api/appointments/:id/cancel
const cancelPatientAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.patient.toString() !== req.patient.id) {
      return res.status(403).json({
        message: "Access denied. You can only cancel your own appointments.",
      });
    }

    if (appointment.status === "Completed") {
      return res.status(400).json({
        message: "Completed appointments cannot be cancelled",
      });
    }

    if (appointment.status === "Cancelled") {
      return res.status(400).json({
        message: "Appointment is already cancelled",
      });
    }

    appointment.status = "Cancelled";
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate({
        path: "doctor",
        select: "name image experience specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("specialization", "name")
      .populate("prescription", "_id");

    res.status(200).json({
      message: "Appointment cancelled successfully",
      appointment: populated,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to cancel appointment");
  }
};

module.exports = {
  createAppointment,
  getBookedSlots,
  getPatientAppointments,
  cancelPatientAppointment,
};
