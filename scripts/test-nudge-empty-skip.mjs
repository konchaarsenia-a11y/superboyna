/**
 * «Подбейте даты»: пустой pack (нет ПП и нет БП1) не уходит в Telegram.
 * Слот DATE_NUDGE_* всё равно помечается. Состав списка, когда клиенты есть, не меняется.
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

const isEmptySrc = sliceFn("deliveryDatesNudgeIsEmpty_");
const deliveryDatesNudgeIsEmpty_ = new Function(
  "pack",
  isEmptySrc.replace(/^function deliveryDatesNudgeIsEmpty_\(pack\)\s*\{/, "").replace(/\}\s*$/, "")
);

assert(deliveryDatesNudgeIsEmpty_(null) === true, "null pack is empty");
assert(deliveryDatesNudgeIsEmpty_({ pp: [], bp1: [], total: 0 }) === true, "no pp and no bp1");
assert(deliveryDatesNudgeIsEmpty_({ total: 0 }) === true, "missing arrays");
assert(
  deliveryDatesNudgeIsEmpty_({ pp: [], bp1: [], total: 0, retailIgnored: [{ name: "Розница" }] }) === true,
  "retail-only day is still empty (retail is not a nudge row)"
);

const withPp = { pp: [{ name: "Veta.foto Дэни", ppSlot: "1" }], bp1: [], total: 1 };
const withBp = { pp: [], bp1: [{ name: "Евгения kinolog.vica" }], total: 1 };
const withBoth = {
  pp: [{ name: "A" }],
  bp1: [{ name: "B" }, { name: "C" }],
  total: 3
};
assert(deliveryDatesNudgeIsEmpty_(withPp) === false, "pp client is not empty");
assert(deliveryDatesNudgeIsEmpty_(withBp) === false, "bp1 client is not empty");
assert(deliveryDatesNudgeIsEmpty_(withBoth) === false, "mixed pack is not empty");
assert(
  deliveryDatesNudgeIsEmpty_({ pp: [{ name: "" }], bp1: [], total: 1 }) === false,
  "a row with a blank name still counts as a client record"
);

function simulateSend(pack, hooks) {
  if (deliveryDatesNudgeIsEmpty_(pack)) {
    return {
      skipped: "empty",
      reason: "no clients",
      recipients: 0,
      telegram: false
    };
  }
  hooks.staff += 1;
  hooks.chat += 1;
  return { skipped: false, pp: pack.pp.length, bp1: pack.bp1.length, telegram: true };
}

function simulateTick(pack, props, ymd, slot, hour) {
  if (hour !== 11 && hour !== 19) return { skipped: true, reason: "not_slot", marked: false };
  const key = "DATE_NUDGE_" + ymd + "_" + slot;
  if (props[key] === "1") return { skipped: true, reason: "already", marked: true };
  const hooks = { staff: 0, chat: 0 };
  const sent = simulateSend(pack, hooks);
  props[key] = "1";
  return { sent: sent, hooks: hooks, marked: props[key] === "1", key: key };
}

const props = {};
const emptyTick = simulateTick({ pp: [], bp1: [], total: 0 }, props, "2026-09-22", "11", 11);
assert(emptyTick.sent.skipped === "empty", "empty tick skipped: empty");
assert(emptyTick.sent.reason === "no clients", "empty tick reason: no clients");
assert(emptyTick.sent.telegram === false, "empty tick does not send telegram");
assert(emptyTick.hooks.staff === 0 && emptyTick.hooks.chat === 0, "empty tick hits neither staff nor chat");
assert(emptyTick.marked === true, "empty tick still marks DATE_NUDGE slot");
assert(props["DATE_NUDGE_2026-09-22_11"] === "1", "marker key is DATE_NUDGE_ymd_slot");

const again = simulateTick({ pp: [], bp1: [], total: 0 }, props, "2026-09-22", "11", 11);
assert(again.reason === "already", "marked empty slot is not repeated");

const props2 = {};
const live = simulateTick(withBoth, props2, "2026-09-22", "19", 19);
assert(live.sent.telegram === true, "non-empty pack still sends");
assert(live.sent.pp === 1 && live.sent.bp1 === 2, "pp and bp1 counts stay intact");
assert(live.hooks.staff === 1 && live.hooks.chat === 1, "staff and TELEGRAM_CHAT_ID both get the non-empty nudge");
assert(props2["DATE_NUDGE_2026-09-22_19"] === "1", "non-empty slot is marked too");

const off = simulateTick({ pp: [], bp1: [] }, {}, "2026-09-22", "11", 12);
assert(off.reason === "not_slot" && off.marked === false, "outside 11/19 does not mark or send");

const sendSrc = sliceFn("sendDeliveryDatesNudge_");
const emptyAt = sendSrc.indexOf("deliveryDatesNudgeIsEmpty_");
const staffAt = sendSrc.indexOf("collectStaffTelegramIds_");
const chatAt = sendSrc.indexOf("TELEGRAM_CHAT_ID");
const textAt = sendSrc.indexOf("telegramSendText_");
const markupAt = sendSrc.indexOf("telegramSendMarkup_");
assert(emptyAt > 0 && staffAt > emptyAt && chatAt > emptyAt, "empty guard is before staff and chat sends");
assert(textAt > emptyAt && markupAt > emptyAt, "telegram helpers run only after the empty guard");
assert(sendSrc.indexOf('skipped: "empty"') > 0, "send returns skipped: empty");
assert(sendSrc.indexOf('reason: "no clients"') > 0, "send returns reason: no clients");
assert(sendSrc.indexOf("telegram: false") > 0, "send flags telegram: false on skip");

const tickSrc = sliceFn("tickDeliveryDatesNudge_");
const sendCall = tickSrc.indexOf("sendDeliveryDatesNudge_(slot)");
const markAt = tickSrc.indexOf('props.setProperty(key, "1")');
const skipBranch = tickSrc.indexOf("if (sent && sent.skipped)");
assert(sendCall > 0 && markAt > sendCall, "slot is marked after send returns");
assert(skipBranch > markAt, "skipped return does not skip the DATE_NUDGE mark");
assert(tickSrc.indexOf('reason: "already"') > 0, "already-marked slot still short-circuits");

const httpSrc = sliceFn("handleTestDeliveryDatesNudge");
assert(httpSrc.indexOf('skipped: empty ? "empty" : false') > 0, "dry endpoint sets skipped empty");
assert(httpSrc.indexOf('reason: empty ? "no clients" : ""') > 0, "dry endpoint sets reason no clients");
assert(
  httpSrc.indexOf("skipped: (sent && sent.skipped) ? sent.skipped : false") > 0,
  "live test endpoint echoes skipped"
);
assert(httpSrc.indexOf("listYesterdayDeliveredForNudge_") > 0, "dry still builds the real pack");

const listSrc = sliceFn("listYesterdayDeliveredForNudge_");
assert(listSrc.indexOf('meta.kind === "pp"') > 0, "pp inclusion unchanged");
assert(listSrc.indexOf('meta.kind === "bp1"') > 0, "bp1 inclusion unchanged");
assert(listSrc.indexOf('meta.kind === "retail"') > 0, "retail still excluded from the nudge list");

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall ok");
