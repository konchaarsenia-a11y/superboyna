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
      return '<div class="nx-line">' +
        '<div class="b-grow"><b style="word-break:break-word">' + esc(it.key) + '</b><div class="b-note">' + esc(it.kind || "") + "</div></div>" +
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

  function costRows(items, note) {
    var box = document.getElementById("rawCostAdmin");
    if (!box || !isOwner()) return;
    var today = new Date().toISOString().slice(0, 10);
    var rows = (items || []).map(function (it) {
      var costVal = it.cost == null || it.cost === "" ? "" : String(it.cost);
      var shrinkVal = it.shrink == null || it.shrink === "" ? "" : String(it.shrink);
      var hist = (it.history || []).map(function (h) {
        var c = h.cost == null || h.cost === "" ? "пусто" : String(h.cost);
        var shv = h.shrink == null || h.shrink === "" ? "" : ", усушка " + h.shrink;
        return String(h.effectiveFrom || "").slice(0, 10) + " · " + c + shv;
      }).join("; ");
      var builtin = it.builtin == null || it.builtin === "" ? "в таблице пусто" : ("в коде " + it.builtin);
      return '<div class="nx-line" style="align-items:flex-start">' +
        '<div class="b-grow"><b>' + esc(it.sku) + '</b><div class="b-note">' + esc(builtin) + "</div>" +
        (hist ? '<div class="b-note">версии: ' + esc(hist) + "</div>" : "") +
        "</div>" +
        '<label class="b-field" style="width:84px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="cost" placeholder="себес" value="' + esc(costVal) + '"></label>' +
        '<label class="b-field" style="width:72px;flex:none"><input class="b-field__input" inputmode="decimal" data-rc-sku="' + esc(it.sku) + '" data-rc-field="shrink" placeholder="усушка" value="' + esc(shrinkVal) + '"></label>' +
        '<label class="b-field" style="width:138px;flex:none"><input class="b-field__input" type="date" data-rc-sku="' + esc(it.sku) + '" data-rc-field="from" value="' + esc(String(it.effectiveFrom || today).slice(0, 10)) + '"></label>' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="rc-save" data-sku="' + esc(it.sku) + '">Внести</button>' +
        "</div>";
    }).join("");
    box.innerHTML = '<p class="b-lbl" style="margin-top:0">Себес сырья</p>' +
      '<p class="b-note">Новая версия действует с даты. Расчёт, экономика, статистика и внос берут себес на дату записи. Старые карточки не переписываются.</p>' +
      '<p class="b-note">' + esc(note || "Усушка хранится отдельно и в цену не входит.") + "</p>" +
      '<p class="b-note">Колонки: себес, усушка, дата действия.</p>' +
      (rows || '<p class="b-note">Пусто</p>');
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
    var out = { cost: "", shrink: "", from: "" };
    var nodes = document.querySelectorAll("[data-rc-sku]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-rc-sku") !== sku) continue;
      var f = nodes[i].getAttribute("data-rc-field");
      if (f === "cost" || f === "shrink" || f === "from") out[f] = nodes[i].value;
    }
    return out;
  }

  async function saveCost(sku) {
    if (!isOwner()) { sh().toast("Только владелец"); return; }
    var f = costFields(sku);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from || "")) { sh().toast("Нужна дата"); return; }
    var res = null;
    try {
      res = await api().apiPost({
        action: "saveRawCost",
        telegramId: tid(),
        sku: sku,
        cost: f.cost,
        shrink: f.shrink,
        effectiveFrom: f.from
      });
    } catch (eS) { res = null; }
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Себес не сохранился");
      return;
    }
    sh().toast("Себес " + sku + " с " + f.from);
    await loadRawCosts();
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
