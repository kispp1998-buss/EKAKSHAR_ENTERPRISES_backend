import mongoose from "mongoose";
import { ClientInvoice } from "../models/ClientInvoice.js";
import { SalesDispatch } from "../models/SalesDispatch.js";
import { Payment } from "../models/Payment.js";
import { round2 } from "./money.js";

/**
 * Calculates previous pending balance due for a client.
 * Looks at the last invoice with balanceDue > 0 or all unpaid invoices.
 */
export async function getClientPendingDue(clientId) {
  if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
    return { previousDue: 0, lastBillNo: "", lastInvoiceId: null, pendingInvoices: [] };
  }

  // Find all active invoices for this client
  const invoices = await ClientInvoice.find({
    client: clientId,
    voided: { $ne: true },
  }).sort({ billDate: -1, createdAt: -1 });

  const pendingInvoices = invoices.filter(
    (inv) => (inv.balanceDue || 0) > 0 && inv.status !== "carried_forward"
  );

  if (pendingInvoices.length > 0) {
    // The most recent pending invoice
    const latestPending = pendingInvoices[0];
    // Total pending balance across all active bills
    const totalPending = round2(pendingInvoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0));
    return {
      previousDue: totalPending,
      lastBillNo: latestPending.billNo,
      lastInvoiceId: latestPending._id,
      lastBillDate: latestPending.billDate,
      pendingInvoices,
    };
  }

  // Fallback: check legacy billed dispatches if no formal invoice exists yet
  const billedDispatches = await SalesDispatch.find({
    client: clientId,
    voided: { $ne: true },
    isBilled: true,
  });

  const billedTotal = billedDispatches.reduce((sum, d) => sum + (d.total || 0), 0);
  const billedRec = billedDispatches.reduce((sum, d) => sum + (d.received || 0), 0);
  const legacyDue = round2(Math.max(0, billedTotal - billedRec));

  return {
    previousDue: legacyDue,
    lastBillNo: billedDispatches[0]?.billNo || "",
    lastInvoiceId: null,
    pendingInvoices: [],
  };
}

/**
 * Saves a new formal Client Invoice, carrying forward previous due balance
 */
export async function createOrUpdateInvoice({
  client,
  billNo,
  billDate,
  dispatchIds = [],
  previousDue = 0,
  previousBillNo = "",
  notes = "",
  userId,
}) {
  const dispatches = await SalesDispatch.find({
    _id: { $in: dispatchIds },
    client,
    voided: { $ne: true },
  });

  const itemsTotal = round2(dispatches.reduce((sum, d) => sum + (d.total || 0), 0));
  const prevDueNum = round2(Number(previousDue || 0));
  const grandTotal = round2(itemsTotal + prevDueNum);

  // Check if invoice with this billNo already exists for this client
  let invoice = await ClientInvoice.findOne({ client, billNo, voided: { $ne: true } });

  if (invoice) {
    invoice.billDate = billDate ? new Date(billDate) : invoice.billDate;
    invoice.dispatchIds = dispatchIds;
    invoice.itemsTotal = itemsTotal;
    invoice.previousDue = prevDueNum;
    invoice.previousBillNo = previousBillNo || invoice.previousBillNo;
    invoice.grandTotal = grandTotal;
    invoice.balanceDue = round2(Math.max(0, grandTotal - (invoice.paidAmount || 0)));
    invoice.status = invoice.balanceDue <= 0 ? "paid" : invoice.paidAmount > 0 ? "partial" : "due";
    invoice.notes = notes || invoice.notes;
    await invoice.save();
  } else {
    invoice = await ClientInvoice.create({
      client,
      billNo,
      billDate: billDate ? new Date(billDate) : new Date(),
      dispatchIds,
      itemsTotal,
      previousDue: prevDueNum,
      previousBillNo,
      grandTotal,
      paidAmount: 0,
      balanceDue: grandTotal,
      status: "due",
      notes: notes || "",
      createdBy: userId,
    });
  }

  // If this bill carried forward balance from a previous bill, mark the earlier bill(s) as carried_forward
  if (prevDueNum > 0) {
    if (previousBillNo) {
      await ClientInvoice.updateMany(
        {
          client,
          billNo: previousBillNo,
          _id: { $ne: invoice._id },
          voided: { $ne: true },
        },
        {
          $set: {
            status: "carried_forward",
            carriedToBillNo: billNo,
            balanceDue: 0,
          },
        }
      );
    }
  }

  // Mark all selected dispatches as billed with this billNo
  await SalesDispatch.updateMany(
    { _id: { $in: dispatchIds } },
    {
      $set: {
        isBilled: true,
        billNo,
        billedAt: billDate ? new Date(billDate) : new Date(),
      },
    }
  );

  return invoice;
}

/**
 * Records a payment (installment) in cash, UPI, etc.
 * Updates Invoice balanceDue & automatically applies payment to SalesDispatches (FIFO)
 */
export async function applyClientPayment({
  client,
  amount,
  mode = "upi",
  reference = "",
  notes = "",
  date,
  billNo = "",
  invoiceId = null,
  userId,
}) {
  const payAmount = round2(Number(amount));
  if (!payAmount || payAmount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  let invoice = null;
  if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
    invoice = await ClientInvoice.findById(invoiceId);
  } else if (billNo) {
    invoice = await ClientInvoice.findOne({ client, billNo, voided: { $ne: true } });
  }

  // If no explicit invoice specified, find client's oldest pending invoice
  if (!invoice) {
    invoice = await ClientInvoice.findOne({
      client,
      voided: { $ne: true },
      status: { $in: ["due", "partial"] },
      balanceDue: { $gt: 0 },
    }).sort({ billDate: 1, createdAt: 1 });
  }

  // 1. Create Payment record
  const payment = await Payment.create({
    client,
    invoice: invoice?._id || null,
    billNo: invoice?.billNo || billNo || "",
    amount: payAmount,
    mode,
    reference: reference || "",
    notes: notes || "",
    date: date ? new Date(date) : new Date(),
    createdBy: userId,
  });

  // 2. Update Invoice paidAmount and balanceDue
  if (invoice) {
    invoice.paidAmount = round2((invoice.paidAmount || 0) + payAmount);
    invoice.balanceDue = round2(Math.max(0, invoice.grandTotal - invoice.paidAmount));
    invoice.status = invoice.balanceDue <= 0 ? "paid" : "partial";
    await invoice.save();
  }

  // 3. Apply payment to SalesDispatches in FIFO order
  // Find dispatches: first from this invoice, or client's unpaid dispatches
  let dispatchFilter = { client, voided: { $ne: true }, paymentStatus: { $in: ["due", "partial"] } };
  if (invoice?.dispatchIds?.length) {
    dispatchFilter = { _id: { $in: invoice.dispatchIds }, voided: { $ne: true } };
  }

  const dispatches = await SalesDispatch.find(dispatchFilter).sort({ clientDoriNo: 1, date: 1 });

  let rem = payAmount;
  for (const d of dispatches) {
    if (rem <= 0) break;
    const currentRec = Number(d.received || 0);
    const totalAmt = Number(d.total || 0);
    const needed = round2(Math.max(0, totalAmt - currentRec));
    if (needed > 0) {
      const applyAmt = round2(Math.min(rem, needed));
      d.received = round2(currentRec + applyAmt);
      d.outstanding = round2(Math.max(0, totalAmt - d.received));
      d.paymentStatus = d.received >= totalAmt ? "paid" : "partial";
      await d.save();
      rem = round2(rem - applyAmt);
    }
  }

  // If there is still payment left and invoice had dispatches, apply to any other client due dispatches
  if (rem > 0) {
    const remainingDispatches = await SalesDispatch.find({
      client,
      voided: { $ne: true },
      paymentStatus: { $in: ["due", "partial"] },
      _id: { $nin: dispatches.map((x) => x._id) },
    }).sort({ clientDoriNo: 1, date: 1 });

    for (const d of remainingDispatches) {
      if (rem <= 0) break;
      const currentRec = Number(d.received || 0);
      const totalAmt = Number(d.total || 0);
      const needed = round2(Math.max(0, totalAmt - currentRec));
      if (needed > 0) {
        const applyAmt = round2(Math.min(rem, needed));
        d.received = round2(currentRec + applyAmt);
        d.outstanding = round2(Math.max(0, totalAmt - d.received));
        d.paymentStatus = d.received >= totalAmt ? "paid" : "partial";
        await d.save();
        rem = round2(rem - applyAmt);
      }
    }
  }

  return { payment, invoice };
}
