import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: "" },
    mobile: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    gstin: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    notes: { type: String, default: "" },
    voided: { type: Boolean, default: false },
  },
  { timestamps: true }
);

clientSchema.index({ name: "text", code: "text", mobile: "text" });

export const Client = mongoose.model("Client", clientSchema);
