import express from "express";
import { Item } from "../models/Item.js";
import { LanyardSize } from "../models/LanyardSize.js";
import { Supplier } from "../models/Supplier.js";
import { ExpenseCategory } from "../models/ExpenseCategory.js";
import { Settings } from "../models/Settings.js";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Client } from "../models/Client.js";
import { Purchase } from "../models/Purchase.js";
import { auth, canWrite, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";

const router = express.Router();
router.use(auth);

router.get(
  "/items",
  asyncHandler(async (req, res) => res.json(await Item.find({ active: true }).sort({ name: 1 })))
);
router.post(
  "/items",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await Item.create(req.body);
    await audit(req, { action: "create", entity: "item", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(doc);
  })
);
router.patch(
  "/items/:id",
  canWrite,
  asyncHandler(async (req, res) => res.json(await Item.findByIdAndUpdate(req.params.id, req.body, { new: true })))
);

router.get(
  "/sizes",
  asyncHandler(async (req, res) => res.json(await LanyardSize.find({ active: true }).sort({ sortOrder: 1 })))
);
router.post(
  "/sizes",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await LanyardSize.create(req.body);
    await audit(req, { action: "create", entity: "size", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(doc);
  })
);
router.patch(
  "/sizes/:id",
  canWrite,
  asyncHandler(async (req, res) => res.json(await LanyardSize.findByIdAndUpdate(req.params.id, req.body, { new: true })))
);

router.get(
  "/suppliers",
  asyncHandler(async (req, res) => res.json(await Supplier.find({ active: true }).sort({ name: 1 })))
);
router.post(
  "/suppliers",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await Supplier.create(req.body);
    await audit(req, { action: "create", entity: "supplier", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(doc);
  })
);
router.patch(
  "/suppliers/:id",
  canWrite,
  asyncHandler(async (req, res) => res.json(await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true })))
);

router.get(
  "/expense-categories",
  asyncHandler(async (req, res) => res.json(await ExpenseCategory.find({ active: true }).sort({ name: 1 })))
);
router.post(
  "/expense-categories",
  canWrite,
  asyncHandler(async (req, res) => res.status(201).json(await ExpenseCategory.create(req.body)))
);
router.patch(
  "/expense-categories/:id",
  canWrite,
  asyncHandler(async (req, res) => res.json(await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true })))
);

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    let s = await Settings.findOne({ key: "company" });
    if (!s) s = await Settings.create({ key: "company" });
    res.json(s);
  })
);
router.patch(
  "/settings",
  adminOnly,
  asyncHandler(async (req, res) => {
    const s = await Settings.findOneAndUpdate({ key: "company" }, req.body, { new: true, upsert: true });
    await audit(req, { action: "update", entity: "settings", entityId: s._id, after: s.toObject() });
    res.json(s);
  })
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ clients: [], dispatches: [], purchases: [] });
    const n = Number(q);
    const clients = await Client.find({
      voided: { $ne: true },
      $or: [{ name: new RegExp(q, "i") }, { code: new RegExp(q, "i") }, { mobile: new RegExp(q, "i") }],
    }).limit(8);
    const dispatchFilter = { voided: { $ne: true } };
    if (!Number.isNaN(n)) dispatchFilter.doriNo = n;
    else dispatchFilter.itemName = new RegExp(q, "i");
    const dispatches = await SalesDispatch.find(dispatchFilter).populate("client").limit(8);
    const purchases = await Purchase.find({
      voided: { $ne: true },
      invoiceRef: new RegExp(q, "i"),
    })
      .populate("supplier")
      .limit(8);
    res.json({ clients, dispatches, purchases });
  })
);

export default router;
