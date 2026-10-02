/* Прайс розницы владельца: getRetailPriceList / saveRetailPrices, как loadRetailPriceAdmin_. */
(function (root) {
  "use strict";

  var access = null;

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

  function paint() {
    sh().dock('<button type="button" class="b-btn b-btn--main" data-act="rp-save">Сохранить</button>');
    sh().main(
      '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>' +
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
    if (box && opts.force) box.innerHTML = '<p class="b-note">Загрузка…</p>';
    var res = null;
    try {
      var q = { action: "getRetailPriceList", telegramId: tid() };
      if (opts.force) q._ = String(Date.now());
      res = await api().apiGet(q, { timeoutMs: 20000, cacheTtlMs: opts.force ? 0 : 60000 });
    } catch (e) { res = null; }
    if (!document.getElementById("retailPriceAdminList")) return;
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

  function show() {
    paint();
    load({ soft: true });
  }

  function onAct(act, node) {
    if (act === "rp-reload") { load({ force: true }); return true; }
    if (act === "rp-save") { save(); return true; }
    if (act === "rp-add") { openAdd(); return true; }
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
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
