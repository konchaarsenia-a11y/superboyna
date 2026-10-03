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
  "deliveryDatesNudgeIsEmpty_"
];
const api = new Function(
  prelude +
    names.map(sliceFn).join("\n") +
    "\nreturn { nudgePpSlotTag_, nudgeSegIsPp_, normalizeBpStage_, classifyDeliveredClientForNudge_, buildDeliveryDatesNudgeText_, deliveryDatesNudgeIsEmpty_ };"
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
assert(listSrc.indexOf('tagC = "ПП2"') > 0, "PP cycle slot2 is read for yesterday");
assert(listSrc.indexOf("ppSlotRaw") > 0, "nudge reads the raw slot cell before it is wiped");
assert(listSrc.indexOf('meta.kind === "retail"') > 0, "retail is still skipped");

const sendSrc = sliceFn("sendDeliveryDatesNudge_");
assert(sendSrc.indexOf("storePpAfkToken_") > 0, "В АФК buttons still built for PP");
assert(sendSrc.indexOf('text: "⏸ В АФК — "') > 0, "AFK button uses an em dash");
assert(sendSrc.indexOf("В АФК ·") < 0, "AFK button has no middle dot");
assert(sendSrc.indexOf('callback_data: ("ppafk:" + tok)') > 0, "AFK callback_data unchanged");
assert(sendSrc.indexOf("deliveryDatesNudgeIsEmpty_") > 0, "empty pack still skips Telegram");
assert(sendSrc.indexOf('telegram: false') > 0, "empty skip still flags telegram false");

const textSrc = sliceFn("buildDeliveryDatesNudgeText_");
assert(textSrc.indexOf("ПП и БП1:") > 0, "text builder header is ПП и БП1");
assert(textSrc.indexOf('lines.push("БП1 ("') > 0, "text builder section is БП1");

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall ok");
