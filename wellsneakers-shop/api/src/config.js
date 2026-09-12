import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3080),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://wellsneakers:wellsneakers@127.0.0.1:5432/wellsneakers",
  webOrigin: process.env.WEB_ORIGIN || "*",
  botToken: process.env.BOT_TOKEN || "",
  adminTelegramIds: String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  allowDevStaff: process.env.ALLOW_DEV_STAFF !== "0",
};
