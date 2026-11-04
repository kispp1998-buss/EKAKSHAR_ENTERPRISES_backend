import express from "express";
import mongoose from "mongoose";
import { ClientRate } from "../models/ClientRate.js";
import { auth, canWrite, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { resolveClientRate } from "../utils/rates.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.clientId) filter.client = req.query.clientId;
    const rates = await ClientRate.find(filter).populate("client item size").sort({ updatedAt: -1 });
    res.json(rates);
  })
);

router.get(
  "/resolve",
  asyncHandler(async (req, res) => {
    const { clientId, itemId, sizeId, date } = req.query;
    const rate = await resolveClientRate(clientId, itemId, sizeId, date ? new Date(date) : new Date());
    res.json(rate);
  })
);

function cleanRatePayload(body) {
  const payload = { ...body };
  if (!payload.item || !mongoose.Types.ObjectId.isValid(payload.item)) {
    payload.item = null;
  }
  if (!payload.size || !mongoose.Types.ObjectId.isValid(payload.size)) {
    payload.size = null;
  }
  if (payload.defaultRate != null && payload.defaultRate !== "") {
    payload.defaultRate = Number(payload.defaultRate);
  }
  if (payload.gstPercent != null && payload.gstPercent !== "") {
    payload.gstPercent = Number(payload.gstPercent);
  } else {
    payload.gstPercent = 0;
  }
  if (payload.effectiveFrom) {
    payload.effectiveFrom = new Date(payload.effectiveFrom);
  } else {
    payload.effectiveFrom = new Date();
  }
  return payload;
}

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const payload = cleanRatePayload(req.body);
    if (!payload.client || !mongoose.Types.ObjectId.isValid(payload.client)) {
      return res.status(400).json({ message: "Valid client is required" });
    }
    if (payload.defaultRate == null || Number.isNaN(payload.defaultRate) || payload.defaultRate < 0) {
      return res.status(400).json({ message: "Valid default rate is required" });
    }
    const rate = await ClientRate.create(payload);
    await audit(req, { action: "create", entity: "client_rate", entityId: rate._id, after: rate.toObject() });
    res.status(201).json(await rate.populate("client item size"));
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const payload = cleanRatePayload(req.body);
    const before = await ClientRate.findById(req.params.id);
    const rate = await ClientRate.findByIdAndUpdate(req.params.id, payload, { new: true }).populate("client item size");
    await audit(req, {
      action: "update",
      entity: "client_rate",
      entityId: rate._id,
      before: before?.toObject(),
      after: rate.toObject(),
    });
    res.json(rate);
  })
);

router.delete(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const rate = await ClientRate.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    await audit(req, { action: "deactivate", entity: "client_rate", entityId: rate._id });
    res.json(rate);
  })
);

export default router;
