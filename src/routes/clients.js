import express from "express";
import mongoose from "mongoose";
import { Client } from "../models/Client.js";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Payment } from "../models/Payment.js";
import { ClientRate } from "../models/ClientRate.js";
import { ClientInvoice } from "../models/ClientInvoice.js";
import { Settings } from "../models/Settings.js";
import { auth, canWrite } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { audit } from "../utils/audit.js";
import { buildClientInvoicePdfBuffer } from "../utils/pdf.js";
import { getClientPendingDue, createOrUpdateInvoice } from "../utils/billing.js";

const router = express.Router();
router.use(auth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    const filter = { voided: { $ne: true } };
    if (q) filter.$or = [{ name: new RegExp(q, "i") }, { code: new RegExp(q, "i") }, { mobile: new RegExp(q, "i") }];
    if (req.query.status) filter.status = req.query.status;
    const clients = await Client.find(filter).sort({ name: 1 });
    const stats = await SalesDispatch.aggregate([
      { $match: { voided: { $ne: true }, client: { $in: clients.map((c) => c._id) } } },
      {
        $group: {
          _id: "$client",
          qty: { $sum: "$quantity" },
          billed: { $sum: "$total" },
          outstanding: { $sum: "$outstanding" },
          dispatches: { $sum: 1 },
          lastDori: { $max: "$clientDoriNo" },
        },
      },
    ]);
    const byId = Object.fromEntries(stats.map((s) => [String(s._id), s]));
    res.json(
      clients.map((c) => ({
        ...c.toObject(),
        stats: byId[String(c._id)] || { qty: 0, billed: 0, outstanding: 0, dispatches: 0, lastDori: null },
      }))
    );
  })
);

router.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const count = await Client.countDocuments();
    const code = req.body.code || `CL-${String(count + 1).padStart(4, "0")}`;
    const client = await Client.create({ ...req.body, code });
    await audit(req, { action: "create", entity: "client", entityId: client._id, after: client.toObject() });
    res.status(201).json(client);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    let sales = await SalesDispatch.find({ client: client._id, voided: { $ne: true } }).sort({ clientDoriNo: -1, date: -1 });

    // Auto-heal any dispatches that are missing clientDoriNo or started at 498
    const needsHeal = sales.some((s) => !s.clientDoriNo || s.clientDoriNo >= 400);
    if (needsHeal && sales.length > 0) {
      const chrono = [...sales].sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
      let seq = 1;
      for (const s of chrono) {
        if (!s.clientDoriNo || s.clientDoriNo >= 400) {
          s.clientDoriNo = seq;
          await SalesDispatch.updateOne({ _id: s._id }, { $set: { clientDoriNo: seq } });
        }
        seq++;
      }
      sales = await SalesDispatch.find({ client: client._id, voided: { $ne: true } }).sort({ clientDoriNo: -1, date: -1 });
    }

    const payments = await Payment.find({ client: client._id, voided: { $ne: true } }).sort({ date: -1 });
    const rates = await ClientRate.find({ client: client._id }).populate("item size").sort({ effectiveFrom: -1 });

    // Invoices list for this client
    const invoices = await ClientInvoice.find({ client: client._id, voided: { $ne: true } })
      .populate("dispatchIds")
      .sort({ billDate: -1, createdAt: -1 });

    const invWithPayments = await Promise.all(
      invoices.map(async (inv) => {
        const invPays = await Payment.find({
          client: client._id,
          $or: [{ invoice: inv._id }, { billNo: inv.billNo }],
          voided: { $ne: true },
        }).sort({ date: -1 });
        return {
          ...inv.toObject(),
          payments: invPays,
        };
      })
    );

    const pendingDueInfo = await getClientPendingDue(client._id);

    // Accurate calculation: Total Sales, Total Paid across all transactions, Net Due
    const totalQty = sales.reduce((s, r) => s + r.quantity, 0);
    const totalSalesAmount = sales.reduce((s, r) => s + (r.total || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const outstanding = Math.max(0, totalSalesAmount - totalPaid);
    const last = sales[0] || null;

    const unbilledSales = sales.filter((s) => !s.isBilled);
    const billedSales = sales.filter((s) => s.isBilled);
    const unbilledQty = unbilledSales.reduce((s, r) => s + r.quantity, 0);
    const unbilledAmount = unbilledSales.reduce((s, r) => s + r.total, 0);
    const billedAmount = billedSales.reduce((s, r) => s + r.total, 0);

    const sizeSummary = {};
    sales.forEach((r) => {
      const sName = r.sizeName || "Standard";
      sizeSummary[sName] = (sizeSummary[sName] || 0) + r.quantity;
    });

    res.json({
      client,
      kpis: {
        totalQty,
        billed: billedAmount,
        totalSales: totalSalesAmount,
        received: totalPaid,
        outstanding,
        lastDispatch: last,
        unbilledQty,
        unbilledAmount,
        billedAmount,
        unbilledCount: unbilledSales.length,
        billedCount: billedSales.length,
        pendingDue: pendingDueInfo.previousDue,
        pendingBillNo: pendingDueInfo.lastBillNo,
      },
      sizeSummary,
      sales,
      payments,
      rates,
      invoices: invWithPayments,
      pendingDueInfo,
    });
  })
);

// Get client's current pending balance / previous due
router.get(
  "/:id/previous-due",
  asyncHandler(async (req, res) => {
    const data = await getClientPendingDue(req.params.id);
    res.json(data);
  })
);

// Get client's all invoices
router.get(
  "/:id/invoices",
  asyncHandler(async (req, res) => {
    const invoices = await ClientInvoice.find({ client: req.params.id, voided: { $ne: true } })
      .populate("dispatchIds")
      .sort({ billDate: -1, createdAt: -1 });

    const invWithPayments = await Promise.all(
      invoices.map(async (inv) => {
        const invPays = await Payment.find({
          client: req.params.id,
          $or: [{ invoice: inv._id }, { billNo: inv.billNo }],
          voided: { $ne: true },
        }).sort({ date: -1 });
        return {
          ...inv.toObject(),
          payments: invPays,
        };
      })
    );

    res.json(invWithPayments);
  })
);

// Stream Client Invoice / Bill PDF directly to browser (ZERO DISK STORAGE)
router.post(
  "/:id/bill-pdf",
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { invoiceId, dispatchIds, billNo, billDate, notes, previousDue, previousBillNo } = req.body;

    // Check if this is an existing invoice
    let invoice = null;
    if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
      invoice = await ClientInvoice.findById(invoiceId);
    } else if (billNo) {
      invoice = await ClientInvoice.findOne({ client: client._id, billNo, voided: { $ne: true } });
    }

    let rows = [];
    if (invoice) {
      // Load dispatches linked to this existing invoice (check both active and historical)
      if (invoice.dispatchIds && invoice.dispatchIds.length) {
        rows = await SalesDispatch.find({ _id: { $in: invoice.dispatchIds } }).sort({ clientDoriNo: 1, date: 1 });
      }
      if (!rows.length && invoice.billNo) {
        rows = await SalesDispatch.find({ client: client._id, billNo: invoice.billNo }).sort({ clientDoriNo: 1, date: 1 });
      }
    } else {
      // Brand new invoice being created
      const filter = { client: client._id, voided: { $ne: true } };
      if (Array.isArray(dispatchIds) && dispatchIds.length) {
        filter._id = { $in: dispatchIds };
      }
      rows = await SalesDispatch.find(filter).sort({ clientDoriNo: 1, date: 1 });

      const prevNum = Number(previousDue || 0);
      if (!rows.length && prevNum <= 0) {
        return res.status(400).json({ message: "No items or pending balance to bill" });
      }

      const effectiveBillNo = billNo || `INV-${client.code}-${Date.now().toString().slice(-4)}`;
      invoice = await createOrUpdateInvoice({
        client: client._id,
        billNo: effectiveBillNo,
        billDate: billDate || new Date(),
        dispatchIds: rows.map((r) => r._id),
        previousDue: prevNum,
        previousBillNo: previousBillNo || "",
        notes: notes || "",
        userId: req.user?._id,
      });
    }

    const company = (await Settings.findOne({ key: "company" })) || {};
    const effectiveBillNo = invoice?.billNo || billNo || `INV-${client.code}`;

    // Fetch payments recorded against this invoice
    const invoicePayments = await Payment.find({
      client: client._id,
      $or: [{ invoice: invoice?._id }, { billNo: effectiveBillNo }],
      voided: { $ne: true },
    }).sort({ date: 1 });

    const buffer = await buildClientInvoicePdfBuffer({
      company,
      client,
      billNo: effectiveBillNo,
      billDate: invoice?.billDate || billDate || new Date(),
      rows,
      notes: invoice?.notes || notes || "",
      previousDue: invoice?.previousDue || 0,
      previousBillNo: invoice?.previousBillNo || "",
      paidAmount: invoice?.paidAmount || 0,
      balanceDue: invoice?.balanceDue || 0,
      payments: invoicePayments,
    });

    const clientSlug = client.name.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${clientSlug}-${effectiveBillNo}.pdf"`);
    res.send(buffer);
  })
);

// Export Client Invoice CSV directly
router.post(
  "/:id/bill-csv",
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { dispatchIds, billNo } = req.body;
    const filter = { client: client._id, voided: { $ne: true } };
    if (Array.isArray(dispatchIds) && dispatchIds.length) {
      filter._id = { $in: dispatchIds };
    }

    const rows = await SalesDispatch.find(filter).sort({ clientDoriNo: 1 });
    const csvRows = [
      ["Client S.No", "Global Dori No", "Date", "Lanyard / Description", "Size", "Quantity", "Rate", "Basic Amount", "GST %", "GST Amount", "Total", "Billed Status", "Bill No"],
    ];

    rows.forEach((r, idx) => {
      csvRows.push([
        r.clientDoriNo || idx + 1,
        r.doriNo,
        r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
        `"${(r.itemName || "Lanyard").replace(/"/g, '""')}"`,
        r.sizeName || "",
        r.quantity,
        r.rate,
        r.basicAmount,
        r.gstPercent || 0,
        r.gstAmount || 0,
        r.total,
        r.isBilled ? "Billed" : "Unbilled",
        r.billNo || "",
      ]);
    });

    const csvContent = csvRows.map((e) => e.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${client.code}-${billNo || "export"}.csv"`);
    res.send(csvContent);
  })
);

router.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const before = await Client.findById(req.params.id);
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await audit(req, { action: "update", entity: "client", entityId: client._id, before: before?.toObject(), after: client.toObject() });
    res.json(client);
  })
);

router.delete(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndUpdate(req.params.id, { voided: true, status: "inactive" }, { new: true });
    await audit(req, { action: "void", entity: "client", entityId: client._id });
    res.json(client);
  })
);

export default router;
