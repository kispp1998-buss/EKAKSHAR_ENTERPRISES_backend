import mongoose from "mongoose";

const clientInvoiceSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    billNo: { type: String, required: true, index: true },
    billDate: { type: Date, default: Date.now },
    dispatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "SalesDispatch" }],
    itemsTotal: { type: Number, required: true, default: 0 },
    previousDue: { type: Number, default: 0 },
    previousBillNo: { type: String, default: "" },
    grandTotal: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    status: { type: String, enum: ["due", "partial", "paid", "carried_forward"], default: "due" },
    carriedToBillNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

clientInvoiceSchema.index({ client: 1, billDate: -1 });

export const ClientInvoice = mongoose.model("ClientInvoice", clientInvoiceSchema);
