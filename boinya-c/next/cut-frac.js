/* Размер нарезки позиции: мелкая / средняя / крупная.
   Жевалки и дрессура. Крошка и обычное мясо — без размера.
   Старые строки без frac остаются без подписи. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaCutFrac = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ORDER = [
    { id: "s", label: "мелкая" },
    { id: "m", label: "средняя" },
    { id: "l", label: "крупная" }
  ];

  function code(frac) {
    var f = String(frac || "").trim().toLowerCase();
    if (f === "s" || f === "m" || f === "l") return f;
    return "";
  }

  function label(frac) {
    var c = code(frac);
    var i;
    for (i = 0; i < ORDER.length; i++) if (ORDER[i].id === c) return ORDER[i].label;
    return "";
  }

  function isCrumb(it) {
    if (!it) return false;
    if (String(it.cat || "").toLowerCase() === "crumb" || it.crumbKind) return true;
    if (Array.isArray(it.sources) && it.sources.length) return true;
    return /^крошка(?:\s|$)/i.test(String(it.name || it.main || "").trim());
  }

  function chewName(name) {
    var n = String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
    n = n.replace(/\s*ШТ\.?$/i, "").trim();
    if (!n) return false;
    if (/^(БЫЧИЙ КОРЕНЬ|ТРАХЕЯ|АОРТА|УХО Г|УХО К|НОСЫ|СТАНОВАЯ ЖИЛА|КОЛЕНИ|ПЕРЕПЕЛКИ|ЛОП ХРЯЩ|УТИНЫЕ ШЕИ|ГУБЫ|КОПЫТО)$/.test(n)) return true;
    if (/УХО|УШК|КОРЕН|ХРЯЩ|ЛОПАТ|КОПЫТ|АОРТ|ТРАХЕ|ПЕРЕПЕЛ|СТАНОВ|КОЛЕН/.test(n)) return true;
    if (/ГУБЫ|НОСЫ|ШЕИ|ШЕЯ/.test(n)) return true;
    if (/(^|[^А-ЯA-Z0-9])НОС([^А-ЯA-Z0-9]|$)/.test(n)) return true;
    return false;
  }

  function isChew(it) {
    if (!it || isCrumb(it)) return false;
    var cat = String(it.cat || "").toLowerCase();
    if (cat === "chew" || cat === "chews") return true;
    if (cat === "dressura" || cat === "other" || cat === "veg" || cat === "crumb") return false;
    return chewName(it.main || it.name);
  }

  function isDressura(it) {
    if (!it || isCrumb(it)) return false;
    return String(it.cat || "").toLowerCase() === "dressura";
  }

  function applies(it) {
    return isChew(it) || isDressura(it);
  }

  function defaultUnit(it) {
    if (isChew(it)) return "шт";
    if (isDressura(it)) return "г";
    return "";
  }

  function keep(it) {
    if (!it || !applies(it)) {
      if (it && it.frac != null) delete it.frac;
      return it;
    }
    var c = code(it.frac);
    if (c) it.frac = c;
    else delete it.frac;
    return it;
  }

  function stampNew(it) {
    if (!it || !applies(it)) {
      if (it) delete it.frac;
      return it;
    }
    it.frac = code(it.frac) || "m";
    return it;
  }

  function chipsHtml(frac, attrs) {
    var on = code(frac);
    var extra = attrs ? " " + attrs : "";
    return '<div class="nx-frac" role="group" aria-label="Размер">' + ORDER.map(function (c) {
      return '<button type="button" class="b-chip' + (on === c.id ? " b-chip--on" : "") + '"' + extra + ' data-frac="' + c.id + '">' + c.label + "</button>";
    }).join("") + "</div>";
  }

  function sizesText(sizes, unit) {
    var bits = [];
    var u = unit === "гр" || unit === "г" ? "г" : "шт";
    (sizes || []).forEach(function (s) {
      var word = label(s && s.frac);
      if (!word) return;
      var n = s.dry;
      if (!(Number(n) > 0)) return;
      bits.push(word + " " + n + " " + u);
    });
    return bits.join(" ");
  }

  return {
    code: code,
    label: label,
    applies: applies,
    isChew: isChew,
    isDressura: isDressura,
    isCrumb: isCrumb,
    defaultUnit: defaultUnit,
    keep: keep,
    stampNew: stampNew,
    chipsHtml: chipsHtml,
    sizesText: sizesText
  };
});
