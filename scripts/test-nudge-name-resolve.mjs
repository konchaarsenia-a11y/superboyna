/**
 * Регрессия «Подбейте даты»: имена пропадали, когда память хранит matchKey
 * без client, а календарь — ключ с |собака. Старый lookup = exact byKey[rk].
 */
function normalizeClientKey_(s) {
  return String(s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/Ё/g, "Е");
}

function extractInstagramNick_(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  var at = s.match(/@([A-Za-z0-9._]{2,})/);
  if (at) return at[1];
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  var parts = s.split(/\s+/);
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
    if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) return p;
  }
  return "";
}

function clientMatchKey_(raw) {
  var ex = extractInstagramNick_(raw);
  var display = String(raw || "").replace(/\s+/g, " ").trim();
  var base = ex || display.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
  var key = normalizeClientKey_(base);
  if (ex || /^[A-Z0-9._]+$/i.test(base)) key = key.replace(/[._]/g, "");
  if (ex && display) {
    var esc = String(ex).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var mAfter = display.match(new RegExp("@?" + esc + "\\s+(.+)$", "i"));
    var dog = mAfter ? String(mAfter[1] || "").trim() : "";
    dog = dog.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
    if (dog && dog.length <= 24 &&
        !/доставк|напис|уточн|втор(ая|ой)|через|европочт/i.test(dog) &&
        /[а-яА-ЯёЁA-Za-z0-9]/.test(dog)) {
      key = key + "|" + normalizeClientKey_(dog).replace(/[._\s]+/g, "");
    }
  }
  return key;
}

function nicksMatch_(a, b) {
  var ka = clientMatchKey_(a);
  var kb = clientMatchKey_(b);
  if (ka && kb && ka === kb) return true;
  var ia = extractInstagramNick_(a);
  var ib = extractInstagramNick_(b);
  if (ia && ib) {
    var ha = normalizeClientKey_(ia).replace(/[._]/g, "");
    var hb = normalizeClientKey_(ib).replace(/[._]/g, "");
    if (ha && ha === hb) {
      if (ka.indexOf("|") < 0 || kb.indexOf("|") < 0) return true;
    }
  }
  var na = normalizeClientKey_(a);
  var nb = normalizeClientKey_(b);
  return !!(na && nb && na === nb);
}

function looksLikeBareMatchKey_(s) {
  var t = String(s || "").trim();
  if (!t) return true;
  if (t.indexOf("|") >= 0) return true;
  if (!/\s/.test(t) && t === t.toUpperCase() && /[A-ZА-ЯЁ]/.test(t) && t.length >= 3) return true;
  return false;
}

function findCalendarHitOld_(cal, raw) {
  var byKey = {};
  for (var c = 0; c < cal.length; c++) {
    var ck = cal[c].matchKey || clientMatchKey_(cal[c].client) || "";
    if (ck) byKey[ck] = cal[c];
  }
  var rk = clientMatchKey_(raw) || String(raw).toUpperCase();
  return byKey[rk] || null;
}

function findCalendarHitNew_(cal, raw) {
  if (!cal || !cal.length || !raw) return null;
  var i;
  var rk = clientMatchKey_(raw) || String(raw).toUpperCase();
  for (i = 0; i < cal.length; i++) {
    var ck = cal[i].matchKey || clientMatchKey_(cal[i].client) || "";
    if (rk && ck && rk === ck) return cal[i];
  }
  for (i = 0; i < cal.length; i++) {
    if (nicksMatch_(cal[i].client, raw) || nicksMatch_(cal[i].matchKey, raw)) return cal[i];
  }
  return null;
}

function displayClientNick_(raw) {
  var s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/\s*\b(АФК|ПП|БП|Р)\b\s*$/i, "").trim();
  s = s.replace(/\s{2,}/g, " ");
  return s || extractInstagramNick_(raw) || String(raw || "").trim();
}

function buildText_(pack) {
  var lines = ["📅 Подбейте даты доставок", "Вчера (" + pack.dateText + ") с галочкой «доставлен» — ПП и БП1:", ""];
  if (!pack.total) lines.push("Нет таких клиентов за вчера.");
  else {
    if (pack.pp.length) {
      lines.push("ПП (" + pack.pp.length + "):");
      pack.pp.forEach(function (x) {
        if (x.name) lines.push("· " + x.name);
      });
    }
  }
  return lines.join("\n");
}

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL", msg);
  } else {
    console.log("OK  ", msg);
  }
}

var cal = [
  { client: "Veta.foto Дэни", matchKey: clientMatchKey_("Veta.foto Дэни"), segment: "ПП" },
  { client: "Евгения kinolog.vica", matchKey: clientMatchKey_("Евгения kinolog.vica"), segment: "ПП" }
];

assert(clientMatchKey_("Veta.foto Дэни") === "VETAFOTO|ДЕНИ", "dog suffix key");
assert(clientMatchKey_("VETAFOTO") === "VETAFOTO", "bare mem key");
assert(!findCalendarHitOld_(cal, "VETAFOTO"), "OLD exact miss on dog suffix");
var hitNew = findCalendarHitNew_(cal, "VETAFOTO");
assert(!!hitNew && hitNew.client === "Veta.foto Дэни", "NEW nicksMatch hits display");
assert(looksLikeBareMatchKey_("VETAFOTO"), "bare matchKey detected");
assert(looksLikeBareMatchKey_("VETAFOTO|ДЕНИ"), "piped key detected");
assert(!looksLikeBareMatchKey_("Евгения kinolog.vica"), "human name not bare");

var memLabel = "VETAFOTO";
var resolved = displayClientNick_(hitNew.client);
assert(resolved === "Veta.foto Дэни", "display from calendar");
var text = buildText_({
  dateText: "11.09.2026",
  total: 1,
  pp: [{ name: resolved }],
  bp1: []
});
assert(text.indexOf("· Veta.foto Дэни") >= 0, "nudge text has name");
assert(text.indexOf("📅 Подбейте даты доставок") >= 0, "nudge header");

var oldText = buildText_({ dateText: "11.09.2026", total: 0, pp: [], bp1: [] });
assert(oldText.indexOf("Нет таких клиентов") >= 0, "old empty list copy");

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall ok");
