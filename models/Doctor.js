
const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    phone: {
      type: String,
      required: true
    },

    specialization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialization",
      required: true
    },

    experience: {
      type: Number,
      default: 0
    },

    image: {
      type: String,
      default: ""
    },

    bio: {
      type: String,
      default: ""
    },

    availableDates: [
      {
        type: Date
      }
    ]
  },
  {
    timestamps: true
  }
);

const Doctor = mongoose.model("Doctor", doctorSchema);

module.exports = Doctor;
