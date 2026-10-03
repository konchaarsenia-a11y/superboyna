import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../boinya-c/next/week-logic.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox, { filename: "week-logic.js" });
const L = sandbox.module.exports;

function store() {
  return {
    overview: {
      "2026-10": {
        status: "success",
        month: "2026-10",
        days: [{ dateIso: "2026-10-03", count: 1, segments: { "ПП": 1 } }]
      }
    },
    people: {
      "2026-10": {
        status: "success",
        month: "2026-10",
        source: "d1",
        total: 1,
        byDate: {
          "2026-10-03": [{ name: "Мира", matchKey: "MIRA", segment: "ПП" }]
        }
      }
    },
    pending: []
  };
}

function day(st, iso) {
  return L.countFromMonth(st.overview[iso.slice(0, 7)], iso);
}

test("save вставляет человека в месяц сразу и не двоит повтор", () => {
  const st = store();
  const change = {
    op: "save",
    date: "2026-10-03",
    client: { name: "zzz_test", matchKey: "zzz_test", orderType: "pp" }
  };
  const first = L.applyMonthChange(st, change);
  st.pending.push(first.pending);
  assert.equal(day(st, "2026-10-03"), 2);
  assert.equal(st.people["2026-10"].byDate["2026-10-03"].length, 2);
  assert.equal(st.overview["2026-10"].days[0].segments["ПП"], 2);
  assert.equal(first.pending.op, "save");
  const again = L.applyMonthChange(st, Object.assign({ known: true }, change));
  assert.equal(again.pending.op, "save");
  assert.equal(day(st, "2026-10-03"), 2);
  assert.equal(st.people["2026-10"].byDate["2026-10-03"].length, 2);
});

test("перенос снимает старый день и красит новый", () => {
  const st = store();
  const res = L.applyMonthChange(st, {
    op: "move",
    date: "2026-10-04",
    oldDate: "03.10.2026",
    client: { name: "Мира", matchKey: "MIRA", segment: "ПП" }
  });
  assert.equal(day(st, "2026-10-03"), 0);
  assert.equal(day(st, "2026-10-04"), 1);
  assert.equal(st.overview["2026-10"].days[0].segments["ПП"], 1);
  assert.equal(res.pending.op, "move");
  assert.deepEqual(Object.keys(st.people["2026-10"].byDate), ["2026-10-04"]);
});

test("удаление убирает человека и бейдж", () => {
  const st = store();
  L.applyMonthChange(st, { op: "remove", date: "2026-10-03", client: { name: "Мира", matchKey: "MIRA", segment: "ПП" } });
  assert.equal(day(st, "2026-10-03"), 0);
  assert.equal(st.people["2026-10"].byDate["2026-10-03"], undefined);
});

test("устаревший ответ месяца не затирает свежую запись", () => {
  const st = store();
  const applied = L.applyMonthChange(st, {
    op: "save",
    date: "2026-10-03",
    client: { name: "zzz_test", matchKey: "zzz_test", orderType: "pp" }
  });
  const stalePeople = {
    status: "success",
    month: "2026-10",
    source: "d1",
    total: 1,
    byDate: { "2026-10-03": [{ name: "Мира", matchKey: "MIRA", segment: "ПП" }] }
  };
  const merged = L.mergePeoplePack(stalePeople, [applied.pending]);
  const names = merged.pack.byDate["2026-10-03"].map((c) => c.name);
  assert.ok(names.includes("zzz_test"));
  assert.equal(merged.pending.length, 1);
  const ov = L.mergeOverview(
    st.overview["2026-10"],
    { status: "success", month: "2026-10", days: [{ dateIso: "2026-10-03", count: 1, segments: { "ПП": 1 } }] },
    [applied.pending],
    "2026-10"
  );
  assert.equal(L.countFromMonth(ov, "2026-10-03"), 2);
  const counted = L.countsFromPeople(ov, merged.pack);
  assert.equal(L.countFromMonth(counted, "2026-10-03"), 2);
});

test("сервер уже видит запись, локальная заплатка снимается", () => {
  const fresh = {
    status: "success",
    month: "2026-10",
    source: "d1",
    total: 2,
    byDate: {
      "2026-10-03": [
        { name: "Мира", matchKey: "MIRA", segment: "ПП" },
        { name: "zzz_test", matchKey: "zzz_test", segment: "ПП" }
      ]
    }
  };
  const pending = { op: "save", date: "2026-10-03", client: { name: "zzz_test", matchKey: "zzz_test", segment: "ПП" } };
  const merged = L.mergePeoplePack(fresh, [pending]);
  assert.equal(merged.pending.length, 0);
  assert.equal(merged.pack.byDate["2026-10-03"].length, 2);
});
