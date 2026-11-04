import mongoose from "mongoose";

const rateSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    size: { type: mongoose.Schema.Types.ObjectId, ref: "LanyardSize", default: null },
    defaultRate: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, default: 0 },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

rateSchema.index({ client: 1, item: 1, size: 1, effectiveFrom: -1 });

export const ClientRate = mongoose.model("ClientRate", rateSchema);
