import crypto from "crypto";
import { config } from "../config.js";
import { query } from "../db.js";

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Validate Telegram WebApp initData. Dev fallback via headers if no BOT_TOKEN. */
export async function staffAuth(req, res, next) {
  try {
    const initData = req.header("x-telegram-init-data") || "";
    if (initData && config.botToken) {
      const user = verifyTelegramInitData(initData, config.botToken);
      if (!user) {
        return res.status(401).json({ ok: false, error: "invalid_init_data" });
      }
      const staff = await upsertStaffFromTelegram(user);
      if (!staff || !staff.active) {
        return res.status(403).json({ ok: false, error: "staff_not_allowed" });
      }
      req.staff = staff;
      return next();
    }

    // Dev / no token yet
    if (!config.botToken || config.allowDevStaff) {
      const role = String(req.header("x-staff-role") || "admin").toLowerCase();
      const telegramId = Number(req.header("x-telegram-id") || 1);
      const name = req.header("x-staff-name") || "Dev";
      req.staff = {
        id: null,
        telegramId,
        name,
        role: role === "seller" ? "seller" : "admin",
        active: true,
        dev: true,
      };
      return next();
    }

    return res.status(401).json({ ok: false, error: "auth_required" });
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "admin_only" });
  }
  next();
}

export function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!timingSafeEqual(calculated, hash)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  try {
    return JSON.parse(params.get("user") || "null");
  } catch {
    return null;
  }
}

async function upsertStaffFromTelegram(user) {
  const telegramId = Number(user.id);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Staff";
  const isAdmin = config.adminTelegramIds.includes(telegramId);
  const { rows } = await query(
    `INSERT INTO staff_users (telegram_id, name, role, active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (telegram_id) DO UPDATE SET
       name = EXCLUDED.name,
       role = CASE
         WHEN staff_users.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'::user_role
         ELSE staff_users.role
       END
     RETURNING id, telegram_id AS "telegramId", name, role, active`,
    [telegramId, name, isAdmin ? "admin" : "seller"]
  );
  return rows[0];
}
