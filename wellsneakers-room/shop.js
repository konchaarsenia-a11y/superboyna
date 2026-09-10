(function () {
  "use strict";

  var STORAGE_KEY = "ws_room_cart_v1";

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function cartCount(cart) {
    return cart.reduce(function (n, line) {
      return n + (line.qty || 1);
    }, 0);
  }

  function money(n) {
    return Number(n).toFixed(0) + " BYN";
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }

  function updateBadges() {
    var n = cartCount(loadCart());
    var sticker = document.getElementById("cartSticker");
    if (!sticker) return;
    if (n > 0) {
      sticker.hidden = false;
      sticker.textContent = String(n);
      sticker.classList.add("hot");
      sticker.setAttribute("aria-label", n + " в корзине");
    } else {
      sticker.hidden = true;
      sticker.textContent = "0";
      sticker.classList.remove("hot");
      sticker.removeAttribute("aria-label");
    }
  }

  function renderCart() {
    var list = document.getElementById("cartList");
    var totalEl = document.getElementById("cartTotal");
    if (!list || !totalEl) return;
    var cart = loadCart();
    list.innerHTML = "";
    var total = 0;
    if (!cart.length) {
      list.innerHTML = '<p class="cart-empty">Пока пусто — загляни в каталог</p>';
    } else {
      cart.forEach(function (line, idx) {
        total += line.price * line.qty;
        var row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML =
          "<div><strong>" +
          line.name +
          '</strong><div class="meta">' +
          line.size +
          " · " +
          line.qty +
          " шт</div></div>" +
          '<div class="sum" style="display:flex;align-items:center;gap:8px">' +
          money(line.price * line.qty) +
          ' <button type="button" data-rm="' +
          idx +
          '" aria-label="Убрать" style="border:0;background:transparent;color:var(--muted);font-size:22px;line-height:1;font-family:var(--display)">×</button></div>';
        list.appendChild(row);
      });
    }
    totalEl.textContent = money(total);
    list.querySelectorAll("[data-rm]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cart2 = loadCart();
        cart2.splice(Number(btn.getAttribute("data-rm")), 1);
        saveCart(cart2);
        updateBadges();
        renderCart();
      });
    });
  }

  function openCart() {
    var sheet = document.getElementById("cartSheet");
    var bg = document.getElementById("sheetBg");
    if (!sheet) return;
    renderCart();
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    if (bg) bg.classList.add("open");
  }

  function closeCart() {
    var sheet = document.getElementById("cartSheet");
    var bg = document.getElementById("sheetBg");
    if (!sheet) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    if (bg) bg.classList.remove("open");
  }

  function addFromCard(card) {
    var sizeBtn = card.querySelector(".size.on");
    if (!sizeBtn) {
      toast("Выбери размер");
      return;
    }
    var id = card.getAttribute("data-id");
    var name = card.getAttribute("data-name");
    var price = Number(card.getAttribute("data-price") || 0);
    var size = sizeBtn.textContent.trim();
    var cart = loadCart();
    var found = cart.find(function (l) {
      return l.id === id && l.size === size;
    });
    if (found) found.qty += 1;
    else
      cart.push({
        id: id,
        name: name,
        size: size,
        price: price,
        qty: 1,
      });
    saveCart(cart);
    updateBadges();
    toast("В корзине");
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function getFilterState() {
    var state = { gender: qs("gender"), type: qs("type"), brand: "", sale: "", size: "" };
    if (qs("sale") === "1" || qs("sale") === "true") state.sale = "1";
    document.querySelectorAll("#catalogFilters [data-filter].on").forEach(function (btn) {
      var key = btn.getAttribute("data-filter");
      var val = btn.getAttribute("data-value") || "";
      if (!key) return;
      state[key] = val;
    });
    return state;
  }

  function syncFilterButtons(state) {
    document.querySelectorAll("#catalogFilters [data-filter]").forEach(function (btn) {
      var key = btn.getAttribute("data-filter");
      var val = btn.getAttribute("data-value") || "";
      var on = false;
      if (key === "brand") on = (state.brand || "") === val;
      else if (key === "size") on = (state.size || "") === val;
      btn.classList.toggle("on", on);
    });
    if (!state.brand) {
      var bAll = document.querySelector('#catalogFilters [data-filter="brand"][data-value=""]');
      if (bAll) bAll.classList.add("on");
    }
    if (!state.size) {
      var sAll = document.querySelector('#catalogFilters [data-filter="size"][data-value=""]');
      if (sAll) sAll.classList.add("on");
    }
    updateDropLabels(state);
  }

  function updateDropLabels(state) {
    var brandsLabel = document.getElementById("brandsLabel");
    var sizesLabel = document.getElementById("sizesLabel");
    var brandBtn = document.querySelector(
      '#catalogFilters [data-filter="brand"][data-value="' + (state.brand || "") + '"]'
    );
    var sizeBtn = document.querySelector(
      '#catalogFilters [data-filter="size"][data-value="' + (state.size || "") + '"]'
    );
    if (brandsLabel) {
      brandsLabel.textContent =
        (brandBtn && brandBtn.getAttribute("data-label")) || (state.brand ? state.brand : "Все бренды");
    }
    if (sizesLabel) {
      sizesLabel.textContent =
        (sizeBtn && sizeBtn.getAttribute("data-label")) || (state.size ? state.size : "Все размеры");
    }
  }

  function cardHasSize(card, size) {
    if (!size) return true;
    var found = false;
    card.querySelectorAll(".size").forEach(function (btn) {
      if (btn.textContent.trim() === size) found = true;
    });
    return found;
  }

  function applyFilters() {
    var list = document.getElementById("catalogList");
    var empty = document.getElementById("catalogEmpty");
    if (!list) return;
    var state = getFilterState();
    var visible = 0;
    list.querySelectorAll(".prod").forEach(function (card) {
      var ok = true;
      if (state.gender) {
        var g = card.getAttribute("data-gender") || "";
        if (g !== state.gender && g !== "uni") ok = false;
      }
      if (state.type && card.getAttribute("data-type") !== state.type) ok = false;
      if (state.brand && card.getAttribute("data-brand") !== state.brand) ok = false;
      if (state.sale === "1" && card.getAttribute("data-sale") !== "1") ok = false;
      if (state.size && !cardHasSize(card, state.size)) ok = false;
      card.classList.toggle("hidden", !ok);
      if (ok) visible += 1;
    });
    if (empty) empty.classList.toggle("show", visible === 0);
  }

  function initFiltersFromUrl() {
    var state = {
      gender: qs("gender"),
      type: qs("type"),
      brand: qs("brand"),
      size: qs("size"),
      sale: qs("sale") === "1" || qs("sale") === "true" ? "1" : "",
    };
    if (state.brand === "WS Wear") state.brand = "ws";
    if (state.brand === "Nike") state.brand = "nike";
    if (state.brand === "Adidas") state.brand = "adidas";
    if (state.brand === "Jordan") state.brand = "jordan";
    syncFilterButtons(state);
    if (state.brand) openPanel("brandsPanel", "toggleBrands", true);
    if (state.size) openPanel("sizesPanel", "toggleSizes", true);
    applyFilters();
  }

  function openPanel(panelId, toggleId, forceOpen) {
    var panel = document.getElementById(panelId);
    var toggle = document.getElementById(toggleId);
    if (!panel || !toggle) return;
    var open = forceOpen === true ? true : forceOpen === false ? false : panel.hidden;
    panel.hidden = !open;
    toggle.classList.toggle("on", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindFilterPanels() {
    var brandsBtn = document.getElementById("toggleBrands");
    var sizesBtn = document.getElementById("toggleSizes");
    if (brandsBtn) {
      brandsBtn.addEventListener("click", function () {
        var panel = document.getElementById("brandsPanel");
        openPanel("brandsPanel", "toggleBrands", panel && panel.hidden);
        openPanel("sizesPanel", "toggleSizes", false);
      });
    }
    if (sizesBtn) {
      sizesBtn.addEventListener("click", function () {
        var panel = document.getElementById("sizesPanel");
        openPanel("sizesPanel", "toggleSizes", panel && panel.hidden);
        openPanel("brandsPanel", "toggleBrands", false);
      });
    }
  }

  function bindFilters() {
    var root = document.getElementById("catalogFilters");
    if (!root) return;
    bindFilterPanels();
    initFiltersFromUrl();
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter]");
      if (!btn || !root.contains(btn)) return;
      var key = btn.getAttribute("data-filter");
      var val = btn.getAttribute("data-value") || "";
      var state = getFilterState();

      if (key === "brand") state.brand = val;
      else if (key === "size") state.size = val;
      else return;

      syncFilterButtons(state);
      applyFilters();
      // collapse after pick
      if (key === "brand") openPanel("brandsPanel", "toggleBrands", false);
      if (key === "size") openPanel("sizesPanel", "toggleSizes", false);

      var params = new URLSearchParams(window.location.search);
      if (state.brand) params.set("brand", state.brand);
      else params.delete("brand");
      if (state.size) params.set("size", state.size);
      else params.delete("size");
      var q = params.toString();
      history.replaceState(null, "", "catalog.html" + (q ? "?" + q : ""));
    });
  }

  function bindProducts() {
    document.querySelectorAll(".prod").forEach(function (card) {
      var sizes = card.querySelector("[data-sizes]");
      if (sizes) {
        sizes.addEventListener("click", function (e) {
          var s = e.target.closest(".size");
          if (!s) return;
          sizes.querySelectorAll(".size").forEach(function (x) {
            x.classList.remove("on");
          });
          s.classList.add("on");
        });
      }
      var add = card.querySelector("[data-add]");
      if (add) {
        add.addEventListener("click", function () {
          addFromCard(card);
        });
      }
    });
  }

  function bindCartChrome() {
    ["openCart", "openCartDock"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("click", openCart);
    });
    var bg = document.getElementById("sheetBg");
    if (bg) bg.addEventListener("click", closeCart);
    var checkout = document.getElementById("checkout");
    if (checkout) {
      checkout.addEventListener("click", function () {
        if (!loadCart().length) {
          toast("Корзина пуста");
          return;
        }
        toast("Демо: заказ не отправляется");
      });
    }
  }

  function bindPerkChips() {
    var root = document.querySelector("#perks .perks");
    if (!root) return;
    var items = root.querySelectorAll("details.perk");
    items.forEach(function (el) {
      el.addEventListener("toggle", function () {
        if (!el.open) return;
        items.forEach(function (other) {
          if (other !== el) other.open = false;
        });
      });
    });
  }

  function bindHomeScrollBrand() {
    if (!document.body.classList.contains("page-home")) return;
    var hero = document.querySelector(".hero");
    var cats = document.getElementById("catsAnchor");
    function sync() {
      var y = window.scrollY || 0;
      var logoAt = hero ? Math.max(120, hero.offsetHeight * 0.42) : 140;
      var navAt = cats ? cats.offsetTop - 24 : logoAt + 180;
      document.body.classList.toggle("is-scrolled", y > logoAt);
      document.body.classList.toggle("is-nav", y > navAt);
    }
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
  }

  document.addEventListener("DOMContentLoaded", function () {
    updateBadges();
    bindCartChrome();
    bindProducts();
    bindFilters();
    bindHomeScrollBrand();
    bindPerkChips();
  });
})();
