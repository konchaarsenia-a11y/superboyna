import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { router } from "./routes/api.js";

const app = express();
app.use(morgan("dev"));
app.use(cors({ origin: config.webOrigin === "*" ? true : config.webOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "wellsneakers-api",
    version: "0.1.0",
    docs: ["GET /api/health", "GET /api/catalog", "POST /api/orders", "GET /api/staff/search?q="],
  });
});

app.use("/api", router);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || "error",
    detail: err.detail || undefined,
  });
});

app.listen(config.port, () => {
  console.log(`wellsneakers-api on :${config.port}`);
});
