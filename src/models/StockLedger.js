import mongoose from "mongoose";

const stockSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    material: { type: String, required: true },
    variant: { type: String, default: "" },
    unit: { type: String, default: "pcs" },
    type: {
      type: String,
      enum: ["opening", "purchase", "consumption", "dispatch", "adjustment_in", "adjustment_out"],
      required: true,
    },
    quantity: { type: Number, required: true },
    rate: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    refType: { type: String, default: "" },
    refId: { type: String, default: "" },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

stockSchema.index({ material: 1, variant: 1, date: 1 });

export const StockLedger = mongoose.model("StockLedger", stockSchema);
