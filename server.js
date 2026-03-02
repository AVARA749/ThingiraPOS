require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const prisma = require("./prisma/client");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const itemRoutes = require("./routes/items");
const supplierRoutes = require("./routes/suppliers");
const purchaseRoutes = require("./routes/purchases");
const salesRoutes = require("./routes/sales");
const customerRoutes = require("./routes/customers");
const stockRoutes = require("./routes/stock");
const reportRoutes = require("./routes/reports");
const shiftRoutes = require("./routes/shifts");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
// CORS: allow origins from env (comma-separated) or default to localhost dev servers
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Default dev origins if none specified
if (allowedOrigins.length === 0) {
  allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, Postman)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(normalizedOrigin)
      ) {
        return callback(null, true);
      }
      console.warn(`[CORS] Rejected: ${origin}. Allowed:`, allowedOrigins);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Custom Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  const origin = req.get("origin") || "no-origin";
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (Origin: ${origin}, ${duration}ms)`,
    );
  });
  next();
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/shifts", shiftRoutes);

// Health checks
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", name: "ThingiraShop API", version: "1.0.0" });
});

app.get("/api/ping", (req, res) => {
  res.send("pong");
});

// 404 for unknown routes — client is deployed separately at thingira-web.vercel.app
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// Vercel serverless — export app immediately, no blocking startup
// Prisma connects lazily on first query (no $connect() needed)
module.exports = app;

// Local dev only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🏪 ThingiraShop API running on http://0.0.0.0:${PORT}`);
  });

  process.on("SIGINT", async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
