import mongoose from "mongoose";

const auditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: "" },
    before: { type: Object, default: null },
    after: { type: Object, default: null },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

auditSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditSchema);
