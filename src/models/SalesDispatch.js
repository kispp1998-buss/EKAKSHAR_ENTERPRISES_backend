import mongoose from "mongoose";

const dispatchSchema = new mongoose.Schema(
  {
    doriNo: { type: Number, required: true, unique: true, index: true },
    clientDoriNo: { type: Number, default: 1, index: true },
    date: { type: Date, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: false },
    size: { type: mongoose.Schema.Types.ObjectId, ref: "LanyardSize", required: false },
    itemName: { type: String, required: true },
    sizeName: { type: String, default: "Standard" },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, default: 0 },
    basicAmount: { type: Number, required: true },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentStatus: { type: String, enum: ["paid", "partial", "due"], default: "due" },
    received: { type: Number, default: 0 },
    outstanding: { type: Number, default: 0 },
    isBilled: { type: Boolean, default: false, index: true },
    billNo: { type: String, default: "" },
    billedAt: { type: Date, default: null },
    remarks: { type: String, default: "" },
    rateOverrideReason: { type: String, default: "" },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

dispatchSchema.index({ client: 1, clientDoriNo: 1 });

dispatchSchema.index({ client: 1, date: -1 });
dispatchSchema.index({ date: -1 });

export const SalesDispatch = mongoose.model("SalesDispatch", dispatchSchema);
