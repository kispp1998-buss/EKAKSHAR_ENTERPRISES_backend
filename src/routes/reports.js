import express from "express";
import mongoose from "mongoose";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Client } from "../models/Client.js";
import { Settings } from "../models/Settings.js";
import { SharedReportLink } from "../models/SharedReportLink.js";
import { Purchase } from "../models/Purchase.js";
import { DailyExpense } from "../models/DailyExpense.js";
import { auth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { buildDispatchRangePdfBuffer, randomToken } from "../utils/pdf.js";
import { env } from "../config/env.js";

const router = express.Router();

async function sendSharedPdf(req, res) {
  const link = await SharedReportLink.findOne({ token: req.params.token });
  if (!link || link.expiresAt < new Date()) return res.status(410).json({ message: "Link expired or invalid" });
  link.downloadCount += 1;
  await link.save();

  // If cloudinary URL exists, redirect
  if (link.cloudinaryUrl) return res.redirect(link.cloudinaryUrl);

  // Otherwise, dynamically generate on the fly with zero disk file
  const { from, to, clientId } = link.payload || {};
  const filter = { voided: { $ne: true } };
  if (from != null && to != null) {
    if (clientId) {
      filter.$or = [
        { clientDoriNo: { $gte: Number(from), $lte: Number(to) } },
        { doriNo: { $gte: Number(from), $lte: Number(to) } },
      ];
    } else {
      filter.doriNo = { $gte: Number(from), $lte: Number(to) };
    }
  }
  if (clientId) filter.client = clientId;

  const rows = await SalesDispatch.find(filter).sort({ clientDoriNo: 1, doriNo: 1 });
  const client = clientId ? await Client.findById(clientId) : null;
  const company = (await Settings.findOne({ key: "company" })) || {};
  const buffer = await buildDispatchRangePdfBuffer({
    company,
    client,
    fromNo: from,
    toNo: to,
    rows,
    generatedAt: new Date(),
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="ekakshar-report-${from || 1}-${to || "all"}.pdf"`);
  return res.send(buffer);
}

router.get("/public/:token", asyncHandler(sendSharedPdf));
router.get("/download/:token", asyncHandler(sendSharedPdf));

router.use(auth);

// Direct in-memory PDF download stream (NO DISK STORAGE)
async function streamDispatchRangePdf(req, res) {
  const { clientId, from, to, unbilledOnly } = req.body;
  const filter = { voided: { $ne: true } };
  if (clientId) filter.client = clientId;
  if (unbilledOnly) filter.isBilled = false;

  if (from != null && from !== "" && to != null && to !== "") {
    if (clientId) {
      filter.$or = [
        { clientDoriNo: { $gte: Number(from), $lte: Number(to) } },
        { doriNo: { $gte: Number(from), $lte: Number(to) } },
      ];
    } else {
      filter.doriNo = { $gte: Number(from), $lte: Number(to) };
    }
  }

  const rows = await SalesDispatch.find(filter).sort(clientId ? { clientDoriNo: 1 } : { doriNo: 1 });
  const client = clientId ? await Client.findById(clientId) : null;
  const company = (await Settings.findOne({ key: "company" })) || {};

  const buffer = await buildDispatchRangePdfBuffer({
    company,
    client,
    fromNo: from || (rows[0]?.clientDoriNo || 1),
    toNo: to || (rows[rows.length - 1]?.clientDoriNo || rows.length),
    rows,
    generatedAt: new Date(),
  });

  const clientSlug = client ? client.name.replace(/[^a-zA-Z0-9]/g, "-") : "all";
  const filename = `Report-${clientSlug}-${from || 1}-${to || "all"}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.post("/stream-pdf", asyncHandler(streamDispatchRangePdf));
router.post("/dispatch-range", asyncHandler(streamDispatchRangePdf));


router.get(
  "/dispatch-range",
  asyncHandler(async (req, res) => {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const filter = { voided: { $ne: true } };
    if (req.query.clientId) filter.client = req.query.clientId;
    if (!Number.isNaN(from) && !Number.isNaN(to)) {
      if (req.query.clientId) {
        filter.$or = [
          { clientDoriNo: { $gte: from, $lte: to } },
          { doriNo: { $gte: from, $lte: to } },
        ];
      } else {
        filter.doriNo = { $gte: from, $lte: to };
      }
    }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.date = {};
      if (req.query.dateFrom) filter.date.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const t = new Date(req.query.dateTo);
        t.setHours(23, 59, 59, 999);
        filter.date.$lte = t;
      }
    }
    const rows = await SalesDispatch.find(filter).populate("client").sort({ clientDoriNo: 1, doriNo: 1 });
    const sizeSummary = {};
    let totalQty = 0;
    let totalBasic = 0;
    let totalGst = 0;
    let grand = 0;
    rows.forEach((r) => {
      sizeSummary[r.sizeName || "Standard"] = (sizeSummary[r.sizeName || "Standard"] || 0) + r.quantity;
      totalQty += r.quantity;
      totalBasic += r.basicAmount;
      totalGst += r.gstAmount;
      grand += r.total;
    });
    res.json({ rows, sizeSummary, totals: { totalQty, totalBasic, totalGst, grand } });
  })
);

// Create share link (without saving pdf files to disk)
router.post(
  "/pdf",
  asyncHandler(async (req, res) => {
    const { clientId, hours = 72 } = req.body;
    let from = req.body.from;
    let to = req.body.to;
    if ((from == null || from === "" || to == null || to === "") && clientId) {
      const bounds = await SalesDispatch.aggregate([
        { $match: { client: new mongoose.Types.ObjectId(clientId), voided: { $ne: true } } },
        { $group: { _id: null, from: { $min: "$clientDoriNo" }, to: { $max: "$clientDoriNo" } } },
      ]);
      from = bounds[0]?.from || 1;
      to = bounds[0]?.to || 1;
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + Number(hours) * 3600 * 1000);
    await SharedReportLink.create({
      token,
      payload: { from, to, clientId },
      expiresAt,
      createdBy: req.user._id,
    });
    res.json({
      filename: `ekakshar-report-${from}-${to}.pdf`,
      shareUrl: `${env.shareBaseUrl}/share/${token}`,
      downloadUrl: `/api/reports/download/${token}`,
      expiresAt,
    });
  })
);

router.get(
  "/pnl",
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const sales = await SalesDispatch.aggregate([
      { $match: { voided: { $ne: true }, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, basic: { $sum: "$basicAmount" }, gst: { $sum: "$gstAmount" }, total: { $sum: "$total" } } },
    ]);
    const purchases = await Purchase.aggregate([
      { $match: { voided: { $ne: true }, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          basic: { $sum: "$basicAmount" },
          gst: { $sum: "$gstAmount" },
          transport: { $sum: "$transportation" },
          handling: { $sum: "$handlingAmount" },
          total: { $sum: "$totalCost" },
        },
      },
    ]);
    const expenses = await DailyExpense.aggregate([
      { $match: { voided: { $ne: true }, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]);
    const s = sales[0] || { basic: 0, gst: 0, total: 0 };
    const p = purchases[0] || { basic: 0, gst: 0, transport: 0, handling: 0, total: 0 };
    const e = expenses[0]?.amount || 0;
    const direct = p.basic + p.transport + p.handling;
    const grossProfit = s.basic - direct;
    const netProfit = grossProfit - e;
    res.json({ from, to, sales: s, purchases: p, expenses: e, direct, grossProfit, netProfit });
  })
);

export default router;
