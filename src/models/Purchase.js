import mongoose from "mongoose";

const lineSchema = new mongoose.Schema(
  {
    material: {
      type: String,
      enum: ["ink", "paper_roll", "lanyard_roll", "other"],
      required: true,
    },
    variant: { type: String, default: "" },
    size: { type: String, default: "" },
    unit: { type: String, default: "pcs" },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    handlingRate: { type: Number, default: 0 },
    handlingAmount: { type: Number, default: 0 },
    basicAmount: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { _id: true }
);

const purchaseSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    invoiceRef: { type: String, default: "" },
    notes: { type: String, default: "" },
    lines: { type: [lineSchema], default: [] },
    basicAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    transportation: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    handlingAmount: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Purchase = mongoose.model("Purchase", purchaseSchema);
