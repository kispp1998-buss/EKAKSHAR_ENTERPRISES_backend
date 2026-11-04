import express from "express";
import { Purchase } from "../models/Purchase.js";
import { Settings } from "../models/Settings.js";
import { auth, canWrite, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { round2 } from "../utils/money.js";
import { addStock } from "../utils/stock.js";

const router = express.Router();
router.use(auth);

function calcPurchase(body, settings) {
  const lines = (body.lines || []).map((line) => {
    const quantity = Number(line.quantity || 0);
    const rate = Number(line.rate || 0);
    const gstPercent = Number(line.gstPercent || 0);
    const basicAmount = round2(quantity * rate);
    const gstAmount = round2((basicAmount * gstPercent) / 100);
    let handlingRate = 0;
    if (line.material === "paper_roll") {
      handlingRate =
        line.handlingRate === undefined || line.handlingRate === null || line.handlingRate === ""
          ? settings?.paperHandlingPerRoll ?? 15
          : Number(line.handlingRate);
    } else {
      handlingRate = Number(line.handlingRate || 0);
    }
    const handlingAmount = line.material === "paper_roll" ? round2(quantity * handlingRate) : round2(Number(line.handlingAmount || 0));
    const lineTotal = round2(basicAmount + gstAmount + handlingAmount);
    return {
      ...line,
      quantity,
      rate,
      gstPercent,
      basicAmount,
      gstAmount,
      handlingRate,
      handlingAmount,
      lineTotal,
    };
  });
  const basicAmount = round2(lines.reduce((s, l) => s + l.basicAmount, 0));
  const gstAmount = round2(lines.reduce((s, l) => s + l.gstAmount, 0));
  const handlingAmount = round2(lines.reduce((s, l) => s + l.handlingAmount, 0));
  const transportation = round2(Number(body.transportation || 0));
  const otherCharges = round2(Number(body.otherCharges || 0));
  const totalCost = round2(basicAmount + gstAmount + handlingAmount + transportation + otherCharges);
  return { lines, basicAmount, gstAmount, handlingAmount, transportation, otherCharges, totalCost };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { voided: { $ne: true } };
    if (req.query.supplierId) filter.supplier = req.query.supplierId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) {
        const t = new Date(req.query.to);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }
    const rows = await Purchase.find(filter).populate("supplier").sort({ date: -1, createdAt: -1 }).limit(200);
    res.json(rows);
  })
);

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: "company" });
    const calc = calcPurchase(req.body, settings);
    const doc = await Purchase.create({
      date: req.body.date || new Date(),
      supplier: req.body.supplier,
      invoiceRef: req.body.invoiceRef || "",
      notes: req.body.notes || "",
      createdBy: req.user._id,
      ...calc,
    });
    for (const line of calc.lines) {
      await addStock({
        date: doc.date,
        material: line.material,
        variant: line.variant || line.size || "",
        unit: line.unit || "pcs",
        type: "purchase",
        quantity: line.quantity,
        rate: line.rate,
        value: line.basicAmount,
        refType: "purchase",
        refId: doc._id.toString(),
        createdBy: req.user._id,
      });
    }
    await audit(req, { action: "create", entity: "purchase", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(await doc.populate("supplier"));
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: "company" });
    const before = await Purchase.findById(req.params.id);
    const calc = req.body.lines ? calcPurchase(req.body, settings) : {};
    const doc = await Purchase.findByIdAndUpdate(req.params.id, { ...req.body, ...calc }, { new: true }).populate("supplier");
    await audit(req, { action: "update", entity: "purchase", entityId: doc._id, before: before?.toObject(), after: doc.toObject() });
    res.json(doc);
  })
);

router.post(
  "/:id/void",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await Purchase.findByIdAndUpdate(req.params.id, { voided: true }, { new: true });
    await audit(req, { action: "void", entity: "purchase", entityId: doc._id });
    res.json(doc);
  })
);

export default router;
