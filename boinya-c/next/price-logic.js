/* Бойня next — цены ПП, кап, оффер и подбор 1:1 из boinya-c/app.main.js.
   Не править вручную: node boinya-c/next/extract-price.mjs */
(function (root, factory) {
  var eng = (typeof module !== "undefined" && module.exports)
    ? require("./order-engine.js")
    : (root.BoinyaOrderEngine || {});
  var api = factory(eng);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoinyaPrice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (eng) {
  "use strict";
  var calcRetailBasketTotal = eng.calcRetailBasketTotal;
  var retailLineCost = eng.retailLineCost;
  var unitForItem = eng.unitForItem;
  var isPieceSkuName = eng.isPieceSkuName;
  var buildIgKnownMap = eng.buildIgKnownMap;
  var igAliasResolve = eng.igAliasResolve;
  var serializeBasketItem_ = eng.serializeBasketItem_;
  var prettyProductName = eng.prettyProductName;
  var humanFraction = eng.humanFraction;
  var isCrumbBasketItemUi_ = eng.isCrumbBasketItemUi_;
  var crumbSourceNames_ = eng.crumbSourceNames_;
  var isChewProductName_ = eng.isChewProductName_;
  var isChewCrumbSource_ = eng.isChewCrumbSource_;
  var catalog = eng.catalog;
  var dressuraFractionSizeKey = eng.dressuraFractionSizeKey;
  var dressuraFractionPickRate = eng.dressuraFractionPickRate;
  var dressuraFractionRates = eng.dressuraFractionRates;
  var parseIgLinesToItems = eng.parseIgLinesToItems;

    var PP_SCHEME_CUTOFF_YMD = "2026-08-31";
var PP_RAW26_COEF_DEFAULT = 2.6;
var PP_RAW26_RECOVER_100 = 3.90;
var PP_RAW26_RECOVER_PIECE = 0.50;
var PP_RAW26_DELIVERY_PER = 9;
var PP_RAW26_RETAIL_CAP = 0.92;
var PP_RAW26_RETAIL_FREE_FROM = 80;
var STATS_DELIVERY_FUEL_PER = 4;
var PP_LEGACY_COEF_DEFAULT = 2.3;
var PP_LEGACY_FIXED = 11;
var PP_LEGACY_DELIVERY_PER = 6;

    var PRICE_PACK_UNIT = { small: 0.34, medium: 0.56, large: 0.80, legs: 1.40 };
    var PRICE_PICK_MONTH_WEEKS = 4;
var PRICE_PICK_MONTH_DELIVERIES = 2;

    var ASM_CAP_PRODUCT = { small: 20, medium: 100, large: 250 };
var ASM_CAP_LIGHT = { small: 15, medium: 80, large: 190 };
var ASM_CRAFT_HOLDS = { large: 4, medium: 7, small: 35 };
var ASM_CHEW_FEW = 2;
var ASM_CHEW_PER_BIG = 4;


  var pricePackCounts = { small: 0, medium: 0, large: 0, legs: 0 };
  var pricePacksManual = false;
  function isPricePpLikeMode_() { return String(priceMode || "pp") !== "retail"; }
  function allPriceItems() { return _list || []; }
  function renderPricePackCounters() {}
  var priceMode = "pp";

  var priceDogCount = 1;
  var priceDogNames = { 1: "", 2: "" };
  var pricePpScheme = "RAW26";
  var _coef = 2.6;
  var _scheme = "RAW26";
  var _list = [];
  var _hint = "";
  var _lastPpCostFact = null;
  var _fracRates = { slices: 0, strips: 1, large: 1, medium: 2, small: 3, extraSmall: 4, whole: 0 };
  var fetchPpCalcPrice_ = async function () { return null; };

  function priceDogLabel_(n) {
    var name = String((priceDogNames && priceDogNames[n]) || "").trim();
    if (name) return name;
    return "Собака " + n;
  }
  function getPricePpCoef() { return _coef; }
  function getPriceFracRates() { return _fracRates; }
  function subDetailSchemeValue_() { return _scheme; }
  function subDetailBasketPayload_() { return _list; }
  function rememberPpCostFact_(fact) { _lastPpCostFact = fact; return fact; }
  function renderRaw26CleanPair_() { return ""; }
  function hideRaw26CleanPair_() {}
  function applySubDetailFact_(total, hint) { _hint = hint || ""; return total; }

  function useQuote(opts) {
    opts = opts || {};
    _scheme = opts.scheme || "RAW26";
    pricePpScheme = _scheme;
    _coef = Number(opts.coef) || (_scheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
    _list = opts.list || [];
    priceDogCount = Number(opts.dogCount) === 2 ? 2 : 1;
    priceDogNames = opts.dogNames || { 1: "", 2: "" };
    if (opts.fracRates) _fracRates = opts.fracRates;
  }

    function pricePickCloneItems_(items) {
      return (items || []).map(function (it, idx) {
        var copy = Object.assign({}, it);
        copy.id = Date.now() + idx + Math.random();
        if (copy.value == null && copy.val != null) copy.value = copy.val;
        if (copy.val == null && copy.value != null) copy.val = copy.value;
        return copy;
      });
    }

    function pricePickDefaultFrac_(cat, name, preferred) {
      if (cat === "veg") return "";
      var known = buildIgKnownMap();
      var hit = known[String(name || "").toUpperCase()];
      var fracs = (hit && hit.fractions) || [];
      if (preferred) {
        var want = String(preferred).toLowerCase();
        for (var i = 0; i < fracs.length; i++) {
          if (String(fracs[i]).toLowerCase().indexOf(want) >= 0) return fracs[i];
        }
      }
      if (cat === "chew") {
        if (fracs.indexOf("СРЕД") >= 0) return "СРЕД";
        if (fracs.indexOf("Обычное") >= 0) return "Обычное";
        if (fracs.indexOf("Обычная") >= 0) return "Обычная";
        return fracs[0] || "";
      }
      if (fracs.indexOf("Среднее") >= 0) return "Среднее";
      if (fracs.indexOf("Ломтики") >= 0) return "Ломтики";
      return fracs[0] || "";
    }

    function pricePickDefaultStarter_() {
      return [
        { cat: "dressura", main: "ЛЁГКОЕ", name: "ЛЁГКОЕ", sub: "Среднее", value: 100, val: 100 },
        { cat: "dressura", main: "РУБЕЦ Т", name: "РУБЕЦ Т", sub: "Среднее", value: 80, val: 80 },
        { cat: "dressura", main: "СЕРДЦЕ", name: "СЕРДЦЕ", sub: "Ломтики", value: 50, val: 50 },
        { cat: "chew", main: "БЫЧИЙ КОРЕНЬ", name: "БЫЧИЙ КОРЕНЬ", sub: "СРЕД", value: 1, val: 1 },
        { cat: "chew", main: "УХО Г", name: "УХО Г", sub: "Обычное", value: 1, val: 1 },
        { cat: "veg", main: "КАБАЧОК", name: "КАБАЧОК", sub: "", value: 50, val: 50 }
      ];
    }

    function pricePickNormUp_(s) {
      return String(s || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
    }

    function pricePickAliasText_(s) {
      var t = " " + pricePickNormUp_(s) + " ";
      var y = "[А-Я]*";
      t = t.replace(/ПЕЧЕНЬЕ/g, " ");
      t = t.replace(new RegExp("УШ" + y + "\\s+КРОЛИК" + y, "g"), " ");
      t = t.replace(new RegExp("БЫЧ(?:ИЙ|ЬЕГО|ЬИ)\\s+ПЕНИС" + y, "g"), " БЫЧИЙ КОРЕНЬ ");
      t = t.replace(new RegExp("(^|[^А-ЯA-Z])ПЕНИС" + y, "g"), "$1 БЫЧИЙ КОРЕНЬ ");
      t = t.replace(new RegExp("ЛОПАТОЧН" + y + "\\s+ХРЯЩ" + y, "g"), " ЛОП ХРЯЩ ШТ. ");
      t = t.replace(new RegExp("СТАНОВ" + y + "(?:\\s+ЖИЛ" + y + ")?", "g"), " СТАНОВАЯ ЖИЛА ");
      t = t.replace(new RegExp("НОСИК" + y, "g"), " НОСЫ ШТ. ");
      t = t.replace(new RegExp("ТРАХЕ" + y, "g"), " ТРАХЕЯ ");
      t = t.replace(new RegExp("ПЕРЕПЕЛ" + y, "g"), " ПЕРЕПЕЛКИ ШТ. ");
      t = t.replace(new RegExp("(^|[^А-ЯA-Z])КОЛЕН" + y, "g"), "$1 КОЛЕНИ ШТ. ");
      t = t.replace(new RegExp("ГОВЯЖ" + y + "\\s+УШ" + y + "|УШКО|УШКИ", "g"), " УХО Г ");
      return pricePickNormUp_(t);
    }

    function pricePickRound5_(n, minG) {
      var g = Math.round((Number(n) || 0) / 5) * 5;
      if (minG && g < minG) g = minG;
      return g;
    }

    function pricePickMatchMention_(up, known) {
      var hay = pricePickNormUp_(up);
      var keys = Object.keys(known).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.length < 4) continue;
        var kn = pricePickNormUp_(k);
        if (hay.indexOf(kn) >= 0) return known[k];
        // «рубец» без «Т» → РУБЕЦ Т
        if (kn.indexOf("РУБЕЦ") === 0 && hay.indexOf("РУБЕЦ") >= 0 && known["РУБЕЦ Т"]) {
          return known["РУБЕЦ Т"];
        }
      }
      return null;
    }

    function parseAnketSignals_(raw) {
      var text = String(raw || "").replace(/\r/g, "\n");
      var upAll = text.toUpperCase().replace(/Ё/g, "Е");
      var known = buildIgKnownMap();
      var liked = [];
      var disliked = [];
      var qty = "ok"; // ok | low | high
      var fracPref = "";
      var dogs = 1;
      var noteBits = [];

      if (/2\s*собак|две\s*собак|оба\s*питомц|двух\s*собак/i.test(text)) dogs = 2;
      if (/не\s*хватил|мало\s*было|впритык|недостаточно|закончил.*быстро/i.test(text)) qty = "low";
      else if (/с\s*запасом|слишком\s*много|много\s*остал|хватило\s*с\s*избыт/i.test(text)) qty = "high";

      if (/очень\s*мелк|крошк/i.test(text)) fracPref = "очень мелк";
      else if (/мелк/i.test(text)) fracPref = "мелк";
      else if (/крупн|больш/i.test(text)) fracPref = "крупн";
      else if (/средн/i.test(text)) fracPref = "средн";
      else if (/ломтик/i.test(text)) fracPref = "ломтик";
      else if (/полоск/i.test(text)) fracPref = "полоск";

      function skusInText_(chunk) {
        var out = [];
        var keys = Object.keys(known).sort(function (a, b) { return b.length - a.length; });
        var hay = pricePickAliasText_(chunk);
        for (var ki = 0; ki < keys.length; ki++) {
          var kn = pricePickNormUp_(keys[ki]);
          if (kn.length < 4) continue;
          var hitRubec = kn.indexOf("РУБЕЦ") === 0 && hay.indexOf("РУБЕЦ") >= 0;
          if (hay.indexOf(kn) < 0 && !hitRubec) continue;
          var nm = (hitRubec && known["РУБЕЦ Т"]) ? known["РУБЕЦ Т"].name : known[keys[ki]].name;
          if (out.indexOf(nm) < 0) out.push(nm);
        }
        return out;
      }

      // Хейт: «не любит / не понравилась / проигнорировал / аллергия на»
      var hateNear = text.match(/([А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z\s\.]{0,40}?)\s*(?:проигнорир\w*|не\s*ел\w*)/gi) || [];
      (text.match(/(?:не\s*понравил\w*|не\s*нрав\w*|не\s*люб\w*|не\s*ел\w*|проигнорир\w*)\s+([^.\n;,]{2,48})/gi) || []).forEach(function (chunk) {
        hateNear.push(chunk);
      });
      (text.match(/(?:аллерги\w*\s+на|не\s+перенос\w*)\s+([^.\n]{2,40})/gi) || []).forEach(function (chunk) {
        hateNear.push(chunk);
      });
      text.split(/[.!\n;]+/).forEach(function (part) {
        var p = String(part || "").trim();
        if (/^(?:не|без)\s+\S/i.test(p) || /(?:^|[,\s])не\s+(?:рубец|трахе|куриц|птиц|рыб|печень(?!е))/i.test(p)) {
          hateNear.push(p);
        }
      });
      hateNear.forEach(function (chunk) {
        skusInText_(chunk).forEach(function (n) {
          if (disliked.indexOf(n) < 0) disliked.push(n);
        });
      });
      var hateVerbObj = text.match(/(?:исключ\w*|убрать|без)\s+([А-Яа-яЁёA-Za-z\s,]{2,40})/gi) || [];
      hateVerbObj.forEach(function (chunk) {
        skusInText_(chunk).forEach(function (n) {
          if (disliked.indexOf(n) < 0) disliked.push(n);
        });
      });

      // Лайк: предложение/фрагмент с «понравил…», минус уже disliked
      var likeParts = text.split(/[.!?\n]+/);
      likeParts.forEach(function (part) {
        if (!/(понравил|любит|обожает|ел\s*с\s*удовольств|особенно\s*нрави|кайфует)/i.test(part)) return;
        var cut = part.split(/(?:проигнорир|не\s*ел|не\s*нрави|исключ)/i)[0] || part;
        skusInText_(cut).forEach(function (n) {
          if (disliked.indexOf(n) >= 0) return;
          if (liked.indexOf(n) < 0) liked.push(n);
        });
      });

      // Любые упоминания SKU в тексте (слабее лайков)
      var mentioned = [];
      var upNorm = pricePickNormUp_(upAll);
      Object.keys(known).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
        var kn = pricePickNormUp_(k);
        if (kn.length < 4) return;
        if (upNorm.indexOf(kn) >= 0 || (kn.indexOf("РУБЕЦ") === 0 && upNorm.indexOf("РУБЕЦ") >= 0)) {
          var n = (kn.indexOf("РУБЕЦ") === 0 && known["РУБЕЦ Т"]) ? known["РУБЕЦ Т"].name : known[k].name;
          if (mentioned.indexOf(n) < 0) mentioned.push(n);
        }
      });

      var parsedLines = parseIgLinesToItems(text);
      if (parsedLines.noteBits && parsedLines.noteBits.length) {
        noteBits = noteBits.concat(parsedLines.noteBits);
      }
      (parsedLines.items || []).forEach(function (it) { it.fromLine = true; });

      var must = [];
      function pushMust(chunk) {
        String(chunk || "").split(/\s*[;\n]\s*|(?:,\s*)(?=\bне\b)/i).forEach(function (part) {
          var p = String(part || "").trim();
          if (!p || /^(?:не|без)(?:\s|$)/i.test(p)) return;
          var clean = p.split(/\s+не\s+/i)[0];
          skusInText_(clean).forEach(function (n) {
            if (must.indexOf(n) < 0) must.push(n);
          });
        });
      }
      var mustRe = /(?:обязательно|точно\s+нуж\w*|нуж(?:ен|но|на|ны)|хочу|пусть\s+будет)\s+([^.\n]{2,70})/gi;
      var mustM;
      while ((mustM = mustRe.exec(text))) pushMust(mustM[1] || mustM[0]);
      var mustRe2 = /([^.\n]{2,40})\s+обязательно/gi;
      while ((mustM = mustRe2.exec(text))) pushMust(mustM[1] || mustM[0]);
      must.forEach(function (n) {
        var di = disliked.indexOf(n);
        if (di >= 0) disliked.splice(di, 1);
        if (liked.indexOf(n) < 0) liked.push(n);
      });

      var familyNotes = [];
      if (/без\s+куриц|не\s+куриц|аллерги\w*[^.\n]{0,24}куриц|куриц\w*\s+(?:нельзя|исключ)|исключ\w*[^.\n]{0,16}куриц|(?:без|исключ)[^.\n]{0,40}куриц/i.test(text)) {
        if (disliked.indexOf("УХО К") < 0 && must.indexOf("УХО К") < 0) disliked.push("УХО К");
        familyNotes.push("курица");
      }
      if (/без\s+рыб|не\s+рыб|аллерги\w*[^.\n]{0,24}рыб|рыб\w*\s+(?:нельзя|исключ)|исключ\w*[^.\n]{0,12}рыб|(?:без|исключ)[^.\n]{0,40}рыб/i.test(text)) {
        familyNotes.push("рыба");
      }
      if (/без\s+индей|не\s+индей|индей\w*\s+(?:нельзя|исключ)|исключ\w*[^.\n]{0,12}индей/i.test(text)) {
        if (disliked.indexOf("ИНДЕЙКА") < 0 && must.indexOf("ИНДЕЙКА") < 0) disliked.push("ИНДЕЙКА");
        familyNotes.push("индейка");
      }
      if (/(?:без|не|исключ|аллерги)[^.\n]{0,24}птиц/i.test(text)) {
        ["УХО К", "УТИНЫЕ ШЕИ ШТ.", "ПЕРЕПЁЛКИ ШТ."].forEach(function (n) {
          if (disliked.indexOf(n) < 0 && must.indexOf(n) < 0) disliked.push(n);
        });
        if (familyNotes.indexOf("птица") < 0) familyNotes.push("птица");
      }

      var budgetByn = 0;
      var budgetRange = text.match(/бюджет\w*[^0-9]{0,12}(\d{2,3})\s*[–\-—]\s*(\d{2,3})/i);
      var budgetOver = text.match(/бюджет\w*\s*(?:>|больше|от)\s*(\d{2,3})/i);
      var budgetM = text.match(/(?:бюджет\w*|не\s*дороже)\s*(\d{2,4})/i) ||
        text.match(/(\d{2,4})\s*(?:byn|бел\.?\s*руб|руб(?:лей|ля)?)/i) ||
        text.match(/до\s*(\d{2,4})\s*(?:byn|руб)/i);
      if (budgetRange) budgetByn = Math.round((Number(budgetRange[1]) + Number(budgetRange[2])) / 2);
      else if (budgetOver) budgetByn = Number(budgetOver[1]) + 10;
      else if (budgetM) budgetByn = Number(budgetM[1]) || 0;

      var monthlyLungG = 0;
      var lungUse = text.match(/(\d+(?:[.,]\d+)?)\s*(кг|г)\s+л[её]гк/i);
      if (lungUse) {
        var lungN = parseFloat(String(lungUse[1]).replace(",", "."));
        monthlyLungG = /кг/i.test(lungUse[2]) ? Math.round(lungN * 1000) : Math.round(lungN);
      }

      var rootPcs = 0;
      var rootFrac = "";
      var rootRange = text.match(/(\d+)\s*[–\-—]\s*(\d+)\s+мал[а-яё]*\s+быч/i);
      if (rootRange) {
        rootPcs = Math.round((Number(rootRange[1]) + Number(rootRange[2])) / 2);
        rootFrac = "МАЛ";
      }
      if (/мал[а-яё]*\s+быч|быч[а-яё]*[^.\n]{0,24}мал/i.test(text)) rootFrac = "МАЛ";
      if (!rootPcs) {
        var rootAfter = text.match(/быч[а-яё]*\s+корен[а-яё]*\s+(\d+)/i);
        var rootBefore = text.match(/(\d+)\s+(?:мал[а-яё]*\s+)?быч/i);
        if (rootAfter) rootPcs = Number(rootAfter[1]) || 0;
        else if (rootBefore) rootPcs = Number(rootBefore[1]) || 0;
      }

      var tried = [];
      var triedM = text.match(/давали\s+([^.\n]{2,80})/i);
      if (triedM) {
        skusInText_(triedM[1]).forEach(function (n) {
          if (tried.indexOf(n) < 0 && disliked.indexOf(n) < 0) tried.push(n);
        });
      }

      var weightKg = 0;
      var weightM = text.match(/(?:вес\w*|собак\w*)[^\d]{0,16}(\d+(?:[.,]\d+)?)\s*кг/i) ||
        text.match(/(\d+(?:[.,]\d+)?)\s*кг/i);
      if (weightM) {
        var kg = parseFloat(String(weightM[1]).replace(",", "."));
        if (kg >= 1 && kg <= 80) weightKg = kg;
      }

      var ageMonths = 0;
      var ageM = text.match(/(\d+)\s*мес/i);
      if (ageM) ageMonths = Number(ageM[1]) || 0;
      var puppy = /щенок/i.test(text) || (ageMonths > 0 && ageMonths < 12 && !(weightKg >= 10));
      if (/ломтик[а-яё]*\s+убрал|убрал[а-яё]*\s+ломтик/i.test(text)) {
        qty = "high";
        if (!fracPref) fracPref = "средн";
      }

      var deliveriesN = 0;
      var delM = text.match(/(\d+)\s*доставк/i);
      if (delM) deliveriesN = Math.max(1, Math.min(8, Number(delM[1]) || 1));

      var petName = "";
      var petM = text.match(/(?:питомец|кличка)\s+([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]{1,24})/i);
      if (petM) petName = petM[1];

      var budget = pricePickParseBudget_(text);
      if (budget && !budgetByn) budgetByn = budget.mid;

      var outSig = {
        liked: liked,
        disliked: disliked,
        must: must,
        tried: tried,
        mentioned: mentioned,
        qty: qty,
        fracPref: fracPref,
        dogs: dogs,
        budgetByn: budgetByn,
        weightKg: weightKg,
        puppy: puppy,
        ageMonths: ageMonths,
        monthlyLungG: monthlyLungG,
        rootPcs: rootPcs,
        rootFrac: rootFrac,
        deliveriesN: deliveriesN,
        familyNotes: familyNotes,
        lineItems: parsedLines.items || [],
        noteBits: noteBits,
        petName: petName,
        budget: budget,
        rawLen: text.length
      };
      try { outSig.profile = pricePickDogProfile_(text, outSig); } catch (eProf) { outSig.profile = {}; }
      return outSig;
    }

    function pricePickItemFromSku_(skuName, gramsOrPcs, fracPref) {
      var known = buildIgKnownMap();
      var up = String(skuName || "").toUpperCase();
      var hit = known[up] || known[igAliasResolve(up)];
      if (!hit) return null;
      var piece = hit.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(hit.name));
      var val = gramsOrPcs;
      if (!(val > 0)) val = piece ? 1 : 80;
      var sub = pricePickDefaultFrac_(hit.cat, hit.name, fracPref);
      return {
        cat: hit.cat,
        main: hit.name,
        name: hit.name,
        sub: sub,
        value: val,
        val: val,
        needFrac: false
      };
    }

    function pricePickScaleItems_(items, scale, opts) {
      opts = opts || {};
      var out = [];
      (items || []).forEach(function (it) {
        if (!it) return;
        var copy = Object.assign({}, it);
        var piece = copy.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(copy.main || copy.name));
        var v = Number(copy.value != null ? copy.value : copy.val) || 0;
        if (piece) {
          var pcs = Math.max(1, Math.round(v * (opts.pieceScale != null ? opts.pieceScale : (scale >= 1 ? 1 : scale))));
          if (opts.boostChew) pcs = Math.max(pcs, pcs + 1);
          copy.value = pcs;
          copy.val = pcs;
        } else {
          var g = Math.max(20, Math.round((v * scale) / 5) * 5);
          copy.value = g;
          copy.val = g;
        }
        if (opts.fracPref && copy.cat === "dressura") {
          var nf = pricePickDefaultFrac_(copy.cat, copy.main, opts.fracPref);
          if (nf) copy.sub = nf;
        }
        out.push(copy);
      });
      return out;
    }

    function pricePickExcludeNames_(items, names) {
      var ban = {};
      (names || []).forEach(function (n) { ban[String(n).toUpperCase()] = true; });
      return (items || []).filter(function (it) {
        var key = String(it.main || it.name || "").toUpperCase();
        return !ban[key];
      });
    }

    function pricePickBoostLiked_(items, liked, fracPref) {
      var have = {};
      (items || []).forEach(function (it) {
        have[String(it.main || it.name || "").toUpperCase()] = true;
      });
      var out = (items || []).slice();
      (liked || []).forEach(function (name) {
        var up = String(name).toUpperCase();
        if (have[up]) {
          out = out.map(function (it) {
            if (String(it.main || it.name || "").toUpperCase() !== up) return it;
            var piece = it.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(it.main));
            var v = Number(it.value != null ? it.value : it.val) || 0;
            var nv = piece ? v + 1 : Math.round((v * 1.2) / 5) * 5;
            return Object.assign({}, it, { value: nv, val: nv });
          });
        } else {
          var add = pricePickItemFromSku_(name, null, fracPref);
          if (add) {
            out.push(add);
            have[up] = true;
          }
        }
      });
      return out;
    }

    function pricePickTargetScale_(target, signals) {
      var kind = target === "bp1" ? 0.7 : (target === "bp2" ? 1.15 : 1);
      var qty = signals.qty === "low" ? 1.15 : (signals.qty === "high" ? 0.9 : 1);
      var w = 1;
      if (signals.weightKg > 0) w = Math.max(0.55, Math.min(1.6, signals.weightKg / 12));
      var b = 1;
      if (signals.budgetByn > 0) {
        if (signals.budgetByn < 50) b = 0.6;
        else if (signals.budgetByn < 80) b = 0.8;
        else if (signals.budgetByn < 130) b = 1;
        else if (signals.budgetByn < 200) b = 1.15;
        else b = 1.3;
      }
      return kind * qty * w * b;
    }

    function pricePickSwapForBp2_(items, disliked, fracPref) {
      if (!disliked || !disliked.length) return items;
      var subs = ["ПОЧКИ", "БАРАНЬЕ ЛЁГКОЕ", "СЕРДЦЕ", "ТРАХЕЯ"];
      var have = {};
      (items || []).forEach(function (it) {
        have[String(it.main || it.name || "").toUpperCase()] = true;
      });
      var ban = {};
      disliked.forEach(function (n) { ban[String(n).toUpperCase()] = true; });
      var out = (items || []).slice();
      for (var i = 0; i < subs.length; i++) {
        var up = subs[i].toUpperCase();
        if (have[up] || ban[up]) continue;
        var add = pricePickItemFromSku_(subs[i], null, fracPref);
        if (add) {
          out.push(add);
          break;
        }
      }
      return out;
    }

    function pricePickOrderSections_(items) {
      var order = { dressura: 0, chew: 1, veg: 2, other: 3, crumb: 4 };
      return (items || []).slice().sort(function (a, b) {
        return (order[a.cat] != null ? order[a.cat] : 9) - (order[b.cat] != null ? order[b.cat] : 9);
      });
    }

    function pricePickBanned_(signals) {
      var ban = {};
      (signals.disliked || []).forEach(function (n) { ban[String(n).toUpperCase()] = true; });
      return ban;
    }

    function pricePickPushSku_(list, name, grams, fracPref, fracOverride) {
      if (!name || !(grams > 0)) return;
      var it = pricePickItemFromSku_(name, grams, fracPref);
      if (!it) return;
      it.value = grams;
      it.val = grams;
      if (fracOverride) it.sub = fracOverride;
      list.push(it);
    }

    function pricePickLungAnchor_(signals, target) {
      var lung = 40;
      var kg = signals.weightKg || 0;
      var budget = signals.budgetByn || 0;
      if (signals.puppy) lung = 15;
      else if (kg >= 7 && kg < 16) lung = 50;
      if (budget > 120) lung = Math.max(lung, 70);
      if (budget > 0 && budget < 45) lung = Math.min(lung, 30);
      if (signals.monthlyLungG > 0) {
        var fromUse = pricePickRound5_(signals.monthlyLungG / 10, 15);
        if (fromUse > 80) fromUse = 80;
        lung = target === "bp1" ? pricePickRound5_(fromUse / 1.3, 15) : fromUse;
      }
      var trial = target === "bp1" || target === "bp2";
      if (target === "bp2") {
        if (signals.qty === "high") lung = Math.max(10, lung - 5);
        else if (!(signals.monthlyLungG > 0)) lung = pricePickRound5_(lung * 1.5, 10);
      }
      if (!trial) {
        if (signals.monthlyLungG > 0) lung = Math.min(350, signals.monthlyLungG);
        else if (budget > 0 && budget < 45) lung = 30;
        else if (budget > 120) lung = Math.max(250, pricePickRound5_(kg > 0 ? kg * 12 : 250, 80));
        else if (budget >= 45 && budget <= 90) lung = Math.max(80, Math.min(180, lung));
        else lung = pricePickRound5_(kg > 0 ? Math.min(300, kg * 10) : 150, 30);
        if (target === "retail" && budget >= 80 && lung < 250) lung = 300;
      }
      return pricePickRound5_(lung, 10);
    }

    function pricePickOfferLines_(signals, target) {
      var ban = pricePickBanned_(signals);
      var list = [];
      var trial = target === "bp1" || target === "bp2";
      var lung = pricePickLungAnchor_(signals, target);
      var frac = signals.fracPref || "";
      function allow(name) { return !ban[String(name).toUpperCase()]; }
      function has(name) {
        var up = String(name).toUpperCase();
        return list.some(function (it) { return String(it.main || it.name).toUpperCase() === up; });
      }

      if (allow("ЛЁГКОЕ")) pricePickPushSku_(list, "ЛЁГКОЕ", lung, frac);
      var heartG = trial
        ? pricePickRound5_(lung * (target === "bp2" ? 0.3 : 0.4), 5)
        : pricePickRound5_(lung * 0.32, 10);
      if (signals.puppy && trial && lung <= 20) heartG = Math.max(heartG, 10);
      if (allow("СЕРДЦЕ") && !(target === "bp2" && signals.puppy && signals.qty === "high")) {
        pricePickPushSku_(list, "СЕРДЦЕ", heartG, frac);
      }
      var sideName = "РУБЕЦ Т";
      if (!allow(sideName) || (target === "bp2" && (signals.liked || []).indexOf("РУБЕЦ Т") < 0)) sideName = "ПОЧКИ";
      if (signals.puppy && trial) sideName = "";
      if (sideName && allow(sideName)) {
        var sideG = trial ? pricePickRound5_(lung * 0.25, 5) : pricePickRound5_(lung * 0.16, 10);
        if (target === "bp2" && sideName === "ПОЧКИ") sideG = Math.max(sideG, 15);
        pricePickPushSku_(list, sideName, sideG, frac);
      }

      var chewCap = trial ? (target === "bp2" ? 3 : 2) : 3;
      var chewWant = [];
      function wantChew(name) {
        if (!name || !allow(name) || chewWant.indexOf(name) >= 0) return;
        chewWant.push(name);
      }
      (signals.must || []).forEach(wantChew);
      (signals.liked || []).forEach(wantChew);
      if (signals.rootPcs) wantChew("БЫЧИЙ КОРЕНЬ");
      if (target === "bp2") (signals.tried || []).forEach(wantChew);
      var chewDefaults = signals.puppy
        ? ["ТРАХЕЯ", "СТАНОВАЯ ЖИЛА", "ЛОП ХРЯЩ ШТ.", "АОРТА", "УХО Г", "НОСЫ ШТ.", "БЫЧИЙ КОРЕНЬ"]
        : ["ЛОП ХРЯЩ ШТ.", "АОРТА", "ТРАХЕЯ", "СТАНОВАЯ ЖИЛА", "УХО Г", "НОСЫ ШТ.", "БЫЧИЙ КОРЕНЬ"];
      chewDefaults.forEach(wantChew);
      var chewN = 0;
      chewWant.forEach(function (name) {
        if (chewN >= chewCap || has(name)) return;
        var known = buildIgKnownMap();
        var hit = known[String(name).toUpperCase()] || known[igAliasResolve(name)];
        if (!hit || (hit.cat !== "chew" && hit.cat !== "other")) return;
        if (hit.cat === "other") return;
        var pcs = 1;
        var sub = "";
        if (name === "СТАНОВАЯ ЖИЛА") pcs = target === "bp2" ? 4 : 2;
        if (name === "БЫЧИЙ КОРЕНЬ") {
          sub = signals.rootFrac || "";
          if (!trial) pcs = signals.rootPcs ? Math.max(1, Math.min(8, signals.rootPcs)) : (signals.budgetByn > 100 ? 4 : 2);
          else pcs = 1;
        }
        if (name === "ТРАХЕЯ" && target === "bp1" && signals.puppy) pcs = 2;
        pricePickPushSku_(list, name, pcs, frac, sub);
        chewN++;
      });

      var vegG = trial ? ((signals.puppy || lung <= 40) ? 5 : 10) : (lung >= 200 ? 100 : (signals.budgetByn > 0 && signals.budgetByn < 45 ? 10 : 40));
      if (target === "bp2" && signals.puppy) vegG = vegG * 2;
      var vegNames = signals.puppy ? ["ЯБЛОКИ", "ТЫКВА"] : ["ТЫКВА", "БАТАТ"];
      if (target === "bp2" && !signals.puppy) vegNames = ["ТЫКВА", "БАНАНЫ"];
      (signals.liked || []).forEach(function (n) {
        var hit = buildIgKnownMap()[String(n).toUpperCase()];
        if (hit && hit.cat === "veg" && vegNames.indexOf(hit.name) < 0) vegNames.unshift(hit.name);
      });
      var vegAdded = 0;
      vegNames.forEach(function (name) {
        if (vegAdded >= 2 || !allow(name) || has(name)) return;
        pricePickPushSku_(list, name, vegG, "");
        vegAdded++;
      });

      ["ВЫМЯ", "СЕМЕННИКИ"].forEach(function (name) {
        var liked = (signals.liked || []).indexOf(name) >= 0 || (signals.must || []).indexOf(name) >= 0;
        if (!liked || !allow(name) || has(name)) return;
        pricePickPushSku_(list, name, trial ? 10 : 20, frac);
      });

      return pricePickOrderSections_(list).filter(function (it) {
        return it && (it.main || it.name) && (Number(it.value) > 0);
      });
    }

    function pricePickCatalogLines_(lines) {
      var known = buildIgKnownMap();
      var out = [];
      (lines || []).forEach(function (it) {
        if (!it) return;
        var up = pricePickNormUp_(it.main || it.name);
        if (!up || /БЮДЖЕТ|РАСХОД|ПОРОД|ВОЗРАСТ|КЛИЧК|ВЕС\b/.test(up)) return;
        var hit = known[up] || known[igAliasResolve(up)];
        if (!hit) return;
        var v = Number(it.value != null ? it.value : it.val) || 0;
        if (!(v > 0)) return;
        var piece = hit.cat === "chew";
        if (piece && v > 40) return;
        if (!piece && v > 2000) return;
        var copy = Object.assign({}, it);
        copy.cat = hit.cat;
        copy.main = hit.name;
        copy.name = hit.name;
        copy.value = v;
        copy.val = v;
        out.push(copy);
      });
      return out;
    }

    function pricePickFlags_(signals) {
      var s = signals || {};
      var fam = s.familyNotes || [];
      var liked = (s.liked || []).concat(s.must || []);
      var hate = s.disliked || [];
      function has(name) { return liked.indexOf(name) >= 0; }
      return {
        weightKg: Number(s.weightKg) || 0,
        puppy: !!s.puppy,
        noChicken: fam.indexOf("курица") >= 0 || fam.indexOf("птица") >= 0 || hate.indexOf("УХО К") >= 0,
        noFish: fam.indexOf("рыба") >= 0,
        likeLung: has("ЛЁГКОЕ"),
        likeRoot: has("БЫЧИЙ КОРЕНЬ"),
        hateTrachea: hate.indexOf("ТРАХЕЯ") >= 0
      };
    }

    function pricePickExampleScore_(ex, flags) {
      if (!ex || !flags) return 0;
      var sc = 0;
      function bit(a, b, w) {
        var left = !!a;
        var right = !!b;
        if (!left && !right) return;
        sc += (left === right) ? w : -w;
      }
      bit(flags.noChicken, ex.noChicken, 3);
      bit(flags.noFish, ex.noFish, 3);
      bit(flags.likeLung, ex.likeLung, 2);
      bit(flags.likeRoot, ex.likeRoot, 2);
      bit(flags.puppy, ex.puppy, 3);
      bit(flags.hateTrachea, ex.hateTrachea, 2);
      var kg = Number(flags.weightKg) || 0;
      var exKg = Number(ex.weightKg) || 0;
      if (kg && exKg) {
        var ratio = kg / exKg;
        if (ratio >= 0.8 && ratio <= 1.25) sc += 4;
        else if (ratio >= 0.55 && ratio <= 1.6) sc += 1;
        else sc -= 3;
      }
      return sc;
    }

    function pricePickCanonExamples_() {
      function row(cat, main, value, sub) {
        return { cat: cat, main: main, name: main, sub: sub || "", value: value, val: value };
      }
      return [
        {
          id: "canon-jay-bp1",
          source: "direct",
          target: "bp1",
          weightKg: 35,
          puppy: false,
          noChicken: false,
          noFish: true,
          likeLung: true,
          likeRoot: false,
          hateTrachea: true,
          anketaText: "Выжла 35 кг, нужно лёгкое, не трахея, аллергия на рыбу, бюджет 50–80, мелкие кубики.",
          items: [
            row("dressura", "ЛЁГКОЕ", 40, "Мелкое"),
            row("dressura", "СЕРДЦЕ", 15, "Мелкое"),
            row("dressura", "РУБЕЦ Т", 10, "Мелкое"),
            row("chew", "ЛОП ХРЯЩ шт.", 1, ""),
            row("chew", "АОРТА", 1, ""),
            row("veg", "ТЫКВА", 5, ""),
            row("veg", "БАТАТ", 5, "")
          ]
        },
        {
          id: "canon-jay-bp2",
          source: "direct",
          target: "bp2",
          weightKg: 35,
          puppy: false,
          noChicken: false,
          noFish: true,
          likeLung: true,
          likeRoot: false,
          hateTrachea: true,
          anketaText: "Выжла 35 кг, вторая коробка: лёгкое, почки, корень, тыква и банан.",
          items: [
            row("dressura", "ЛЁГКОЕ", 60, "Мелкое"),
            row("dressura", "ПОЧКИ", 15, "Мелкое"),
            row("chew", "БЫЧИЙ КОРЕНЬ", 1, "СРЕД"),
            row("veg", "ТЫКВА", 10, ""),
            row("veg", "БАНАНЫ", 10, "")
          ]
        },
        {
          id: "canon-twix-bp1",
          source: "direct",
          target: "bp1",
          weightKg: 11,
          puppy: false,
          noChicken: true,
          noFish: false,
          likeLung: true,
          likeRoot: false,
          hateTrachea: false,
          anketaText: "Беспородная 9 мес 11 кг, любит лёгкое и трахею, аллергия на курицу.",
          items: [
            row("dressura", "ЛЁГКОЕ", 50, "Среднее"),
            row("dressura", "СЕРДЦЕ", 20, "Среднее"),
            row("dressura", "РУБЕЦ Т", 15, "Среднее"),
            row("chew", "ТРАХЕЯ", 1, ""),
            row("chew", "ЛОП ХРЯЩ шт.", 1, ""),
            row("veg", "ТЫКВА", 10, ""),
            row("veg", "БАТАТ", 10, "")
          ]
        },
        {
          id: "canon-twix-bp2",
          source: "direct",
          target: "bp2",
          weightKg: 11,
          puppy: false,
          noChicken: true,
          noFish: false,
          likeLung: true,
          likeRoot: false,
          hateTrachea: false,
          anketaText: "Беспородная 11 кг, вторая коробка, без курицы, больше лёгкого.",
          items: [
            row("dressura", "ЛЁГКОЕ", 75, "Среднее"),
            row("dressura", "СЕРДЦЕ", 25, "Среднее"),
            row("dressura", "ПОЧКИ", 20, "Среднее"),
            row("chew", "ТРАХЕЯ", 1, ""),
            row("chew", "СТАНОВАЯ ЖИЛА", 4, ""),
            row("chew", "ЛОП ХРЯЩ шт.", 1, ""),
            row("veg", "ЯБЛОКИ", 10, ""),
            row("veg", "МОРКОВЬ", 10, "")
          ]
        },
        {
          id: "canon-cheddar-bp2",
          source: "direct",
          target: "bp2",
          weightKg: 8.3,
          puppy: false,
          noChicken: true,
          noFish: false,
          likeLung: true,
          likeRoot: true,
          hateTrachea: false,
          anketaText: "Такса 8.3 кг, нужны корень и лёгкое, не рубец, без курицы и птицы, малые корни, 700 г лёгкого.",
          items: [
            row("dressura", "ЛЁГКОЕ", 70, "Среднее"),
            row("dressura", "СЕРДЦЕ", 20, "Ломтики"),
            row("dressura", "ПОЧКИ", 20, "Ломтики"),
            row("chew", "ЛОП ХРЯЩ шт.", 1, ""),
            row("chew", "БЫЧИЙ КОРЕНЬ", 1, "МАЛ"),
            row("other", "ВЫМЯ", 10, ""),
            row("other", "СЕМЕННИКИ", 10, "")
          ]
        },
        {
          id: "canon-cheddar-pp",
          source: "direct",
          target: "pp",
          weightKg: 8.3,
          puppy: false,
          noChicken: true,
          noFish: false,
          likeLung: true,
          likeRoot: true,
          hateTrachea: false,
          anketaText: "Такса, подписка: лёгкое по расходу и малый бычий корень.",
          items: [
            row("dressura", "ЛЁГКОЕ", 350, "Среднее"),
            row("dressura", "СЕРДЦЕ", 80, "Ломтики"),
            row("chew", "БЫЧИЙ КОРЕНЬ", 8, "МАЛ"),
            row("other", "ВЫМЯ", 20, "")
          ]
        },
        {
          id: "canon-luntik-bp1",
          source: "direct",
          target: "bp1",
          weightKg: 0,
          puppy: true,
          noChicken: false,
          noFish: false,
          likeLung: false,
          likeRoot: false,
          hateTrachea: false,
          anketaText: "Щенок около 6 месяцев, первая пробная коробка.",
          items: [
            row("dressura", "ЛЁГКОЕ", 15, "Среднее"),
            row("dressura", "СЕРДЦЕ", 10, "Среднее"),
            row("chew", "ТРАХЕЯ", 2, ""),
            row("chew", "СТАНОВАЯ ЖИЛА", 2, ""),
            row("veg", "ЯБЛОКИ", 5, ""),
            row("veg", "ТЫКВА", 5, "")
          ]
        }
      ];
    }

    function pricePickReadStoredExamples_() {
      try {
        if (typeof localStorage === "undefined") return [];
        var raw = localStorage.getItem(PRICE_PICK_EX_KEY_);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch (eRead) {
        return [];
      }
    }

    function pricePickWriteStoredExamples_(list) {
      var slim = (list || []).slice(0, 40);
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem(PRICE_PICK_EX_KEY_, JSON.stringify(slim));
      } catch (eLs) {}
      try {
        if (window.BoinyaCIdb && typeof window.BoinyaCIdb.setMeta === "function") {
          window.BoinyaCIdb.setMeta(PRICE_PICK_EX_KEY_, slim);
        }
      } catch (eIdb) {}
      return slim;
    }

    function pricePickFindExample_(signals, target) {
      var flags = pricePickFlags_(signals);
      var best = null;
      var bestScore = 7;
      function consider(ex) {
        if (!ex || ex.target !== target || !ex.items || !ex.items.length) return;
        var sc = pricePickExampleScore_(ex, flags);
        if (sc > bestScore) {
          bestScore = sc;
          best = ex;
        }
      }
      pricePickReadStoredExamples_().forEach(consider);
      pricePickCanonExamples_().forEach(consider);
      return best;
    }

    function pricePickFromExample_(ex, signals, target) {
      var list = (ex.items || []).map(function (it) {
        var copy = Object.assign({}, it);
        var v = Number(copy.value != null ? copy.value : copy.val) || 0;
        copy.value = v;
        copy.val = v;
        copy.main = copy.main || copy.name;
        copy.name = copy.main;
        return copy;
      });
      list = pricePickExcludeNames_(list, signals.disliked);
      var have = {};
      list.forEach(function (it) {
        have[String(it.main || it.name || "").toUpperCase()] = true;
      });
      var offer = pricePickOfferLines_(signals, target);
      (signals.must || []).concat(signals.liked || []).forEach(function (name) {
        var up = String(name || "").toUpperCase();
        if (!up || have[up]) return;
        var fromOffer = null;
        for (var i = 0; i < offer.length; i++) {
          if (String(offer[i].main || offer[i].name || "").toUpperCase() === up) {
            fromOffer = offer[i];
            break;
          }
        }
        var add = fromOffer
          ? Object.assign({}, fromOffer)
          : pricePickItemFromSku_(name, null, signals.fracPref);
        if (!add) return;
        list.push(add);
        have[up] = true;
      });
      if (signals.weightKg && ex.weightKg) {
        var ratio = signals.weightKg / ex.weightKg;
        if (ratio < 0.8 || ratio > 1.25) {
          list = pricePickScaleItems_(list, Math.max(0.55, Math.min(1.8, ratio)), { fracPref: signals.fracPref });
        }
      }
      list = pricePickOrderSections_(list).filter(function (it) {
        return it && (it.main || it.name) && (Number(it.value) > 0);
      });
      if (list.length < 3) return null;
      return list;
    }

    function pricePickComposeForTarget_(signals, target) {
      signals = signals || {};
      target = priceModeKey(target);
      var catalogLines = pricePickCatalogLines_(signals.lineItems || []);
      var explicit = catalogLines.length >= 2;
      var list = null;
      var exampleNote = "";
      var exampleId = "";
      if (explicit) {
        list = catalogLines.map(function (it) {
          var copy = Object.assign({}, it);
          if (!copy.sub && copy.cat !== "veg") {
            copy.sub = pricePickDefaultFrac_(copy.cat, copy.main || copy.name, signals.fracPref);
          }
          copy.needFrac = false;
          copy.fromLine = true;
          return copy;
        });
        list = pricePickExcludeNames_(list, signals.disliked);
        list = pricePickOrderSections_(list).filter(function (it) {
          return it && (it.main || it.name) && (Number(it.value) > 0 || Number(it.val) > 0);
        });
        if (list.length < 2) explicit = false;
      }
      if (!explicit) {
        var ex = pricePickFindExample_(signals, target);
        var fromEx = ex ? pricePickFromExample_(ex, signals, target) : null;
        if (fromEx && fromEx.length) {
          list = fromEx;
          exampleId = ex.id || "";
          exampleNote = ex.source === "manager"
            ? "За основу — сохранённый подбор."
            : "За основу — похожий пример из Direct.";
        } else {
          list = pricePickOfferLines_(signals, target);
        }
      }
      if (!explicit && (!list || list.length < 3)) {
        var offer = pricePickOfferLines_(signals, target);
        if (!list || offer.length > list.length) list = offer;
      }
      if (!list || !list.length) {
        list = pricePickExcludeNames_(pricePickDefaultStarter_(), signals.disliked || []);
      }
      var sparse = !explicit && !exampleId &&
        !(signals.liked && signals.liked.length) &&
        !(signals.must && signals.must.length) &&
        !(signals.mentioned && signals.mentioned.length);
      return {
        target: target,
        items: list || [],
        signals: signals,
        usedDefault: !!sparse,
        exampleNote: exampleNote,
        exampleId: exampleId
      };
    }

    function pricePickSkuTitle_(name) {
      var n = String(name || "");
      var map = {
        "ЛЁГКОЕ": "Лёгкое",
        "СЕРДЦЕ": "Сердце",
        "РУБЕЦ Т": "Рубец",
        "ПОЧКИ": "Почки",
        "БАРАНЬЕ ЛЁГКОЕ": "Баранье лёгкое",
        "БЫЧИЙ КОРЕНЬ": "Бычий корень",
        "ТРАХЕЯ": "Трахея",
        "АОРТА": "Аорта",
        "УХО Г": "Говяжье ухо",
        "УХО К": "Куриное ухо",
        "НОСЫ шт.": "Носик",
        "СТАНОВАЯ ЖИЛА": "Становая жила",
        "ЛОП ХРЯЩ шт.": "Лопаточный хрящ",
        "ПЕРЕПЁЛКИ шт.": "Перепёлка",
        "УТИНЫЕ ШЕИ шт.": "Утиная шея",
        "КОЛЕНИ шт.": "Колено",
        "ГУБЫ шт.": "Губы",
        "ТЫКВА": "Тыква",
        "БАТАТ": "Батат",
        "ЯБЛОКИ": "Яблоки",
        "МОРКОВЬ": "Морковь",
        "БАНАНЫ": "Банан",
        "КАБАЧОК": "Кабачок",
        "ВЫМЯ": "Вымя",
        "СЕМЕННИКИ": "Семенники",
        "ИНДЕЙКА": "Индейка",
        "ПЕЧЕНЬ": "Печень"
      };
      return map[n] || map[n.toUpperCase()] || n;
    }

    function pricePickParseBudgetSeg_(seg) {
      var s = String(seg || "").replace(/\s+/g, " ").trim();
      if (!s) return null;
      var m;
      if ((m = s.match(/(\d{2,4})\s*(?:[–\-—]|до|\s)\s*(\d{2,4})/i)) && Number(m[2]) > Number(m[1])) {
        return { min: Number(m[1]), max: Number(m[2]), mid: Math.round((Number(m[1]) + Number(m[2])) / 2), kind: "range" };
      }
      if ((m = s.match(/(?:до|не\s*дороже|не\s*больше|максимум)\s*(\d{2,4})/i))) {
        var up = Number(m[1]);
        return { min: Math.round(up * 0.7), max: up, mid: Math.round(up * 0.85), kind: "upto" };
      }
      if ((m = s.match(/(?:более|больше|от|свыше|>)\s*(\d{2,4})/i))) {
        var lo = Number(m[1]);
        return { min: lo, max: Math.round(lo * 1.3), mid: Math.round(lo * 1.15), kind: "over" };
      }
      if ((m = s.match(/(?:около|примерно|где-?то|~)\s*(\d{2,4})/i))) {
        var ab = Number(m[1]);
        return { min: Math.round(ab * 0.85), max: Math.round(ab * 1.1), mid: ab, kind: "about" };
      }
      if ((m = s.match(/(\d{2,4})/))) {
        var one = Number(m[1]);
        if (one < 15) return null;
        return { min: Math.round(one * 0.8), max: one, mid: Math.round(one * 0.9), kind: "single" };
      }
      return null;
    }

    function pricePickParseBudget_(raw) {
      var lines = String(raw || "").replace(/\r/g, "\n").split(/\n+/);
      var cur = "(?:byn|бел\\.?\\s*руб[а-яё]*\\.?|руб[а-яё]*\\.?|р\\.?(?![а-яё]))";
      var per = "(?:\\s*(?:\\/|в|за)\\s*мес[а-яё]*\\.?|\\s*ежемесячно)";
      var money = new RegExp("byn|бел\\.?\\s*руб|(?:^|[^а-яё])руб(?:л[а-яё]*|\\.)?(?![а-яё])|\\d\\s*р\\.?(?![а-яё])|\\d" + per, "i");
      var weight = /\d\s*(?:г|гр|кг|шт|км|мл|л)(?![а-яё])/i;
      var bare = new RegExp("^\\s*(?:до|около|примерно|от|более|больше|~)?\\s*\\d{2,3}(?:\\s*(?:[–\\-—]|до|\\s)\\s*\\d{2,3})?\\s*" + cur + "?" + per + "?\\s*[.!]?\\s*$", "i");
      var strip = function (l) { return String(l || "").replace(/^\s*\d{1,2}\s*[.)]\s*/, ""); };
      var i, hit;
      for (i = 0; i < lines.length; i++) {
        if (/бюджет/i.test(lines[i])) {
          hit = pricePickParseBudgetSeg_(String(lines[i]).replace(/^[\s\S]*?бюджет[а-яё]*/i, "").replace(/(?:^|\s)10\s*[.)]/, ""));
          if (hit) return hit;
          /* вопрос «Бюджет в месяц?» — ответ на следующей строке */
          if (i + 1 < lines.length && bare.test(strip(lines[i + 1]))) {
            hit = pricePickParseBudgetSeg_(strip(lines[i + 1]));
            if (hit) return hit;
          }
        }
      }
      for (i = 0; i < lines.length; i++) {
        var l2 = String(lines[i] || "");
        var body = strip(l2);
        if (/^\s*10\s*[.)]/.test(l2) && bare.test(body)) {
          hit = pricePickParseBudgetSeg_(body);
          if (hit) return hit;
        }
      }
      for (i = 0; i < lines.length; i++) {
        var l3 = strip(lines[i]);
        if (money.test(l3) && !weight.test(l3)) {
          hit = pricePickParseBudgetSeg_(l3);
          if (hit) return hit;
        }
      }
      return null;
    }

    function pricePickDogProfile_(raw, signals) {
      signals = signals || {};
      var text = String(raw || "").replace(/\r/g, "\n");
      var low = text.toLowerCase().replace(/ё/g, "е");
      var p = {};
      var nameM = text.match(/(?:питом[а-яёa-z]*|собак[а-яёa-z]*|пс[аы]|щен[а-яёa-z]*|кличк[а-яёa-z]*)\s*(?:[—:\-]\s*)?(?:зовут\s+)?([А-ЯЁA-Z][а-яёa-z\-]{1,20})/);
      var stopName = /^(Зовут|Порода|Возраст|Вес|Такса|Выжла|Корги|Шпиц|Лабрадор|Метис|Беспородн[а-яёa-z]*|Да|Нет)$/;
      if (nameM && !stopName.test(nameM[1])) p.name = nameM[1];
      else if (signals.petName && /^[А-ЯЁA-Z]/.test(signals.petName)) p.name = signals.petName;

      var item2 = text.match(/(?:^|\n)\s*2\s*[.)]\s*([^\n]+)/);
      var breedSrc = item2 ? item2[1] : "";
      if (!breedSrc) {
        var lnB = text.split(/\n+/).filter(function (l) { return /(\d+\s*(?:лет|год|мес))|(\d+\s*кг)/i.test(l); })[0];
        breedSrc = lnB || "";
      }
      if (breedSrc) {
        var chunk = String(breedSrc).split(/[,;]/)[0].trim();
        if (chunk && !/\d/.test(chunk) && chunk.length <= 40 && /^[А-Яа-яЁё\s\-]+$/.test(chunk) &&
          !/порода|возраст|вес/i.test(chunk)) {
          p.breed = chunk.charAt(0).toLowerCase() + chunk.slice(1);
        }
      }
      var yM = text.match(/(\d+(?:[.,]5)?)\s*(год|года|лет)(?![а-яё])/i);
      if (yM) {
        var yn = parseFloat(String(yM[1]).replace(",", "."));
        var yw = (yn % 1) ? "года" : (yn % 10 === 1 && yn % 100 !== 11 ? "год" :
          ((yn % 10 >= 2 && yn % 10 <= 4 && (yn % 100 < 10 || yn % 100 >= 20)) ? "года" : "лет"));
        p.age = String(yM[1]).replace(".", ",") + " " + yw;
        p.years = yn;
      } else if (signals.ageMonths) {
        var mn = signals.ageMonths;
        var mw = (mn % 10 === 1 && mn % 100 !== 11) ? "месяц" :
          ((mn % 10 >= 2 && mn % 10 <= 4 && (mn % 100 < 10 || mn % 100 >= 20)) ? "месяца" : "месяцев");
        p.age = mn + " " + mw;
      }
      if (signals.weightKg) p.weight = String(signals.weightKg).replace(".", ",") + " кг";
      p.puppy = !!signals.puppy;
      p.senior = !!(p.years && p.years >= 8);
      p.small = !!(signals.weightKg && signals.weightKg < 10);
      p.large = !!(signals.weightKg && signals.weightKg >= 25);

      if (/очень\s+активн|гиперактивн|энергичн|бегаем|бега[ею]т|каникросс|аджилити|фризби|спорт/.test(low)) p.activity = "high";
      else if (/малоактивн|не\s+очень\s+активн|спокойн|ленив|домосед/.test(low)) p.activity = "calm";
      else if (/активн/.test(low)) p.activity = "active";

      var noTrain = /(?:не\s+занима[а-яёa-z]*|дрессировкой\s+не|не\s+дрессир|без\s+дрессир)/.test(low);
      if (!noTrain && /дрессир|тренир|окд|кинолог|занимаемся|аджилити|послушани/.test(low)) {
        p.training = true;
        var rM = text.match(/(\d{2})\s*\/\s*(\d{2})/);
        if (rM && Number(rM[1]) + Number(rM[2]) === 100) p.trainRatio = rM[1] + "/" + rM[2];
      }
      if (/чувствительн[а-яёa-z]*\s+(?:желуд|жкт|пищевар|живот)|(?:^|[^а-яё])жкт(?![а-яё])|слаб[а-яёa-z]*\s+желуд|расстройств[а-яёa-z]*\s+(?:желуд|стул)|понос|мягк[а-яёa-z]*\s+стул/.test(low)) p.stomach = true;
      if (/меняются\s+зубы|режутся\s+зубы|смен[а-яёa-z]*\s+зуб/.test(low)) p.teething = true;
      else if (/налет|зубн[а-яёa-z]*\s+камн|запах\s+изо\s+рта|дес(?:е|ё)н|дёсн|десн/.test(low)) p.teeth = true;
      if (/вс[её]\s+грыз|грыз[её]т|погрызть|пожевать|жевать\s+долго|надолго|мебель/.test(low)) p.chewer = true;
      if (/привередлив|избирательн|капризн|разборчив/.test(low)) p.fussy = true;
      p.allergy = (signals.familyNotes || []).slice();
      if (!p.allergy.length) {
        var alM = text.match(/аллерги[а-яёa-z]*\s+на\s+([А-Яа-яЁё]+(?:\s+и\s+[А-Яа-яЁё]+)?)/i);
        if (alM && !/нет/i.test(alM[1])) p.allergy.push(alM[1].toLowerCase());
      }
      return p;
    }

    function pricePickJoinRu_(arr) {
      arr = (arr || []).filter(Boolean);
      if (arr.length <= 1) return arr.join("");
      return arr.slice(0, -1).join(", ") + " и " + arr[arr.length - 1];
    }

    function pricePickAccRu_(s) {
      return String(s || "").split(" ").map(function (w) {
        if (/ая$/.test(w)) return w.replace(/ая$/, "ую");
        if (/яя$/.test(w)) return w.replace(/яя$/, "юю");
        if (/[^аеёиоуыэюя]а$/.test(w)) return w.replace(/а$/, "у");
        if (/я$/.test(w)) return w.replace(/я$/, "ю");
        return w;
      }).join(" ");
    }

    function pricePickOfferText_(signals, target, items) {
      signals = signals || {};
      var prof = signals.profile || {};
      items = items || [];
      var name = prof.name || "";
      var lower = function (n) { return pricePickSkuTitle_(n).toLowerCase(); };
      var boxWord = target === "bp2" ? "вторую пробную коробку"
        : (target === "bp1" ? "первую пробную коробку"
          : (target === "retail" ? "набор" : "набор на подписку"));
      var lines = [];
      lines.push("Спасибо за ответы! Очень рады знакомству" + (name ? " — привет, " + name + " 🐾" : " 🐾"));
      lines.push("Собрали " + boxWord + ":");
      lines.push("");
      var last = "";
      items.forEach(function (it) {
        var title = pricePickSectionTitle_(it.cat);
        if (title !== last) {
          if (last) lines.push("");
          lines.push(title);
          last = title;
        }
        var unit = it.cat === "chew" ? "шт" : "г";
        var sub = "";
        if (it.sub === "ПОЛОВИНКА") sub = " (пополам)";
        else if (it.sub) sub = " (" + String(it.sub).toLowerCase() + ")";
        var val = it.value != null ? it.value : it.val;
        lines.push(pricePickSkuTitle_(it.main || it.name) + " — " + val + " " + unit + sub);
      });

      var names = function (cat) {
        var out = [];
        items.forEach(function (it) {
          if (it && it.cat === cat) {
            var nm = lower(it.main || it.name);
            if (out.indexOf(nm) < 0) out.push(nm);
          }
        });
        return out;
      };
      var dress = names("dressura").slice(0, 2);
      var chews = names("chew").slice(0, 2);
      var liked = (signals.liked || []).filter(function (n) {
        return items.some(function (it) { return String(it.main || it.name).toUpperCase() === String(n).toUpperCase(); });
      }).map(lower);
      var said = [];

      // 1) исключения
      var excl = (prof.allergy || []).map(function (a) { return pricePickAccRu_(a); });
      (signals.disliked || []).forEach(function (n) {
        var up = String(n).toUpperCase();
        if ((prof.allergy || []).length && /^(УХО К|УТИНЫЕ ШЕИ|ПЕРЕПЁЛКИ|ИНДЕЙКА)/.test(up)) return;
        var t = pricePickAccRu_(lower(n));
        if (excl.indexOf(t) < 0) excl.push(t);
      });
      var cap = function (t) { return String(t).replace(/^./, function (c) { return c.toUpperCase(); }); };
      if (excl.length) {
        said.push(cap(pricePickJoinRu_(excl)) + " не кладём совсем, как вы и писали, — " +
          (prof.stomach ? "чтобы животику было спокойно." : "чтобы ничего не беспокоило."));
      }

      // 2) дрессура / щенок
      if (dress.length) {
        var dj = pricePickJoinRu_(dress);
        if (prof.training) {
          said.push("Для тренировок основа — " + dj + ": нежные и ароматные, их удобно быстро давать, так что заниматься будет вдвойне приятнее.");
        } else if (prof.puppy) {
          said.push("Для малыша взяли мягкое и мелкое — " + dj + " легко жевать, и можно баловать почаще.");
        } else {
          said.push(cap(dj) + " — нежирные и ароматные, их приятно давать часто.");
        }
      }

      // 3) жевалки / зубы
      if (chews.length) {
        var ch = pricePickJoinRu_(chews);
        if (prof.teething) said.push("Пока меняются зубки, " + ch + " помогут почесать дёсны — и будет чем заняться.");
        else if (prof.teeth) said.push("Для зубов — " + ch + ": грызть долго, и это помогает счищать налёт.");
        else if (prof.chewer) said.push("А для любителя погрызть — " + ch + ", будет чем заняться надолго.");
        else said.push("И жевалки — " + ch + ", чтобы было чем заняться.");
      }
      if (prof.stomach && !excl.length) said.push("Порции небольшие, начинаем мягко, чтобы животику было спокойно.");
      var likedRest2 = liked.filter(function (n) { return dress.indexOf(n) < 0 && chews.indexOf(n) < 0; });
      if (likedRest2.length) said.push("И, конечно, положили проверенный вкус — " + pricePickJoinRu_(likedRest2.slice(0, 2)) + ".");
      if (said.length) {
        lines.push("");
        lines.push(said.slice(0, 3).join(" "));
      }

      var waitLine = "Ждём отзыв — очень интересно, что " + (name || "ваш хвостик") + " оценит больше всего!";
      lines.push("");
      if (target === "bp1") {
        lines.push("Как вам такой состав? " + waitLine + " По реакции соберём вторую коробку.");
      } else if (target === "bp2") {
        lines.push("Смотрим, что закрепилось после первой коробки, и дальше подстроим. Как вам такой состав? " + waitLine);
      } else if (target === "retail") {
        lines.push("Как вам такой вариант? Если понравится, можно перейти на подписку с тем же составом. " + waitLine);
      } else {
        lines.push("Как вам такой состав? Цену пришлём отдельно. " + waitLine);
      }
      return lines.join("\n");
    }

    function pricePickMonthlyItems_(items) {
      return pricePickCloneItems_(items || []).map(function (it) {
        var v = (Number(it.value != null ? it.value : it.val) || 0) * PRICE_PICK_MONTH_WEEKS;
        it.value = v;
        it.val = v;
        return it;
      });
    }

    async function pricePickEstimateMonthly_(items) {
      var month = pricePickMonthlyItems_(items);
      var nDel = PRICE_PICK_MONTH_DELIVERIES;
      var retail = calcRetailBasketTotal(month, { deliveriesN: nDel });
      var monthly = 0, goods = NaN, fixed = NaN;
      var approx = false;
      var model = null;
      try {
        var slim = month.map(function (it) { return serializeBasketItem_(it); });
        var res = await fetchPpCalcPrice_(slim, {
          mode: "pp",
          deliveriesN: nDel,
          coef: getPricePpCoef(),
          scheme: pricePpScheme || defaultPpSchemeForNewLocal_(),
          forNew: 1,
          timeoutMs: 15000
        });
        if (res) {
          monthly = Number(raw26ApiFactPrice_(res)) || Number(res.factCost) || 0;
          fixed = (Number(res.deliveryByn) || 0) + (Number(res.packagesByn) || 0);
          goods = res.goodsByn != null ? Number(res.goodsByn) : monthly - fixed;
          if (monthly > 0) {
            var unit = {};
            (res.lines || []).forEach(function (L) {
              var lv = Number(L && (L.val != null ? L.val : L.value)) || 0;
              if (lv > 0) unit[String(L.name || L.main || "") + "|" + String(L.sub || "")] = (Number(L.cost) || 0) / lv;
            });
            model = {
              factBefore: Number(res.factBeforeCap) > 0 ? Number(res.factBeforeCap) : monthly,
              goodsBefore: Number(res.goodsBeforeCap) > 0 ? Number(res.goodsBeforeCap) : goods,
              coef: Number(res.coef) > 0 ? Number(res.coef) : getPricePpCoef(),
              unit: unit
            };
          }
        }
      } catch (eEst) { monthly = 0; }
      if (!(monthly > 0)) {
        monthly = Math.round((Number(retail.total) || 0) * 0.92 * 100) / 100;
        fixed = (typeof PP_RAW26_DELIVERY_PER === "number" ? PP_RAW26_DELIVERY_PER : 9) * nDel;
        goods = Math.max(0, monthly - fixed);
        approx = true;
      }
      monthly = capOfferSubToDisplayedRetail_(monthly, retail.total) || monthly;
      if (!isFinite(goods)) goods = Math.max(0, monthly - (fixed || 0));
      if (!isFinite(fixed)) fixed = Math.max(0, monthly - goods);
      return {
        monthly: Math.round(monthly * 100) / 100,
        goods: Math.round(Math.max(0, goods) * 100) / 100,
        fixed: Math.round(Math.max(0, fixed) * 100) / 100,
        retailMonthly: Number(retail.total) || 0,
        deliveriesN: nDel,
        basis: "ПП",
        approx: approx,
        model: approx ? null : model
      };
    }

    function pricePickTrimKey_(it) {
      return String((it && (it.main || it.name)) || "") + "|" + String((it && it.sub) || "");
    }

    function pricePickIsPieceItem_(it) {
      return !!it && (it.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(it.main || it.name)));
    }

    function pricePickLocalMonthly_(list, anchorList, anchor) {
      var month = pricePickMonthlyItems_(list);
      var monthA = pricePickMonthlyItems_(anchorList);
      var retail = calcRetailBasketTotal(month, { deliveriesN: PRICE_PICK_MONTH_DELIVERIES });
      var capRate = typeof PP_RAW26_RETAIL_CAP === "number" ? PP_RAW26_RETAIL_CAP : 0.92;
      var capAt = Math.round((Number(retail.total) || 0) * capRate * 100) / 100;
      var m = anchor && anchor.model;
      var monthly, goods;
      if (m) {
        var rec100 = typeof PP_RAW26_RECOVER_100 === "number" ? PP_RAW26_RECOVER_100 : 3.9;
        var recPc = typeof PP_RAW26_RECOVER_PIECE === "number" ? PP_RAW26_RECOVER_PIECE : 0.5;
        var qty = {};
        month.forEach(function (it) { qty[pricePickTrimKey_(it)] = Number(it.value) || 0; });
        var dGoods = 0;
        monthA.forEach(function (it) {
          var k = pricePickTrimKey_(it);
          var d = (Number(it.value) || 0) - (qty[k] || 0);
          if (!d) return;
          var piece = pricePickIsPieceItem_(it);
          dGoods += d * ((m.unit[k] || 0) * m.coef + (piece ? recPc : rec100 / 100));
        });
        var dFrac = 0;
        try {
          if (typeof calcDressuraFractionMarkup === "function") {
            var rates = typeof getPriceFracRates === "function" ? getPriceFracRates() : undefined;
            dFrac = (Number(calcDressuraFractionMarkup(monthA, rates).total) || 0) -
              (Number(calcDressuraFractionMarkup(month, rates).total) || 0);
          }
        } catch (eFr) { dFrac = 0; }
        monthly = m.factBefore - dGoods - dFrac;
        goods = m.goodsBefore - dGoods;
      } else {
        var ratio = anchor && anchor.retailMonthly > 0 ? (Number(retail.total) || 0) / anchor.retailMonthly : 1;
        monthly = ((anchor && anchor.monthly) || 0) * ratio;
        goods = ((anchor && anchor.goods) || 0) * ratio;
      }
      if (capAt > 0 && monthly > capAt) monthly = capAt;
      return {
        monthly: Math.round(monthly * 100) / 100,
        goods: Math.round(Math.max(0, goods) * 100) / 100
      };
    }

    function pricePickTrimStep_(items, floors, signals, orig) {
      var keep = {};
      ((signals && signals.must) || []).concat((signals && signals.liked) || []).forEach(function (n) {
        keep[String(n).toUpperCase()] = true;
      });
      function room(it) {
        var v = Number(it.value != null ? it.value : it.val) || 0;
        var f = floors[pricePickTrimKey_(it)];
        return v - (f != null ? f : (pricePickIsPieceItem_(it) ? 1 : 10));
      }
      function per100(it) {
        try {
          return Number(retailLineCost(it.main || it.name, it.sub || "", pricePickIsPieceItem_(it) ? 1 : 100, it.cat, {}).cost) || 0;
        } catch (eP) { return 0; }
      }
      var tiers = [[false, false], [false, true], [true, false], [true, true]];
      for (var t = 0; t < tiers.length; t++) {
        var wantKeep = tiers[t][0], wantPiece = tiers[t][1];
        var best = -1, bestR = -1, bestV = -1, bestP = -1;
        items.forEach(function (it, i) {
          var nm = String(it.main || it.name || "").toUpperCase();
          if (!!keep[nm] !== wantKeep) return;
          if (pricePickIsPieceItem_(it) !== wantPiece) return;
          if (room(it) <= 0) return;
          var v = Number(it.value != null ? it.value : it.val) || 0;
          var pr = per100(it);
          var o = orig && orig[pricePickTrimKey_(it)];
          var ratio = o > 0 ? v / o : 1;
          if (ratio > bestR + 1e-9 || (Math.abs(ratio - bestR) <= 1e-9 && (v > bestV || (v === bestV && pr > bestP)))) {
            best = i; bestR = ratio; bestV = v; bestP = pr;
          }
        });
        if (best >= 0) {
          return items.map(function (it, i) {
            var copy = Object.assign({}, it);
            if (i === best) {
              var step = wantPiece ? 1 : 5;
              var nv = Math.max((Number(copy.value != null ? copy.value : copy.val) || 0) - step,
                (Number(copy.value != null ? copy.value : copy.val) || 0) - room(copy));
              copy.value = nv;
              copy.val = nv;
            }
            return copy;
          });
        }
      }
      return null;
    }

    async function pricePickTrimToBudget_(base, signals, max, est, val) {
      var floors = {}, orig = {};
      base.forEach(function (it) {
        var v = Number(it.value != null ? it.value : it.val) || 0;
        orig[pricePickTrimKey_(it)] = v;
        floors[pricePickTrimKey_(it)] = pricePickIsPieceItem_(it) ? Math.min(v, 1) : Math.min(v, 10);
      });
      var cur = base;
      var curE = await est(cur);
      if (val(curE) <= max) return { items: cur, e: curE };
      var anchorList = cur, anchor = curE, trail = [cur];
      for (var guard = 0; guard < 600; guard++) {
        var nxt = pricePickTrimStep_(cur, floors, signals, orig);
        if (!nxt) {
          // пол достигнут, а локально всё ещё выше — одна живая проверка пола, чтобы не убирать позицию зря
          if (cur === anchorList) return null;
          var eFl = await est(cur);
          return val(eFl) <= max ? { items: cur, e: eFl } : null;
        }
        cur = nxt;
        trail.push(cur);
        if (val(pricePickLocalMonthly_(cur, anchorList, anchor)) > max) continue;
        var e = await est(cur);
        if (val(e) <= max) {
          for (var j = trail.length - 2, back = 0; j >= 1 && back < 4; j--, back++) {
            var eb = await est(trail[j]);
            if (val(eb) <= max) { cur = trail[j]; e = eb; } else break;
          }
          return { items: cur, e: e };
        }
        anchorList = cur; anchor = e; trail = [cur];
      }
      return null;
    }

    function pricePickScaleForBudget_(items, f) {
      return (items || []).map(function (it) {
        var copy = Object.assign({}, it);
        var piece = copy.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(copy.main || copy.name));
        var v = Number(copy.value != null ? copy.value : copy.val) || 0;
        var nv;
        if (piece) nv = Math.max(1, Math.round(v * f));
        else nv = Math.max(Math.min(v, 10), Math.round((v * f) / 5) * 5);
        copy.value = nv;
        copy.val = nv;
        return copy;
      });
    }

    function pricePickDropPriciest_(items, signals) {
      if (!items || items.length <= 1) return null;
      var keep = {};
      (signals.must || []).concat(signals.liked || []).forEach(function (n) { keep[String(n).toUpperCase()] = true; });
      var dressN = items.filter(function (it) { return it.cat === "dressura"; }).length;
      function pick(strict) {
        var worst = -1, worstCost = -1;
        items.forEach(function (it, i) {
          var nm = String(it.main || it.name || "").toUpperCase();
          if (strict && keep[nm]) return;
          if (it.cat === "dressura" && dressN <= 1) return;
          var c = retailLineCost(it.main || it.name, it.sub || "", it.value != null ? it.value : it.val, it.cat, {}).cost || 0;
          if (c > worstCost) { worstCost = c; worst = i; }
        });
        return worst;
      }
      var w = pick(true);
      if (w < 0) w = pick(false);
      if (w < 0) return null;
      return items.filter(function (_, i) { return i !== w; });
    }

    async function pricePickFitBudget_(payload) {
      if (!payload || !payload.items || !payload.items.length) return null;
      var target = payload.target;
      if (target !== "pp" && target !== "retail" && target !== "bp1" && target !== "bp2") return null;
      var sig = payload.signals || {};
      var b = sig.budget;
      if (!b || !(b.max > 0)) return null;
      var cache = {};
      async function est(list) {
        var k = pricePickItemsKey_(list);
        if (!cache[k]) cache[k] = await pricePickEstimateMonthly_(list);
        return cache[k];
      }
      var goodsOnly = false;
      function val(e) { return goodsOnly ? e.goods : e.monthly; }

      var base0 = pricePickCloneItems_(payload.items);
      var result = null;
      var minEst = null, minMonthly = null;
      var e0 = await est(base0);
      if (!(e0.monthly > 0)) return null;
      if (e0.monthly <= b.max) {
        result = { items: base0, e: e0 };
      } else {
        // самый маленький разумный набор: одна дрессура (лучше из лайков) на 10 г
        var minimal = base0.slice();
        var guard = 0;
        while (minimal.length > 1 && guard++ < 20) {
          var d = pricePickDropPriciest_(minimal, sig);
          if (!d) break;
          minimal = d;
        }
        minimal = pricePickScaleForBudget_(minimal, 0.01);
        minEst = await est(minimal);
        if (!(minEst.monthly > 0)) return null;
        minMonthly = minEst.monthly;
        if (minMonthly > b.max) goodsOnly = true;

        var base = base0;
        for (var round = 0; round < 12 && !result; round++) {
          var e1 = await est(base);
          if (val(e1) <= b.max) { result = { items: base, e: e1 }; break; }
          result = await pricePickTrimToBudget_(base, sig, b.max, est, val);
          if (result) break;
          // даже 10 г / 1 шт не влезает — убираем самую дорогую не-лайк позицию и снова урезаем с исходных граммов
          var floorList = pricePickScaleForBudget_(base, 0.01);
          var dropped = pricePickDropPriciest_(base, sig);
          if (!dropped) { result = { items: floorList, e: await est(floorList) }; break; }
          base = dropped;
        }
      }
      if (!result) return null;
      var r = result.e;
      return {
        items: result.items,
        monthly: r.monthly,
        goodsMonthly: r.goods,
        fixedMonthly: r.fixed,
        retailMonthly: r.retailMonthly,
        deliveriesN: r.deliveriesN,
        minMonthly: minMonthly,
        minFixed: minEst ? minEst.fixed : null,
        goodsOnly: goodsOnly,
        budget: b,
        basis: r.basis,
        trial: target === "bp1" || target === "bp2",
        approx: r.approx,
        inRange: val(r) <= b.max
      };
    }

    function pricePickItemsKey_(items) {
      return (items || []).map(function (it) {
        return [
          String(it.main || it.name || ""),
          String(it.sub || ""),
          String(it.value != null ? it.value : it.val)
        ].join("|");
      }).join(";");
    }

    function pricePickRememberExample_(payload) {
      if (!payload || !payload.anketaText) return false;
      var nowKey = pricePickItemsKey_(payload.items);
      if (!payload.autoKey || nowKey === payload.autoKey) return false;
      var flags = pricePickFlags_(payload.signals || {});
      var text = String(payload.anketaText).slice(0, 2000);
      var row = {
        id: "mgr-" + Date.now(),
        source: "manager",
        target: payload.target,
        anketaText: text,
        items: (payload.items || []).filter(function (it) {
          return it && (Number(it.value) > 0 || Number(it.val) > 0);
        }).map(function (it) {
          var v = Number(it.value != null ? it.value : it.val) || 0;
          return {
            cat: it.cat || "",
            main: it.main || it.name,
            name: it.main || it.name,
            sub: it.sub || "",
            value: v,
            val: v
          };
        }),
        weightKg: flags.weightKg,
        puppy: flags.puppy,
        noChicken: flags.noChicken,
        noFish: flags.noFish,
        likeLung: flags.likeLung,
        likeRoot: flags.likeRoot,
        hateTrachea: flags.hateTrachea,
        savedAt: new Date().toISOString()
      };
      if (!row.items.length) return false;
      var head = text.slice(0, 180);
      var list = pricePickReadStoredExamples_().filter(function (ex) {
        return !(ex && ex.target === row.target && String(ex.anketaText || "").slice(0, 180) === head);
      });
      list.unshift(row);
      pricePickWriteStoredExamples_(list);
      return true;
    }

    function pricePickSectionTitle_(cat) {
      if (cat === "dressura") return "Дрессура";
      if (cat === "chew") return "Жевалки";
      if (cat === "veg") return "Овощи-Фрукты";
      if (cat === "crumb") return "Крошки";
      return "Другое";
    }

    function pricePickCatClass_(cat) {
      var c = String(cat || "");
      if (c === "dressura" || c === "chew" || c === "veg" || c === "other" || c === "crumb" || c === "powder") return c;
      return "";
    }

    function statedTouchedFlag_(v) {
      return v === true || v === 1 || v === "1";
    }

    function ppOfferClientPrice_(scheme, factCost, statedCost, statedTouched) {
      var fact = Number(factCost);
      var stated = Number(statedCost);
      var sch = String(scheme || "").toUpperCase();
      if (sch !== "RAW26") {
        if (isFinite(stated) && stated > 0) return Math.round(stated * 100) / 100;
        if (isFinite(fact) && fact > 0) return Math.round(fact * 100) / 100;
        return 0;
      }
      if (statedTouchedFlag_(statedTouched) && isFinite(stated) && stated > 0) {
        return Math.round(stated * 100) / 100;
      }
      if (isFinite(fact) && fact > 0) return Math.round(fact * 100) / 100;
      if (isFinite(stated) && stated > 0) return Math.round(stated * 100) / 100;
      return 0;
    }

    function formatClientMessagePrice_(n, asEntered) {
      var x = Number(n) || 0;
      if (!isFinite(x) || x <= 0) return 0;
      if (asEntered) {
        if (Math.abs(x - Math.round(x)) < 0.001) return Math.round(x);
        return Math.round(x * 100) / 100;
      }
      return Math.round(x);
    }

    function ppClientDisplayPrice_(scheme, factCost, statedCost, statedTouched) {
      var stated = Number(statedCost);
      var sch = String(scheme || "").toUpperCase();
      var touched = statedTouchedFlag_(statedTouched);
      var asEntered = false;
      if (sch !== "RAW26") {
        asEntered = isFinite(stated) && stated > 0;
      } else {
        asEntered = touched && isFinite(stated) && stated > 0;
      }
      var picked = ppOfferClientPrice_(scheme, factCost, statedCost, touched);
      return formatClientMessagePrice_(picked, asEntered);
    }

    function clientMessagePriceText_(n, asEntered) {
      var v = formatClientMessagePrice_(n, asEntered);
      if (!v) return "0";
      if (Math.abs(v - Math.round(v)) < 0.001) return String(Math.round(v));
      return Number(v).toFixed(2);
    }

    function ppSheetPrice_(res) {
      res = res || {};
      var stated = Number(res.statedCost);
      var fact = Number(res.factCost != null && res.factCost !== "" ? res.factCost : res.factAfterCap);
      var calc = Number(res.calcFactCost);
      if (isFinite(calc) && isFinite(fact) && fact > 0 && calc > fact + 0.001) calc = NaN;
      if (isFinite(stated) && stated > 0) return Math.round(stated * 100) / 100;
      if (isFinite(fact) && fact > 0) return Math.round(fact * 100) / 100;
      if (isFinite(calc) && calc > 0) return Math.round(calc * 100) / 100;
      return 0;
    }

    function raw26ApiFactPrice_(res) {
      var fact = Number(res && res.factCost);
      var client = Number(res && res.clientPrice);
      var calc = Number(res && res.calcFactCost);
      if (isFinite(calc) && isFinite(fact) && fact > 0 && calc > fact + 0.001) calc = NaN;
      if (isFinite(client) && isFinite(fact) && fact > 0 && client > fact + 0.001) client = fact;
      if (isFinite(fact) && fact > 0) return Math.round(fact * 100) / 100;
      if (isFinite(client) && client > 0) return Math.round(client * 100) / 100;
      if (isFinite(calc) && calc > 0) return Math.round(calc * 100) / 100;
      return 0;
    }

    function parsePpCoefFromWishes_(wishes) {
      var m = String(wishes || "").match(/\[COEF:([0-9]+(?:[.,][0-9]+)?)\]/i);
      if (!m) return null;
      var v = Number(String(m[1]).replace(",", "."));
      return (isFinite(v) && v > 0) ? v : null;
    }

    function stripPpCoefFromWishes_(wishes) {
      return String(wishes || "").replace(/\[COEF:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    }

    function stampPpCoefIntoWishes_(wishes, coef) {
      var base = stripPpCoefFromWishes_(wishes);
      var v = Number(coef);
      if (!isFinite(v) || v <= 0) return base;
      var tag = "[COEF:" + (Math.round(v * 1000) / 1000) + "]";
      return (base + (base ? " " : "") + tag).trim();
    }

    function todayYmdLocal_() {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function defaultPpSchemeForNewLocal_() {
      return todayYmdLocal_() >= PP_SCHEME_CUTOFF_YMD ? "RAW26" : "LEGACY";
    }

    function normalizePpSchemeLocal_(s) {
      var u = String(s || "").trim().toUpperCase();
      if (u === "RAW26" || u === "RAW" || u === "NEW" || u === "V2") return "RAW26";
      if (u === "LEGACY" || u === "OLD" || u === "V1") return "LEGACY";
      return "";
    }

    function parsePpSchemeFromWishes_(wishes) {
      var m = String(wishes || "").match(/\[SCHEME:([^\]]+)\]/i);
      if (!m) return "";
      return normalizePpSchemeLocal_(m[1]);
    }

    function stripPpSchemeFromWishes_(wishes) {
      return String(wishes || "").replace(/\[SCHEME:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    }

    function stampPpSchemeIntoWishes_(wishes, scheme) {
      var base = stripPpSchemeFromWishes_(wishes);
      var sch = normalizePpSchemeLocal_(scheme);
      if (!sch) return base;
      return (base + (base ? " " : "") + "[SCHEME:" + sch + "]").trim();
    }

    function stripPpMetaFromWishes_(wishes) {
      return stripPpSchemeFromWishes_(stripPpCoefFromWishes_(wishes));
    }

    function raw26OfferCleanByn_(clientPrice, raw, recover, packagesByn, deliveriesN) {
      var n = Math.max(1, Number(deliveriesN) || 1);
      var fuel = STATS_DELIVERY_FUEL_PER * n;
      return Math.round(
        ((Number(clientPrice) || 0) - (Number(raw) || 0) - (Number(recover) || 0) -
          (Number(packagesByn) || 0) - fuel) * 100
      ) / 100;
    }

    function raw26RetailCapBase_(retailGoods, deliveriesN) {
      var r = Number(retailGoods);
      if (!isFinite(r) || r <= 0) return 0;
      var n = Math.max(1, Number(deliveriesN) || 1);
      var extra = r < PP_RAW26_RETAIL_FREE_FROM ? PP_RAW26_DELIVERY_PER * n : 0;
      return Math.round((r + extra) * 100) / 100;
    }

    function applyRaw26RetailCapAlloc_(goods, delivery, packagesByn, fracMark, capAt, goodsFloor) {
      var g = Math.round((Number(goods) || 0) * 100) / 100;
      var d = Math.round((Number(delivery) || 0) * 100) / 100;
      var p = Math.round((Number(packagesByn) || 0) * 100) / 100;
      var f = Math.round((Number(fracMark) || 0) * 100) / 100;
      var cap = Math.round((Number(capAt) || 0) * 100) / 100;
      var floor = Math.round((Number(goodsFloor) || 0) * 100) / 100;
      if (floor < 0) floor = 0;
      var full = Math.round((g + d + p + f) * 100) / 100;
      var capped = cap > 0 && full > cap;
      if (capped) {
        var excess = Math.round((full - cap) * 100) / 100;
        if (f > 0 && excess > 0) {
          var cutF = Math.min(f, excess);
          f = Math.round((f - cutF) * 100) / 100;
          excess = Math.round((excess - cutF) * 100) / 100;
        }
        if (excess > 0) {
          var room = Math.max(0, Math.round((g - floor) * 100) / 100);
          var cutG = Math.min(room, excess);
          g = Math.round((g - cutG) * 100) / 100;
        }
      }
      var factAlloc = Math.round((g + d + p + f) * 100) / 100;
      var uncappedFloor = !!(capped && cap > 0 && factAlloc > cap + 0.001);
      return {
        goods: g,
        delivery: d,
        packagesByn: p,
        fractionMarkup: f,
        factCost: Math.round((g + d + p + f) * 100) / 100,
        retailCapped: !!capped,
        retailCapAt: cap,
        uncappedFloor: uncappedFloor
      };
    }

    function capRaw26PriceToRetail_(price, retailGoods, deliveriesN) {
      var p = Math.round((Number(price) || 0) * 100) / 100;
      var base = raw26RetailCapBase_(retailGoods, deliveriesN);
      if (base <= 0) return p;
      var capAt = Math.round(base * PP_RAW26_RETAIL_CAP * 100) / 100;
      return p > capAt ? capAt : p;
    }

    function recoverBynFromBasketLocal_(list) {
      var sum = 0;
      (list || []).forEach(function (it) {
        var val = Number(it.val != null ? it.val : it.value) || 0;
        if (val <= 0) return;
        var cat = String(it.cat || "").toLowerCase();
        var name = String(it.main || it.name || "");
        var piece = cat === "chew" || cat === "chews" || cat === "powder";
        try {
          if (!piece && typeof unitForItem === "function" && unitForItem(cat || "other", name) === "шт") piece = true;
        } catch (eU) {}
        if (!piece && /шт/i.test(name)) piece = true;
        if (cat === "crumb" || it.crumbKind || (Array.isArray(it.sources) && it.sources.length)) {
          piece = false;
        } else if (!piece && /^крошка$/i.test(String(name || "").trim()) && !/шт/i.test(name)) {
          piece = false;
        }
        if (piece) sum += PP_RAW26_RECOVER_PIECE * val;
        else sum += PP_RAW26_RECOVER_100 * (val / 100);
      });
      return Math.round(sum * 100) / 100;
    }

    function packagesBynFromUCountsLocal_(pc) {
      pc = pc || {};
      return Math.round(
        ((Number(pc.u1) || 0) * 0.34 +
          (Number(pc.u2) || 0) * 0.56 +
          (Number(pc.u3) || 0) * 0.80 +
          (Number(pc.up4) || 0) * 1.40) * 100
      ) / 100;
    }

    function packHintFromU_(pc) {
      pc = pc || {};
      var parts = [];
      if (pc.u1) parts.push("У1×" + pc.u1);
      if (pc.u2) parts.push("У2×" + pc.u2);
      if (pc.u3) parts.push("У3×" + pc.u3);
      if (pc.up4) parts.push("УП4×" + pc.up4);
      return parts.join(" ");
    }

    function extractRawPpCost_(pr, list) {
      if (!pr) return null;
      var raw = null;
      if (pr.rawCost != null && pr.rawCost !== "") raw = Number(pr.rawCost);
      else if (pr.cost != null && pr.cost !== "") raw = Number(pr.cost);
      else raw = recalcPpCostSum(pr, list);
      if (raw == null || !isFinite(raw)) return null;
      var tot = (pr.total != null) ? Number(pr.total) : NaN;
      var mk = Number(pr.markup);
      if (!isFinite(mk) || mk <= 1) mk = 2.3;

      if (isFinite(tot) && tot > 0 && Math.abs(raw - tot) < 0.05) {
        raw = Math.round((tot / mk) * 100) / 100;
      }

      if (pr.factCost != null && Math.abs(raw - Number(pr.factCost)) < 0.05 && Number(pr.factCost) > raw * 1.2) {
        raw = Math.round((Number(pr.factCost) - 11) / mk * 100) / 100;
      }
      return Math.round(raw * 100) / 100;
    }

    function recalcPpCostSum(res, list) {
      var meta = {};
      (list || []).forEach(function (it) {
        var n = String(it.name || it.main || "").trim();
        var s = String(it.sub || "").trim();
        meta[n + "|" + s] = it;
        meta[n] = it;
      });
      var sum = 0;
      var used = false;
      (res && res.lines ? res.lines : []).forEach(function (L) {
        var it = meta[L.name + "|" + (L.sub || "")] || meta[L.name] || {};
        var cat = it.cat || "";
        var piece = L.piece === true ||
          cat === "chew" || cat === "chews" ||
          /шт/i.test(String(L.name || "")) ||
          unitForItem(cat, L.name) === "шт";
        var unit = Number(L.unitPrice != null ? L.unitPrice : L.per100) || 0;
        var val = Number(L.val) || 0;
        sum += piece ? (unit * val) : ((val / 100) * unit);
        used = true;
      });
      if (used) return Math.round(sum * 100) / 100;
      return Number(res && res.cost) || 0;
    }

    function calcDressuraFractionMarkup(list, rates) {
      var r = dressuraFractionRates(rates || getPriceFracRates());
      var sum = 0;
      var details = [];
      (list || []).forEach(function (it) {
        var cat = String(it.cat || "").toLowerCase();
        if (cat === "chew" || cat === "chews" || cat === "powder") return;
        if (cat && cat !== "dressura" && cat !== "other") return;
        var main = it.main || it.name || "";
        var sub = it.sub || "";
        var size = dressuraFractionSizeKey(sub);
        if (!size) return;
        var rate = r[size];
        if (!isFinite(rate)) rate = 0;
        var grams = Number(it.val != null ? it.val : it.value) || 0;
        if (grams <= 0) return;
        var add = (grams / 100) * rate;
        sum += add;
        if (add !== 0) {
          details.push(prettyProductName(main) + " " + (humanFraction(main, sub) || sub) +
            ": " + grams + "г → +" + (Math.round(add * 100) / 100));
        }
      });
      return { total: Math.round(sum * 100) / 100, details: details };
    }

    function crumbOfferGenitive_(name) {
      var raw = String(name || "").trim();
      if (!raw) return "";
      var folded = raw.toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      folded = folded.replace(/^КРОШКА\s+/, "").replace(/\s*ШТ\.?$/, "").trim();
      var table = {
        "ЛЕГКОЕ": "лёгкого",
        "БАРАНЬЕ ЛЕГКОЕ": "бараньего лёгкого",
        "СЕРДЦЕ": "сердца",
        "РУБЕЦ": "рубца",
        "РУБЕЦ Т": "рубца",
        "ПОЧКИ": "почек",
        "ПЕЧЕНЬ": "печени",
        "БАРАНЬЯ ПЕЧЕНЬ": "бараньей печени",
        "ИНДЕЙКА": "индейки",
        "МЯСНЫЕ ЛОМТИКИ": "мясных ломтиков",
        "ВЫМЯ": "вымени",
        "СЕМЕННИКИ": "семенников",
        "БАНАНЫ": "бананов",
        "БАНАН": "банана",
        "ЯБЛОКИ": "яблок",
        "ЯБЛОКО": "яблока",
        "ГРУШИ": "груш",
        "ГРУШЫ": "груш",
        "ГРУША": "груши",
        "МОРКОВЬ": "моркови",
        "ТЫКВА": "тыквы",
        "БАТАТ": "батата",
        "КАБАЧОК": "кабачка",
        "КАБАЧКИ": "кабачков"
      };
      if (/БАРАН/.test(folded) && /ЛЕГК/.test(folded)) return "бараньего лёгкого";
      if (/БАРАН/.test(folded) && /ПЕЧЕН/.test(folded)) return "бараньей печени";
      if (table[folded]) return table[folded];
      if (/ЛЕГК/.test(folded)) return "лёгкого";
      if (/ПОЧК/.test(folded)) return "почек";
      if (/РУБ/.test(folded)) return "рубца";
      if (/СЕРДЦ/.test(folded)) return "сердца";
      if (/ПЕЧЕН/.test(folded)) return "печени";
      if (/ИНДЕЙ/.test(folded)) return "индейки";
      if (/ВЫМ/.test(folded)) return "вымени";
      if (/СЕМЕН/.test(folded)) return "семенников";
      if (/МЯСН/.test(folded) && /ЛОМТ/.test(folded)) return "мясных ломтиков";
      if (/БАНАН/.test(folded)) return "бананов";
      if (/ЯБЛОК/.test(folded)) return "яблок";
      if (/ГРУШ/.test(folded)) return "груш";
      if (/МОРКОВ/.test(folded)) return "моркови";
      if (/ТЫКВ/.test(folded)) return "тыквы";
      if (/БАТАТ/.test(folded)) return "батата";
      if (/КАБАЧ/.test(folded)) return "кабачка";
      var plain = raw;
      try { plain = prettyProductName(raw) || raw; } catch (ePlain) {}
      return String(plain).replace(/^крошка\s+/i, "").trim().toLowerCase();
    }

    function crumbClientMessageLine_(item) {
      var raw = (item && Array.isArray(item.sources)) ? item.sources : [];
      var kept = [];
      raw.forEach(function (s, i) {
        if (!s || isChewCrumbSource_(s)) return;
        var nm = String((s.name || s.main) || "").trim();
        if (!nm || isChewProductName_(nm)) return;
        kept.push({ s: s, i: i, name: nm });
      });
      var names = kept.length
        ? kept.map(function (k) { return k.name; })
        : crumbSourceNames_(item).filter(function (n) { return String(n || "").trim(); });
      if (!names.length) {
        var selfName = String((item && (item.name || item.main)) || "").trim();
        var subCrumb = /^крошк/i.test(String((item && item.sub) || "").trim());
        if (subCrumb && selfName && !/^крошка$/i.test(selfName)) names = [selfName];
        else if (/^крошка\s+\S/i.test(selfName)) names = [selfName];
      }
      var val = Number(item && (item.val != null ? item.val : item.value)) || 0;
      var qty = val + " г";
      if (names.length >= 2) return "Крошка микс — " + qty;
      if (names.length === 1) {
        var g = String(crumbOfferGenitive_(names[0]) || names[0] || "")
          .replace(/^крошка\s+/i, "").trim().toLowerCase();
        return "Крошка " + g + " — " + qty;
      }
      return "Крошка — " + qty;
    }

    function priceUnitLabel(cat, main) {
      return unitForItem(cat, main) === "шт" ? "шт" : "г";
    }

    function formatPriceCompositionLine(it) {
      if (/^крошк/i.test(String((it && it.sub) || "")) || isCrumbBasketItemUi_(it)) return crumbClientMessageLine_(it);
      var main = it.main || it.name || "";
      var sub = it.sub || "";
      var val = it.val != null ? it.val : it.value;
      var unit = priceUnitLabel(it.cat, main);
      var frac = humanFraction(main, sub);
      var line = prettyProductName(main) + " - " + (Number(val) || 0) + " " + unit;
      if (frac) line += " (" + frac + ")";
      return line;
    }

    function buildPriceCompositionBlocks(list) {
      var order = ["dressura", "chew", "other", "veg", "crumb"];
      var titles = {
        dressura: "Дрессура",
        chew: "Жевалки",
        other: "Другое",
        veg: "Овощи/фрукты",
        crumb: "Присыпки"
      };
      var byCat = {};
      (list || []).forEach(function (it) {
        var c = it.cat || "other";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(it);
      });
      var parts = [];
      order.forEach(function (c) {
        if (!byCat[c] || !byCat[c].length) return;
        parts.push(titles[c] + " :\n\n" + byCat[c].map(formatPriceCompositionLine).join("\n"));
      });
      Object.keys(byCat).forEach(function (c) {
        if (order.indexOf(c) >= 0) return;
        parts.push((catalog[c] && catalog[c].title ? catalog[c].title : c) + " :\n\n" +
          byCat[c].map(formatPriceCompositionLine).join("\n"));
      });
      return parts.join("\n\n");
    }

    function buildPriceCompositionForMessage(list) {
      var items = list || [];
      if (priceDogCount < 2) return buildPriceCompositionBlocks(items);
      var d1 = items.filter(function (it) { return Number(it.dog) !== 2; });
      var d2 = items.filter(function (it) { return Number(it.dog) === 2; });
      var parts = [];
      if (d1.length) parts.push(priceDogLabel_(1) + ":\n\n" + buildPriceCompositionBlocks(d1));
      if (d2.length) parts.push(priceDogLabel_(2) + ":\n\n" + buildPriceCompositionBlocks(d2));
      return parts.join("\n\n");
    }

    function roundRub(n) {
      return Math.round(Number(n) || 0);
    }

    function money2_(n) {
      return Math.round((Number(n) || 0) * 100) / 100;
    }

    function formatClientRub_(n) {
      var x = money2_(n);
      return (Math.abs(x - Math.round(x)) < 0.001) ? String(Math.round(x)) : x.toFixed(2);
    }

    function capOfferSubToDisplayedRetail_(subTotal, retailTotal) {
      var r = money2_(retailTotal);
      var s = money2_(subTotal);
      if (r > 0) {
        var capAt = money2_(r * (typeof PP_RAW26_RETAIL_CAP === "number" ? PP_RAW26_RETAIL_CAP : 0.92));
        if (s > capAt) s = capAt;
        if (s > r) s = r;
      }
      return s;
    }

    function composePpClientMessage(list, deliveriesN, clientNote, retailTotal, subTotal, scheme, opts) {
      opts = opts || {};
      var n = Math.max(1, Number(deliveriesN) || 1);
      var blocks = buildPriceCompositionForMessage(list);
      var note = String(clientNote || "").trim();
      var sch = String(scheme || "").toUpperCase();
      var asEntered = !!(opts.asEntered || opts.statedAsEntered || statedTouchedFlag_(opts.statedTouched));
      var rExact = money2_(retailTotal);
      var sExact = money2_(subTotal);
      if (!asEntered && sch === "RAW26") {
        sExact = capOfferSubToDisplayedRetail_(sExact, rExact);
      }
      var rShow = String(roundRub(rExact));
      var sShow = String(roundRub(sExact));
      var msg = "Ваш состав на месяц получается\n\n" + blocks +
        "\n\nКоличество доставок в месяц - " + n;
      if (note) msg += "\n\n" + note;
      msg += "\n\nЦена за этот состав в розницу выходит - " + rShow + " рублей";
      msg += "\n\nВ подписке с учётом доставок, поддержки 24/7 и партнёрской программы со скидками для наших клиентов\n" +
        "стоимость выходит - " + sShow + " рублей за месяц";
      msg += "\n\nКак вам наше предложение?)\nГотовы продолжать😁";
      return msg;
    }

    function composeRetailClientMessage(list, retailTotal, clientNote) {
      var blocks = buildPriceCompositionForMessage(list);
      var note = String(clientNote || "").trim();
      var msg = "Давайте подытожим ваш заказ 📜\n\n" + blocks;
      if (note) msg += "\n\n" + note;
      msg += "\n\nЦена за этот набор составит - " + String(roundRub(retailTotal)) + " рублей";
      msg += "\n\nВсё подходит?)";
      return msg;
    }

    function priceModeKey(mode) {
      var m = String(mode || "").toLowerCase();
      if (m === "retail" || m === "ret") return "retail";
      if (m === "bp1" || m === "bp_1") return "bp1";
      if (m === "bp2" || m === "bp_2" || m === "bp") return "bp2";
      return "pp";
    }

    function priceModeLabel_(mode) {
      var k = priceModeKey(mode);
      if (k === "bp1") return "БП1";
      if (k === "bp2") return "БП2";
      if (k === "retail") return "Розница";
      return "Подписка";
    }

    function applyLocalPpFact_(costSum, coef, n, packagesByn, fracTotal, packHint, listOpt) {
      costSum = Number(costSum) || 0;
      var scheme = subDetailSchemeValue_();
      coef = Number(coef) || (scheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
      n = Math.max(1, Number(n) || 1);
      packagesByn = Number(packagesByn) || 0;
      fracTotal = Number(fracTotal) || 0;
      var total;
      var hintCore;
      if (scheme === "RAW26") {
        var recover = recoverBynFromBasketLocal_(listOpt || subDetailBasketPayload_());
        var delivery = PP_RAW26_DELIVERY_PER * n;
        var goodsLocal = Math.round((costSum * coef + recover) * 100) / 100;
        var packsBefore = packagesByn;
        var fracBefore = fracTotal;
        total = Math.round((goodsLocal + delivery + packsBefore + fracBefore) * 100) / 100;
        var retailLocal = 0;
        try {
          retailLocal = Number(calcRetailBasketTotal(listOpt || subDetailBasketPayload_(), { applyDelivery: false }).goods) || 0;
        } catch (eRetL) { retailLocal = 0; }
        var capLocalAt = 0;
        var retailLocalBase = raw26RetailCapBase_(retailLocal, n);
        if (retailLocalBase > 0) {
          capLocalAt = Math.round(retailLocalBase * PP_RAW26_RETAIL_CAP * 100) / 100;
        }
        var allocLocal = applyRaw26RetailCapAlloc_(
          goodsLocal,
          delivery,
          packsBefore,
          fracBefore,
          capLocalAt,
          Math.round((costSum + recover) * 100) / 100
        );
        hintCore = "себест " + costSum + " ×" + coef + " +recover " + recover + " +9×" + n;
        if (allocLocal.retailCapped) {
          total = allocLocal.factCost;
          packagesByn = allocLocal.packagesByn;
          fracTotal = allocLocal.fractionMarkup;
          hintCore += " · cap 92% розн. " + total;
        }
        var factBeforeLocal = Math.round((goodsLocal + delivery + packsBefore + fracBefore) * 100) / 100;
        rememberPpCostFact_({
          scheme: "RAW26",
          rawCost: costSum,
          recoverByn: recover,
          goodsBeforeCap: goodsLocal,
          goodsByn: allocLocal.goods,
          fractionBeforeCap: fracBefore,
          fractionMarkup: allocLocal.fractionMarkup,
          packagesBeforeCap: packsBefore,
          packagesByn: allocLocal.packagesByn,
          deliveryByn: delivery,
          deliveriesN: n,
          retailGoods: retailLocal,
          retailCapBase: retailLocalBase,
          retailCapAt: capLocalAt,
          factBeforeCap: factBeforeLocal,
          factAfterCap: total,
          factCost: total,
          capCutByn: Math.round((factBeforeLocal - total) * 100) / 100,
          capCutFrom: allocLocal.retailCapped ? "фракции" : "",
          cleanBeforeCap: raw26OfferCleanByn_(factBeforeLocal, costSum, recover, packsBefore, n),
          cleanAfterCap: raw26OfferCleanByn_(total, costSum, recover, packagesByn, n),
          retailCapped: allocLocal.retailCapped,
          uncappedFloor: !!allocLocal.uncappedFloor
        }, costSum);
        renderRaw26CleanPair_(
          _lastPpCostFact && _lastPpCostFact.cleanBeforeCap,
          _lastPpCostFact && _lastPpCostFact.cleanAfterCap,
          "subDetailCleanPair",
          _lastPpCostFact
        );
      } else {
        total = Math.round((costSum * coef + 11 + 6 * n + packagesByn + fracTotal) * 100) / 100;
        hintCore = "себест " + costSum + " ×" + coef + " +11 +6×" + n;
        hideRaw26CleanPair_("subDetailCleanPair");
      }
      applySubDetailFact_(total,
        hintCore +
        (packagesByn ? (" +пакеты " + packagesByn + (packHint ? " [" + packHint + "]" : "")) : "") +
        (fracTotal ? (" +фракт " + fracTotal) : "") +
        " → " + total + " BYN");
      return total;
    }

    function asmFormatOn(enabled, key) {
      if (!enabled) return true;
      return enabled[key] !== false;
    }

    function asmIsLargeChewFrac(sub) {
      var u = String(sub || "").toUpperCase();
      return /ОГР|ОГРОМ|ГИГАНТ|КРУПН|БОЛЬШ|БОЛ|^ОБЫЧН/.test(u);
    }

    function asmPackGrams(grams, caps, enabled) {
      var out = { "маленький": 0, "средний": 0, "большой": 0 };
      var g = Number(grams) || 0;
      if (g <= 0) return out;
      var levels = [];
      if (asmFormatOn(enabled, "большой")) levels.push({ key: "большой", cap: caps.large });
      if (asmFormatOn(enabled, "средний")) levels.push({ key: "средний", cap: caps.medium });
      if (asmFormatOn(enabled, "маленький")) levels.push({ key: "маленький", cap: caps.small });
      if (!levels.length) {
        levels = [
          { key: "большой", cap: caps.large },
          { key: "средний", cap: caps.medium },
          { key: "маленький", cap: caps.small }
        ];
      }
      var rem = g;
      var largest = levels[0];
      var nFull = Math.floor(rem / largest.cap);
      if (nFull > 0) {
        out[largest.key] += nFull;
        rem -= nFull * largest.cap;
      }
      if (rem <= 0) return out;
      for (var i = levels.length - 1; i >= 0; i--) {
        if (rem <= levels[i].cap) {
          out[levels[i].key]++;
          return out;
        }
      }
      out[largest.key] += Math.ceil(rem / largest.cap);
      return out;
    }

    function asmPackChews(val, sub, enabled) {
      var out = { "маленький": 0, "средний": 0, "большой": 0 };
      var n = Number(val) || 0;
      if (n <= 0) return out;
      var wantMed = n <= ASM_CHEW_FEW && !asmIsLargeChewFrac(sub);
      var canM = asmFormatOn(enabled, "средний");
      var canL = asmFormatOn(enabled, "большой");
      if (wantMed && canM) { out["средний"] = 1; return out; }
      var bags = Math.max(1, Math.ceil(n / ASM_CHEW_PER_BIG));
      if (canL) { out["большой"] = bags; return out; }
      if (canM) { out["средний"] = bags; return out; }
      out["большой"] = bags;
      return out;
    }

    function asmCraftBags(doy) {
      var s = Number(doy["маленький"]) || 0;
      var m = Number(doy["средний"]) || 0;
      var l = (Number(doy["большой"]) || 0) + (Number(doy["целое"]) || 0);
      if (s + m + l <= 0) return 0;
      var fill = l / ASM_CRAFT_HOLDS.large + m / ASM_CRAFT_HOLDS.medium + s / ASM_CRAFT_HOLDS.small;
      return Math.max(1, Math.ceil(fill - 1e-12));
    }

    function buildAssemblyPacksLocal(basket, enabled) {
      var packs = [];
      var doy = { "маленький": 0, "средний": 0, "большой": 0, "целое": 0 };
      function pushDist(name, sub, val, unit, type, dist) {
        ["большой", "средний", "маленький"].forEach(function (key) {
          var n = Number(dist[key]) || 0;
          if (n <= 0) return;
          doy[key] = (doy[key] || 0) + n;
          packs.push({ name: name, sub: sub, val: val, unit: unit, bags: n, type: type, counterKey: key });
        });
      }
      (basket || []).forEach(function (it) {
        var name = String(it.name || it.main || "").trim();
        var sub = String(it.sub || "").trim();
        var val = Number(it.val != null ? it.val : it.value) || 0;
        var cat = String(it.cat || "").toLowerCase();
        var unit = String(it.unit || "").trim() || (isPieceSkuName(name) || cat === "chew" || cat === "chews" ? "шт" : "гр");
        if (!name || val <= 0) return;
        var dist;
        var type = "bulk";
        if (/л[её]гк/i.test(name) && !/баран/i.test(name) && !/крошк/i.test(name)) {
          dist = asmPackGrams(val, ASM_CAP_LIGHT, enabled);
          type = "light";
        } else if (/баран/i.test(name) && /л[её]гк/i.test(name)) {
          dist = asmPackGrams(val, ASM_CAP_PRODUCT, enabled);
          type = "bulk";
        } else if (cat === "chew" || cat === "chews" || isPieceSkuName(name)) {
          dist = asmPackChews(val, sub, enabled);
          type = "chew";
        } else {
          dist = asmPackGrams(val, ASM_CAP_PRODUCT, enabled);
          type = cat === "other" ? "other" : "bulk";
        }
        pushDist(name, sub, val, unit, type, dist);
      });
      if (asmFormatOn(enabled, "крафт")) {
        var cb = asmCraftBags(doy);
        if (cb > 0) {
          packs.push({ name: "КРАФТ", sub: "", val: cb, unit: "пак", bags: cb, type: "craft", counterKey: "крафт" });
        }
      }
      return packs;
    }

    function packCountsFromBasketLocal_(basket) {
      var packs = [];
      try { packs = buildAssemblyPacksLocal(basket || [], null) || []; } catch (e0) { packs = []; }
      var out = { small: 0, medium: 0, large: 0, legs: 0, u1: 0, u2: 0, u3: 0, up4: 0 };
      packs.forEach(function (p) {
        var bags = Number(p.bags) || 0;
        if (bags <= 0) return;
        var k = String(p.counterKey || "");
        if (k === "маленький") { out.small += bags; out.u1 += bags; }
        else if (k === "средний") { out.medium += bags; out.u2 += bags; }
        else if (k === "большой" || k === "целое") { out.large += bags; out.u3 += bags; }
        else if (k === "крафт" || p.type === "craft") { out.legs += bags; out.up4 += bags; }
      });
      return out;
    }

    function syncPricePacksFromBasket_(opts) {
      opts = opts || {};
      if (!isPricePpLikeMode_()) return;
      if (pricePacksManual && !opts.force) return;
      var list = [];
      try { list = allPriceItems(); } catch (eL) { list = []; }
      var pc = packCountsFromBasketLocal_(list);
      pricePackCounts = {
        small: pc.small || 0,
        medium: pc.medium || 0,
        large: pc.large || 0,
        legs: pc.legs || 0
      };
      if (opts.force) pricePacksManual = false;
      renderPricePackCounters();
    }

    function calcPricePacksByn() {
      var sum = 0;
      Object.keys(PRICE_PACK_UNIT).forEach(function (k) {
        sum += (Number(pricePackCounts[k]) || 0) * (Number(PRICE_PACK_UNIT[k]) || 0);
      });
      return Math.round(sum * 100) / 100;
    }

    function pricePacksSummary() {
      var parts = [];
      if (pricePackCounts.small) parts.push("мал×" + pricePackCounts.small);
      if (pricePackCounts.medium) parts.push("ср×" + pricePackCounts.medium);
      if (pricePackCounts.large) parts.push("бол×" + pricePackCounts.large);
      if (pricePackCounts.legs) parts.push("ножк×" + pricePackCounts.legs);
      return parts.join(" ");
    }

  function quotePp(opts) {
    useQuote(opts);
    var packs = opts.packagesByn;
    if (packs == null && opts.packCounts) packs = packagesBynFromUCountsLocal_(opts.packCounts);
    var frac = opts.fracTotal;
    if (frac == null) frac = calcDressuraFractionMarkup(opts.list || [], opts.fracRates || _fracRates).total;
    var total = applyLocalPpFact_(opts.costSum, _coef, opts.deliveriesN, packs || 0, frac || 0, opts.packHint || "", opts.list || []);
    return { total: total, fact: _lastPpCostFact, hint: _hint };
  }

  function offerMessage(opts) {
    useQuote(opts);
    var scheme = String(opts.scheme || _scheme || "").toUpperCase();
    if (scheme === "RETAIL" || opts.mode === "retail") {
      return composeRetailClientMessage(opts.list || [], opts.retailTotal, opts.note || "");
    }
    return composePpClientMessage(opts.list || [], opts.deliveriesN, opts.note || "", opts.retailTotal, opts.subTotal, scheme, opts);
  }

  function setFetchPpCalcPrice(fn) {
    fetchPpCalcPrice_ = fn || (async function () { return null; });
  }

  return {
    PP_SCHEME_CUTOFF_YMD: PP_SCHEME_CUTOFF_YMD,
    PP_RAW26_COEF_DEFAULT: PP_RAW26_COEF_DEFAULT,
    PP_RAW26_RECOVER_100: PP_RAW26_RECOVER_100,
    PP_RAW26_RECOVER_PIECE: PP_RAW26_RECOVER_PIECE,
    PP_RAW26_DELIVERY_PER: PP_RAW26_DELIVERY_PER,
    PP_RAW26_RETAIL_CAP: PP_RAW26_RETAIL_CAP,
    PP_RAW26_RETAIL_FREE_FROM: PP_RAW26_RETAIL_FREE_FROM,
    PP_LEGACY_COEF_DEFAULT: PP_LEGACY_COEF_DEFAULT,
    PP_LEGACY_FIXED: PP_LEGACY_FIXED,
    PP_LEGACY_DELIVERY_PER: PP_LEGACY_DELIVERY_PER,
    PRICE_PACK_UNIT: PRICE_PACK_UNIT,
    PRICE_PICK_MONTH_WEEKS: PRICE_PICK_MONTH_WEEKS,
    PRICE_PICK_MONTH_DELIVERIES: PRICE_PICK_MONTH_DELIVERIES,
    ppOfferClientPrice_: ppOfferClientPrice_,
    ppSheetPrice_: ppSheetPrice_,
    raw26ApiFactPrice_: raw26ApiFactPrice_,
    ppClientDisplayPrice_: ppClientDisplayPrice_,
    applyRaw26RetailCapAlloc_: applyRaw26RetailCapAlloc_,
    capRaw26PriceToRetail_: capRaw26PriceToRetail_,
    raw26RetailCapBase_: raw26RetailCapBase_,
    recoverBynFromBasketLocal_: recoverBynFromBasketLocal_,
    capOfferSubToDisplayedRetail_: capOfferSubToDisplayedRetail_,
    composePpClientMessage: composePpClientMessage,
    composeRetailClientMessage: composeRetailClientMessage,
    stampPpCoefIntoWishes_: stampPpCoefIntoWishes_,
    stampPpSchemeIntoWishes_: stampPpSchemeIntoWishes_,
    parsePpCoefFromWishes_: parsePpCoefFromWishes_,
    parsePpSchemeFromWishes_: parsePpSchemeFromWishes_,
    stripPpMetaFromWishes_: stripPpMetaFromWishes_,
    defaultPpSchemeForNewLocal_: defaultPpSchemeForNewLocal_,
    packagesBynFromUCountsLocal_: packagesBynFromUCountsLocal_,
    packHintFromU_: packHintFromU_,
    calcDressuraFractionMarkup: calcDressuraFractionMarkup,
    recalcPpCostSum: recalcPpCostSum,
    quotePp: quotePp,
    offerMessage: offerMessage,
    pricePickParseBudget_: pricePickParseBudget_,
    pricePickParseBudgetSeg_: pricePickParseBudgetSeg_,
    parseAnketSignals_: parseAnketSignals_,
    pricePickComposeForTarget_: pricePickComposeForTarget_,
    pricePickOfferText_: pricePickOfferText_,
    pricePickDogProfile_: pricePickDogProfile_,
    pricePickFitBudget_: pricePickFitBudget_,
    pricePickLocalMonthly_: pricePickLocalMonthly_,
    pricePickTrimStep_: pricePickTrimStep_,
    pricePickScaleForBudget_: pricePickScaleForBudget_,
    pricePickDefaultStarter_: pricePickDefaultStarter_,
    priceModeKey: priceModeKey,
    priceModeLabel_: priceModeLabel_,
    raw26OfferCleanByn_: raw26OfferCleanByn_,
    setFetchPpCalcPrice: setFetchPpCalcPrice,
    useQuote: useQuote,
    getPricePpCoef: getPricePpCoef,
    buildAssemblyPacksLocal: buildAssemblyPacksLocal,
    recountPacks: function (list) {
      _list = list || [];
      priceMode = "pp";
      syncPricePacksFromBasket_({ force: true });
      return {
        counts: {
          small: pricePackCounts.small || 0,
          medium: pricePackCounts.medium || 0,
          large: pricePackCounts.large || 0,
          legs: pricePackCounts.legs || 0
        },
        byn: calcPricePacksByn(),
        hint: pricePacksSummary()
      };
    }
  };
});
