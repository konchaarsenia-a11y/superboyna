/* БП на 1 или 2 недели. Нет тега — как сейчас, 2 недели. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaBpWeeks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function weeksOf(raw) {
    if (raw == null || raw === "") return 2;
    return Number(raw) === 1 ? 1 : 2;
  }

  function outcomeOf(raw) {
    var s = String(raw || "").trim().toLowerCase();
    if (s === "extend" || s === "extended" || s === "продлён" || s === "продлен") return "extend";
    if (s === "pp" || s === "пп") return "pp";
    if (s === "done" || s === "completed" || s === "завершён" || s === "завершен") return "done";
    return "";
  }

  function statusLabel(weeks, outcome) {
    if (weeksOf(weeks) !== 1) return "";
    var o = outcomeOf(outcome);
    if (o === "extend") return "продлён";
    if (o === "pp") return "перешёл в ПП";
    if (o === "done") return "завершён";
    return "1 нед";
  }

  function remindTitle(name) {
    return "Предложить продление или переход на ПП: " + String(name || "").trim();
  }

  function remindId(nick) {
    var s = String(nick || "").toUpperCase();
    var out = "";
    var i;
    for (i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      var ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 1040 && c <= 1103) || c === 1025 || c === 1105;
      if (ok) out += s.charAt(i);
    }
    if (!out) out = "X";
    if (out.length > 40) out = out.slice(0, 40);
    return "bp1w_" + out;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function extendPrice(week1, week2, partsFn) {
    if (!week1 || typeof partsFn !== "function") return null;
    function one(units) {
      units = units || {};
      return Number(partsFn({ S: units.S, G: units.G, P: units.P, N: 1 }).cost) || 0;
    }
    return round2(one(week1) + one(week2 || week1));
  }

  function parseWishes(wishes) {
    var w = String(wishes || "");
    var mw = w.match(/\[BPW:([12])\]/i);
    var mo = w.match(/\[BPOUT:(extend|pp|done)\]/i);
    return {
      bpWeeks: mw ? Number(mw[1]) : 2,
      bpWeeksSet: !!mw,
      bpOutcome: mo ? String(mo[1]).toLowerCase() : ""
    };
  }

  function strip(wishes) {
    return String(wishes || "")
      .replace(/\[BPW:[^\]]*\]/gi, "")
      .replace(/\[BPOUT:[^\]]*\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stampWishes(wishes, meta) {
    meta = meta || {};
    var parsed = parseWishes(wishes);
    var base = strip(wishes);
    var weeks = parsed.bpWeeksSet ? parsed.bpWeeks : 0;
    if (meta.bpWeeks != null && meta.bpWeeks !== "") weeks = weeksOf(meta.bpWeeks);
    var outcome = parsed.bpOutcome;
    if (meta.bpOutcome != null) outcome = outcomeOf(meta.bpOutcome);
    var tags = "";
    if (weeks === 1 || weeks === 2) tags += "[BPW:" + weeks + "]";
    if (outcome) tags += "[BPOUT:" + outcome + "]";
    return (base + (base && tags ? " " : "") + tags).trim();
  }

  function remindBody(nick, telegramId) {
    var when = new Date();
    var title = remindTitle(nick);
    var tid = String(telegramId || "").trim();
    return {
      action: "saveDeferred",
      telegramId: tid,
      id: remindId(nick),
      mode: "remind",
      title: title,
      clientNick: String(nick || "").trim(),
      status: "open",
      silent: "1",
      remindAt: when.toISOString(),
      remindAtMs: String(when.getTime()),
      payload: JSON.stringify({
        mode: "remind",
        title: title,
        bpWeeks: 1,
        remindSilent: true,
        remindSent: true,
        client: String(nick || "").trim(),
        targetTelegramId: tid,
        forTelegramId: tid
      })
    };
  }

  return {
    weeksOf: weeksOf,
    outcomeOf: outcomeOf,
    statusLabel: statusLabel,
    remindTitle: remindTitle,
    remindId: remindId,
    extendPrice: extendPrice,
    parseWishes: parseWishes,
    strip: strip,
    stampWishes: stampWishes,
    remindBody: remindBody
  };
});
