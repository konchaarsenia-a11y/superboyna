import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { router } from "./routes/api.js";
import { uploadsDir } from "./middleware/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const app = express();
app.use(morgan("dev"));
app.use(cors({ origin: config.webOrigin === "*" ? true : config.webOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));

app.use("/ops", express.static(path.join(root, "miniapp")));
app.use("/shop", express.static(path.join(root, "web")));

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html><meta charset=utf-8>
<title>Wellsneakers</title>
<body style="font-family:system-ui;padding:24px;background:#0b0b0c;color:#f5f2ec">
<h1>Wellsneakers</h1>
<p><a href="/ops/" style="color:#4fd4ff">Операционка (Mini App)</a></p>
<p><a href="/shop/" style="color:#4fd4ff">Витрина</a></p>
<p><a href="/api/health" style="color:#a7a29b">API health</a></p>
</body>`);
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
