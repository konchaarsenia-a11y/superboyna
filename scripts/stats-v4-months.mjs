/**
 * Read-only Sept/Oct 2026 close.
 * GET getStats only. Does not POST and does not call finishFullWeekProduction.
 *
 *   node scripts/stats-v4-months.mjs
 *   WEBHOOK_URL=https://script.google.com/macros/s/.../exec node scripts/stats-v4-months.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const F = require(path.resolve(here, "../boinya-c/next/formulas.js"));

const WEBHOOK = process.env.WEBHOOK_URL ||
  "https://boinya-c.konchaarsenia.workers.dev";
const INIT_DATA = process.env.INIT_DATA || "";
const MONTHS = ["2026-09", "2026-10"];

function money(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

async function getStats(month) {
  const url = WEBHOOK + "?action=getStats&period=month&month=" + encodeURIComponent(month) + "&force=1";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  const body = JSON.stringify({
    action: "getStats",
    period: "month",
    month: month,
    force: "1",
    initData: INIT_DATA
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) {
      return { ok: false, status: res.status, snippet: text.slice(0, 240).replace(/\s+/g, " ") };
    }
    const json = JSON.parse(text.slice(start, end + 1));
    return { ok: true, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function line(label, value) {
  return label.padEnd(28, " ") + value;
}

function report(month, json) {
  const roll = json && json.formula;
  console.log("\n=== " + month + " ===");
  if (!json || json.status !== "success" || !roll || roll.ok === false || roll.revenue == null) {
    console.log("Живой срез формулы недоступен.");
    console.log("status:", json && json.status);
    console.log("message:", json && (json.message || json.error || ""));
    console.log("keys:", json ? Object.keys(json).join(", ") : "");
    return null;
  }
  const close = F.formulaClose_({
    monthKey: month,
    revenue: roll.revenue,
    S: roll.S, G: roll.G, P: roll.P, N: roll.N,
    rows: [],
    repairs: []
  });
  const rows = [
    ["Оборот", money(close.revenue)],
    ["Сырьё", money(close.raw)],
    ["ЗП нарезка", money(close.cut)],
    ["ЗП сборка", money(close.assembly)],
    ["Свет по формуле", money(close.light)],
    ["Упаковка", money(close.pack)],
    ["Дорога", money(close.road)],
    ["Себестоимость", money(close.cost)],
    ["Валовая маржа", money(close.gross)],
    ["Аренда", money(close.rent) + (close.rentDefault ? " по умолчанию" : "")],
    ["Купоны", money(close.project.coupon) + " не введено"],
    ["Инструмент", money(close.project.tool) + " не введено"],
    ["SMM", money(close.project.smm) + " не введено"],
    ["Прочее", money(close.project.other) + " не введено"],
    ["Амортизация", money(close.amort) + " не введено"],
    ["Налог 20%", money(close.tax)],
    ["Прибыль до налога", money(close.profit)],
    ["Прибыль после налога", money(close.afterTax)],
    ["Доставки", String(close.N)],
    ["Остаток доставки", money(close.deliveryRest) + " уже внутри маржи"],
    ["ПП", money(roll.ppRevenue)],
    ["Розница", money(roll.retailRevenue)]
  ];
  rows.forEach((r) => console.log(line(r[0], r[1])));
  console.log("Журнал расходов пуст: таблица owner_expenses новая, в этот запрос не входит.");
  return close;
}

const results = [];
for (const month of MONTHS) {
  process.stderr.write("getStats " + month + "\n");
  const got = await getStats(month);
  if (!got.ok) {
    console.log("\n=== " + month + " ===");
    console.log("HTTP", got.status);
    console.log(got.snippet || got.error || "пустой ответ");
    results.push({ month, ok: false });
    continue;
  }
  const close = report(month, got.json);
  results.push({ month, ok: !!close });
}

if (results.some((r) => !r.ok)) {
  console.log("\nЖивые цифры без подписи Telegram не отдаются: getStats отвечает auth_required.");
  console.log("Только чтение, записей в таблицу нет. Из мини-аппа владельца скопируйте Telegram.WebApp.initData и запустите:");
  console.log("INIT_DATA='вставьте_initData' node scripts/stats-v4-months.mjs");
  console.log("Журнал расходов в ответ getStats не входит. Пока строк нет, аренда 900 по умолчанию, остальные статьи не введены, налог считается с этого.");
  process.exitCode = 2;
}
