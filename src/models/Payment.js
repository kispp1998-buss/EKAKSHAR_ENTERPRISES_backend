import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    salesDispatch: { type: mongoose.Schema.Types.ObjectId, ref: "SalesDispatch", default: null },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "ClientInvoice", default: null },
    billNo: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ["cash", "upi", "neft", "cheque", "other"], default: "upi" },
    reference: { type: String, default: "" },
    notes: { type: String, default: "" },
    voided: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);
