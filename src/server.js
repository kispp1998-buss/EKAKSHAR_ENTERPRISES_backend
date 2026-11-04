import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

async function autoHealClientSequences() {
  try {
    const { Client } = await import("./models/Client.js");
    const { SalesDispatch } = await import("./models/SalesDispatch.js");
    const { Counter } = await import("./models/Counter.js");
    const clients = await Client.find({});
    for (const c of clients) {
      const sales = await SalesDispatch.find({ client: c._id, voided: { $ne: true } }).sort({ date: 1, createdAt: 1, doriNo: 1 });
      if (!sales.length) {
        await Counter.findOneAndUpdate({ name: `client_dori_${c._id}` }, { $set: { seq: 0 } }, { upsert: true });
        continue;
      }
      let seq = 1;
      for (const s of sales) {
        if (s.clientDoriNo !== seq) {
          s.clientDoriNo = seq;
          await SalesDispatch.updateOne({ _id: s._id }, { $set: { clientDoriNo: seq } });
        }
        seq++;
      }
      const maxSeq = seq - 1;
      await Counter.findOneAndUpdate(
        { name: `client_dori_${c._id}` },
        { $set: { seq: maxSeq } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("Auto-heal sequence notice:", err.message);
  }
}


await connectDb();
await autoHealClientSequences();

const app = createApp();
app.listen(env.port, () => {
  console.log(`EKAKSHAR API running on http://localhost:${env.port}`);
});

