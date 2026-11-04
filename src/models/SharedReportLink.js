import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    reportType: { type: String, default: "dispatch-range" },
    payload: { type: Object, required: true },
    cloudinaryUrl: { type: String, default: "" },
    localPath: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

linkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SharedReportLink = mongoose.model("SharedReportLink", linkSchema);
