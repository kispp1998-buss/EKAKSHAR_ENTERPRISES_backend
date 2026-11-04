import { AuditLog } from "../models/AuditLog.js";

export async function audit(req, { action, entity, entityId, before, after }) {
  await AuditLog.create({
    user: req.user?._id,
    action,
    entity,
    entityId: entityId?.toString() || "",
    before: before || null,
    after: after || null,
    ip: req.ip,
  });
}
