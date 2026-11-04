import { ClientRate } from "../models/ClientRate.js";

export async function resolveClientRate(clientId, itemId, sizeId, onDate = new Date()) {
  if (!clientId) return null;
  const baseQuery = {
    client: clientId,
    active: true,
    effectiveFrom: { $lte: onDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: onDate } }],
  };

  if (itemId && sizeId) {
    const exact = await ClientRate.findOne({ ...baseQuery, item: itemId, size: sizeId }).sort({ effectiveFrom: -1 });
    if (exact) return exact;
  }
  if (sizeId) {
    const bySize = await ClientRate.findOne({ ...baseQuery, size: sizeId }).sort({ effectiveFrom: -1 });
    if (bySize) return bySize;
  }
  if (itemId) {
    const byItem = await ClientRate.findOne({ ...baseQuery, item: itemId }).sort({ effectiveFrom: -1 });
    if (byItem) return byItem;
  }
  return null;
}

