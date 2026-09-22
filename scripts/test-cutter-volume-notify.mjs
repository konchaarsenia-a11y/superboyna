#!/usr/bin/env node
/**
 * «Срочно: увеличение объёма нарезки» — только реальный рост состава.
 * Адрес / телефон / note / дата и перенормализация basket → 0 notify.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "Code.gs"), "utf8");

function extractFn(name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const start = src.search(re);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const names = [
  "normalizeProductAlias_",
  "catalogAliasName_",
  "normalizeFraction",
  "extractEmbeddedFraction",
  "isPieceSkuName_",
  "basketCanonParts_",
  "basketTotalsMap_",
  "formatBasketDelta_",
  "diffBasketIncrease_",
  "resolveOldBasketForCutterNotify_",
  "cutterVolumeNotifyDecision_"
];

const bundle = names.map(extractFn).join("\n");
const fns = {};
eval(bundle + "\n" + names.map(function (n) {
  return "fns." + n + "=" + n + ";";
}).join("\n"));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("ok  ", msg);
  }
}

const base = [
  { name: "УХО ГА", sub: "МЕЛКОЕ", val: 2 },
  { name: "трахея", sub: "сред", value: 100 }
];
const sameCanon = [
  { name: "УХО Г", sub: "МАЛ", val: 2 },
  { name: "ТРАХЕЯ", sub: "СРЕД", value: 100 }
];

function decide(extra) {
  return fns.cutterVolumeNotifyDecision_(Object.assign({
    late: true,
    newDateKey: "22.09.2026",
    oldDateKey: "22.09.2026",
    existingBasket: base,
    priorBasket: base,
    newBasket: sameCanon
  }, extra || {}));
}

const addressOnly = decide({ address: "ул. Новая 1", phone: "+375291112233", note: "домофон 4" });
assert(addressOnly.notify === false && addressOnly.lines.length === 0, "адрес/телефон/note → 0 notify");

const phoneOnly = decide({ phone: "+375447770011" });
assert(phoneOnly.notify === false, "только телефон → 0 notify");

const noteOnly = decide({ note: "не звонить" });
assert(noteOnly.notify === false, "только note → 0 notify");

const dateOnly = decide({
  newDateKey: "23.09.2026",
  oldDateKey: "22.09.2026",
  existingBasket: [],
  priorBasket: base,
  newBasket: sameCanon
});
assert(dateOnly.notify === false && dateOnly.lines.length === 0, "только дата → 0 notify (oldBasket со старой даты)");
assert(
  fns.resolveOldBasketForCutterNotify_({
    newDateKey: "23.09.2026",
    oldDateKey: "22.09.2026",
    existingBasket: [],
    priorBasket: base
  }).length === 2,
  "смена даты не берёт пустой existing"
);

const dogMerge = decide({
  existingBasket: [
    { name: "ЛЁГКОЕ", sub: "СРЕД", val: 50, dog: 1 },
    { name: "ЛЁГКОЕ", sub: "СРЕД", val: 50, dog: 2 }
  ],
  priorBasket: [
    { name: "ЛЁГКОЕ", sub: "СРЕД", val: 50, dog: 1 },
    { name: "ЛЁГКОЕ", sub: "СРЕД", val: 50, dog: 2 }
  ],
  newBasket: [{ name: "легкое", sub: "среднее", val: 100 }]
});
assert(dogMerge.notify === false, "перенормализация без смены состава → 0 notify");

const added = decide({
  newBasket: sameCanon.concat([{ name: "АОРТА", sub: "Обычное", val: 1 }])
});
assert(added.notify === true && added.lines.length >= 1, "добавили позицию late → notify есть");
assert(added.lines.join("\n").indexOf("АОРТА") >= 0, "строка notify называет новую позицию");

const addedEarly = decide({
  late: false,
  newBasket: sameCanon.concat([{ name: "АОРТА", sub: "Обычное", val: 1 }])
});
assert(addedEarly.notify === false, "рост состава не в позднем окне → 0 notify");

const fresh = decide({
  oldDateKey: "",
  existingBasket: [],
  priorBasket: [],
  newBasket: sameCanon
});
assert(fresh.notify === true, "новый поздний заказ без записи до правки → notify есть");

const less = decide({
  newBasket: [{ name: "УХО Г", sub: "МАЛ", val: 1 }]
});
assert(less.notify === false, "уменьшение состава → 0 notify");

const workerSrc = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
function extractWorkerFn(name) {
  const re = new RegExp("async function " + name + "\\s*\\(");
  const start = workerSrc.search(re);
  if (start < 0) throw new Error("missing worker " + name);
  let i = workerSrc.indexOf("{", start);
  let depth = 0;
  for (; i < workerSrc.length; i++) {
    if (workerSrc[i] === "{") depth++;
    else if (workerSrc[i] === "}") {
      depth--;
      if (depth === 0) return workerSrc.slice(start, i + 1);
    }
  }
  throw new Error("unclosed worker " + name);
}

function coerceDateIso_(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return m[3] + "-" + mm + "-" + dd;
}
function normalizeMatchKey_(s) {
  return String(s || "").trim().toLowerCase();
}
const workerFns = {};
eval(
  extractWorkerFn("attachPriorBasketForVolumeNotify_") +
    "\nworkerFns.attachPriorBasketForVolumeNotify_ = attachPriorBasketForVolumeNotify_;"
);

function fakeDb(rows) {
  const queries = [];
  return {
    queries: queries,
    DB: {
      prepare: function (sql) {
        const q = { sql: sql, args: [] };
        queries.push(q);
        return {
          bind: function () {
            q.args = Array.prototype.slice.call(arguments);
            return this;
          },
          first: async function () {
            const iso = q.args[0];
            const clientLow = q.args[2];
            const hit = rows.find(function (r) {
              if (String(r.client || "").toLowerCase() !== clientLow) return false;
              if (q.sql.indexOf("date_iso") >= 0) return r.date_iso === iso;
              return r.day_name === iso;
            });
            return hit || null;
          }
        };
      }
    }
  };
}

const oldBasketJson = JSON.stringify(base);
const db = fakeDb([
  { client: "zzz_test", date_iso: "2026-09-22", day_name: "Вторник", basket_json: oldBasketJson },
  { client: "zzz_test", date_iso: "2026-09-23", day_name: "Среда", basket_json: "[]" }
]);
const moved = {
  client: "zzz_test",
  editClient: "zzz_test",
  oldDate: "2026-09-22",
  date: "2026-09-23",
  address: "новый адрес",
  phone: "+37529",
  note: "позвонить"
};
await workerFns.attachPriorBasketForVolumeNotify_(moved, db);
assert(moved.priorBasket === oldBasketJson, "worker: смена даты берёт basket со старой date_iso");
assert(db.queries[0].args[0] === "2026-09-22", "worker: запрос не по новой дате");

const meta = {
  client: "zzz_test",
  editClient: "zzz_test",
  oldDate: "22.09.2026",
  date: "22.09.2026",
  address: "другой дом",
  phone: "111",
  note: "код"
};
const dbSame = fakeDb([
  { client: "zzz_test", date_iso: "2026-09-22", day_name: "Вторник", basket_json: oldBasketJson }
]);
await workerFns.attachPriorBasketForVolumeNotify_(meta, dbSame);
assert(meta.priorBasket === oldBasketJson, "worker: адрес/телефон/note читают прежний состав");

const freshOrder = { client: "zzz_test", date: "2026-09-23", basket: "[]" };
await workerFns.attachPriorBasketForVolumeNotify_(freshOrder, db);
assert(!freshOrder.priorBasket, "worker: новый заказ без edit не подставляет чужой basket");

if (process.exitCode) {
  console.error("cutter volume notify: FAILED");
  process.exit(process.exitCode);
}
console.log("cutter volume notify: ok");
