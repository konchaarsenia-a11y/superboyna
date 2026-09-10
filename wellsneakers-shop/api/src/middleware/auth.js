/** Dev / Telegram WebApp auth stub. Real initData verify comes next. */
export function staffAuth(req, _res, next) {
  const role = String(req.header("x-staff-role") || "admin").toLowerCase();
  const telegramId = Number(req.header("x-telegram-id") || 0);
  const name = req.header("x-staff-name") || "Dev";
  req.staff = {
    telegramId,
    name,
    role: role === "seller" ? "seller" : "admin",
  };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "admin_only" });
  }
  next();
}
