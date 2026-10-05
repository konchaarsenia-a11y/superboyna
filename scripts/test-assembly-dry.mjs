#!/usr/bin/env node
/**
 * Вес после сушки в Сборке подменяет план склада.
 * Нет факта — прежняя формула dry÷coef + излишек.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const prodSrc = fs.readFileSync(path.join(root, "boinya-c/next/production.js"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL  " + msg);
    return;
  }
  console.log("ok    " + msg);
}

assert(prodSrc.includes("function isChewCut_"), "излишек только через isChewCut_");
assert(prodSrc.includes("pr-surplus-open"), "жевалка открывает излишек");
assert(prodSrc.includes("Сохранить излишек"), "лист жевалки сохраняет излишек");
assert(prodSrc.includes("if (!srow || !isChewCut_(srow))"), "лист излишка закрыт для веса");
assert(prodSrc.includes("Вес после сушки"), "сборка показывает вес после сушки");
assert(prodSrc.includes("saveAssemblyDry"), "сборка пишет saveAssemblyDry");
assert(prodSrc.includes("Сегодня режет"), "строка кто режет на месте");
assert(prodSrc.includes("nxCutterManual"), "пустое список — ручное имя");
assert(prodSrc.includes('data-act="pr-cutter"'), "кнопка Сменить есть");
assert(workerSrc.includes("assembly_dry"), "D1 таблица assembly_dry");
assert(workerSrc.includes("function blendDryGramsWithFacts_"), "подмена граммов фактом");
assert(!workerSrc.includes("telegramSend") || workerSrc.indexOf("saveAssemblyDry_") > 0, "save не шлёт telegram");

const prodBox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  document: { getElementById: function () { return null; }, addEventListener: function () {} }
};
prodBox.globalThis = prodBox;
const prodCtx = vm.createContext(prodBox);
vm.runInContext(prodSrc, prodCtx, { filename: "production.js" });
prodCtx.BoinyaShell = {
  esc: function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
};
const api = prodCtx.BoinyaProduction;
assert(api && api.dryRawKg_(1200, 0.2) === 6, "1200 г / 0.2 = 6 кг");
assert(api.dryRawKg_(800, 0.2) === 4, "800 г / 0.2 = 4 кг");
const dryHtml = api.previewDryHtml_([
  { key: "ЛЕГКОЕ", name: "Лёгкое", planDryG: 1200, factDryG: 800, coef: 0.2 }
]);
assert(dryHtml.includes("Вес после сушки") && dryHtml.includes("Лёгкое") && !dryHtml.includes("Излишек"), "карточка веса без излишка");
assert(api.isChewCut_({ name: "ТРАХЕЯ СРЕД", unit: "шт", cat: "chew" }), "трахея — жевалка");
assert(api.isChewCut_({ name: "ЛОП ХРЯЩ шт.", unit: "шт" }), "хрящ штуками — жевалка");
assert(!api.isChewCut_({ name: "Лёгкое", unit: "гр", cat: "dressura", surplus: 3 }), "лёгкое не жевалка");
assert(!api.isChewCut_({ name: "Сердце", unit: "гр" }), "сердце не жевалка");
const chewRow = api.previewCutRow_({ name: "ТРАХЕЯ СРЕД", unit: "шт", cat: "chew", dry: 4, raw: 4, surplus: 2, row: 1 });
assert(chewRow.includes("pr-surplus-open") && chewRow.includes("излишек 2") && chewRow.includes("ТРАХЕЯ"), "жевалка: вторая ! и излишек");
const weightRow = api.previewCutRow_({ name: "Лёгкое", unit: "гр", cat: "dressura", dry: 1200, raw: 6, surplus: 9, row: 2 });
assert(weightRow.includes("pr-bang") && !weightRow.includes("pr-surplus") && !weightRow.includes("излишек"), "вес: только ! дефицита, без излишка");
const who = api.previewCutterLine_({ id: "1", name: "Нарезчик" });
assert(who.includes("Сегодня режет Нарезчик") && who.includes("Сменить"), "смена нарезчика видна");
const none = api.previewCutterLine_(null);
assert(none.includes("не выбран") && none.includes("Сменить"), "без имени тоже можно сменить");
fs.writeFileSync("/tmp/assembly-dry-preview.html", "<!doctype html><meta charset=utf-8><body style=\"background:#0a0a0a;color:#f5f5f7;font:16px sans-serif;max-width:420px;padding:16px\">" + dryHtml + who + "</body>");

let Database = null;
try {
  Database = (await import("node:sqlite")).DatabaseSync;
} catch (eSql) {
  Database = null;
}

if (!Database) {
  console.log("skip  d1 sim");
} else {
  const workerBox = {};
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    try { workerBox[k] = globalThis[k]; } catch (eG) {}
  }
  const wctx = vm.createContext(workerBox);
  vm.runInContext(workerSrc.replace(/^export default /m, "const __workerExport = "), wctx, { filename: "worker.js" });
  const plan = wctx.warehouseRawForKey_({
    planDryG: 1200,
    planByDay: { "ЛЕГКОЕ": { "2026-10-05": 1200 } },
    factByIso: {},
    key: "ЛЕГКОЕ",
    dayIsos: ["2026-10-05"],
    surplusKg: 1,
    coef: 0.2,
    piece: false
  });
  assert(plan.raw === 7 && plan.fromFact === false, "без факта 6 кг + излишек 1, got " + plan.raw);
  const piece = wctx.warehouseRawForKey_({
    planDryG: 4,
    planByDay: { "ТРАХЕЯ": { "2026-10-05": 4 } },
    factByIso: {},
    key: "ТРАХЕЯ",
    dayIsos: ["2026-10-05"],
    surplusKg: 2,
    coef: 1,
    piece: true
  });
  assert(piece.raw === 6 && piece.surplus === 2 && piece.fromFact === false, "жевалка: 4 шт + излишек 2, got " + piece.raw);
  const fact = wctx.warehouseRawForKey_({
    planDryG: 1200,
    planByDay: { "ЛЕГКОЕ": { "2026-10-05": 1200 } },
    factByIso: { "2026-10-05": { "ЛЕГКОЕ": 800 } },
    key: "ЛЕГКОЕ",
    dayIsos: ["2026-10-05"],
    surplusKg: 1,
    coef: 0.2,
    piece: false
  });
  assert(fact.raw === 4 && fact.fromFact === true && fact.surplus === 0, "факт 800 г = 4 кг без излишка, got " + fact.raw);
  const mixed = wctx.warehouseRawForKey_({
    planDryG: 2200,
    planByDay: { "ЛЕГКОЕ": { "2026-10-05": 1200, "2026-10-06": 1000 } },
    factByIso: { "2026-10-05": { "ЛЕГКОЕ": 800 } },
    key: "ЛЕГКОЕ",
    dayIsos: ["2026-10-05", "2026-10-06"],
    surplusKg: 1,
    coef: 0.2,
    piece: false
  });
  assert(mixed.dryG === 1800 && mixed.raw === 9, "день с фактом 800 + день плана 1000 = 9 кг, got " + mixed.dryG + "/" + mixed.raw);

  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(root, "boinya-c/proxy/schema.sql"), "utf8"));
  function d1() {
    return {
      prepare(sql) {
        const stmt = db.prepare(sql);
        function bound(args) {
          return {
            first: async () => stmt.get(...args) || null,
            all: async () => ({ results: stmt.all(...args) }),
            run: async () => stmt.run(...args)
          };
        }
        return Object.assign(bound([]), { bind: (...args) => bound(args) });
      }
    };
  }
  const env = { DB: d1() };
  const saved = await wctx.saveAssemblyDry_(
    { iso: "2026-10-05", key: "ЛЕГКОЕ", name: "Лёгкое", dryG: "800", coef: 0.2 },
    env
  );
  assert(saved && saved.status === "success" && saved.rawKg === 4, "saveAssemblyDry 800 г");
  const loaded = await wctx.loadAssemblyDryByIso_(env, ["2026-10-05"]);
  assert(loaded["2026-10-05"] && loaded["2026-10-05"]["ЛЕГКОЕ"] === 800, "факт читается из D1");
  const cleared = await wctx.saveAssemblyDry_({ iso: "2026-10-05", key: "ЛЕГКОЕ", dryG: "" }, env);
  assert(cleared && cleared.cleared === true, "пустое поле снимает факт");
  const after = await wctx.loadAssemblyDryByIso_(env, ["2026-10-05"]);
  assert(!after["2026-10-05"], "после очистки плана нет факта");
}

if (failed) {
  console.error("assembly-dry FAILED " + failed);
  process.exit(1);
}
console.log("assembly-dry ok");
