import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { router } from "./routes/api.js";
import { uploadsDir } from "./middleware/upload.js";

const app = express();
app.use(morgan("dev"));
app.use(cors({ origin: config.webOrigin === "*" ? true : config.webOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "wellsneakers-api",
    version: "0.2.0",
    docs: [
      "GET /api/health",
      "GET /api/catalog",
      "POST /api/orders",
      "GET /api/staff/search?q=",
      "POST /api/staff/products",
      "POST /api/staff/inventory",
    ],
  });
});

app.use("/api", router);

app.use((err, _req, res, _next) => {
  const status = err.status || (err.message === "image_only" ? 400 : 500);
  res.status(status).json({
    ok: false,
    error: err.message || "error",
    detail: err.detail || undefined,
  });
});

app.listen(config.port, () => {
  console.log(`wellsneakers-api on :${config.port}`);
});
