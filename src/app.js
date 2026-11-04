import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import clientRoutes from "./routes/clients.js";
import rateRoutes from "./routes/clientRates.js";
import salesRoutes from "./routes/sales.js";
import purchaseRoutes from "./routes/purchases.js";
import stockRoutes from "./routes/stock.js";
import expenseRoutes from "./routes/expenses.js";
import paymentRoutes from "./routes/payments.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/reports.js";
import masterRoutes from "./routes/masters.js";
import userRoutes from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://ekakshar-enterprises.vercel.app",
    env.clientOrigin,
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith(".vercel.app") ||
          env.clientOrigin === "*"
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  app.get("/api/health", (req, res) => res.json({ ok: true, service: "ekakshar-api" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/clients", clientRoutes);
  app.use("/api/client-rates", rateRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/purchases", purchaseRoutes);
  app.use("/api/stock", stockRoutes);
  app.use("/api/expenses", expenseRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/masters", masterRoutes);
  app.use("/api/users", userRoutes);

  app.use(errorHandler);
  return app;
}
