const mongoose = require("mongoose");
const Prescription = require("../models/Prescription");
const handleControllerError = require("../utils/handleError");

// GET /api/prescriptions/:appointmentId
const getPrescriptionByAppointmentId = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    if (!mongoose.isValidObjectId(appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }

    const prescription = await Prescription.findOne({
      appointment: appointmentId,
    })
      .populate("patient", "name email phone age gender")
      .populate({
        path: "doctor",
        select: "name email phone specialization",
        populate: { path: "specialization", select: "name" },
      })
      .populate("appointment", "date time status reason");

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    const { role, id } = req.user;

    if (role === "patient") {
      if (prescription.patient?._id?.toString() !== id) {
        return res.status(403).json({
          message: "Access denied. You can only view your own prescriptions.",
        });
      }
    } else if (role === "doctor") {
      if (prescription.doctor?._id?.toString() !== id) {
        return res.status(403).json({
          message:
            "Access denied. You can only view prescriptions for your assigned appointments.",
        });
      }
    } else if (role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Insufficient permissions.",
      });
    }

    res.status(200).json({
      message: "Prescription fetched successfully",
      prescription,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch prescription");
  }
};

module.exports = {
  getPrescriptionByAppointmentId,
};
