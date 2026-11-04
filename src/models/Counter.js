import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

export async function nextSeq(name, startAt = 1) {
  const doc = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  if (doc.seq === 1 && startAt > 1) {
    doc.seq = startAt;
    await doc.save();
  }
  return doc.seq;
}

export async function nextClientSeq(clientId) {
  const { SalesDispatch } = await import("./SalesDispatch.js");
  const last = await SalesDispatch.findOne({ client: clientId, voided: { $ne: true } })
    .sort({ clientDoriNo: -1 })
    .select("clientDoriNo");
  const currentMax = Number(last?.clientDoriNo) || 0;

  const name = `client_dori_${clientId}`;
  const counterDoc = await Counter.findOne({ name });
  const base = Math.max(currentMax, Number(counterDoc?.seq) || 0);
  const nextVal = base + 1;

  await Counter.findOneAndUpdate(
    { name },
    { $set: { seq: nextVal } },
    { upsert: true, new: true }
  );
  return nextVal;
}

export async function nextGlobalDoriSeq() {
  const { SalesDispatch } = await import("./SalesDispatch.js");
  const last = await SalesDispatch.findOne({ voided: { $ne: true } })
    .sort({ doriNo: -1 })
    .select("doriNo");
  const currentMax = Number(last?.doriNo) || 0;

  const counterDoc = await Counter.findOne({ name: "dori" });
  const base = Math.max(currentMax, Number(counterDoc?.seq) || 0);
  const nextVal = base + 1;

  await Counter.findOneAndUpdate(
    { name: "dori" },
    { $set: { seq: nextVal } },
    { upsert: true, new: true }
  );

  return nextVal;
}
