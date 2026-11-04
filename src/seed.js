import bcrypt from "bcryptjs";
import { connectDb } from "./config/db.js";
import { User } from "./models/User.js";
import { Client } from "./models/Client.js";
import { Item } from "./models/Item.js";
import { LanyardSize } from "./models/LanyardSize.js";
import { ClientRate } from "./models/ClientRate.js";
import { Supplier } from "./models/Supplier.js";
import { ExpenseCategory } from "./models/ExpenseCategory.js";
import { Settings } from "./models/Settings.js";
import { SalesDispatch } from "./models/SalesDispatch.js";
import { Purchase } from "./models/Purchase.js";
import { DailyExpense } from "./models/DailyExpense.js";
import { FixedExpense } from "./models/FixedExpense.js";
import { StockLedger } from "./models/StockLedger.js";
import { Payment } from "./models/Payment.js";
import { Counter } from "./models/Counter.js";
import { SharedReportLink } from "./models/SharedReportLink.js";
import { AuditLog } from "./models/AuditLog.js";

await connectDb();

async function seed() {
  await Promise.all([
    Client.deleteMany({}),
    ClientRate.deleteMany({}),
    SalesDispatch.deleteMany({}),
    Purchase.deleteMany({}),
    DailyExpense.deleteMany({}),
    FixedExpense.deleteMany({}),
    StockLedger.deleteMany({}),
    Payment.deleteMany({}),
    Counter.deleteMany({}),
    SharedReportLink.deleteMany({}),
    AuditLog.deleteMany({}),
    Supplier.deleteMany({}),
    Item.deleteMany({}),
    LanyardSize.deleteMany({}),
    ExpenseCategory.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  if (!(await User.countDocuments())) {
    await User.create({
      name: "Owner",
      email: "admin@ekakshar.com",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      role: "admin",
    });
    await User.create({
      name: "Data Entry",
      email: "entry@ekakshar.com",
      passwordHash: await bcrypt.hash("Entry@123", 10),
      role: "data_entry",
    });
    await User.create({
      name: "Accounts",
      email: "accounts@ekakshar.com",
      passwordHash: await bcrypt.hash("View@123", 10),
      role: "viewer",
    });
  }

  await Settings.create({
    key: "company",
    companyName: "EKAKSHAR ENTERPRISES",
    tagline: "Lanyard & Dori Manufacturing",
    nextDoriNo: 1,
    lowStockThresholds: { ink: 2, paper_roll: 5, lanyard_roll: 3 },
  });

  await LanyardSize.insertMany([
    { name: "16mm", mm: 16, sortOrder: 1 },
    { name: "20mm", mm: 20, sortOrder: 2 },
    { name: "25mm", mm: 25, sortOrder: 3 },
    { name: "38mm", mm: 38, sortOrder: 4 },
  ]);
  await Item.insertMany([{ name: "Lanyard / Dori" }, { name: "Printed Lanyard" }]);
  await ExpenseCategory.insertMany([
    { name: "Tea / snacks", type: "daily" },
    { name: "Transport", type: "daily" },
    { name: "Repair", type: "daily" },
    { name: "Rent", type: "fixed" },
    { name: "Electricity", type: "fixed" },
  ]);

  console.log("Clean start ready. Dummy clients, sales, purchases and payments were removed.");
  console.log("Login: admin@ekakshar.com / Admin@123");
  console.log("Add your own clients from the Clients page.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
