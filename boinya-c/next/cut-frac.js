/* Подпись фракции на сборке и нарезке.
   Живой состав хранит её в sub (Среднее, СРЕД, Ломтики), не в frac.
   Слова как у humanFraction. frac s/m/l дописываем, если он уже лежит в строке.
   Крошка-микс и обычное мясо — без подписи. */
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
    n = n.replace(/\s+(СРЕД|МАЛ|БОЛ|ОГР|ПЛАСТ|ПАЛК|ПОЛОВИНКА|ОЧ МАЛ)$/i, "").trim();
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

  /* То же дерево, что order-engine humanFraction. */
  function catalogWord(main, sub) {
    var f = String(sub || "").trim();
    if (!f) return "";
    var m = String(main || "").toUpperCase();
    var fu = f.toUpperCase().replace(/\s+/g, " ");
    if (/ОЧЕНЬ\s*МЕЛК|^ОЧ\s*МЕЛК/.test(fu)) return "очень мелкое";
    if (/^ЛОМТ/.test(fu)) return "ломтики";
    if (/^ПОЛОСК/.test(fu)) return "полоски";
    if (/Л[ЁЕ]ГК/.test(m) && /^МЕЛК/.test(fu)) return "мелкий кубик";
    if (fu === "ПЛАСТ") return "пластинки";
    if (/ПОЛОВИН/.test(fu)) return "половинки";
    if (/ПАЛК/.test(fu)) return "палочки";
    if (/^ОЧ/.test(fu) || fu === "ОЧ МАЛ") return "очень маленькие";
    if (fu === "МАЛ" || fu === "ОЧ МАЛ") return "маленькие";
    if (fu === "СРЕД") return "средние";
    if (fu === "БОЛ") return "большие";
    if (fu === "ОГР") return "огромные";
    if (/^МЕЛК/.test(fu)) return "мелкое";
    if (/^СРЕД/.test(fu)) return "среднее";
    if (/^БОЛЬ|^КРУП/.test(fu)) return "крупное";
    if (/^ЦЕЛ/.test(fu)) return "целое";
    if (/ОБЫЧН/.test(fu)) return "";
    return f.toLowerCase();
  }

  function embeddedChew(name) {
    var u = String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ");
    if (/ПОЛОВИН/.test(u)) return "ПОЛОВИНКА";
    if (/ОЧ\s*МАЛ|ОЧЕНЬ\s*МАЛ/.test(u)) return "ОЧ МАЛ";
    if (/(^|[^А-ЯA-Z0-9])ОГР([^А-ЯA-Z0-9]|$)|ОГРОМ/.test(u)) return "ОГР";
    if (/ПАЛК|ПАЛОЧ/.test(u)) return "ПАЛК";
    if (/ПЛАСТ/.test(u)) return "ПЛАСТ";
    if (/(^|[^А-ЯA-Z0-9])БОЛ([^А-ЯA-Z0-9]|$)/.test(u)) return "БОЛ";
    if (/(^|[^А-ЯA-Z0-9])СРЕД([^А-ЯA-Z0-9]|$)/.test(u)) return "СРЕД";
    if (/(^|[^А-ЯA-Z0-9])МАЛ([^А-ЯA-Z0-9]|$)/.test(u)) return "МАЛ";
    return "";
  }

  function subOf(it) {
    var sub = String((it && it.sub) || "").trim();
    var name = String((it && (it.name || it.main)) || "");
    var main = String((it && (it.main || it.name)) || "");
    if (sub) return { main: main, sub: sub };
    var parts = name.split(" / ");
    if (parts.length >= 2 && String(parts[1] || "").trim()) {
      return { main: String(parts[0] || "").trim() || main, sub: parts.slice(1).join(" / ").trim() };
    }
    if (isChew(it)) {
      var tok = embeddedChew(name);
      if (tok) return { main: main, sub: tok };
    }
    return { main: main, sub: "" };
  }

  function phrase(it) {
    if (!it || !applies(it)) return "";
    var got = subOf(it);
    var word = catalogWord(got.main, got.sub);
    var extra = label(it.frac);
    if (extra && word && extra !== word) return word + " " + extra;
    return word || extra || "";
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

  function sizeWord(s) {
    if (!s) return "";
    if (s.text) return String(s.text);
    if (s.label) return String(s.label);
    var fracWord = label(s.frac);
    if (fracWord) return fracWord;
    if (s.sub) return catalogWord(s.main || "", s.sub);
    return "";
  }

  function sizesText(sizes, unit) {
    var bits = [];
    var u = unit === "гр" || unit === "г" ? "г" : "шт";
    (sizes || []).forEach(function (s) {
      var word = sizeWord(s);
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
    catalogWord: catalogWord,
    phrase: phrase,
    applies: applies,
    isChew: isChew,
    isDressura: isDressura,
    isCrumb: isCrumb,
    defaultUnit: defaultUnit,
    keep: keep,
    sizesText: sizesText
  };
});
