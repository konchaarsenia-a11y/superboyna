/* БП — новая модель (t516u-clients #10): бесплатный / по себесу; 1 неделя + опц. вторая.
   Нет БП2/ФИНАЛ. Опросник = напоминание менеджеру карточки.
   Архив: done <7д в активных; ≥7д → «Завершённые»; ≥14д бездействия → «Отказ» + notify. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaBpWeeks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY_MS = 86400000;
  var DONE_ARCHIVE_MS = 7 * DAY_MS;
  var REFUSE_ARCHIVE_MS = 14 * DAY_MS;

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
    var md = w.match(/\[BPDONE:([^\]]+)\]/i);
    var mn = w.match(/\[BPNOTIFIED:([^\]]+)\]/i);
    var out = mo ? String(mo[1]).toLowerCase() : "";
    if (out === "week2") out = "extend";
    return {
      bpWeeks: mw ? Number(mw[1]) : 1,
      bpWeeksSet: !!mw,
      bpOutcome: out,
      bpKind: mk ? String(mk[1]).toLowerCase() : "",
      bpDoneAt: md ? String(md[1]).trim() : "",
      bpRefuseNotifiedAt: mn ? String(mn[1]).trim() : ""
    };
  }

  function strip(wishes) {
    return String(wishes || "")
      .replace(/\[BPW:[^\]]*\]/gi, "")
      .replace(/\[BPOUT:[^\]]*\]/gi, "")
      .replace(/\[BPKIND:[^\]]*\]/gi, "")
      .replace(/\[BPDONE:[^\]]*\]/gi, "")
      .replace(/\[BPNOTIFIED:[^\]]*\]/gi, "")
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
    var doneAt = parsed.bpDoneAt;
    if (meta.bpDoneAt != null) doneAt = String(meta.bpDoneAt || "").trim();
    var notified = parsed.bpRefuseNotifiedAt;
    if (meta.bpRefuseNotifiedAt != null) notified = String(meta.bpRefuseNotifiedAt || "").trim();
    var tags = "";
    if (weeks === 1 || weeks === 2) tags += "[BPW:" + weeks + "]";
    if (outcome) tags += "[BPOUT:" + outcome + "]";
    if (kind) tags += "[BPKIND:" + kind + "]";
    if (doneAt) tags += "[BPDONE:" + doneAt + "]";
    if (notified) tags += "[BPNOTIFIED:" + notified + "]";
    return (base + (base && tags ? " " : "") + tags).trim();
  }

  /** t516u-clients #10: при создании БП deferred-задачу перехода в ПП не ставим. */
  function remindBody(nick, telegramId) {
    return null;
  }

  function doneAtMs(row, nowMs) {
    row = row || {};
    var raw = row.bpDoneAt || "";
    if (!raw && row.wishes) raw = parseWishes(row.wishes).bpDoneAt;
    if (!raw && row._savedAt && outcomeOf(row.bpOutcome || (row.wishes && parseWishes(row.wishes).bpOutcome)) === "done") {
      raw = row._savedAt;
    }
    var n = Number(raw);
    if (isFinite(n) && n > 1e11) return n;
    if (isFinite(n) && n > 1e9 && n < 1e11) return n * 1000;
    var t = Date.parse(String(raw || ""));
    if (isFinite(t)) return t;
    return 0;
  }

  /**
   * active — обычный / свежий «завершён» (<7д)
   * done — секция «Завершённые» (≥7д)
   * refuse — архив «Отказ»
   */
  function archiveBucket(row, nowMs) {
    row = row || {};
    var now = nowMs != null ? Number(nowMs) : Date.now();
    var parsed = row.wishes ? parseWishes(row.wishes) : {};
    var outcome = outcomeOf(row.bpOutcome || parsed.bpOutcome);
    if (outcome === "refuse") return "refuse";
    if (outcome === "pp") return "pp";
    if (outcome !== "done") return "active";
    var at = doneAtMs(Object.assign({}, row, { bpDoneAt: row.bpDoneAt || parsed.bpDoneAt }), now);
    if (!at) return "active";
    if (now - at >= DONE_ARCHIVE_MS) return "done";
    return "active";
  }

  function shouldAutoRefuse(row, nowMs) {
    row = row || {};
    var now = nowMs != null ? Number(nowMs) : Date.now();
    var parsed = row.wishes ? parseWishes(row.wishes) : {};
    var outcome = outcomeOf(row.bpOutcome || parsed.bpOutcome);
    if (outcome === "refuse" || outcome === "pp") return false;
    if (outcome !== "done") return false;
    var at = doneAtMs(Object.assign({}, row, { bpDoneAt: row.bpDoneAt || parsed.bpDoneAt }), now);
    if (!at) return false;
    return now - at >= REFUSE_ARCHIVE_MS;
  }

  function surveyPhase(survey, sub) {
    var kind = String((survey && (survey.kind || survey.templateId)) || "").toLowerCase();
    var weeks = sub ? weeksOf(sub.bpWeeks) : 1;
    if (/week2|w2/.test(kind)) return "week2";
    if (weeks === 2 && /final/.test(kind)) return "week2";
    if (/bp2|week1|w1|final/.test(kind)) return weeks === 2 ? "week2" : "week1";
    return weeks === 2 ? "week2" : "week1";
  }

  function surveyChoices(phase) {
    if (phase === "week2") {
      return [
        { id: "pp", label: "Переход на ПП" },
        { id: "refuse", label: "Отказ" }
      ];
    }
    return [
      { id: "pp", label: "Переход на ПП" },
      { id: "week2", label: "Вторая неделя" },
      { id: "refuse", label: "Отказ" }
    ];
  }

  function surveyKindLabel(phase) {
    return phase === "week2" ? "БП · 2-я неделя" : "БП · 1-я неделя";
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
    remindBody: remindBody,
    DONE_ARCHIVE_MS: DONE_ARCHIVE_MS,
    REFUSE_ARCHIVE_MS: REFUSE_ARCHIVE_MS,
    doneAtMs: doneAtMs,
    archiveBucket: archiveBucket,
    shouldAutoRefuse: shouldAutoRefuse,
    surveyPhase: surveyPhase,
    surveyChoices: surveyChoices,
    surveyKindLabel: surveyKindLabel
  };
});
