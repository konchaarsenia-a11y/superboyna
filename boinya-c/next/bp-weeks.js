/* БП — новая модель (t516u-clients #10): бесплатный / по себесу; 1 неделя + опц. вторая.
   Нет БП2/ФИНАЛ. Опросник = напоминание менеджеру карточки. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaBpWeeks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function weeksOf(raw) {
    if (raw == null || raw === "") return 1;
    return Number(raw) === 2 ? 2 : 1;
  }

  function kindOf(raw) {
    var s = String(raw || "").trim().toLowerCase();
    if (s === "cost" || s === "себес" || s === "себестоимость" || s === "paid") return "cost";
    if (s === "free" || s === "бесплатный" || s === "бесплат") return "free";
    return "";
  }

  function outcomeOf(raw) {
    var s = String(raw || "").trim().toLowerCase();
    if (s === "extend" || s === "extended" || s === "продлён" || s === "продлен" || s === "week2") return "extend";
    if (s === "pp" || s === "пп") return "pp";
    if (s === "done" || s === "completed" || s === "завершён" || s === "завершен") return "done";
    if (s === "refuse" || s === " отказ" || s === "отказ" || s === "archive") return "refuse";
    return "";
  }

  function statusLabel(weeks, outcome, kind) {
    var o = outcomeOf(outcome);
    if (o === "pp") return "перешёл в ПП";
    if (o === "done") return "завершён";
    if (o === "extend" || weeksOf(weeks) === 2) return "вторая неделя";
    if (o === "refuse") return "отказ";
    var k = kindOf(kind);
    if (k === "cost") return "по себестоимости";
    if (k === "free") return "бесплатный";
    return "";
  }

  function listLabel(status, outcome, kind) {
    var extra = statusLabel(null, outcome, kind);
    if (extra) return "БП, " + extra;
    if (/БП2|ФИНАЛ/i.test(String(status || ""))) return "БП";
    return "БП";
  }

  function countsInBpList(row) {
    row = row || {};
    var sh = String(row.sheet || row.segment || "").trim().toUpperCase();
    if (sh === "BP") sh = "БП";
    if (sh !== "БП") return false;
    var o = outcomeOf(row.bpOutcome);
    return o !== "refuse";
  }

  function newCardFields(kind) {
    var k = kindOf(kind) || "free";
    return {
      sheet: "БП",
      segment: "БП",
      status: "БП",
      stage: "БП",
      ppStatus: "БП",
      bpWeeks: "1",
      bpKind: k,
      surveyKind: "final",
      createCard: true,
      needSurvey: true,
      skipPpRemind: true
    };
  }

  function remindTitle(name) {
    return "Опросник БП: " + String(name || "").trim();
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
    var mo = w.match(/\[BPOUT:(extend|pp|done|refuse|week2)\]/i);
    var mk = w.match(/\[BPKIND:(free|cost)\]/i);
    var out = mo ? String(mo[1]).toLowerCase() : "";
    if (out === "week2") out = "extend";
    return {
      bpWeeks: mw ? Number(mw[1]) : 1,
      bpWeeksSet: !!mw,
      bpOutcome: out,
      bpKind: mk ? String(mk[1]).toLowerCase() : ""
    };
  }

  function strip(wishes) {
    return String(wishes || "")
      .replace(/\[BPW:[^\]]*\]/gi, "")
      .replace(/\[BPOUT:[^\]]*\]/gi, "")
      .replace(/\[BPKIND:[^\]]*\]/gi, "")
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
    var kind = parsed.bpKind;
    if (meta.bpKind != null && meta.bpKind !== "") kind = kindOf(meta.bpKind);
    var tags = "";
    if (weeks === 1 || weeks === 2) tags += "[BPW:" + weeks + "]";
    if (outcome) tags += "[BPOUT:" + outcome + "]";
    if (kind) tags += "[BPKIND:" + kind + "]";
    return (base + (base && tags ? " " : "") + tags).trim();
  }

  /** t516u-clients #10: при создании БП deferred-задачу перехода в ПП не ставим. */
  function remindBody(nick, telegramId) {
    return null;
  }

  return {
    weeksOf: weeksOf,
    kindOf: kindOf,
    outcomeOf: outcomeOf,
    statusLabel: statusLabel,
    listLabel: listLabel,
    countsInBpList: countsInBpList,
    newCardFields: newCardFields,
    remindTitle: remindTitle,
    remindId: remindId,
    extendPrice: extendPrice,
    parseWishes: parseWishes,
    strip: strip,
    stampWishes: stampWishes,
    remindBody: remindBody
  };
});
