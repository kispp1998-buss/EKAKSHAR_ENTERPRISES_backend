import express from "express";
import { Payment } from "../models/Payment.js";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { auth, canWrite } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { round2 } from "../utils/money.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { voided: { $ne: true } };
    if (req.query.clientId) filter.client = req.query.clientId;
    const rows = await Payment.find(filter).populate("client salesDispatch").sort({ date: -1 }).limit(300);
    const outstanding = await SalesDispatch.aggregate([
      { $match: { voided: { $ne: true } } },
      {
        $group: {
          _id: "$client",
          billed: { $sum: "$total" },
          received: { $sum: "$received" },
          outstanding: { $sum: "$outstanding" },
          qty: { $sum: "$quantity" },
        },
      },
    ]);
    res.json({ rows, outstanding });
  })
);

import { applyClientPayment } from "../utils/billing.js";

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const { client, amount, mode, reference, notes, date, billNo, invoiceId, salesDispatch } = req.body;
    if (!client) {
      return res.status(400).json({ message: "Client is required for payment" });
    }
    const payNum = Number(amount);
    if (!payNum || payNum <= 0) {
      return res.status(400).json({ message: "Payment amount must be greater than zero" });
    }

    const { payment } = await applyClientPayment({
      client,
      amount: payNum,
      mode: mode || "upi",
      reference: reference || "",
      notes: notes || "",
      date: date || new Date(),
      billNo: billNo || "",
      invoiceId: invoiceId || null,
      userId: req.user._id,
    });

    if (salesDispatch) {
      payment.salesDispatch = salesDispatch;
      await payment.save();
    }

    await audit(req, { action: "create", entity: "payment", entityId: payment._id, after: payment.toObject() });
    res.status(201).json(await payment.populate("client salesDispatch invoice"));
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const before = await Payment.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Not found" });
    const doc = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("client salesDispatch");
    await audit(req, { action: "update", entity: "payment", entityId: doc._id, before: before.toObject(), after: doc.toObject() });
    res.json(doc);
  })
);

router.post(
  "/:id/void",
  canWrite,
  asyncHandler(async (req, res) => {
    const doc = await Payment.findByIdAndUpdate(req.params.id, { voided: true }, { new: true });
    if (!doc) return res.status(404).json({ message: "Not found" });
    await audit(req, { action: "void", entity: "payment", entityId: doc._id });
    res.json(doc);
  })
);

export default router;
