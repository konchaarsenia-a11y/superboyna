/* Прайс розницы владельца: getRetailPriceList / saveRetailPrices, как loadRetailPriceAdmin_. */
(function (root) {
  "use strict";

  var access = null;
  var pane = "price";

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function eng() { return root.BoinyaOrderEngine; }
  function logic() { return root.BoinyaWarehouseLogic; }
  function extras() { return root.BoinyaPriceExtras; }
  function esc(s) { return sh().esc(s); }
  function isOwner() { return !!(access && access.role === "owner"); }

  function tid() {
    var u = api().telegramUser() || {};
    return String((access && access.telegramId) || u.id || "");
  }

  function feeDefault() {
    var n = eng() && eng().PRICE_RETAIL_DELIVERY_BYN ? eng().PRICE_RETAIL_DELIVERY_BYN() : 9;
    return n;
  }

  function freeDefault() {
    var n = eng() && eng().PRICE_RETAIL_FREE_FROM ? eng().PRICE_RETAIL_FREE_FROM() : 80;
    return n;
  }

  function segBar() {
    if (!isOwner()) return "";
    function item(id, label) {
      return '<button type="button" class="b-seg__item' + (pane === id ? " b-seg__item--on" : "") + '" data-act="rp-pane" data-seg="' + id + '">' + esc(label) + "</button>";
    }
    return '<div class="b-seg" style="margin-bottom:16px">' + item("price", "Прайс") + item("cost", "Себестоимость") + "</div>";
  }

  function paint() {
    if (!isOwner()) pane = "price";
    if (pane === "cost") {
      sh().dock("");
      sh().main(
        '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>' +
        segBar() +
        '<div class="b-card" id="rawCostAdmin"><p class="b-note">Себес…</p></div>'
      );
      return;
    }
    sh().dock('<button type="button" class="b-btn b-btn--main" data-act="rp-save">Сохранить</button>');
    sh().main(
      '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>' +
      segBar() +
      '<div class="b-card">' +
        '<p class="b-lbl" style="margin-top:0">Прайс розницы</p>' +
        '<p class="b-note">Рабочие цены для новых расчётов и заказов. Уже сохранённые заказы (orderPrice) не меняются.</p>' +
        '<div class="nx-pair" style="margin-top:12px">' +
          '<div><p class="b-note">Доставка BYN</p><label class="b-field"><input class="b-field__input" type="number" id="retailPriceFeeInput" step="1" min="0" placeholder="9"></label></div>' +
          '<div><p class="b-note">Бесплатно от</p><label class="b-field"><input class="b-field__input" type="number" id="retailPriceFreeFromInput" step="1" min="0" placeholder="80"></label></div>' +
        "</div>" +
        '<div class="nx-actions" style="margin-top:12px">' +
          '<button type="button" class="b-btn b-btn--sec" data-act="rp-reload">Обновить</button>' +
          (isOwner() ? '<button type="button" class="b-btn b-btn--sec" data-act="rp-add">Добавить позицию</button>' : "") +
        "</div>" +
        '<p class="b-note" id="retailPriceAdminStatus">—</p>' +
      "</div>" +
      '<div class="b-card" style="margin-top:12px" id="retailPriceAdminList"><p class="b-note">Загрузка…</p></div>' +
      '<div class="b-card" style="margin-top:12px" id="retailPriceExtraList"></div>'
    );
  }

  function extraCard(positions) {
    var box = document.getElementById("retailPriceExtraList");
    if (!box) return;
    if (!positions || !positions.length) {
      box.innerHTML = '<p class="b-lbl" style="margin-top:0">Добавленные позиции</p><p class="b-note">Пока пусто. Новая позиция появится в заказе, в списке «+позиция».</p>';
      return;
    }
    var ex = extras();
    box.innerHTML = '<p class="b-lbl" style="margin-top:0">Добавленные позиции</p>' + positions.map(function (p) {
      var fr = (p.fractions && p.fractions.length) ? p.fractions.join(", ") : "без фракций";
      var cat = ex && ex.CATS[p.cat] ? ex.CATS[p.cat] : p.cat;
      return '<div class="nx-line"><div class="b-grow"><b>' + esc(p.name) + '</b><div class="b-note">' +
        esc(cat) + ", " + esc(fr) + ", " + esc(p.unit) + "</div></div><b>" + esc(String(p.price)) + "</b></div>";
    }).join("");
  }

  async function loadExtras() {
    var res = null;
    try {
      res = await api().apiGet({ action: "listPricePositions", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (e) { res = null; }
    var positions = (res && res.status === "success" && res.positions) ? res.positions : [];
    if (extras()) extras().remember_(positions);
    extraCard(positions);
    return positions;
  }

  function openAdd() {
    var ex = extras();
    var cats = ex ? ex.CATS : {};
    var chips = Object.keys(cats).map(function (id) {
      return '<button type="button" class="b-chip" data-act="rp-cat" data-cat="' + esc(id) + '">' + esc(cats[id]) + "</button>";
    }).join("");
    sh().openSheet({
      title: "Добавить позицию",
      id: "price-add",
      html: '<p class="b-note">Позиция допишется к прайсу и появится в заказе. Уже сохранённые заказы не меняются.</p>' +
        '<p class="b-lbl">Название</p><label class="b-field"><input class="b-field__input" id="rpNewName" placeholder="Например, УТКА"></label>' +
        '<p class="b-lbl">Категория</p><div class="b-chips" id="rpNewCats">' + chips + "</div>" +
        '<p class="b-lbl">Фракции</p><label class="b-field"><input class="b-field__input" id="rpNewFractions" placeholder="Среднее, Мелкое"></label>' +
        '<p class="b-note">Несколько через запятую. Если фракций нет, оставьте пустым.</p>' +
        '<div class="nx-pair">' +
          '<div><p class="b-lbl">Цена</p><label class="b-field"><input class="b-field__input" id="rpNewPrice" inputmode="decimal" placeholder="12"></label></div>' +
          '<div><p class="b-lbl">Единица</p><div class="b-chips">' +
            '<button type="button" class="b-chip b-chip--on" data-act="rp-unit" data-unit="гр">гр</button>' +
            '<button type="button" class="b-chip" data-act="rp-unit" data-unit="шт">шт</button>' +
          "</div></div>" +
        "</div>" +
        '<p class="b-note" id="rpNewStatus"></p>',
      foot: '<button type="button" class="b-btn b-btn--main" data-act="rp-add-save">Добавить</button>'
    });
  }

  async function savePosition() {
    if (!isOwner()) { sh().toast("Только владелец"); return; }
    var ex = extras();
    var catBtn = document.querySelector("#rpNewCats .b-chip--on");
    var unitBtn = document.querySelector('[data-act="rp-unit"].b-chip--on');
    var draft = ex.normalizePricePosition_({
      name: (document.getElementById("rpNewName") || {}).value || "",
      cat: catBtn ? catBtn.getAttribute("data-cat") : "",
      fractions: (document.getElementById("rpNewFractions") || {}).value || "",
      price: (document.getElementById("rpNewPrice") || {}).value || "",
      unit: unitBtn ? unitBtn.getAttribute("data-unit") : ""
    });
    var st = document.getElementById("rpNewStatus");
    if (!draft.ok) {
      if (st) st.textContent = draft.message;
      return;
    }
    if (st) st.textContent = "Вношу…";
    var res = null;
    try {
      res = await api().apiPost(Object.assign({ action: "addPricePosition", telegramId: tid() }, draft.position));
    } catch (e) { res = null; }
    if (!res || res.status !== "success" || !res.position) {
      if (st) st.textContent = (res && res.message) || "Не сохранилось";
      return;
    }
    sh().closeTop("ok");
    sh().toast("Позиция добавлена");
    await loadExtras();
    if (extras() && eng()) extras().installCatalog_(eng());
  }

  async function load(opts) {
    opts = opts || {};
    var box = document.getElementById("retailPriceAdminList");
    var st = document.getElementById("retailPriceAdminStatus");
    if (box && opts.force && !opts.quiet) box.innerHTML = '<p class="b-note">Загрузка…</p>';
    var res = null;
    try {
      var q = { action: "getRetailPriceList", telegramId: tid() };
      if (opts.force) q._ = String(Date.now());
      res = await api().apiGet(q, { timeoutMs: 20000, cacheTtlMs: opts.force ? 0 : 60000 });
    } catch (e) { res = null; }
    if (!document.getElementById("retailPriceAdminList")) return;
    loadRawCosts();
    box = document.getElementById("retailPriceAdminList");
    st = document.getElementById("retailPriceAdminStatus");
    if (res && res.status === "success" && eng() && eng().applyRetailPriceMapToUi_) {
      eng().applyRetailPriceMapToUi_(res.items || [], res.delivery || null);
    }
    if (!res || res.status !== "success") {
      if (box) box.innerHTML = '<p class="b-note">Не удалось загрузить. Нужен Deploy Code.gs.</p>';
      if (st) st.textContent = "ошибка загрузки";
      return;
    }
    var feeEl = document.getElementById("retailPriceFeeInput");
    var freeEl = document.getElementById("retailPriceFreeFromInput");
    if (feeEl) feeEl.value = String((res.delivery && res.delivery.fee) != null ? res.delivery.fee : feeDefault());
    if (freeEl) freeEl.value = String((res.delivery && res.delivery.freeFrom) != null ? res.delivery.freeFrom : freeDefault());
    var items = logic().visibleRetailPriceItems_(res.items || []);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<p class="b-note">Пусто</p>';
      return;
    }
    box.innerHTML = items.map(function (it) {
      var rawKey = String(it.key || "");
      var pipe = rawKey.indexOf("|");
      var main = pipe >= 0 ? rawKey.slice(0, pipe) : rawKey;
      var frac = pipe >= 0 ? rawKey.slice(pipe + 1) : "";
      var e = eng();
      var title = e && e.prettyProductName ? e.prettyProductName(main) : main;
      var word = frac && e && e.humanFraction ? e.humanFraction(main, frac) : "";
      var label = word ? (title + " · " + word) : title;
      return '<div class="nx-line">' +
        '<div class="b-grow"><b style="word-break:break-word">' + esc(label) + '</b><div class="b-note">' + esc(it.kind || "") + "</div></div>" +
        '<label class="b-field" style="width:96px;flex:none"><input class="b-field__input" type="number" step="0.01" min="0" data-rp-key="' +
        esc(it.key) + '" data-rp-kind="' + esc(it.kind || "per100") + '" value="' + (Number(it.price) || 0) + '"></label>' +
        "</div>";
    }).join("");
    if (st) {
      st.textContent = items.length + " позиций, доставка <" +
        ((res.delivery && res.delivery.freeFrom) || freeDefault()) + " → +" +
        ((res.delivery && res.delivery.fee) || feeDefault());
    }
    var positions = await loadExtras();
    if (extras() && eng() && res.items) {
      eng().applyRetailPriceMapToUi_(extras().mergeRetailItems_(res.items, positions), res.delivery || null);
      extras().installCatalog_(eng());
    }
  }

  async function save() {
    var box = document.getElementById("retailPriceAdminList");
    var st = document.getElementById("retailPriceAdminStatus");
    var inputs = box ? box.querySelectorAll("input[data-rp-key]") : [];
    var items = [];
    inputs.forEach(function (inp) {
      items.push({
        key: inp.getAttribute("data-rp-key"),
        kind: inp.getAttribute("data-rp-kind") || "per100",
        price: Number(inp.value)
      });
    });
    if (!items.length) {
      sh().toast("Нечего сохранять");
      return;
    }
    var fee = Number(document.getElementById("retailPriceFeeInput") && document.getElementById("retailPriceFeeInput").value);
    var freeFrom = Number(document.getElementById("retailPriceFreeFromInput") && document.getElementById("retailPriceFreeFromInput").value);
    var id = tid();
    if (!id) {
      sh().toast("Нет telegramId");
      return;
    }
    try {
      sh().toast("Сохраняю прайс…");
      if (st) st.textContent = "сохранение…";
      var res = await api().apiPost({
        action: "saveRetailPrices",
        telegramId: id,
        items: items,
        delivery: { fee: fee, freeFrom: freeFrom }
      });
      if (!res || res.status !== "success") {
        sh().toast((res && res.message) || "Не сохранилось — Deploy Code.gs?");
        if (st) st.textContent = (res && res.message) || "ошибка";
        return;
      }
      if (eng() && eng().applyRetailPriceMapToUi_) {
        eng().applyRetailPriceMapToUi_(res.items || items, res.delivery || { fee: fee, freeFrom: freeFrom });
      }
      sh().toast("Прайс сохранён, " + (res.saved || items.length));
      await load({});
    } catch (e) {
      sh().toast("Сеть / Deploy Code.gs");
      if (st) st.textContent = "ошибка сети";
    }
  }

  /* raw-kg-shrink: себес100 = кг/10/(1−%/100); зеркало формулы worker. */
  function cost100FromKgShrinkUi_(kg, pct) {
    var a = Number(String(kg == null ? "" : kg).replace(",", "."));
    var b = Number(String(pct == null ? "" : pct).replace(",", "."));
    if (!isFinite(a) || a < 0 || !isFinite(b) || b < 0 || b >= 100) return "";
    return String(Math.round((a / 10 / (1 - b / 100)) * 10000) / 10000);
  }

  /* chew-pcs-kg: себес/шт = цена_кг / шт_в_кг. */
  function costPieceFromKgPcsUi_(kg, pcsKg) {
    var a = Number(String(kg == null ? "" : kg).replace(",", "."));
    var n = Number(String(pcsKg == null ? "" : pcsKg).replace(",", "."));
    if (!isFinite(a) || a < 0 || !isFinite(n) || !(n > 0)) return "";
    return String(Math.round((a / n) * 10000) / 10000);
  }

  /* chew-pcs-kg: себес партии за шт = кг × вес / штук (статистика). */
  function costPieceFromBatchUi_(kg, weight, pcs) {
    var a = Number(String(kg == null ? "" : kg).replace(",", "."));
    var w = Number(String(weight == null ? "" : weight).replace(",", "."));
    var n = Number(String(pcs == null ? "" : pcs).replace(",", "."));
    if (!isFinite(a) || a < 0 || !isFinite(w) || !(w > 0) || !isFinite(n) || !(n > 0)) return "";
    return String(Math.round(((a * w) / n) * 10000) / 10000);
  }

  function costRows(items, note) {
    var box = document.getElementById("rawCostAdmin");
    if (!box || !isOwner()) return;
    var today = new Date().toISOString().slice(0, 10);
    var rows = (items || []).map(function (it) {
      var piece = !!it.piece;
      var costVal = it.cost == null || it.cost === "" ? "" : String(it.cost);
      var kgVal = it.costKg == null || it.costKg === "" ? "" : String(it.costKg);
      var pcsKgVal = it.pcsPerKg == null || it.pcsPerKg === "" ? "" : String(it.pcsPerKg);
      var pctVal = it.shrinkPct == null || it.shrinkPct === "" ? "" : String(it.shrinkPct);
      var hist = (it.history || []).map(function (h) {
        var c = h.cost == null || h.cost === "" ? "пусто" : String(h.cost);
        /* chew-pcs-kg / raw-kg-shrink: в истории кг, шт/кг или усушка. */
        var extra = "";
        if (h.costKg != null && h.costKg !== "") extra += ", кг " + h.costKg;
        if (h.pcsPerKg != null && h.pcsPerKg !== "") extra += ", шт/кг " + h.pcsPerKg;
        if (h.shrinkPct != null && h.shrinkPct !== "") extra += ", усушка " + h.shrinkPct + "%";
        if (!extra && h.shrink != null && h.shrink !== "") extra = ", выход " + h.shrink;
        return String(h.effectiveFrom || "").slice(0, 10) + " · " + c + extra;
      }).join("; ");
      var builtin = it.builtin == null || it.builtin === "" ? "в таблице пусто" : ("в коде " + it.builtin);
      var inputs;
      var batchBlock = "";
      if (piece) {
        /* chew-pcs-kg: ввод цена/кг + шт/кг → себес; партии — сравнение. */
        var piecePreview = kgVal !== "" && pcsKgVal !== "" ? costPieceFromKgPcsUi_(kgVal, pcsKgVal) : costVal;
        var hintParts = [];
        hintParts.push("в calc " + (piecePreview || costVal || "—") + "/шт");
        if (pcsKgVal) hintParts.push("ручные шт/кг " + pcsKgVal);
        if (it.batchPcsPerKg != null) hintParts.push("факт шт/кг " + it.batchPcsPerKg);
        if (it.lastBatchCost != null) hintParts.push("партия " + it.lastBatchCost + "/шт");
        if (it.batchAvg != null) hintParts.push("ср. партий " + it.batchAvg);
        var avgNote = hintParts.join(" · ");
        var batHist = (it.batches || []).map(function (b) {
          return String(b.batchDate || "").slice(0, 10) + " · " + b.costPiece + "/шт (" + b.costKg + "×" + b.weightKg + "/" + b.pieces + ")";
        }).join("; ");
        inputs =
          '<label class="b-field" style="width:84px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="costKg" placeholder="BYN/кг" value="' + esc(kgVal) + '"></label>' +
          '<label class="b-field" style="width:84px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="pcsPerKg" placeholder="шт/кг" value="' + esc(pcsKgVal) + '"></label>' +
          '<span class="b-note rc-pout" data-rc-pout="' + esc(it.sku) + '" style="min-width:72px;padding-top:10px">шт: <b>' + esc(piecePreview || "—") + "</b></span>" +
          '<label class="b-field" style="width:138px;flex:none"><input class="b-field__input" type="date" data-rc-sku="' + esc(it.sku) + '" data-rc-field="from" value="' + esc(String(it.effectiveFrom || today).slice(0, 10)) + '"></label>' +
          '<button type="button" class="b-btn b-btn--main b-btn--sm" data-act="rc-save" data-sku="' + esc(it.sku) + '">Внести</button>';
        batchBlock =
          '<div class="b-note" style="width:100%;margin:4px 0 0">' + esc(avgNote) +
          (batHist ? " · " + esc(batHist) : "") +
          '</div>' +
          '<div style="width:100%;display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;align-items:flex-start">' +
          '<label class="b-field" style="width:72px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="batchKg" placeholder="парт.кг"></label>' +
          '<label class="b-field" style="width:64px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="batchWeight" placeholder="вес"></label>' +
          '<label class="b-field" style="width:64px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="batchPcs" placeholder="шт"></label>' +
          '<span class="b-note rc-bout" data-rc-bout="' + esc(it.sku) + '" style="min-width:72px;padding-top:10px">партия: <b>—</b></span>' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="rc-batch" data-sku="' + esc(it.sku) + '" data-sku-id="' + esc(it.skuId || "") + '">Партия</button>' +
          "</div>";
      } else {
        /* raw-kg-shrink: граммы — цена/кг + усушка%; себес100 рядом (считается). */
        var preview = kgVal !== "" && pctVal !== "" ? cost100FromKgShrinkUi_(kgVal, pctVal) : costVal;
        inputs =
          '<label class="b-field" style="width:84px;flex:none"><input class="b-field__input rc-kg" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="costKg" placeholder="BYN/кг" value="' + esc(kgVal) + '"></label>' +
          '<label class="b-field" style="width:72px;flex:none"><input class="b-field__input rc-pct" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="shrinkPct" placeholder="усуш %" value="' + esc(pctVal) + '"></label>' +
          '<span class="b-note rc-out" data-rc-out="' + esc(it.sku) + '" style="min-width:64px;padding-top:10px">100г: <b>' + esc(preview || "—") + "</b></span>" +
          '<label class="b-field" style="width:138px;flex:none"><input class="b-field__input" type="date" data-rc-sku="' + esc(it.sku) + '" data-rc-field="from" value="' + esc(String(it.effectiveFrom || today).slice(0, 10)) + '"></label>' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="rc-save" data-sku="' + esc(it.sku) + '">Внести</button>';
      }
      return '<div class="nx-line" style="align-items:flex-start;flex-wrap:wrap" data-rc-row="' + esc(it.sku) + '" data-rc-piece="' + (piece ? "1" : "0") + '" data-rc-sku-id="' + esc(it.skuId || "") + '">' +
        '<div class="b-grow"><b>' + esc(it.sku) + '</b><div class="b-note">' + esc(builtin) + (piece ? " · шт" : " · г") + "</div>" +
        (hist ? '<div class="b-note">версии: ' + esc(hist) + "</div>" : "") +
        "</div>" +
        inputs +
        batchBlock +
        "</div>";
    }).join("");
    box.innerHTML = '<p class="b-lbl" style="margin-top:0">Себес сырья</p>' +
      '<p class="b-note">Единый канон D1 (sku_id). Google-книга прайса на расчёт не влияет. Новая версия — с даты; карточки не переписываем.</p>' +
      '<p class="b-note">' + esc(note || "") + "</p>" +
      /* chew-pcs-kg: цена/кг + шт/кг → себес; партии не меняют шт/кг. */
      '<p class="b-note">Граммы: BYN/кг + усушка % → 100 г. Штуки: BYN/кг + среднее шт/кг → себес/шт. Партии — сравнение (себес партии и факт шт/кг), автоматически шт/кг не перезаписывают. Старые версии и цены клиентов не трогаем.</p>' +
      '<button type="button" class="b-btn b-btn--main" data-act="rc-publish" style="margin:8px 0">Обновить прайс</button>' +
      (rows || '<p class="b-note">Пусто</p>');
    /* raw-kg-shrink + chew-pcs-kg: живой пересчёт 100г / себес шт / партии. */
    box.onchange = box.oninput = function (ev) {
      var t = ev && ev.target;
      if (!t || !t.getAttribute) return;
      var field = t.getAttribute("data-rc-field");
      var sku = t.getAttribute("data-rc-sku");
      if (!sku) return;
      var f = costFields(sku);
      if (field === "costKg" || field === "shrinkPct") {
        var out = box.querySelector('[data-rc-out="' + sku.replace(/"/g, "") + '"]');
        if (out) {
          var v = cost100FromKgShrinkUi_(f.costKg, f.shrinkPct);
          out.innerHTML = "100г: <b>" + esc(v || "—") + "</b>";
        }
      }
      if (field === "costKg" || field === "pcsPerKg") {
        var pout = box.querySelector('[data-rc-pout="' + sku.replace(/"/g, "") + '"]');
        if (pout) {
          var pv = costPieceFromKgPcsUi_(f.costKg, f.pcsPerKg);
          pout.innerHTML = "шт: <b>" + esc(pv || "—") + "</b>";
        }
      }
      if (field === "batchKg" || field === "batchWeight" || field === "batchPcs") {
        var bout = box.querySelector('[data-rc-bout="' + sku.replace(/"/g, "") + '"]');
        if (!bout) return;
        var bp = costPieceFromBatchUi_(f.batchKg, f.batchWeight, f.batchPcs);
        bout.innerHTML = "партия: <b>" + esc(bp || "—") + "</b>";
      }
    };
  }

  async function loadRawCosts() {
    var box = document.getElementById("rawCostAdmin");
    if (!box || !isOwner()) return;
    var res = null;
    try {
      res = await api().apiGet({ action: "listRawCosts", telegramId: tid(), _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    } catch (eC) { res = null; }
    if (!document.getElementById("rawCostAdmin")) return;
    if (!res || res.status !== "success") {
      box.innerHTML = '<p class="b-lbl" style="margin-top:0">Себес сырья</p><p class="b-note">Не загрузился.</p>';
      return;
    }
    costRows(res.items || [], res.shrinkNote || "");
  }

  function costFields(sku) {
    /* chew-pcs-kg: costKg+pcsPerKg для calc; batch* — статистика партий. */
    var out = { cost: "", shrink: "", costKg: "", shrinkPct: "", pcsPerKg: "", from: "", piece: false, batchKg: "", batchWeight: "", batchPcs: "", skuId: "" };
    var row = document.querySelector('[data-rc-row="' + String(sku || "").replace(/"/g, "") + '"]');
    if (row && row.getAttribute("data-rc-piece") === "1") out.piece = true;
    if (row) out.skuId = row.getAttribute("data-rc-sku-id") || "";
    var nodes = document.querySelectorAll("[data-rc-sku]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-rc-sku") !== sku) continue;
      var f = nodes[i].getAttribute("data-rc-field");
      if (f === "cost" || f === "shrink" || f === "costKg" || f === "shrinkPct" || f === "pcsPerKg" || f === "from" ||
          f === "batchKg" || f === "batchWeight" || f === "batchPcs") out[f] = nodes[i].value;
    }
    return out;
  }

  async function saveCost(sku) {
    if (!isOwner()) { sh().toast("Только владелец"); return; }
    var f = costFields(sku);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from || "")) { sh().toast("Нужна дата"); return; }
    var body = {
      action: "saveRawCost",
      telegramId: tid(),
      sku: sku,
      effectiveFrom: f.from
    };
    /* chew-pcs-kg: штуки — кг + шт/кг; граммы — кг+%. */
    if (f.piece) {
      body.costKg = f.costKg;
      body.pcsPerKg = f.pcsPerKg;
    } else {
      body.costKg = f.costKg;
      body.shrinkPct = f.shrinkPct;
    }
    var res = null;
    try {
      res = await api().apiPost(body);
    } catch (eS) { res = null; }
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Себес не сохранился");
      return;
    }
    var tip = res.fromPcsKg
      ? (" → " + res.cost + "/шт из " + res.costKg + " кг / " + res.pcsPerKg + " шт/кг")
      : (res.fromKg
        ? (" → 100г " + res.cost + " из " + res.costKg + " кг / " + res.shrinkPct + "%")
        : (res.scaled ? " (выход пересчитал)" : ""));
    sh().toast("Себес " + sku + " с " + f.from + tip + ". Прайс клиенту тот же.");
    await loadRawCosts();
  }

  /* chew-pcs-kg: партия не пишет/не меняет pcs_per_kg в raw_cost_ver. */
  async function saveBatch(sku, skuId) {
    if (!isOwner()) { sh().toast("Только владелец"); return; }
    var f = costFields(sku);
    var batchDate = f.from || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) { sh().toast("Нужна дата"); return; }
    var preview = costPieceFromBatchUi_(f.batchKg, f.batchWeight, f.batchPcs);
    if (!preview) { sh().toast("Нужны BYN/кг, вес кг и штук"); return; }
    var pcsBefore = f.pcsPerKg;
    var res = null;
    try {
      res = await api().apiPost({
        action: "savePieceBatch",
        telegramId: tid(),
        sku: sku,
        skuId: skuId || f.skuId || "",
        batchDate: batchDate,
        costKg: f.batchKg,
        weightKg: f.batchWeight,
        pieces: f.batchPcs
      });
    } catch (eB) { res = null; }
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Партия не сохранилась");
      return;
    }
    sh().toast(
      "Партия " + sku + ": " + res.costPiece + "/шт" +
      (res.batchPcsPerKg != null ? (", факт " + res.batchPcsPerKg + " шт/кг") : "") +
      (pcsBefore ? ("; ручные шт/кг " + pcsBefore + " без изменений") : "") +
      ". Прайс клиенту тот же."
    );
    await loadRawCosts();
  }

  async function publishPrices() {
    if (!isOwner()) { sh().toast("Только владелец"); return; }
    var ok = await sh().confirm({
      title: "Обновить прайс",
      text: "Розница пересчитается от нового себеса. Уже внесённые заказы и карточки не трогаем. Дальше обновите Instagram.",
      ok: "Обновить"
    });
    if (!ok) return;
    var res = null;
    try {
      res = await api().apiPost({ action: "publishRetailFromCosts", telegramId: tid() });
    } catch (eP) { res = null; }
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Прайс не обновился");
      return;
    }
    sh().toast(res.changed ? ("Прайс обновлён, позиций " + res.changed + ". Обновите Instagram.") : "Себес не менялся — цены те же.");
    pane = "price";
    paint();
    await load({ force: true });
  }

  function show() {
    if (!isOwner()) pane = "price";
    paint();
    if (pane === "cost") loadRawCosts();
    else load({ soft: true });
  }

  function refreshQuiet() {
    var a = document.activeElement;
    if (pane === "cost") {
      var costs = document.getElementById("rawCostAdmin");
      if (!costs || (a && costs.contains(a))) return;
      loadRawCosts();
      return;
    }
    if (!document.getElementById("retailPriceAdminList")) return;
    var box = document.getElementById("retailPriceAdminList");
    if (a && box && box.contains(a)) return;
    load({ force: true, quiet: true });
  }

  function onAct(act, node) {
    if (act === "rp-pane") {
      var next = node && node.getAttribute("data-seg");
      if (!isOwner() || (next !== "price" && next !== "cost") || next === pane) return true;
      pane = next;
      show();
      return true;
    }
    if (act === "rp-reload") { load({ force: true }); return true; }
    if (act === "rp-save") { save(); return true; }
    if (act === "rp-add") { openAdd(); return true; }
    if (act === "rc-save") { saveCost(node && node.getAttribute("data-sku")); return true; }
    /* chew-batch-avg: кнопка «Партия» — savePieceBatch. */
    if (act === "rc-batch") { saveBatch(node && node.getAttribute("data-sku"), node && node.getAttribute("data-sku-id")); return true; }
    if (act === "rc-publish") { publishPrices(); return true; }
    if (act === "rp-add-save") { savePosition(); return true; }
    if (act === "rp-cat" || act === "rp-unit") {
      if (!node || !node.parentNode) return true;
      var kids = node.parentNode.querySelectorAll("[data-act]");
      var i;
      for (i = 0; i < kids.length; i++) kids[i].classList.remove("b-chip--on");
      node.classList.add("b-chip--on");
      return true;
    }
    return false;
  }

  root.BoinyaRetailAdmin = {
    bind: function (a) { access = a; },
    show: show,
    refreshQuiet: refreshQuiet,
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
