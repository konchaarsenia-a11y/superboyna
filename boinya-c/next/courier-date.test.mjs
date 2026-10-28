import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../proxy/worker.js");
const src = fs.readFileSync(root, "utf8");
const start = src.indexOf("function courierSlotIso_(");
const end = src.indexOf("/** Чтение: заказы этой даты доставки");
const chunk = src.slice(start, end);

function boot() {
  const sandbox = {
    WEEK_DAYS: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье", "Будущая неделя"],
    coerceDateIso_: function (raw) {
      const s = String(raw || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      return m ? m[3] + "-" + m[2] + "-" + m[1] : "";
    },
    isoAddDays_: function (iso, n) {
      const p = String(iso || "").split("-");
      const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(n || 0)));
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return dt.getUTCFullYear() + "-" + m + "-" + d;
    },
    partnerOpsKey_: function () { return ""; },
    opsPersonKey_: function (c) { return String((c && (c.matchKey || c.name)) || "").toUpperCase(); },
    normalizeSegmentLabel_: function (s) { return String(s || ""); }
  };
  vm.createContext(sandbox);
  vm.runInContext(chunk, sandbox, { filename: "courier-date.js" });
  return sandbox;
}

test("слот четверга и пятницы этой недели, даже если снимок отстаёт", () => {
  const api = boot();
  assert.equal(api.courierSlotIso_("Четверг", "2026-10-22", "2026-10-26"), "2026-10-29");
  assert.equal(api.courierSlotIso_("Пятница", "16.10.2026", "2026-10-26"), "2026-10-30");
  assert.equal(api.courierSlotIso_("Четверг", "2026-10-29", "2026-10-26"), "2026-10-29");
  assert.equal(api.courierSlotIso_("Пятница", "2026-10-30", "2026-10-26"), "2026-10-30");
});

test("две записи 29.10 и одна 30.10 с днём «Будущая неделя» попадают в курьер", () => {
  const api = boot();
  const thu = api.courierMergeDateRows_(
    [{ name: "old_thu", matchKey: "OLD", segment: "ПП", dateIso: "2026-10-22" }],
    [
      { id: "a", name: "pp_one", matchKey: "PPONE", segment: "ПП", dateIso: "2026-10-29", day: "Будущая неделя" },
      { id: "b", name: "pp_two", matchKey: "PPTWO", segment: "ПП", dateIso: "2026-10-29", day: "Будущая неделя" }
    ],
    "2026-10-29"
  );
  assert.equal(thu.map(function (c) { return c.name; }).join(","), "pp_one,pp_two");
  const fri = api.courierMergeDateRows_(
    [],
    [{ id: "c", name: "pp_fri", matchKey: "PPFRI", segment: "ПП", dateIso: "2026-10-30", day: "Будущая неделя", orderPrice: 145 }],
    "2026-10-30"
  );
  assert.equal(fri.length, 1);
  assert.equal(fri[0].name, "pp_fri");
  assert.equal(fri[0].orderPrice, 145);
  const again = api.courierMergeDateRows_(thu, thu, "2026-10-29");
  assert.equal(again.length, 2);
  const retail = api.courierMergeDateRows_(thu, [
    { id: "r", name: "shop", matchKey: "SHOP", segment: "Р", dateIso: "2026-10-29", address: "Немига 5", entrance: "2" }
  ], "2026-10-29");
  assert.equal(retail.length, 3);
  assert.equal(retail[2].entrance, "2");
});

test("наложение курьера только читает заказы этой даты", () => {
  const overlay = src.slice(src.indexOf("async function overlayCourierByDate_"), src.indexOf("async function getCourier_("));
  assert.match(overlay, /date_iso = \?/);
  assert.match(overlay, /status = 'active'/);
  assert.equal(overlay.includes("UPDATE"), false);
  assert.equal(overlay.includes("putSnap_"), false);
  assert.match(src, /hit = await overlayCourierByDate_\(env, day, hit\)/);
});
