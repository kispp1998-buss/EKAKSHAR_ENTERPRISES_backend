import express from "express";
import mongoose from "mongoose";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Item } from "../models/Item.js";
import { LanyardSize } from "../models/LanyardSize.js";
import { Payment } from "../models/Payment.js";
import { auth, canWrite } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { resolveClientRate } from "../utils/rates.js";
import { nextSeq, nextClientSeq, nextGlobalDoriSeq } from "../models/Counter.js";
import { round2 } from "../utils/money.js";
import { Settings } from "../models/Settings.js";

const router = express.Router();
router.use(auth);

function computeAmounts({ quantity, rate, gstPercent, received }) {
  const basicAmount = round2(quantity * rate);
  const gstAmount = round2((basicAmount * (gstPercent || 0)) / 100);
  const total = round2(basicAmount + gstAmount);
  const rec = round2(received || 0);
  const outstanding = round2(Math.max(total - rec, 0));
  let paymentStatus = "due";
  if (rec <= 0) paymentStatus = "due";
  else if (rec >= total) paymentStatus = "paid";
  else paymentStatus = "partial";
  return { basicAmount, gstAmount, total, received: rec, outstanding, paymentStatus };
}

// Autocomplete suggestions for lanyard names (school / company names)
router.get(
  "/suggestions",
  asyncHandler(async (req, res) => {
    const names = await SalesDispatch.distinct("itemName", { voided: { $ne: true } });
    res.json(names.filter(Boolean));
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { voided: { $ne: true } };
    if (req.query.clientId) filter.client = req.query.clientId;
    if (req.query.sizeId) filter.size = req.query.sizeId;
    if (req.query.itemId) filter.item = req.query.itemId;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.isBilled !== undefined && req.query.isBilled !== "") {
      filter.isBilled = req.query.isBilled === "true";
    }
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) {
        const t = new Date(req.query.to);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }
    if (req.query.doriFrom || req.query.doriTo) {
      filter.doriNo = {};
      if (req.query.doriFrom) filter.doriNo.$gte = Number(req.query.doriFrom);
      if (req.query.doriTo) filter.doriNo.$lte = Number(req.query.doriTo);
    }
    if (req.query.clientDoriFrom || req.query.clientDoriTo) {
      filter.clientDoriNo = {};
      if (req.query.clientDoriFrom) filter.clientDoriNo.$gte = Number(req.query.clientDoriFrom);
      if (req.query.clientDoriTo) filter.clientDoriNo.$lte = Number(req.query.clientDoriTo);
    }
    if (req.query.q) {
      const n = Number(req.query.q);
      filter.$or = [{ itemName: new RegExp(req.query.q, "i") }, { remarks: new RegExp(req.query.q, "i") }];
      if (!Number.isNaN(n)) {
        filter.$or.push({ doriNo: n }, { clientDoriNo: n });
      }
    }
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 50), 500);
    const sortField = req.query.clientId ? { clientDoriNo: -1 } : { doriNo: -1 };
    const [rows, total] = await Promise.all([
      SalesDispatch.find(filter).populate("client item size").sort(sortField).skip((page - 1) * limit).limit(limit),
      SalesDispatch.countDocuments(filter),
    ]);
    res.json({ rows, total, page, limit });
  })
);

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const {
      client,
      item,
      size,
      date,
      quantity,
      rate: givenRate,
      gstPercent,
      received,
      remarks,
      rateOverrideReason,
      doriNo,
      clientDoriNo,
      itemName,
      lanyardName,
      sizeName,
      isBilled,
      billNo,
    } = req.body;

    let resolvedItemName = (itemName || lanyardName || "").trim();
    let resolvedSizeName = (sizeName || "").trim();
    let itemDoc = null;
    let sizeDoc = null;

    if (item && mongoose.Types.ObjectId.isValid(item)) {
      itemDoc = await Item.findById(item);
      if (itemDoc && !resolvedItemName) resolvedItemName = itemDoc.name;
    }
    if (!resolvedItemName) resolvedItemName = "Custom Printed Lanyard";

    if (size && mongoose.Types.ObjectId.isValid(size)) {
      sizeDoc = await LanyardSize.findById(size);
      if (sizeDoc && !resolvedSizeName) resolvedSizeName = sizeDoc.name;
    }
    if (!resolvedSizeName) resolvedSizeName = "Standard";

    const onDate = date ? new Date(date) : new Date();
    const master = await resolveClientRate(client, itemDoc?._id, sizeDoc?._id, onDate);
    const parsed = givenRate === "" || givenRate == null ? NaN : Number(givenRate);
    let rate = Number.isFinite(parsed) ? parsed : null;
    if (rate == null) rate = master?.defaultRate;
    if (rate == null) return res.status(400).json({ message: "Enter a rate or save a client rate first." });
    const gst = gstPercent != null && gstPercent !== "" ? Number(gstPercent) : master?.gstPercent ?? 0;

    let no = doriNo;
    if (!no) no = await nextGlobalDoriSeq();

    let clientNo = clientDoriNo;
    if (!clientNo) clientNo = await nextClientSeq(client);

    const amounts = computeAmounts({ quantity: Number(quantity), rate, gstPercent: gst, received: Number(received || 0) });
    const doc = await SalesDispatch.create({
      doriNo: no,
      clientDoriNo: clientNo,
      date: onDate,
      client,
      item: itemDoc?._id || undefined,
      size: sizeDoc?._id || undefined,
      itemName: resolvedItemName,
      sizeName: resolvedSizeName,
      quantity: Number(quantity),
      rate,
      gstPercent: gst,
      remarks: remarks || "",
      isBilled: Boolean(isBilled),
      billNo: billNo || "",
      billedAt: isBilled ? new Date() : null,
      rateOverrideReason: givenRate != null && master && givenRate !== master.defaultRate ? rateOverrideReason || "override" : "",
      createdBy: req.user._id,
      ...amounts,
    });
    await audit(req, { action: "create", entity: "sales_dispatch", entityId: doc._id, after: doc.toObject() });
    res.status(201).json(await doc.populate("client item size"));
  })
);

// Bulk multiple sales entry for client
router.post(
  "/bulk",
  canWrite,
  asyncHandler(async (req, res) => {
    const { client, date: commonDate, dispatches = [] } = req.body;
    if (!client) return res.status(400).json({ message: "Client is required" });
    const itemsList = Array.isArray(dispatches) && dispatches.length ? dispatches : (req.body.items || []);
    if (!itemsList.length) return res.status(400).json({ message: "Please provide at least one dispatch row" });

    const settings = await Settings.findOne({ key: "company" });
    const createdDocs = [];

    for (const row of itemsList) {
      const onDate = row.date ? new Date(row.date) : (commonDate ? new Date(commonDate) : new Date());
      let resolvedItemName = (row.itemName || row.lanyardName || "").trim();
      let resolvedSizeName = (row.sizeName || "").trim();
      let itemDoc = null;
      let sizeDoc = null;

      if (row.item && mongoose.Types.ObjectId.isValid(row.item)) {
        itemDoc = await Item.findById(row.item);
        if (itemDoc && !resolvedItemName) resolvedItemName = itemDoc.name;
      }
      if (!resolvedItemName) resolvedItemName = "Custom Printed Lanyard";

      if (row.size && mongoose.Types.ObjectId.isValid(row.size)) {
        sizeDoc = await LanyardSize.findById(row.size);
        if (sizeDoc && !resolvedSizeName) resolvedSizeName = sizeDoc.name;
      }
      if (!resolvedSizeName) resolvedSizeName = "Standard";

      const master = await resolveClientRate(client, itemDoc?._id, sizeDoc?._id, onDate);
      const parsed = row.rate === "" || row.rate == null ? NaN : Number(row.rate);
      let rate = Number.isFinite(parsed) ? parsed : null;
      if (rate == null) rate = master?.defaultRate;
      if (rate == null) {
        return res.status(400).json({ message: `Please enter rate for "${resolvedItemName}"` });
      }
      const gst = row.gstPercent != null && row.gstPercent !== "" ? Number(row.gstPercent) : master?.gstPercent ?? 0;

      const no = await nextGlobalDoriSeq();
      const clientNo = await nextClientSeq(client);
      const amounts = computeAmounts({
        quantity: Number(row.quantity || 0),
        rate,
        gstPercent: gst,
        received: Number(row.received || 0),
      });

      const doc = await SalesDispatch.create({
        doriNo: no,
        clientDoriNo: clientNo,
        date: onDate,
        client,
        item: itemDoc?._id || undefined,
        size: sizeDoc?._id || undefined,
        itemName: resolvedItemName,
        sizeName: resolvedSizeName,
        quantity: Number(row.quantity || 0),
        rate,
        gstPercent: gst,
        remarks: row.remarks || "",
        rateOverrideReason: row.rateOverrideReason || "",
        isBilled: Boolean(row.isBilled),
        billNo: row.billNo || "",
        billedAt: row.isBilled ? new Date() : null,
        createdBy: req.user._id,
        ...amounts,
      });
      createdDocs.push(doc);
    }

    await audit(req, {
      action: "bulk_create",
      entity: "sales_dispatch",
      after: { count: createdDocs.length, client },
    });

    res.status(201).json({ success: true, count: createdDocs.length, dispatches: createdDocs });
  })
);

// Mark dispatches as billed
router.post(
  "/mark-billed",
  canWrite,
  asyncHandler(async (req, res) => {
    const { dispatchIds, billNo, billedAt } = req.body;
    if (!Array.isArray(dispatchIds) || !dispatchIds.length) {
      return res.status(400).json({ message: "Select dispatches to mark as billed" });
    }
    const bNo = billNo || `BILL-${Date.now()}`;
    const bDate = billedAt ? new Date(billedAt) : new Date();

    const result = await SalesDispatch.updateMany(
      { _id: { $in: dispatchIds } },
      { $set: { isBilled: true, billNo: bNo, billedAt: bDate } }
    );
    await audit(req, { action: "mark_billed", entity: "sales_dispatch", after: { dispatchIds, billNo: bNo } });
    res.json({ success: true, modifiedCount: result.modifiedCount, billNo: bNo, billedAt: bDate });
  })
);

// Unmark dispatches as billed
router.post(
  "/unmark-billed",
  canWrite,
  asyncHandler(async (req, res) => {
    const { dispatchIds } = req.body;
    if (!Array.isArray(dispatchIds) || !dispatchIds.length) {
      return res.status(400).json({ message: "Select dispatches to unmark" });
    }
    const result = await SalesDispatch.updateMany(
      { _id: { $in: dispatchIds } },
      { $set: { isBilled: false, billNo: "", billedAt: null } }
    );
    await audit(req, { action: "unmark_billed", entity: "sales_dispatch", after: { dispatchIds } });
    res.json({ success: true, modifiedCount: result.modifiedCount });
  })
);

// Toggle single dispatch billed status
router.post(
  "/:id/toggle-billed",
  canWrite,
  asyncHandler(async (req, res) => {
    const sale = await SalesDispatch.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: "Not found" });
    const nextBilled = !sale.isBilled;
    sale.isBilled = nextBilled;
    sale.billNo = nextBilled ? (req.body.billNo || `BILL-${Date.now()}`) : "";
    sale.billedAt = nextBilled ? new Date() : null;
    await sale.save();
    res.json(sale);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await SalesDispatch.findById(req.params.id).populate("client item size");
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const before = await SalesDispatch.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Not found" });
    const patch = { ...req.body };
    if (patch.itemName || patch.lanyardName) {
      patch.itemName = patch.itemName || patch.lanyardName;
    }
    if (patch.item) {
      const itemDoc = await Item.findById(patch.item);
      if (itemDoc && !patch.itemName) patch.itemName = itemDoc.name;
    }
    if (patch.size) {
      const sizeDoc = await LanyardSize.findById(patch.size);
      if (sizeDoc && !patch.sizeName) patch.sizeName = sizeDoc.name;
    }
    const next = { ...before.toObject(), ...patch };
    const amounts = computeAmounts({
      quantity: next.quantity,
      rate: next.rate,
      gstPercent: next.gstPercent,
      received: next.received,
    });
    const doc = await SalesDispatch.findByIdAndUpdate(req.params.id, { ...patch, ...amounts }, { new: true }).populate(
      "client item size"
    );
    await audit(req, { action: "update", entity: "sales_dispatch", entityId: doc._id, before: before.toObject(), after: doc.toObject() });
    res.json(doc);
  })
);

router.post(
  "/:id/void",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await SalesDispatch.findByIdAndUpdate(req.params.id, { voided: true }, { new: true });
    await audit(req, { action: "void", entity: "sales_dispatch", entityId: doc._id });
    res.json(doc);
  })
);

router.post(
  "/:id/payment",
  canWrite,
  asyncHandler(async (req, res) => {
    const sale = await SalesDispatch.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: "Not found" });
    const pay = await Payment.create({
      date: req.body.date || new Date(),
      client: sale.client,
      salesDispatch: sale._id,
      amount: req.body.amount,
      mode: req.body.mode || "upi",
      reference: req.body.reference || "",
      notes: req.body.notes || "",
      createdBy: req.user._id,
    });
    const received = round2((sale.received || 0) + Number(req.body.amount));
    const amounts = computeAmounts({ quantity: sale.quantity, rate: sale.rate, gstPercent: sale.gstPercent, received });
    Object.assign(sale, amounts);
    await sale.save();
    await audit(req, { action: "create", entity: "payment", entityId: pay._id, after: pay.toObject() });
    res.status(201).json({ payment: pay, sale });
  })
);

export default router;
