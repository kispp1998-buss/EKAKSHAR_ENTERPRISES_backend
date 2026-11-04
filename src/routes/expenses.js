import express from "express";
import { DailyExpense } from "../models/DailyExpense.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { auth, canWrite, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { voided: { $ne: true } };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) {
        const t = new Date(req.query.to);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }
    const rows = await DailyExpense.find(filter).populate("category").sort({ date: -1 });
    res.json(rows);
  })
);

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await DailyExpense.create({ ...req.body, createdBy: req.user._id });
    await audit(req, { action: "create", entity: "daily_expense", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(await doc.populate("category"));
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const before = await DailyExpense.findById(req.params.id);
    const doc = await DailyExpense.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("category");
    await audit(req, { action: "update", entity: "daily_expense", entityId: doc._id, before: before?.toObject(), after: doc.toObject() });
    res.json(doc);
  })
);

router.post(
  "/:id/void",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await DailyExpense.findByIdAndUpdate(req.params.id, { voided: true }, { new: true });
    await audit(req, { action: "void", entity: "daily_expense", entityId: doc._id });
    res.json(doc);
  })
);

router.get(
  "/fixed",
  asyncHandler(async (req, res) => {
    const rows = await FixedExpense.find({ voided: { $ne: true } }).populate("category").sort({ name: 1 });
    res.json(rows);
  })
);

router.post(
  "/fixed",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await FixedExpense.create({ ...req.body, createdBy: req.user._id });
    await audit(req, { action: "create", entity: "fixed_expense", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(await doc.populate("category"));
  })
);

router.patch(
  "/fixed/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await FixedExpense.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("category");
    await audit(req, { action: "update", entity: "fixed_expense", entityId: doc._id, after: doc.toObject() });
    res.json(doc);
  })
);

export default router;
