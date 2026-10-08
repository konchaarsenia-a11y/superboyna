/**
 * Снятие slot2 только у katya.dehtyarenko: одна запись, slot1 и чужие ключи на месте.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "Code.gs"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL", msg);
  } else {
    console.log("OK  ", msg);
  }
}

function sliceFn(name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const prelude = `
function clientMatchKey_(s) {
  return String(s || "").toUpperCase().replace(/Ё/g, "Е").replace(/[._\\s@]/g, "");
}
function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a);
  var kb = clientMatchKey_(b);
  return !!(ka && kb && ka === kb);
}
`;

const api = {};
new Function("api", prelude + [
  "katyaSlot2Decide_",
  "katyaSlot2Live_",
  "katyaSlot2Match_",
  "katyaSlot2ApplyStore_"
].map(sliceFn).join("\n") + "\nObject.assign(api, { katyaSlot2Decide_, katyaSlot2Live_, katyaSlot2Match_, katyaSlot2ApplyStore_ });")(api);

const one = api.katyaSlot2Decide_([
  { monthKey: "PP_CYCLE:2026-10", slot2Date: "07.10.2026", row: 4 }
]);
assert(one.ok === true && one.logical === 1 && one.rows === 1, "one row is one record");

const split = api.katyaSlot2Decide_([
  { monthKey: "PP_CYCLE:2026-10", slot2Date: "07.10.2026", row: 4 },
  { monthKey: "PP_CYCLE:2026-10", slot2Date: "07.10.2026", row: 9 }
]);
assert(split.ok === true && split.logical === 1 && split.rows === 2, "same month and date stay one record");

const twoMonths = api.katyaSlot2Decide_([
  { monthKey: "PP_CYCLE:2026-09", slot2Date: "07.09.2026", row: 1 },
  { monthKey: "PP_CYCLE:2026-10", slot2Date: "07.10.2026", row: 2 }
]);
assert(twoMonths.ok === false && twoMonths.reason === "not_one", "two months are not applied");

const none = api.katyaSlot2Decide_([]);
assert(none.ok === false && none.reason === "none", "empty scan is not an apply");

const store = {
  KATYADEHTYARENKO: {
    deliveriesN: 1,
    paid: "yes",
    client: "katya.dehtyarenko",
    slot1: { date: "05.10.2026", day: "Понедельник", basket: [{ name: "секрет" }] },
    slot2: { date: "07.10.2026", day: "Среда", basket: [{ name: "секрет2" }], client: "katya.dehtyarenko" }
  },
  OTHER: {
    slot1: { date: "01.10.2026" },
    slot2: { date: "08.10.2026", client: "polotno_an" }
  }
};
const applied = api.katyaSlot2ApplyStore_(store);
assert(applied.nulled === 1 && applied.slot1Same === true, "only katya slot2 is cleared");
assert(applied.store.KATYADEHTYARENKO.slot2 === null, "katya slot2 is null");
assert(applied.store.KATYADEHTYARENKO.slot1.date === "05.10.2026", "katya slot1 date stays");
assert(applied.store.KATYADEHTYARENKO.slot1.basket[0].name === "секрет", "katya slot1 basket stays");
assert(applied.store.KATYADEHTYARENKO.paid === "yes", "paid stays");
assert(applied.store.OTHER.slot2.date === "08.10.2026", "other client slot2 stays");
assert(store.KATYADEHTYARENKO.slot2.date === "07.10.2026", "input store is not mutated");

const handler = sliceFn("handleClearKatyaPpSlot2");
assert(handler.indexOf('confirm !== "katya-slot2-only"') > 0, "apply needs the confirm");
assert(handler.indexOf("sendMessage") < 0, "handler does not send Telegram");
assert(handler.indexOf("katyaSlot2ApplyStore_") > 0, "apply goes through the one-field clear");
assert(src.indexOf('action === "clearKatyaPpSlot2"') > 0, "action is wired");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("test-katya-slot2: OK");
