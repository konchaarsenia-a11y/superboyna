/**
 * «Подбейте даты»: ПП1 и ПП2, все этапы БП.
 * Слот «2/2» в Sheets часто лежит как дата 2 февраля — подпись всё равно ПП2.
 * Розница и АФК в список не входят. Пустой pack по-прежнему не шлёт Telegram.
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
function clientMatchKey_(s) { return String(s || "").trim().toUpperCase(); }
function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a), kb = clientMatchKey_(b);
  return !!(ka && kb && ka === kb);
}
function looksLikeBareMatchKey_() { return false; }
function displayClientNick_(s) { return String(s || "").trim(); }
`;

const names = [
  "nudgePpSlotTag_",
  "nudgeSegIsPp_",
  "normalizeBpStage_",
  "crmIndexHit_",
  "classifyDeliveredClientForNudge_",
  "buildDeliveryDatesNudgeText_",
  "deliveryDatesNudgeIsEmpty_",
  "parseFlexibleDate_",
  "mergePpCycleJsonMaps_",
  "collectPpCycleNudgeHits_",
  "absorbNudgeDeliveryRows_",
  "splitNudgeTelegramText_"
];
const api = new Function(
  prelude +
    names.map(sliceFn).join("\n") +
    "\nreturn { nudgePpSlotTag_, nudgeSegIsPp_, normalizeBpStage_, classifyDeliveredClientForNudge_, buildDeliveryDatesNudgeText_, deliveryDatesNudgeIsEmpty_, parseFlexibleDate_, mergePpCycleJsonMaps_, collectPpCycleNudgeHits_, absorbNudgeDeliveryRows_, splitNudgeTelegramText_ };"
)();

const tag = api.nudgePpSlotTag_;
assert(tag("2/2") === "ПП2", "fraction 2/2 is ПП2");
assert(tag("1/2") === "ПП1", "fraction 1/2 is ПП1");
assert(tag("2") === "ПП2", "bare 2 is ПП2");
assert(tag("1") === "ПП1", "bare 1 is ПП1");
assert(tag("ПП2") === "ПП2", "word ПП2 stays ПП2");
assert(tag("ПП 1") === "ПП1", "word ПП 1 is ПП1");
assert(
  tag("Mon Feb 02 2026 00:00:00 GMT+0300 (Moscow Standard Time)") === "ПП2",
  "Sheets date of 2/2 (Feb 02) is ПП2"
);
assert(
  tag("Sun Feb 01 2026 00:00:00 GMT+0300 (Moscow Standard Time)") === "ПП1",
  "Sheets date of 1/2 (Feb 01) is ПП1"
);
assert(tag(new Date("2026-02-02T00:00:00+03:00")) === "ПП2", "Date 2 Feb Minsk is ПП2");
assert(tag(new Date("2026-02-01T00:00:00+03:00")) === "ПП1", "Date 1 Feb Minsk is ПП1");
assert(tag(new Date("2026-10-02T12:00:00+03:00")) === "", "a real October date is not a slot");
assert(tag("") === "", "empty slot stays empty");

assert(api.nudgeSegIsPp_("ПП2") === true, "segment ПП2 is PP");
assert(api.nudgeSegIsPp_("ПП1") === true, "segment ПП1 is PP");
assert(api.nudgeSegIsPp_("ПП") === true, "segment ПП is PP");
assert(api.nudgeSegIsPp_("PP") === true, "segment PP is PP");
assert(api.nudgeSegIsPp_("БП") === false, "segment БП is not PP");
assert(api.nudgeSegIsPp_("Р") === false, "retail segment is not PP");

function cls(row, index) {
  return api.classifyDeliveredClientForNudge_(null, row, null, index || null);
}

const pp2seg = cls({ name: "Viihrova", segment: "ПП2", ppSlot: "" });
assert(pp2seg.kind === "pp", "segment ПП2 classifies as pp even without CRM");
assert(pp2seg.ppSlot === "ПП2", "segment ПП2 fills the slot tag");

const pp2frac = cls({ name: "snowygodness", segment: "ПП", ppSlot: "2/2" });
assert(pp2frac.kind === "pp" && pp2frac.ppSlot === "ПП2", "calendar 2/2 stays pp and shows ПП2");

const pp2date = cls({
  name: "_madmazelka_",
  segment: "ПП",
  ppSlot: "Mon Feb 02 2026 00:00:00 GMT+0300 (Moscow Standard Time)"
});
assert(pp2date.kind === "pp" && pp2date.ppSlot === "ПП2", "Feb 02 cell is still a PP2 client");

const pp1 = cls({ name: "Alinagidayathanova", segment: "ПП", ppSlot: "1/2" });
assert(pp1.kind === "pp" && pp1.ppSlot === "ПП1", "1/2 shows ПП1");

const idx = {
  pp: { VIIHROVA: "Viihrova" },
  afk: { PAUSEDOG: "Pause Dog" },
  bp1: { WEEK: "Неделя" },
  retail: { SHOP: "Лавка" }
};
assert(cls({ name: "Аня", segment: "" }, idx).kind === "", "БП2 is not in the БП1 index, so it is dropped");
assert(cls({ name: "Боря", segment: "" }, idx).kind === "", "ФИНАЛ is not in the БП1 index, so it is dropped");
assert(cls({ name: "Неделя", segment: "БП" }, idx).kind === "bp1", "БП1 from the index is included");
assert(cls({ name: "Неделя", segment: "БП" }, idx).stage === "БП1", "included BP stage stays БП1");
assert(cls({ name: "Лавка", segment: "Р" }, idx).kind === "retail", "retail stays retail");
assert(cls({ name: "Pause Dog", segment: "" }, idx).kind === "", "АФК is not a nudge kind");
assert(cls({ name: "Viihrova", segment: "ПП2" }, idx).kind === "pp", "CRM PP hit wins for ПП2");

const bpOnly = cls({ name: "Финал без индекса", segment: "БП", stage: "" });
assert(bpOnly.kind === "bp1" && bpOnly.stage === "БП1", "segment БП without a known later stage stays БП1");

const text = api.buildDeliveryDatesNudgeText_({
  dateText: "02.10.2026",
  total: 4,
  pp: [
    { name: "Viihrova", ppSlot: "ПП2" },
    { name: "Alinagidayathanova", ppSlot: "1/2" }
  ],
  bp1: [{ name: "Неделя", stage: "БП1" }]
}, "11");
assert(text.indexOf("ПП и БП1:") > 0, "header says ПП и БП1");
assert(text.indexOf("• Viihrova — ПП2") > 0, "PP2 name keeps the slot");
assert(text.indexOf("• Alinagidayathanova — ПП1") > 0, "PP1 name keeps the slot");
assert(text.indexOf("БП1 (1):") > 0, "section title is БП1");
assert(text.indexOf("\nБП (") < 0, "section is not titled plain БП");
assert(text.indexOf("• Неделя") > 0, "БП1 name is listed");
assert(text.indexOf("Аня") < 0 && text.indexOf("ФИНАЛ") < 0, "later BP stages are not in the text");
assert(text.indexOf("⏰ 11:00 Минск") > 0, "footer has no middle dot");
assert(text.indexOf("·") < 0, "nudge text has no middle dots");
assert(text.indexOf("В АФК") > 0, "AFK hint stays for PP");
assert(text.indexOf("Лавка") < 0 && text.indexOf("Pause") < 0, "retail and AFK are not in the text");

assert(api.deliveryDatesNudgeIsEmpty_({ pp: [], bp1: [{ name: "Неделя" }] }) === false, "БП1-only pack is not empty");
assert(api.deliveryDatesNudgeIsEmpty_({ pp: [{ name: "Viihrova", ppSlot: "ПП2" }], bp1: [] }) === false, "PP2-only pack is not empty");
assert(api.deliveryDatesNudgeIsEmpty_({ pp: [], bp1: [] }) === true, "old empty bp1 pack is still empty");
assert(api.deliveryDatesNudgeIsEmpty_(null) === true, "null pack is empty");

const indexSrc = sliceFn("loadCrmNudgeIndex_");
assert(indexSrc.indexOf('if (stage0 === "БП1")') > 0, "CRM index keeps only БП1");
assert(indexSrc.indexOf("idx.bpStage") < 0, "CRM index does not store later BP stages");

const listSrc = sliceFn("listYesterdayDeliveredForNudge_");
assert(listSrc.indexOf("collectPpCycleNudgeHits_") > 0, "PP cycle slot2 is read for yesterday");
assert(listSrc.indexOf("fetchD1DeliveredForNudge_") > 0, "nudge unions D1 delivered rows");
assert(sliceFn("collectPpCycleNudgeHits_").indexOf('tag = "ПП2"') > 0, "cycle slot2 tag is ПП2");
assert(listSrc.indexOf("ppSlotRaw") > 0, "nudge reads the raw slot cell before it is wiped");
assert(listSrc.indexOf('meta.kind === "retail"') > 0, "retail is still skipped");

const sendSrc = sliceFn("sendDeliveryDatesNudge_");
assert(sendSrc.indexOf("storePpAfkToken_") > 0, "В АФК buttons still built for PP");
assert(sendSrc.indexOf('text: "⏸ В АФК — "') > 0, "AFK button uses an em dash");
assert(sendSrc.indexOf("В АФК ·") < 0, "AFK button has no middle dot");
assert(sendSrc.indexOf('callback_data: ("ppafk:" + tok)') > 0, "AFK callback_data unchanged");
assert(sendSrc.indexOf("deliveryDatesNudgeIsEmpty_") > 0, "empty pack still skips Telegram");
assert(sendSrc.indexOf('telegram: false') > 0, "empty skip still flags telegram false");
assert(sendSrc.indexOf("splitNudgeTelegramText_") > 0, "long nudge text is split, not sliced away");

const textSrc = sliceFn("buildDeliveryDatesNudgeText_");
assert(textSrc.indexOf("ПП и БП1:") > 0, "text builder header is ПП и БП1");
assert(textSrc.indexOf('lines.push("БП1 ("') > 0, "text builder section is БП1");

const parsedCycle = api.parseFlexibleDate_("PP_CYCLE:2026-10");
assert(parsedCycle == null, "PP_CYCLE:2026-10 is not a date");
const parsedPaid = api.parseFlexibleDate_("WEEK_PAID:05.10.2026");
assert(parsedPaid == null, "WEEK_PAID:05.10.2026 is not a date");
const oct5 = api.parseFlexibleDate_("05.10.2026");
assert(oct5 instanceof Date && oct5.getFullYear() === 2026 && oct5.getMonth() === 9 && oct5.getDate() === 5, "05.10.2026 stays 5 October");
const iso = api.parseFlexibleDate_("2026-10-05");
assert(iso instanceof Date && iso.getMonth() === 9 && iso.getDate() === 5, "ISO 2026-10-05 stays 5 October");

const merged = api.mergePpCycleJsonMaps_([
  { ANDREI: { paid: "yes", slot1: { date: "05.10.2026", client: "Andreiprigunov" }, slot2: null } },
  { SNOWY: { paid: null, deliveriesN: 2, slot1: { date: "01.10.2026" }, slot2: { date: "05.10.2026", client: "snowygodness" } } }
]);
const hits = api.collectPpCycleNudgeHits_(merged, "05.10.2026", "2026-10-05");
const hitNames = hits.map((h) => h.name + ":" + h.tag).sort();
assert(hitNames.indexOf("ANDREI:ПП1") >= 0, "first cycle fragment still yields PP1");
assert(hitNames.indexOf("snowygodness:ПП2") >= 0, "second cycle fragment PP2 without paid is included");

const absorbed = [];
const slots = {};
api.absorbNudgeDeliveryRows_(
  [
    { client: "snowygodness", matchKey: "SNOWYGODNESS", segment: "ПП", ppSlot: "2/2", delivered: 1, paid: null },
    { client: "Andreiprigunov", matchKey: "ANDREIPRIGUNOV", segment: "ПП", ppSlot: "1", delivered: true, mail: "euro", track: "BY123" },
    { client: "Indixvost", matchKey: "INDIXVOST", segment: "ПП", ppSlot: "1", delivered: 0 },
    { client: "Почта без флага", matchKey: "MAILONLY", segment: "ПП", ppSlot: "2", delivered: 0, track: "EP999" }
  ],
  (name) => absorbed.push(name),
  (name, tag) => { slots[name] = tag; }
);
assert(absorbed.indexOf("snowygodness") >= 0, "D1 PP2 without payment is absorbed");
assert(absorbed.indexOf("Andreiprigunov") >= 0, "D1 mail delivery with track is absorbed");
assert(absorbed.indexOf("Почта без флага") >= 0, "track alone still counts as a delivery");
assert(absorbed.indexOf("Indixvost") < 0, "delivered 0 without a track is not absorbed");
assert(slots.snowygodness === "2/2", "D1 row keeps the PP2 slot");

const longNames = [];
for (let i = 0; i < 120; i++) {
  longNames.push("• Клиент_с_очень_длинным_ником_для_рассылки_" + String(i).padStart(3, "0") + " — ПП2");
}
const longText = ["📅 Подбейте даты доставок", ""].concat(longNames).concat(["", "⏰ 11:00 Минск"]).join("\n");
assert(longText.length > 3500, "fixture is longer than the Telegram slice");
const chunks = api.splitNudgeTelegramText_(longText, 3500);
assert(chunks.length > 1, "long nudge becomes several messages");
assert(chunks.every((c) => c.length <= 3500), "each chunk fits the send slice");
const joined = chunks.join("\n");
assert(longNames.every((line) => joined.indexOf(line) >= 0), "no client line is dropped when the text is split");

const workerSrc = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");
function sliceWorker(name) {
  const start = workerSrc.indexOf("function " + name);
  if (start < 0) throw new Error("missing worker " + name);
  let i = workerSrc.indexOf("{", start);
  let depth = 0;
  for (; i < workerSrc.length; i++) {
    const ch = workerSrc[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return workerSrc.slice(start, i + 1);
    }
  }
  throw new Error("unclosed worker " + name);
}
const shape = new Function(
  sliceWorker("parseMeta_") + "\n" + sliceWorker("shapeNudgeDeliveredRows_") + "\nreturn shapeNudgeDeliveredRows_;"
)();
const shaped = shape(
  [{ match_key: "SNOWYGODNESS", delivered: 1 }],
  [
    {
      client: "snowygodness",
      match_key: "SNOWYGODNESS",
      segment: "ПП",
      status: "active",
      note: "",
      meta_json: JSON.stringify({ ppSlot: "2/2", paid: null })
    },
    {
      client: "Andreiprigunov",
      match_key: "ANDREIPRIGUNOV",
      segment: "ПП",
      status: "active",
      note: "[ЕВРОПОЧТА] [ОТДЕЛЕНИЕ:564]",
      meta_json: JSON.stringify({ mailTrack: "BY123", mailMethod: "euro", ppSlot: "1" })
    },
    {
      client: "Старая строка",
      match_key: "ANDREIPRIGUNOV",
      segment: "",
      status: "deleted",
      note: "",
      meta_json: "{}"
    }
  ]
);
const shapedNames = shaped.map((r) => r.client).sort();
assert(shapedNames.indexOf("snowygodness") >= 0, "D1 flag keeps unpaid PP2");
assert(shaped.find((r) => r.client === "snowygodness").ppSlot === "2/2", "D1 PP2 slot comes from order meta");
assert(shaped.find((r) => r.matchKey === "ANDREIPRIGUNOV").client === "Andreiprigunov", "active order wins over a deleted duplicate");
assert(shaped.find((r) => r.matchKey === "ANDREIPRIGUNOV").mail === "euro", "euro post tag is kept");
assert(shaped.find((r) => r.matchKey === "ANDREIPRIGUNOV").fromTrack === true, "mail track is a delivery even beside the flag");
assert(workerSrc.indexOf('a === "nudgeDeliveredDay"') > 0, "worker exposes nudgeDeliveredDay behind the GAS secret");

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall ok");
