import mongoose from "mongoose";

const catSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["daily", "fixed", "both"], default: "both" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExpenseCategory = mongoose.model("ExpenseCategory", catSchema);
