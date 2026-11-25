
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Specialization = require("../models/Specialization");
const Doctor = require("../models/Doctor");
const authMiddleware = require("../middleware/authMiddleware");
const handleControllerError = require("../utils/handleError");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Get All Specializations
router.get("/", async (req, res) => {
  try {
    const specializations = await Specialization.find();

    res.status(200).json({
      message: "Specializations fetched successfully",
      specializations
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch specializations",
      error: error.message
    });
  }
});

// Add Specialization
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, image, description } = req.body;
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName) {
      return res.status(400).json({
        message: "Specialization name is required"
      });
    }

    const existing = await Specialization.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
    });

    if (existing) {
      return res.status(409).json({
        message: "Specialization already exists"
      });
    }

    const newSpecialization = new Specialization({
      name: trimmedName,
      image,
      description
    });

    await newSpecialization.save();

    res.status(201).json({
      message: "Specialization added successfully",
      specialization: newSpecialization
    });

  } catch (error) {
    return handleControllerError(res, error, "Failed to add specialization");
  }
});

// Update Specialization
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid specialization ID"
      });
    }

    const { name, image, description } = req.body;
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName) {
      return res.status(400).json({
        message: "Specialization name is required"
      });
    }

    const existing = await Specialization.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
    });

    if (existing) {
      return res.status(409).json({
        message: "Specialization already exists"
      });
    }

    const specialization = await Specialization.findByIdAndUpdate(
      req.params.id,
      { name: trimmedName, image, description },
      { returnDocument: "after", runValidators: true }
    );

    if (!specialization) {
      return res.status(404).json({
        message: "Specialization not found"
      });
    }

    res.status(200).json({
      message: "Specialization updated successfully",
      specialization
    });

  } catch (error) {
    return handleControllerError(res, error, "Failed to update specialization");
  }
});

// Delete Specialization
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid specialization ID"
      });
    }

    const assignedDoctors = await Doctor.countDocuments({
      specialization: req.params.id
    });

    if (assignedDoctors > 0) {
      return res.status(400).json({
        message: "Cannot delete specialization assigned to existing doctors"
      });
    }

    const specialization = await Specialization.findByIdAndDelete(
      req.params.id
    );

    if (!specialization) {
      return res.status(404).json({
        message: "Specialization not found"
      });
    }

    res.status(200).json({
      message: "Specialization deleted successfully"
    });

  } catch (error) {
    return handleControllerError(res, error, "Failed to delete specialization");
  }
});

module.exports = router;
