import { StockLedger } from "../models/StockLedger.js";
import { round2 } from "./money.js";

export async function addStock(entry) {
  return StockLedger.create(entry);
}

export async function getStockSummary() {
  const rows = await StockLedger.aggregate([
    {
      $group: {
        _id: { material: "$material", variant: "$variant", unit: "$unit" },
        qtyIn: {
          $sum: {
            $cond: [{ $in: ["$type", ["opening", "purchase", "adjustment_in"]] }, "$quantity", 0],
          },
        },
        qtyOut: {
          $sum: {
            $cond: [{ $in: ["$type", ["consumption", "dispatch", "adjustment_out"]] }, "$quantity", 0],
          },
        },
        valueIn: {
          $sum: {
            $cond: [{ $in: ["$type", ["opening", "purchase", "adjustment_in"]] }, "$value", 0],
          },
        },
        valueOut: {
          $sum: {
            $cond: [{ $in: ["$type", ["consumption", "dispatch", "adjustment_out"]] }, "$value", 0],
          },
        },
      },
    },
  ]);

  return rows.map((r) => {
    const qty = round2(r.qtyIn - r.qtyOut);
    const value = round2(r.valueIn - r.valueOut);
    const avgRate = qty > 0 ? round2(value / qty) : 0;
    return {
      material: r._id.material,
      variant: r._id.variant || "",
      unit: r._id.unit || "pcs",
      quantity: qty,
      value,
      avgRate,
    };
  });
}
