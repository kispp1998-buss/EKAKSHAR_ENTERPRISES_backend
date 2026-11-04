import mongoose from "mongoose";

const fixedSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory" },
    amount: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    vendor: { type: String, default: "" },
    remarks: { type: String, default: "" },
    active: { type: Boolean, default: true },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const FixedExpense = mongoose.model("FixedExpense", fixedSchema);
