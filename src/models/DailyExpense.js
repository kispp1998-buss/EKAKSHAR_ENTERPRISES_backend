import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory", required: true },
    amount: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, default: 0 },
    vendor: { type: String, default: "" },
    paymentMode: { type: String, default: "cash" },
    remarks: { type: String, default: "" },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const DailyExpense = mongoose.model("DailyExpense", expenseSchema);
