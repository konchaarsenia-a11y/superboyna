#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Contract: getStats / expected fee echo matches the scheme in use.
 * RAW26 → recover 3.90 + delivery 9; LEGACY → light 11 + delivery 6.
 * MIXED / empty → omit ppLightFeeEach / ppDeliveryFeeEach, send both in ppFeeByScheme.
 * No new math — labels/echo only.
 */
const PP_RAW26_RECOVER_100_ = 3.90;
const PP_RAW26_DELIVERY_PER_ = 9;
const PP_LEGACY_FIXED_ = 11;
const PP_LEGACY_DELIVERY_PER_ = 6;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function statsPpFeeEchoFromMonth_(month) {
  const countsIn = (month && month.ppSchemeCounts) || {};
  const rawN = Number(countsIn.RAW26) || 0;
  const legN = Number(countsIn.LEGACY) || 0;
  let scheme = String((month && month.ppScheme) || "").toUpperCase();
  if (rawN && legN) scheme = "MIXED";
  else if (rawN) scheme = "RAW26";
  else if (legN) scheme = "LEGACY";
  else if (scheme !== "RAW26" && scheme !== "LEGACY" && scheme !== "MIXED") scheme = "";
  const echo = {
    ppScheme: scheme,
    ppSchemeCounts: { RAW26: rawN, LEGACY: legN },
    ppFeeByScheme: {
      LEGACY: { lightEach: PP_LEGACY_FIXED_, deliveryEach: PP_LEGACY_DELIVERY_PER_ },
      RAW26: { recoverEach: PP_RAW26_RECOVER_100_, deliveryEach: PP_RAW26_DELIVERY_PER_ }
    }
  };
  if (scheme === "RAW26") {
    echo.ppLightFeeEach = PP_RAW26_RECOVER_100_;
    echo.ppDeliveryFeeEach = PP_RAW26_DELIVERY_PER_;
  } else if (scheme === "LEGACY") {
    echo.ppLightFeeEach = PP_LEGACY_FIXED_;
    echo.ppDeliveryFeeEach = PP_LEGACY_DELIVERY_PER_;
  }
  return echo;
}

function applyStatsPpFeeEcho_(target, month) {
  const echo = statsPpFeeEchoFromMonth_(month);
  if (!target) return echo;
  target.ppScheme = echo.ppScheme;
  target.ppSchemeCounts = echo.ppSchemeCounts;
  target.ppFeeByScheme = echo.ppFeeByScheme;
  if (echo.ppLightFeeEach != null) target.ppLightFeeEach = echo.ppLightFeeEach;
  else delete target.ppLightFeeEach;
  if (echo.ppDeliveryFeeEach != null) target.ppDeliveryFeeEach = echo.ppDeliveryFeeEach;
  else delete target.ppDeliveryFeeEach;
  return echo;
}

function statsPpSchemeOf_(src) {
  const sch = String((src && src.ppScheme) || "").toUpperCase();
  if (sch === "RAW26" || sch === "LEGACY" || sch === "MIXED") return sch;
  return "";
}

function statsPpDeliveryLabel_(src) {
  const sch = statsPpSchemeOf_(src);
  if (sch === "RAW26") return "Топливо доставок ПП (4×N, тариф 9 RAW26)";
  if (sch === "LEGACY") return "Топливо доставок ПП (4×N, тариф 6 LEGACY)";
  return "Топливо доставок ПП (4×N)";
}

const raw = statsPpFeeEchoFromMonth_({ ppSchemeCounts: { RAW26: 4, LEGACY: 0 } });
assert(raw.ppScheme === "RAW26", "RAW26 scheme");
assert(raw.ppLightFeeEach === 3.90, "RAW26 light/recover echo 3.90, got " + raw.ppLightFeeEach);
assert(raw.ppDeliveryFeeEach === 9, "RAW26 delivery 9");
assert(raw.ppFeeByScheme.RAW26.recoverEach === 3.90, "RAW26 recover in both-scheme map");
assert(raw.ppFeeByScheme.LEGACY.lightEach === 11, "LEGACY rates still listed");

const leg = statsPpFeeEchoFromMonth_({ ppSchemeCounts: { RAW26: 0, LEGACY: 3 } });
assert(leg.ppScheme === "LEGACY", "LEGACY scheme");
assert(leg.ppLightFeeEach === 11, "LEGACY light 11");
assert(leg.ppDeliveryFeeEach === 6, "LEGACY delivery 6");

const mixed = statsPpFeeEchoFromMonth_({ ppSchemeCounts: { RAW26: 2, LEGACY: 1 } });
assert(mixed.ppScheme === "MIXED", "MIXED scheme");
assert(mixed.ppLightFeeEach === undefined, "MIXED omits ppLightFeeEach");
assert(mixed.ppDeliveryFeeEach === undefined, "MIXED omits ppDeliveryFeeEach");
assert(mixed.ppFeeByScheme.RAW26.deliveryEach === 9, "MIXED still sends RAW26 9");
assert(mixed.ppFeeByScheme.LEGACY.deliveryEach === 6, "MIXED still sends LEGACY 6");

const empty = statsPpFeeEchoFromMonth_({ ppSchemeCounts: { RAW26: 0, LEGACY: 0 } });
assert(empty.ppScheme === "", "empty scheme");
assert(empty.ppLightFeeEach === undefined, "empty omits 11+6");
assert(empty.ppDeliveryFeeEach === undefined, "empty omits delivery each");

const staleFact = { ppLightFeeEach: 11, ppDeliveryFeeEach: 6 };
applyStatsPpFeeEcho_(staleFact, { ppSchemeCounts: { RAW26: 2, LEGACY: 1 } });
assert(staleFact.ppScheme === "MIXED", "apply MIXED scheme");
assert(!("ppLightFeeEach" in staleFact), "MIXED deletes leftover ppLightFeeEach=11");
assert(!("ppDeliveryFeeEach" in staleFact), "MIXED deletes leftover ppDeliveryFeeEach=6");
const freshFact = {};
applyStatsPpFeeEcho_(freshFact, { ppSchemeCounts: { RAW26: 2, LEGACY: 1 } });
assert(!("ppLightFeeEach" in freshFact), "fresh MIXED payload has no ppLightFeeEach");
assert(!("ppDeliveryFeeEach" in freshFact), "fresh MIXED payload has no ppDeliveryFeeEach");

const rawPayload = {};
applyStatsPpFeeEcho_(rawPayload, { ppScheme: "RAW26", ppSchemeCounts: { RAW26: 1, LEGACY: 0 } });
assert(rawPayload.ppLightFeeEach === 3.90 && rawPayload.ppDeliveryFeeEach === 9, "apply RAW26 echo");

assert(statsPpDeliveryLabel_({ ppScheme: "RAW26" }) === "Топливо доставок ПП (4×N, тариф 9 RAW26)", "UI RAW26 fuel label");
assert(statsPpDeliveryLabel_({ ppScheme: "LEGACY" }) === "Топливо доставок ПП (4×N, тариф 6 LEGACY)", "UI LEGACY fuel label");
assert(statsPpDeliveryLabel_({ ppScheme: "MIXED" }).indexOf("4×N") >= 0, "UI MIXED fuel 4×N");
assert(statsPpDeliveryLabel_({ ppLightFeeEach: 11, ppDeliveryFeeEach: 6 }) === "Топливо доставок ПП (4×N)",
  "stale 11+6 snap without ppScheme → fuel 4, not LEGACY-only");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gs = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "../boinya-c/app.main.js"), "utf8");
assert(gs.indexOf("function statsPpFeeEchoFromMonth_") >= 0, "Code.gs fee echo helper");
assert(gs.indexOf("function applyStatsPpFeeEcho_") >= 0, "Code.gs apply helper");
assert(gs.indexOf("ppLightFeeEach: PP_LIGHT_COST_BYN_") < 0, "no hardcoded LEGACY 11 in payloads");
assert(gs.indexOf("ppDeliveryFeeEach: PP_DELIVERY_COST_BYN_") < 0, "no hardcoded LEGACY 6 in payloads");
assert(gs.indexOf("applyStatsPpFeeEcho_(ok.fact, month)") >= 0, "getStats applies echo");
assert(gs.indexOf("applyStatsPpFeeEcho_(ok, stats)") >= 0, "expected applies echo");
assert(gs.indexOf("STATS24:") >= 0, "GAS cache bumped to STATS24");
assert(ui.indexOf("stats-pp-fee-echo-h1") >= 0, "UI marker");
assert(ui.indexOf("function statsPpDeliveryLabel_") >= 0, "UI delivery label helper");
assert(ui.indexOf("statsPpDeliveryLabel_(fact)") >= 0, "dashboard uses scheme label");
assert(ui.indexOf("statsPpCostFootnote_(fact)") >= 0, "dashboard footnote from scheme");
assert(ui.indexOf("statsPpFeeEchoLine_(res)") >= 0, "expected prints scheme tariff");
assert(ui.indexOf("v71115950") >= 0, "UI cache-bust v71115950");

console.log("OK stats-pp-fee-echo");
console.log(JSON.stringify({
  raw: { ppScheme: raw.ppScheme, ppLightFeeEach: raw.ppLightFeeEach, ppDeliveryFeeEach: raw.ppDeliveryFeeEach },
  legacy: { ppScheme: leg.ppScheme, ppLightFeeEach: leg.ppLightFeeEach, ppDeliveryFeeEach: leg.ppDeliveryFeeEach },
  mixed: { ppScheme: mixed.ppScheme, hasEach: mixed.ppLightFeeEach != null, ppFeeByScheme: mixed.ppFeeByScheme },
  emptyOmitsEach: empty.ppLightFeeEach == null && empty.ppDeliveryFeeEach == null
}, null, 2));
