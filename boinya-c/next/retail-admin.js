/* Прайс розницы владельца: getRetailPriceList / saveRetailPrices, как loadRetailPriceAdmin_. */
(function (root) {
  "use strict";

  var access = null;

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function eng() { return root.BoinyaOrderEngine; }
  function logic() { return root.BoinyaWarehouseLogic; }
  function esc(s) { return sh().esc(s); }

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
      '<div class="b-card">' +
        '<p class="b-lbl" style="margin-top:0">Прайс розницы</p>' +
        '<p class="b-note">Рабочие цены для новых расчётов и заказов. Уже сохранённые заказы (orderPrice) не меняются.</p>' +
        '<div class="nx-pair" style="margin-top:12px">' +
          '<div><p class="b-note">Доставка BYN</p><label class="b-field"><input class="b-field__input" type="number" id="retailPriceFeeInput" step="1" min="0" placeholder="9"></label></div>' +
          '<div><p class="b-note">Бесплатно от</p><label class="b-field"><input class="b-field__input" type="number" id="retailPriceFreeFromInput" step="1" min="0" placeholder="80"></label></div>' +
        "</div>" +
        '<div class="nx-actions" style="margin-top:12px">' +
          '<button type="button" class="b-btn b-btn--sec" data-act="rp-reload">Обновить</button>' +
        "</div>" +
        '<p class="b-note" id="retailPriceAdminStatus">—</p>' +
      "</div>" +
      '<div class="b-card" style="margin-top:12px" id="retailPriceAdminList"><p class="b-note">Загрузка…</p></div>'
    );
  }

  async function load(opts) {
    opts = opts || {};
    var box = document.getElementById("retailPriceAdminList");
    var st = document.getElementById("retailPriceAdminStatus");
    if (box && !opts.soft) box.innerHTML = '<p class="b-note">Загрузка…</p>';
    var res = null;
    try {
      res = await api().apiGet({
        action: "getRetailPriceList",
        telegramId: tid(),
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: opts.soft ? 60000 : 0 });
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
      st.textContent = items.length + " позиций · доставка <" +
        ((res.delivery && res.delivery.freeFrom) || freeDefault()) + " → +" +
        ((res.delivery && res.delivery.fee) || feeDefault());
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
      sh().toast("Прайс сохранён · " + (res.saved || items.length));
      await load({});
    } catch (e) {
      sh().toast("Сеть / Deploy Code.gs");
      if (st) st.textContent = "ошибка сети";
    }
  }

  function show() {
    paint();
    load({});
  }

  function onAct(act) {
    if (act === "rp-reload") { load({}); return true; }
    if (act === "rp-save") { save(); return true; }
    return false;
  }

  root.BoinyaRetailAdmin = {
    bind: function (a) { access = a; },
    show: show,
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
