import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "company" },
    companyName: { type: String, default: "EKAKSHAR ENTERPRISES" },
    tagline: { type: String, default: "Lanyard & Dori Manufacturing" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    gstin: { type: String, default: "" },
    paperHandlingPerRoll: { type: Number, default: 15 },
    paperRollMeters: { type: Number, default: 200 },
    paperRollRate: { type: Number, default: 3300 },
    inkRates: {
      type: Object,
      default: {
        Black: { rate: 650, gstPercent: 9, unit: "L" },
        Cyan: { rate: 600, gstPercent: 9, unit: "L" },
        Yellow: { rate: 600, gstPercent: 9, unit: "L" },
        Magenta: { rate: 600, gstPercent: 9, unit: "L" },
      },
    },
    defaultSaleGstPercent: { type: Number, default: 0 },
    lowStockThresholds: { type: Object, default: {} },
    nextDoriNo: { type: Number, default: 1 },
    logoUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", settingsSchema);
