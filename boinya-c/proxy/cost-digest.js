/** Текст и слот ежемесячного дайджеста себеса. Отправка остаётся в worker.js. */

export function costDigestMonth_(ymd) {
  if (!/^\d{4}-\d{2}-01$/.test(String(ymd || ""))) return "";
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const prev = new Date(Date.UTC(y, m - 1, 0));
  const pm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  return prev.getUTCFullYear() + "-" + pm;
}

/** 1-е число, 11:00 Минск, минута 0. Возвращает месяц, за который слать. */
export function costDigestDue_(parts) {
  if (!parts || parts.hour !== 11 || parts.minute !== 0) return "";
  return costDigestMonth_(parts.ymd);
}

export function costDigestText_(month, changes) {
  const lines = ["Себес за " + month + ":"];
  const list = (changes || []).slice(0, 40);
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    let bit = String(c.sku || "");
    if (c.cost != null && c.cost !== "") bit += " · " + c.cost;
    if (c.yield != null && c.yield !== "") bit += " · выход " + c.yield;
    if (c.from) bit += " · с " + c.from;
    lines.push("• " + bit);
  }
  lines.push("");
  lines.push("Кнопка пересчитает розницу от нового себеса. Потом обновите прайс в Instagram и на других площадках.");
  return lines.join("\n");
}

export const COST_DIGEST_MARKUP = {
  inline_keyboard: [[{ text: "Обновить прайс", callback_data: "costpub" }]]
};
