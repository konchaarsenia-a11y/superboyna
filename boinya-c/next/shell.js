/* Каркас: шапка, колокольчик, нижняя панель, нижний лист, тост, состояния. */
(function (root) {
  "use strict";

  var ICONS = {
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"/><path d="M10 18a2 2 0 0 0 4 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/>',
    more: '<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    close: '<path d="M7 7l10 10M17 7L7 17"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
    orders: '<path d="M8 7h11M8 12h11M8 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
    clients: '<path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3"/><path d="M20 20v-1.2A3 3 0 0 0 17.2 16"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/>',
    production: '<path d="M4 19V9l5 3V9l5 3V6l6 4v9"/><path d="M4 19h16"/>',
    warehouse: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
    goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    wifi: '<path d="M5 12a10 10 0 0 1 14 0"/><path d="M8 15a6 6 0 0 1 8 0"/><path d="M12 18h.01"/>',
    doc: '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6"/>',
    pen: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.2-5.5"/><path d="M20 4v5h-5"/>',
    phone: '<path d="M8 3h3l1 4-2 1a12 12 0 0 0 6 6l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 6 5a2 2 0 0 1 2-2z"/>'
  };

  var appEl = null;
  var sheetStack = [];
  var toastTimer = null;
  var loaderTimer = null;
  var watchdog = null;
  var actHandler = null;

  function ico(name, cls) {
    var p = ICONS[name] || ICONS.more;
    return '<svg class="' + (cls || "b-ico") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var x = Math.round(Number(n) * 100) / 100;
    if (!isFinite(x)) x = 0;
    return x.toFixed(2).replace(".", ",");
  }

  function el(id) {
    return document.getElementById(id);
  }

  function mount(node) {
    appEl = node;
    appEl.innerHTML =
      '<div class="nx" id="nxRoot">' +
        '<header class="b-top" id="nxTop"></header>' +
        '<div class="b-busy" id="nxBusy" hidden></div>' +
        '<main class="nx-main" id="nxMain"></main>' +
        '<div class="nx-dock" id="nxDock" hidden></div>' +
        '<nav class="b-nav" id="nxNav" hidden></nav>' +
      "</div>" +
      '<div class="nx-scrim" id="nxScrim" hidden></div>' +
      '<div class="nx-toast-wrap" id="nxToast" hidden></div>' +
      '<div class="nx-gate" id="nxGate" hidden></div>';
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    var scrim = el("nxScrim");
    scrim.addEventListener("click", function (e) {
      if (e.target === scrim) closeTop("scrim");
    });
    scrim.addEventListener("touchstart", onTouchStart, { passive: true });
    scrim.addEventListener("touchmove", onTouchMove, { passive: true });
    scrim.addEventListener("touchend", onTouchEnd);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheetStack.length) closeTop("x");
    });
    bindTitleUnlock();
  }

  var holdAt = 0;
  function bindTitleUnlock() {
    function onTitle(e) {
      return !!(e.target && e.target.closest && e.target.closest(".b-top__title"));
    }
    appEl.addEventListener("pointerdown", function (e) {
      if (!onTitle(e)) return;
      holdAt = Date.now();
    });
    appEl.addEventListener("pointerup", function () {
      if (!holdAt) return;
      if ((Date.now() - holdAt) >= 650) unlockStuck();
      holdAt = 0;
    });
    appEl.addEventListener("pointercancel", function () { holdAt = 0; });
  }

  function roleMayDropGate() {
    var role = "";
    try { role = document.body.getAttribute("data-nx-role") || ""; } catch (e) {}
    return role === "owner" || role === "manager" || role === "all" || role === "courier" || role === "cutter";
  }

  function unlockStuck() {
    clearTimeout(loaderTimer);
    clearTimeout(watchdog);
    sheetStack = [];
    paintSheet();
    var gate = el("nxGate");
    if (gate && !gate.hidden && roleMayDropGate()) gate.hidden = true;
    try {
      document.body.style.pointerEvents = "auto";
      document.documentElement.style.pointerEvents = "auto";
    } catch (e) {}
    toast("UI разблокирован");
  }

  function onClick(e) {
    var node = e.target.closest("[data-act]");
    if (!node) {
      if (!e.target.closest("input, textarea, select, .b-field")) blurIfSwipe(e);
      return;
    }
    var act = node.getAttribute("data-act");
    if (act === "sheet-close") {
      e.preventDefault();
      closeTop("x");
      return;
    }
    if (act === "toast-hide") {
      hideToast();
      return;
    }
    if (actHandler) actHandler(act, node, e);
  }

  function onInput(e) {
    if (actHandler) actHandler("input", e.target, e);
  }

  function onChange(e) {
    if (actHandler) actHandler("change", e.target, e);
  }

  var touchY = 0;
  var touchDy = 0;
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    touchY = t ? t.clientY : 0;
    touchDy = 0;
  }
  function onTouchMove(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    touchDy = t.clientY - touchY;
    var sheet = el("nxScrim") && el("nxScrim").querySelector(".b-sheet");
    if (sheet && touchDy > 0) sheet.style.transform = "translateY(" + Math.min(touchDy, 180) + "px)";
  }
  function onTouchEnd() {
    var sheet = el("nxScrim") && el("nxScrim").querySelector(".b-sheet");
    if (sheet) sheet.style.transform = "";
    if (touchDy > 80) closeTop("swipe");
    if (touchDy > 80) blurActive();
    touchDy = 0;
  }

  function blurIfSwipe() {}
  function blurActive() {
    try {
      var a = document.activeElement;
      if (a && a.blur) a.blur();
    } catch (e) {}
  }

  function setHandler(fn) {
    actHandler = fn;
  }

  var fitGen = 0;
  function fitHeaderTitle() {
    var gen = ++fitGen;
    var sizes = ["", "var(--b-f16)", "var(--b-f14)", "var(--b-f12)"];
    function run() {
      if (gen !== fitGen) return;
      var top = el("nxTop");
      var title = top && top.querySelector(".b-top__title");
      if (!title) return;
      function pass(tight) {
        top.classList.toggle("b-top--tight", !!tight);
        var i;
        for (i = 0; i < sizes.length; i++) {
          title.style.fontSize = sizes[i];
          if (title.scrollWidth <= title.clientWidth + 1) return true;
        }
        return false;
      }
      if (!pass(false)) pass(true);
    }
    run();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  }

  function chrome(opts) {
    opts = opts || {};
    var bell = "";
    if (opts.bell) {
      var badge = opts.badge > 0
        ? '<span class="b-badge">' + esc(opts.badge > 99 ? "99+" : String(opts.badge)) + "</span>"
        : "";
      bell = '<button class="b-ib" type="button" data-act="tasks" aria-label="Задачи">' + ico("bell") + badge + "</button>";
    }
    el("nxTop").innerHTML =
      '<div class="b-top__ctx">' +
        '<h1 class="b-top__title">' + esc(opts.title || "") + "</h1>" +
        '<p class="b-top__sub">' + esc(opts.sub || "") + "</p>" +
      "</div>" +
      '<button class="b-ib" type="button" data-act="help" aria-label="Справка">' + ico("info", "b-ico b-ico--20") + "</button>" +
      '<button class="b-ib" type="button" data-act="menu" aria-label="Меню">' + ico("dots", "b-ico b-ico--20") + "</button>" +
      bell;
    fitHeaderTitle();
    var nav = el("nxNav");
    var items = opts.nav || [];
    if (!items.length) {
      nav.hidden = true;
      nav.innerHTML = "";
    } else {
      nav.hidden = false;
      nav.classList.toggle("nx-nav--6", items.length >= 6);
      nav.setAttribute("data-nav-count", String(items.length));
      nav.innerHTML = items.map(function (it) {
        var on = it.id === opts.active ? " b-nav__item--on" : "";
        return '<button class="b-nav__item' + on + '" type="button" data-act="nav" data-tab="' + esc(it.id) + '">' +
          ico(it.id === "more" ? "dots" : it.id) +
          '<span class="b-nav__lbl">' + esc(it.label) + "</span></button>";
      }).join("");
    }
  }

  function main(html) {
    el("nxMain").innerHTML = html;
    el("nxMain").scrollTop = 0;
  }

  function dock(html) {
    var d = el("nxDock");
    if (!html) {
      d.hidden = true;
      d.innerHTML = "";
      return;
    }
    d.hidden = false;
    d.innerHTML = html;
  }

  function busy(on, sec) {
    var bar = el("nxBusy");
    if (!bar) return;
    if (!on) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    bar.innerHTML = '<span class="b-spin"></span><span>Идёт обработка…</span><span class="b-busy__sec">' +
      esc(String(sec || 8)) + " с</span><span>можно работать дальше</span>";
  }

  function toast(text) {
    var box = el("nxToast");
    box.hidden = false;
    box.innerHTML = '<div class="b-toast" role="status"><span class="b-toast__mark">' + ico("info", "b-ico b-ico--18") +
      "</span><span class=\"b-grow\">" + esc(text) + "</span></div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }

  function hideToast() {
    var box = el("nxToast");
    if (box) box.hidden = true;
  }

  function paintSheet() {
    var scrim = el("nxScrim");
    var top = sheetStack[sheetStack.length - 1];
    if (!top) {
      scrim.hidden = true;
      scrim.innerHTML = "";
      return;
    }
    scrim.hidden = false;
    var closeBtn = top.hideClose ? "" : '<button class="b-ib" type="button" data-act="sheet-close" aria-label="Закрыть">' + ico("close", "b-ico b-ico--20") + "</button>";
    scrim.innerHTML =
      '<section class="b-sheet nx-sheet" role="dialog" aria-modal="true" aria-label="' + esc(top.title || "Лист") + '">' +
        '<div class="b-sheet__grab" data-act="sheet-grab"></div>' +
        '<div class="b-sheet__head"><h2 class="b-sheet__title">' + esc(top.title || "") + "</h2>" + closeBtn + "</div>" +
        '<div class="nx-sheet__body">' + (top.html || "") + "</div>" +
        (top.foot ? '<div class="nx-sheet__foot">' + top.foot + "</div>" : "") +
      "</section>";
  }

  function openSheet(opts) {
    sheetStack.push({
      title: opts.title || "",
      html: opts.html || "",
      foot: opts.foot || "",
      hideClose: !!opts.hideClose,
      onClose: opts.onClose || null,
      id: opts.id || ""
    });
    paintSheet();
  }

  function replaceTop(opts) {
    if (!sheetStack.length) return openSheet(opts);
    var cur = sheetStack[sheetStack.length - 1];
    cur.title = opts.title != null ? opts.title : cur.title;
    cur.html = opts.html != null ? opts.html : cur.html;
    if (opts.foot != null) cur.foot = opts.foot;
    paintSheet();
  }

  function closeTop(how) {
    var top = sheetStack.pop();
    paintSheet();
    if (top && top.onClose) top.onClose(how || "x");
  }

  function closeAll() {
    sheetStack = [];
    paintSheet();
  }

  function sheetOpen() {
    return sheetStack.length > 0;
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      openSheet({
        title: opts.title || "",
        html:
          '<p class="b-note" style="color:var(--b-text);font-size:var(--b-f16);margin:0 0 16px">' + esc(opts.text || "").replace(/\n/g, "<br>") + "</p>" +
          (opts.extra || "") +
          '<button class="b-btn b-btn--main" type="button" data-act="dlg-ok">' + esc(opts.ok || "Да") + "</button>" +
          (opts.alt ? '<button class="b-btn b-btn--sec" type="button" data-act="dlg-alt" style="margin-top:8px">' + esc(opts.alt) + "</button>" : "") +
          (opts.cancel === "" ? "" : '<button class="b-btn b-btn--sec" type="button" data-act="dlg-no" style="margin-top:8px">' + esc(opts.cancel || "Отмена") + "</button>"),
        onClose: function () { done(false); }
      });
      var prev = actHandler;
      var wrap = function (act, node, e) {
        if (act === "dlg-ok") { closeTop("ok"); done(true); return; }
        if (act === "dlg-alt") { closeTop("alt"); done("alt"); return; }
        if (act === "dlg-no") { closeTop("no"); done(false); return; }
        if (prev) prev(act, node, e);
      };
      actHandler = wrap;
      var origClose = sheetStack[sheetStack.length - 1].onClose;
      sheetStack[sheetStack.length - 1].onClose = function (how) {
        actHandler = prev;
        if (origClose && how !== "ok" && how !== "alt" && how !== "no") origClose(how);
        if (how !== "ok" && how !== "alt") done(false);
      };
    });
  }

  function choice(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      var buttons = (opts.options || []).map(function (o) {
        return '<button class="b-btn b-btn--sec" type="button" data-act="dlg-choice" data-value="' + esc(o.value) + '" style="margin-top:8px">' + esc(o.label) + "</button>";
      }).join("");
      openSheet({
        title: opts.title || "",
        html: '<p class="b-note" style="color:var(--b-text);font-size:var(--b-f16);margin:0 0 8px">' + esc(opts.text || "") + "</p>" + buttons,
        onClose: function () { done(null); }
      });
      var prev = actHandler;
      actHandler = function (act, node, e) {
        if (act === "dlg-choice") {
          var v = node.getAttribute("data-value");
          closeTop("ok");
          done(v);
          return;
        }
        if (prev) prev(act, node, e);
      };
      sheetStack[sheetStack.length - 1].onClose = function (how) {
        actHandler = prev;
        if (how !== "ok") done(null);
      };
    });
  }

  function prompt(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      openSheet({
        title: opts.title || "",
        html:
          '<p class="b-note" style="margin:0 0 12px">' + esc(opts.text || "") + "</p>" +
          '<label class="b-field"><input class="b-field__input" id="nxPrompt" value="' + esc(opts.value || "") + '" autocomplete="off"></label>' +
          '<div style="height:12px"></div>' +
          '<button class="b-btn b-btn--main" type="button" data-act="dlg-prompt-ok">' + esc(opts.ok || "Готово") + "</button>",
        onClose: function () { done(null); }
      });
      var prev = actHandler;
      actHandler = function (act, node, e) {
        if (act === "dlg-prompt-ok") {
          var v = (el("nxPrompt") && el("nxPrompt").value) || "";
          closeTop("ok");
          done(v);
          return;
        }
        if (prev) prev(act, node, e);
      };
      sheetStack[sheetStack.length - 1].onClose = function (how) {
        actHandler = prev;
        if (how !== "ok") done(null);
      };
      setTimeout(function () {
        var inp = el("nxPrompt");
        if (inp) inp.focus();
      }, 30);
    });
  }

  function alert(opts) {
    return confirm({ title: opts.title || "Бойня", text: opts.text || "", ok: "Понятно", cancel: "" }).then(function () {
      return true;
    });
  }

  function loader(opts) {
    opts = opts || {};
    clearTimeout(loaderTimer);
    clearTimeout(watchdog);
    openSheet({
      id: "loader",
      title: opts.title || "Сохраняю…",
      html:
        '<div class="b-loader"><span class="b-spin b-spin--lg"></span><p class="b-loader__step">' + esc(opts.step || "") + "</p></div>" +
        '<div class="b-meter" style="height:4px;background:var(--b-surface-2);border-radius:6px;overflow:hidden"><div id="nxMeter" style="height:4px;width:20%;background:var(--b-text-2)"></div></div>' +
        '<p class="b-note" id="nxLoaderHint" style="margin-top:12px">Можно свернуть — сохранение продолжится.</p>' +
        '<button class="b-btn b-btn--sec" type="button" id="nxLoaderHide" data-act="loader-hide" hidden style="margin-top:12px">Скрыть</button>'
    });
    loaderTimer = setTimeout(function () {
      var b = el("nxLoaderHide");
      var h = el("nxLoaderHint");
      if (b) b.hidden = false;
      if (h) h.textContent = "Через несколько секунд можно скрыть. Сохранение продолжится в фоне.";
    }, 4000);
    watchdog = setTimeout(function () {
      if (sheetStack.length && sheetStack[sheetStack.length - 1].id === "loader") closeTop("watchdog");
    }, 22000);
  }

  function closeLoader() {
    clearTimeout(loaderTimer);
    clearTimeout(watchdog);
    if (sheetStack.length && sheetStack[sheetStack.length - 1].id === "loader") closeTop("x");
  }

  function gate(opts) {
    var g = el("nxGate");
    g.hidden = false;
    var actions = opts.actions || "";
    g.innerHTML =
      '<p class="b-kicker">Бойня</p>' +
      '<h1 class="b-display">' + esc(opts.title || "") + "</h1>" +
      '<p style="color:var(--b-text-2);margin:12px 0 24px">' + esc(opts.text || "") + "</p>" +
      actions;
  }

  function hideGate() {
    var g = el("nxGate");
    if (g) g.hidden = true;
  }

  function empty(opts) {
    return '<div class="b-empty">' +
      '<div class="b-empty__plate">' + ico(opts.icon || "doc") + "</div>" +
      '<p class="b-empty__title">' + esc(opts.title || "") + "</p>" +
      '<p class="b-empty__ctx">' + esc(opts.text || "") + "</p>" +
      (opts.action || "") +
      "</div>";
  }

  function errorBox(opts) {
    return '<div class="b-error"><div class="b-error__banner">' +
      '<div class="b-error__icon">' + ico("wifi", "b-ico b-ico--20") + "</div>" +
      '<div class="b-grow"><p class="b-error__title">' + esc(opts.title || "Не удалось загрузить") + "</p>" +
      '<p class="b-error__text">' + esc(opts.text || "") + "</p></div>" +
      '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="' + esc(opts.act || "retry") + '">' +
      ico("refresh", "b-ico b-ico--18") + " Повторить</button></div></div>";
  }

  function skeleton(rows) {
    var n = rows || 3;
    var html = "";
    for (var i = 0; i < n; i++) {
      html += '<div class="b-skel__row"><span class="b-skel__avatar"></span><span class="b-skel__lines">' +
        '<span class="b-skel__bar b-skel__bar--a"></span><span class="b-skel__bar b-skel__bar--b"></span></span></div>';
    }
    return '<div class="b-skel">' + html + "</div>";
  }

  root.BoinyaShell = {
    mount: mount,
    ico: ico,
    esc: esc,
    money: money,
    setHandler: setHandler,
    chrome: chrome,
    main: main,
    dock: dock,
    busy: busy,
    toast: toast,
    hideToast: hideToast,
    openSheet: openSheet,
    replaceTop: replaceTop,
    closeTop: closeTop,
    closeAll: closeAll,
    sheetOpen: sheetOpen,
    confirm: confirm,
    choice: choice,
    prompt: prompt,
    alert: alert,
    loader: loader,
    closeLoader: closeLoader,
    gate: gate,
    hideGate: hideGate,
    empty: empty,
    errorBox: errorBox,
    skeleton: skeleton,
    blurActive: blurActive
  };
})(window);
