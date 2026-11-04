import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["ink", "paper", "lanyard", "mixed", "other"], default: "mixed" },
    contact: { type: String, default: "" },
    gstin: { type: String, default: "" },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Supplier = mongoose.model("Supplier", supplierSchema);
