import express from "express";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Purchase } from "../models/Purchase.js";
import { DailyExpense } from "../models/DailyExpense.js";
import { FixedExpense } from "../models/FixedExpense.js";
import { Settings } from "../models/Settings.js";
import { SharedReportLink } from "../models/SharedReportLink.js";
import { auth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { round2, mom } from "../utils/money.js";
import { getStockSummary } from "../utils/stock.js";
import { buildDashboardPdfBuffer, randomToken } from "../utils/pdf.js";
import { env } from "../config/env.js";

const router = express.Router();
router.use(auth);

export function getDateRange(query) {
  const now = new Date();
  const period = query.period || "month";

  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), 0, 1);
    from.setHours(0, 0, 0, 0);
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    return { from, to, periodName: "Custom Range" };
  }

  if (period === "today" || period === "daily") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to, periodName: "Today (Daily)" };
  }

  if (period === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const from = new Date(now);
    from.setDate(diff);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to, periodName: "This Week" };
  }

  if (period === "year") {
    const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to, periodName: `Year ${now.getFullYear()}` };
  }

  // default: month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to, periodName: "This Month" };
}

async function rangeAgg(from, to) {
  const sales = await SalesDispatch.aggregate([
    { $match: { voided: { $ne: true }, date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        qty: { $sum: "$quantity" },
        basic: { $sum: "$basicAmount" },
        gst: { $sum: "$gstAmount" },
        total: { $sum: "$total" },
        received: { $sum: "$received" },
        outstanding: { $sum: "$outstanding" },
      },
    },
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
  const daily = await DailyExpense.aggregate([
    { $match: { voided: { $ne: true }, date: { $gte: from, $lte: to } } },
    { $group: { _id: null, amount: { $sum: "$amount" } } },
  ]);
  const fixedRows = await FixedExpense.find({
    voided: { $ne: true },
    active: true,
    effectiveFrom: { $lte: to },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: from } }],
  });
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  const fixed = fixedRows.reduce((s, r) => s + r.amount * Math.max(months, 1), 0);
  const s = sales[0] || { qty: 0, basic: 0, gst: 0, total: 0, received: 0, outstanding: 0 };
  const p = purchases[0] || { basic: 0, gst: 0, transport: 0, handling: 0, total: 0 };
  const expenses = round2((daily[0]?.amount || 0) + fixed);
  const direct = round2(p.basic + p.transport + p.handling);
  const grossProfit = round2(s.basic - direct);
  const netProfit = round2(grossProfit - expenses);
  return { sales: s, purchases: p, expenses, direct, grossProfit, netProfit };
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { from, to, periodName } = getDateRange(req.query);
    const periodData = await rangeAgg(from, to);

    // Also get previous period for growth comparison
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    const prev = await rangeAgg(prevFrom, prevTo);

    const stock = await getStockSummary();
    const stockValue = round2(stock.reduce((a, b) => a + b.value, 0));
    const outstandingAll = await SalesDispatch.aggregate([
      { $match: { voided: { $ne: true } } },
      { $group: { _id: null, outstanding: { $sum: "$outstanding" } } },
    ]);

    res.json({
      periodName,
      from: from.toISOString(),
      to: to.toISOString(),
      sales: periodData.sales,
      purchases: periodData.purchases,
      periodSales: periodData.sales.basic,
      periodQty: periodData.sales.qty,
      periodPurchase: periodData.purchases.total,
      periodExpenses: periodData.expenses,
      periodGrossProfit: periodData.grossProfit,
      periodNetProfit: periodData.netProfit,
      outstanding: outstandingAll[0]?.outstanding || 0,
      stockValue,
      growthRate: mom(periodData.sales.basic, prev.sales.basic),
    });
  })
);

router.get(
  "/trends",
  asyncHandler(async (req, res) => {
    const { from, to, periodName } = getDateRange(req.query);
    const match = { voided: { $ne: true }, date: { $gte: from, $lte: to } };

    const isYear = req.query.period === "year";
    const groupFormat = isYear ? "%Y-%m" : "%Y-%m-%d";

    const dailySales = await SalesDispatch.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$date" } },
          basic: { $sum: "$basicAmount" },
          qty: { $sum: "$quantity" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const sizeQty = await SalesDispatch.aggregate([
      { $match: match },
      { $group: { _id: { $ifNull: ["$sizeName", "Standard"] }, qty: { $sum: "$quantity" } } },
      { $sort: { qty: -1 } },
    ]);

    const clientRank = await SalesDispatch.aggregate([
      { $match: match },
      { $group: { _id: "$client", qty: { $sum: "$quantity" }, basic: { $sum: "$basicAmount" } } },
      { $sort: { basic: -1 } },
      { $limit: 12 },
      { $lookup: { from: "clients", localField: "_id", foreignField: "_id", as: "client" } },
      { $unwind: "$client" },
    ]);

    res.json({ dailySales, sizeQty, clientRank, periodName, from, to });
  })
);

router.get(
  "/ops",
  asyncHandler(async (req, res) => {
    const { from, to } = getDateRange(req.query);
    const match = { voided: { $ne: true }, date: { $gte: from, $lte: to } };

    const recentSales = await SalesDispatch.find(match)
      .populate("client")
      .sort({ clientDoriNo: -1, date: -1 })
      .limit(50);

    const recentPurchases = await Purchase.find(match)
      .populate("supplier")
      .sort({ date: -1 })
      .limit(30);

    const pending = await SalesDispatch.find({ voided: { $ne: true }, paymentStatus: { $ne: "paid" } })
      .populate("client")
      .sort({ date: -1 })
      .limit(20);

    res.json({ recentSales, recentPurchases, pending });
  })
);

// Export CSV for Dashboard period directly (ZERO DISK STORAGE)
router.get(
  "/export/csv",
  asyncHandler(async (req, res) => {
    const { from, to, periodName } = getDateRange(req.query);
    const match = { voided: { $ne: true }, date: { $gte: from, $lte: to } };

    const rows = await SalesDispatch.find(match).populate("client").sort({ date: 1, doriNo: 1 });

    const csvRows = [
      ["EKAKSHAR ENTERPRISES - SALES REPORT", periodName, `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`],
      [],
      ["Dori No", "Client S.No", "Date", "Client Name", "Lanyard / Description", "Size", "Quantity", "Rate", "Basic Amount", "GST %", "Total Amount", "Billed Status", "Bill No"],
    ];

    rows.forEach((r) => {
      csvRows.push([
        r.doriNo,
        r.clientDoriNo || 1,
        r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
        `"${(r.client?.name || "").replace(/"/g, '""')}"`,
        `"${(r.itemName || "Lanyard").replace(/"/g, '""')}"`,
        r.sizeName || "",
        r.quantity,
        r.rate,
        r.basicAmount,
        r.gstPercent || 0,
        r.total,
        r.isBilled ? "Billed" : "Unbilled",
        r.billNo || "",
      ]);
    });

    const csvContent = csvRows.map((e) => e.join(",")).join("\n");
    const filename = `ekakshar-sales-${periodName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  })
);

// Stream Dashboard PDF report directly to browser (ZERO DISK STORAGE)
router.get(
  "/export/pdf",
  asyncHandler(async (req, res) => {
    const { from, to, periodName } = getDateRange(req.query);
    const summary = await rangeAgg(from, to);
    const match = { voided: { $ne: true }, date: { $gte: from, $lte: to } };
    const salesRows = await SalesDispatch.find(match).populate("client").sort({ date: 1, doriNo: 1 });
    const company = (await Settings.findOne({ key: "company" })) || {};

    const buffer = await buildDashboardPdfBuffer({
      company,
      periodName,
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
      summary,
      salesRows,
    });

    const filename = `ekakshar-dashboard-${periodName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

// Create shareable web link for dashboard period
router.post(
  "/share",
  asyncHandler(async (req, res) => {
    const { from, to, periodName } = getDateRange(req.body);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);

    await SharedReportLink.create({
      token,
      payload: { from, to, periodName, type: "dashboard" },
      expiresAt,
      createdBy: req.user._id,
    });

    res.json({
      shareUrl: `${env.shareBaseUrl}/share/${token}`,
      downloadUrl: `/api/dashboard/export/pdf?from=${from.toISOString()}&to=${to.toISOString()}`,
      expiresAt,
    });
  })
);

export default router;
