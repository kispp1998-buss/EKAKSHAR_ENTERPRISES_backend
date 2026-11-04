import express from "express";
import { StockLedger } from "../models/StockLedger.js";
import { Settings } from "../models/Settings.js";
import { auth, canWrite } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { getStockSummary, addStock } from "../utils/stock.js";
import { round2 } from "../utils/money.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const summary = await getStockSummary();
    const settings = await Settings.findOne({ key: "company" });
    const thresholds = settings?.lowStockThresholds || {};
    const withAlerts = summary.map((s) => {
      const key = `${s.material}:${s.variant}`;
      const threshold = Number(thresholds[key] ?? thresholds[s.material] ?? 0);
      return { ...s, threshold, low: threshold > 0 && s.quantity <= threshold };
    });
    const stockValue = round2(withAlerts.reduce((a, b) => a + b.value, 0));
    res.json({ summary: withAlerts, stockValue });
  })
);

router.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.material) filter.material = req.query.material;
    const rows = await StockLedger.find(filter).sort({ date: -1, createdAt: -1 }).limit(300);
    res.json(rows);
  })
);

router.post(
  "/movement",
  canWrite,
  asyncHandler(async (req, res) => {
    const quantity = Number(req.body.quantity || 0);
    const rate = Number(req.body.rate || 0);
    const doc = await addStock({
      date: req.body.date || new Date(),
      material: req.body.material,
      variant: req.body.variant || "",
      unit: req.body.unit || "pcs",
      type: req.body.type,
      quantity,
      rate,
      value: round2(quantity * rate),
      notes: req.body.notes || "",
      refType: "manual",
      createdBy: req.user._id,
    });
    await audit(req, { action: "create", entity: "stock_ledger", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(doc);
  })
);

export default router;
