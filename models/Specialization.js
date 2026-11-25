
const mongoose = require("mongoose");

const specializationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    image: {
      type: String,
      default: ""
    },

    description: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

const Specialization = mongoose.model(
  "Specialization",
  specializationSchema
);

module.exports = Specialization;
