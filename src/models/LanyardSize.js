import mongoose from "mongoose";

const sizeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    mm: { type: Number, default: null },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const LanyardSize = mongoose.model("LanyardSize", sizeSchema);
