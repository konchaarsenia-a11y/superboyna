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
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11.5h2M12 11.5h2M16 11.5h.01M8 15.5h2M12 15.5h2M16 15.5h.01"/>',
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

  function undot(text) {
    var s = String(text == null ? "" : text);
    if (s.indexOf("·") < 0) return s;
    if (/^\s*·\s*$/.test(s)) return "";
    return s
      .replace(/\s*·\s*/g, ", ")
      .replace(/^[,\s]+/, "")
      .replace(/[,\s]+$/, "")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*,/g, ",");
  }

  function stripDots(node) {
    if (!node || typeof document === "undefined") return;
    if (node.nodeType === 3) {
      if (node.nodeValue && node.nodeValue.indexOf("·") >= 0) node.nodeValue = undot(node.nodeValue);
      return;
    }
    if (!node.querySelectorAll) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var list = [];
    var n;
    while ((n = walker.nextNode())) list.push(n);
    list.forEach(function (t) {
      if (t.nodeValue && t.nodeValue.indexOf("·") >= 0) t.nodeValue = undot(t.nodeValue);
    });
  }

  var scrollPlan = null;
  var paintedSheet = null;

  function resetScroll() { scrollPlan = "top"; }
  function restoreScrollTo(y) { scrollPlan = Number(y) || 0; }
  function scrollTop() {
    var box = el("nxMain");
    return box ? box.scrollTop : 0;
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
        '<header class="top b-top" id="nxTop"></header>' +
        '<div class="b-busy" id="nxBusy" hidden></div>' +
        '<main class="scroll nx-main" id="nxMain"></main>' +
        '<div class="dock nx-dock" id="nxDock" hidden></div>' +
        '<nav class="tabs b-nav" id="nxNav" hidden aria-label="Разделы"></nav>' +
      "</div>" +
      '<div class="nx-scrim" id="nxScrim" hidden></div>' +
      '<div class="nx-toast-wrap" id="nxToast" hidden></div>' +
      '<div class="nx-gate" id="nxGate" hidden></div>';
    document.addEventListener("click", onClick);
    bindToastSwipe();
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    bindKeyboard();
    var scrim = el("nxScrim");
    scrim.addEventListener("click", function (e) {
      if (e.target === scrim) closeTop("scrim");
    });
    scrim.addEventListener("touchstart", onTouchStart, { passive: true });
    scrim.addEventListener("touchmove", onTouchMove, { passive: true });
    scrim.addEventListener("touchend", onTouchEnd);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheetStack.length) { closeTop("x"); return; }
      if (e.key !== "Tab" || !sheetStack.length) return;
      var root = el("nxScrim");
      if (!root || root.hidden) return;
      var nodes = root.querySelectorAll("button, [href], input, select, textarea");
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
  var touchDismiss = false;
  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    touchY = t ? t.clientY : 0;
    touchDy = 0;
    touchDismiss = false;
    var sheet = el("nxScrim") && el("nxScrim").querySelector(".b-sheet");
    if (!sheet || !t) return;
    var fromGrab = t.target && t.target.closest && t.target.closest(".b-sheet__grab, .b-sheet__head");
    var body = sheet.querySelector(".nx-sheet__body");
    if (fromGrab) touchDismiss = true;
    else if (!body || body.scrollTop <= 0) touchDismiss = true;
  }
  function onTouchMove(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    touchDy = t.clientY - touchY;
    var sheet = el("nxScrim") && el("nxScrim").querySelector(".b-sheet");
    if (sheet && touchDismiss && touchDy > 0) sheet.style.transform = "translateY(" + Math.min(touchDy, 180) + "px)";
  }
  function onTouchEnd() {
    var sheet = el("nxScrim") && el("nxScrim").querySelector(".b-sheet");
    if (sheet) sheet.style.transform = "";
    if (touchDismiss && touchDy > 80) {
      closeTop("swipe");
      blurActive();
    }
    touchDy = 0;
    touchDismiss = false;
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

  function viewportSquashed() {
    var vv = window.visualViewport;
    if (!vv) return false;
    var stable = window.innerHeight;
    try {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.viewportStableHeight) stable = Number(tg.viewportStableHeight) || stable;
    } catch (e) {}
    return vv.height + 80 < stable;
  }

  function textField(el) {
    if (!el || !el.matches) return false;
    if (el.matches("textarea")) return true;
    if (el.matches("select")) return true;
    if (!el.matches("input")) return false;
    var type = String(el.getAttribute("type") || "text").toLowerCase();
    return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit" && type !== "file" && type !== "hidden" && type !== "range" && type !== "color";
  }

  function fieldFocused() {
    var a = document.activeElement;
    if (!textField(a)) return false;
    return !!(a.closest && a.closest("#nxMain, #nxScrim, .nx-sheet"));
  }

  function syncKeyboard() {
    document.body.classList.toggle("nx-kb", fieldFocused() || viewportSquashed());
  }

  function bindKeyboard() {
    document.addEventListener("focusin", function (e) {
      var t = e.target;
      if (!textField(t)) return;
      if (t.closest && t.closest("#nxMain, #nxScrim, .nx-sheet")) document.body.classList.add("nx-kb");
    });
    document.addEventListener("focusout", function () {
      setTimeout(syncKeyboard, 60);
    });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", syncKeyboard);
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
    var calc = opts.calc
      ? '<button class="b-ib" type="button" data-act="price-tools" aria-label="Расчёт и подбор">' + ico("calc", "b-ico b-ico--20") + "</button>"
      : "";
    el("nxTop").innerHTML =
      '<div class="b-top__ctx">' +
        '<h1 class="b-top__title">' + esc(opts.title || "") + "</h1>" +
      "</div>" +
      '<button class="b-ib" type="button" data-act="guide" aria-label="Справка">' + ico("info", "b-ico b-ico--20") + "</button>" +
      calc +
      bell;
    stripDots(el("nxTop"));
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
        return '<button class="b-nav__item' + on + '" type="button" data-act="nav" data-tab="' + esc(it.id) + '"' +
          (it.id === opts.active ? ' aria-current="page"' : "") + ">" +
          ico(it.id === "more" ? "dots" : (it.id === "production" ? "doc" : it.id)) +
          '<span class="b-nav__lbl">' + esc(it.label) + "</span></button>";
      }).join("");
    }
  }

  function main(html) {
    var box = el("nxMain");
    var prev = box ? box.scrollTop : 0;
    if (box) box.innerHTML = html;
    stripDots(box);
    if (!box) return;
    if (scrollPlan === "top") box.scrollTop = 0;
    else if (typeof scrollPlan === "number") box.scrollTop = scrollPlan;
    else box.scrollTop = Math.min(prev, Math.max(0, box.scrollHeight - box.clientHeight));
    scrollPlan = null;
  }

  function clearOrderDockPad() {
    var d = el("nxDock");
    var main = el("nxMain");
    if (d) d.classList.remove("nx-dock--order");
    if (main) {
      main.style.paddingBottom = "";
      main.removeAttribute("data-order-dock");
    }
  }

  function dock(html) {
    var d = el("nxDock");
    clearOrderDockPad();
    if (!html) {
      d.hidden = true;
      d.innerHTML = "";
      return;
    }
    d.hidden = false;
    d.innerHTML = html;
    stripDots(d);
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

  function toastDismissGesture(dx, dy) {
    dx = Number(dx) || 0;
    dy = Number(dy) || 0;
    if (dy <= -36 && Math.abs(dy) > Math.abs(dx)) return "up";
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) return "side";
    return "";
  }

  function bindToastSwipe() {
    var box = el("nxToast");
    if (!box || box.getAttribute("data-swipe") === "1") return;
    box.setAttribute("data-swipe", "1");
    var sx = 0;
    var sy = 0;
    var dx = 0;
    var dy = 0;
    var tracking = false;
    function point(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    function card() { return box.querySelector(".b-toast"); }
    function down(e) {
      if (box.hidden) return;
      var p = point(e);
      tracking = true;
      sx = p.x;
      sy = p.y;
      dx = 0;
      dy = 0;
      var t = card();
      if (t) t.style.transition = "none";
    }
    function move(e) {
      if (!tracking) return;
      var p = point(e);
      dx = p.x - sx;
      dy = p.y - sy;
      var t = card();
      if (!t) return;
      if (Math.abs(dx) >= Math.abs(dy)) t.style.transform = "translate3d(" + dx + "px,0,0)";
      else if (dy < 0) t.style.transform = "translate3d(0," + dy + "px,0)";
      if (e.cancelable && Math.abs(dx) + Math.abs(dy) > 8) e.preventDefault();
    }
    function up() {
      if (!tracking) return;
      tracking = false;
      var t = card();
      if (toastDismissGesture(dx, dy)) {
        hideToast();
        if (t) {
          t.style.transform = "";
          t.style.transition = "";
        }
        return;
      }
      if (t) {
        t.style.transition = "transform .18s ease";
        t.style.transform = "";
      }
    }
    if (typeof PointerEvent !== "undefined") {
      box.addEventListener("pointerdown", down);
      box.addEventListener("pointermove", move);
      box.addEventListener("pointerup", up);
      box.addEventListener("pointercancel", up);
    } else {
      box.addEventListener("touchstart", down, { passive: true });
      box.addEventListener("touchmove", move, { passive: false });
      box.addEventListener("touchend", up);
      box.addEventListener("touchcancel", up);
    }
  }

  function toast(text) {
    var box = el("nxToast");
    box.hidden = false;
    box.innerHTML = '<div class="b-toast" role="status"><span class="b-toast__mark">' + ico("info", "b-ico b-ico--18") +
      "</span><span class=\"b-grow\">" + esc(undot(text)) + "</span></div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
    bindToastSwipe();
  }

  function hideToast() {
    var box = el("nxToast");
    clearTimeout(toastTimer);
    if (box) box.hidden = true;
  }

  function paintSheet() {
    var scrim = el("nxScrim");
    var top = sheetStack[sheetStack.length - 1];
    var prevBody = scrim.querySelector(".nx-sheet__body");
    var prevTop = prevBody ? prevBody.scrollTop : 0;
    var same = !!(top && top === paintedSheet);
    if (!top) {
      paintedSheet = null;
      scrim.hidden = true;
      scrim.innerHTML = "";
      return;
    }
    scrim.hidden = false;
    var active = document.activeElement;
    if (active && active !== document.body && scrim.contains(active)) {
      try { active.blur(); } catch (eBlur) {}
    }
    var closeBtn = top.hideClose ? "" : '<button class="b-ib" type="button" data-act="sheet-close" aria-label="Закрыть">' + ico("close", "b-ico b-ico--20") + "</button>";
    scrim.innerHTML =
      '<section class="b-sheet nx-sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="' + esc(top.title || "Лист") + '">' +
        '<div class="b-sheet__grab" data-act="sheet-grab"></div>' +
        '<div class="b-sheet__head"><h2 class="b-sheet__title" id="nxSheetTitle" tabindex="-1">' + esc(top.title || "") + "</h2>" + closeBtn + "</div>" +
        '<div class="nx-sheet__body">' + (top.html || "") + "</div>" +
        (top.foot ? '<div class="nx-sheet__foot">' + top.foot + "</div>" : "") +
      "</section>";
    stripDots(scrim);
    var body = scrim.querySelector(".nx-sheet__body");
    if (body && same) body.scrollTop = prevTop;
    paintedSheet = top;
    var title = el("nxSheetTitle");
    var back = document.activeElement;
    if (!sheetReturn && back && back !== document.body && !scrim.contains(back)) sheetReturn = back;
    setTimeout(function () {
      if (document.activeElement && scrim.contains(document.activeElement)) return;
      var close = scrim.querySelector("[data-act='sheet-close']");
      if (close) close.focus();
      else if (title) title.focus();
    }, 0);
  }

  var sheetReturn = null;

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
    if (!sheetStack.length && sheetReturn && sheetReturn.focus) {
      try { sheetReturn.focus(); } catch (eF) {}
      sheetReturn = null;
    }
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
          '<button class="b-btn ' + (opts.danger ? "b-btn--danger" : "b-btn--main") + '" type="button" data-act="dlg-ok">' + esc(opts.ok || "Да") + "</button>" +
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

  function isoDate(v) {
    var s = String(v || "").trim();
    var dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function shortDate(iso) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return "";
    return p[2] + "." + p[1];
  }

  function pad2_(n) {
    var x = Number(n) || 0;
    return (x < 10 ? "0" : "") + x;
  }

  function timeOf_(v) {
    if (!v || typeof v.getTime !== "function") return NaN;
    var t = Number(v.getTime());
    return isFinite(t) ? t : NaN;
  }

  function remindPresetAt(value, now) {
    var stamp = timeOf_(now);
    var base = new Date(isFinite(stamp) ? stamp : Date.now());
    if (value === "1h") return new Date(base.getTime() + 3600000);
    if (value === "3h") return new Date(base.getTime() + 3 * 3600000);
    if (value === "tomorrow" || value === "tomorrow10") {
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
      return base;
    }
    if (value === "today" || value === "today18") {
      base.setHours(18, 0, 0, 0);
      return base;
    }
    return null;
  }

  function remindInPast(when, now) {
    var t = timeOf_(when);
    var n = timeOf_(now);
    if (!isFinite(n)) n = Date.now();
    return !isFinite(t) || t <= n;
  }

  function dateTimeFromFields_(dateStr, timeStr) {
    var d = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var t = String(timeStr || "").match(/^(\d{2}):(\d{2})/);
    if (!d || !t) return null;
    var when = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0);
    return isFinite(when.getTime()) ? when : null;
  }

  function formatRemindWhen(raw) {
    if (raw == null || raw === "") return "";
    var stamp = timeOf_(raw);
    var d = isFinite(stamp) ? new Date(stamp) : new Date(/^\d+$/.test(String(raw)) ? Number(raw) : raw);
    if (!isFinite(d.getTime())) return "";
    return pad2_(d.getDate()) + "." + pad2_(d.getMonth() + 1) + " в " + pad2_(d.getHours()) + ":" + pad2_(d.getMinutes());
  }

  function pickDateTime(opts) {
    opts = opts || {};
    var def = opts.at instanceof Date && isFinite(opts.at.getTime()) ? opts.at : remindPresetAt("tomorrow10", new Date());
    var today = new Date();
    var min = today.getFullYear() + "-" + pad2_(today.getMonth() + 1) + "-" + pad2_(today.getDate());
    var dateVal = def.getFullYear() + "-" + pad2_(def.getMonth() + 1) + "-" + pad2_(def.getDate());
    var timeVal = pad2_(def.getHours()) + ":" + pad2_(def.getMinutes());
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      openSheet({
        title: opts.title || "Дата и время",
        html:
          '<p class="b-lbl">Дата</p><label class="b-field"><input class="b-field__input" id="nxRemindDate" type="date" min="' + esc(min) + '" value="' + esc(dateVal) + '"></label>' +
          '<p class="b-lbl">Время</p><label class="b-field"><input class="b-field__input" id="nxRemindTime" type="time" value="' + esc(timeVal) + '"></label>' +
          '<button class="b-btn b-btn--main" type="button" data-act="remind-when-save" style="margin-top:12px">Сохранить</button>',
        onClose: function () { done(null); }
      });
      var prev = actHandler;
      actHandler = function (act, node, e) {
        if (act === "remind-when-save") {
          var dateEl = document.getElementById("nxRemindDate");
          var timeEl = document.getElementById("nxRemindTime");
          var when = dateTimeFromFields_(dateEl && dateEl.value, timeEl && timeEl.value);
          if (!when || remindInPast(when, new Date())) {
            toast("Это время уже прошло");
            return;
          }
          closeTop("ok");
          done(when);
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

  function pickRemindAt(opts) {
    opts = opts || {};
    var options = (opts.options || []).slice();
    options.push({ value: "pick", label: "Выбрать дату и время" });
    return choice({
      title: opts.title || "Когда напомнить?",
      text: opts.text != null ? opts.text : "Время по часам телефона.",
      options: options
    }).then(function (v) {
      if (!v) return null;
      if (v === "pick") return pickDateTime({ title: "Дата и время" });
      if (v === "none") return { none: true };
      var when = remindPresetAt(v, new Date());
      if (!when || remindInPast(when, new Date())) {
        toast("Это время уже прошло");
        return null;
      }
      return when;
    });
  }

  function pickDate(opts) {
    opts = opts || {};
    var weekLogic = root.BoinyaWeekLogic;
    var MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
    var selected = isoDate(opts.value);
    var cursor = { y: Number(selected.slice(0, 4)), m: Number(selected.slice(5, 7)) - 1 };
    var cache = {};
    var gen = 0;
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      function monthKey() {
        return cursor.y + "-" + String(cursor.m + 1).padStart(2, "0");
      }
      function daysOf(res) {
        var map = {};
        ((res && res.days) || []).forEach(function (d) {
          var iso = String(d.dateIso || d.date || "").slice(0, 10);
          if (iso) map[iso] = d;
        });
        return map;
      }
      function html() {
        var y = cursor.y;
        var m = cursor.m;
        var by = daysOf(cache[monthKey()] || { days: [] });
        var first = new Date(y, m, 1);
        var start = (first.getDay() + 6) % 7;
        var days = new Date(y, m + 1, 0).getDate();
        var cells = "";
        var i;
        for (i = 0; i < start; i++) cells += '<span class="cell cell--pad"></span>';
        for (var d = 1; d <= days; d++) {
          var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
          var hit = by[iso];
          var segs = (hit && hit.segments) || {};
          var n = hit && isFinite(Number(hit.count)) ? Number(hit.count) : 0;
          var dots = "";
          if (segs["ПП"]) dots += '<i class="dot dot-pp"></i>';
          if (segs["БП"]) dots += '<i class="dot dot-bp"></i>';
          if (segs["Р"]) dots += '<i class="dot dot-r"></i>';
          if (segs["ПАРТНЁР"] || segs["П"]) dots += '<i class="dot dot-p"></i>';
          var cls = "cell";
          if (n > 0) cls += " cell--busy";
          var loadMark = weekLogic && weekLogic.dayLoadMark ? weekLogic.dayLoadMark(n) : "";
          if (loadMark) cls += " cell--load-" + loadMark;
          if (iso === selected) cls += " is-on";
          var label = d + " " + MONTHS[m] + (n ? ", " + n + " чел." : "");
          cells += '<button type="button" class="' + cls + '" data-act="date-day" data-iso="' + iso + '" aria-label="' + esc(label) + '"' +
            (iso === selected ? ' aria-pressed="true"' : "") + ">" +
            '<span class="cell-date">' + d + "</span>" +
            (n ? '<span class="cell-count">' + n + "</span>" : "") +
            (dots ? '<span class="dots" aria-hidden="true">' + dots + "</span>" : "") + "</button>";
        }
        var verb = opts.verb || opts.ok || "Выбрать";
        var lead = opts.lead ? '<p class="b-note" style="margin:0 0 8px">' + esc(opts.lead) + "</p>" : "";
        return lead +
          '<div class="b-row"><button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="date-shift" data-dir="-1" aria-label="Предыдущий месяц">‹</button>' +
          '<span class="b-grow" style="text-align:center;font-weight:600">' + esc(MONTHS[m] + " " + y) + "</span>" +
          '<button class="b-btn b-btn--sec b-btn--sm" type="button" data-act="date-shift" data-dir="1" aria-label="Следующий месяц">›</button></div>' +
          '<div class="wd" aria-hidden="true"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>' +
          '<div class="nx-cal grid">' + cells + "</div>" +
          '<button class="b-btn b-btn--main" type="button" data-act="date-ok" style="margin-top:12px">' + esc(verb + " на " + shortDate(selected)) + "</button>";
      }
      function draw() {
        if (settled) return;
        if (sheetOpen()) replaceTop({ title: opts.title || "Дата", html: html() });
        else openSheet({ title: opts.title || "Дата", html: html(), id: "pick-date" });
      }
      function load() {
        var key = monthKey();
        var token = ++gen;
        if (!opts.loadMonth || cache[key]) return;
        Promise.resolve(opts.loadMonth(key)).then(function (res) {
          if (token !== gen || settled) return;
          cache[key] = res || { days: [] };
          draw();
        }).catch(function () {
          if (token !== gen || settled) return;
          cache[key] = { days: [] };
        });
      }
      draw();
      load();
      var prev = actHandler;
      actHandler = function (act, node, e) {
        if (act === "date-day") {
          selected = node.getAttribute("data-iso") || selected;
          draw();
          return;
        }
        if (act === "date-shift") {
          var dir = Number(node.getAttribute("data-dir")) || 0;
          var next = new Date(cursor.y, cursor.m + dir, 1);
          cursor = { y: next.getFullYear(), m: next.getMonth() };
          draw();
          load();
          return;
        }
        if (act === "date-ok") {
          var iso = selected;
          closeTop("ok");
          done(iso);
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
    stripDots(el("nxScrim"));
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
      '<div class="gate"><h1 class="b-display">' + esc(opts.title || "") + "</h1>" +
      '<p style="color:var(--b-text-2);margin:12px 0 0;line-height:1.45">' + esc(opts.text || "") + "</p></div>" +
      (actions ? '<div class="dock" style="width:100%">' + actions + "</div>" : "");
    stripDots(g);
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

  function trackFromPhoto_(file) {
    return new Promise(function (resolve) {
      var Detector = typeof BarcodeDetector === "function" ? BarcodeDetector : null;
      var makeBmp = typeof createImageBitmap === "function" ? createImageBitmap : null;
      if (!file || !Detector || !makeBmp) {
        resolve("");
        return;
      }
      makeBmp(file).then(function (bmp) {
        function read(det) {
          return det.detect(bmp).then(function (codes) {
            if (codes && codes.length && codes[0] && codes[0].rawValue) return String(codes[0].rawValue).trim();
            return "";
          });
        }
        var formats = ["code_128", "code_39", "ean_13", "ean_8", "itf", "codabar", "qr_code", "pdf417", "aztec", "data_matrix"];
        read(new Detector({ formats: formats })).then(function (value) {
          if (value) {
            resolve(value);
            return;
          }
          return read(new Detector()).then(resolve);
        }).catch(function () {
          read(new Detector()).then(resolve).catch(function () { resolve(""); });
        });
      }).catch(function () { resolve(""); });
    });
  }

  /* Трек почты: ручной ввод, вставка из буфера, штрихкод с фото (BarcodeDetector). */
  function askTrackCode(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      openSheet({
        title: opts.title || "Трек-код",
        html:
          '<p class="b-note" style="margin:0 0 12px">' + esc(opts.text || "Трек-код отправления") + "</p>" +
          '<label class="b-field"><input class="b-field__input" id="nxTrack" value="" autocomplete="off" inputmode="text" placeholder="Трек-код"></label>' +
          '<input id="nxTrackFile" type="file" accept="image/*" style="display:none">' +
          '<div class="nx-actions" style="margin-top:8px">' +
          '<button class="b-btn b-btn--sec" type="button" data-act="track-paste">Вставить из буфера</button>' +
          '<button class="b-btn b-btn--sec" type="button" data-act="track-photo">Фото наклейки</button></div>' +
          '<button class="b-btn b-btn--main" type="button" data-act="track-ok" style="margin-top:12px">Доставлено</button>',
        onClose: function () { done(null); }
      });
      var prev = actHandler;
      function valueOf() {
        var inp = el("nxTrack");
        return String((inp && inp.value) || "").trim();
      }
      actHandler = function (act, node) {
        if (act === "track-paste") {
          var clip = navigator.clipboard;
          if (!clip || !clip.readText) {
            toast("Буфер недоступен — введите код");
            return;
          }
          clip.readText().then(function (text) {
            var inp = el("nxTrack");
            if (inp) inp.value = String(text || "").trim();
            if (!valueOf()) toast("В буфере пусто");
          }).catch(function () {
            toast("Не удалось вставить — введите код");
          });
          return;
        }
        if (act === "track-photo") {
          var file = el("nxTrackFile");
          if (file) file.click();
          return;
        }
        if (act === "change" && node && node.id === "nxTrackFile") {
          var picked = node.files && node.files[0];
          if (!picked) return;
          toast("Смотрю фото…");
          trackFromPhoto_(picked).then(function (code) {
            var inp = el("nxTrack");
            if (code && inp) {
              inp.value = code;
              toast("Код с фото");
            } else {
              toast("С фото код не прочитался — введите или вставьте");
            }
          });
          return;
        }
        if (act === "track-ok") {
          var v = valueOf();
          if (!v) {
            toast("Введите трек-код");
            return;
          }
          closeTop("ok");
          done(v);
          return;
        }
        if (prev) prev(act, node);
      };
      sheetStack[sheetStack.length - 1].onClose = function (how) {
        actHandler = prev;
        if (how !== "ok") done(null);
      };
      setTimeout(function () {
        var inp = el("nxTrack");
        if (inp) inp.focus();
      }, 30);
    });
  }

  root.BoinyaShell = {
    mount: mount,
    ico: ico,
    esc: esc,
    undot: undot,
    money: money,
    resetScroll: resetScroll,
    restoreScrollTo: restoreScrollTo,
    scrollTop: scrollTop,
    syncKeyboard: syncKeyboard,
    setHandler: setHandler,
    chrome: chrome,
    main: main,
    dock: dock,
    busy: busy,
    toast: toast,
    hideToast: hideToast,
    toastDismissGesture: toastDismissGesture,
    openSheet: openSheet,
    replaceTop: replaceTop,
    closeTop: closeTop,
    closeAll: closeAll,
    sheetOpen: sheetOpen,
    confirm: confirm,
    choice: choice,
    prompt: prompt,
    askTrackCode: askTrackCode,
    pickDate: pickDate,
    pickDateTime: pickDateTime,
    pickRemindAt: pickRemindAt,
    formatRemindWhen: formatRemindWhen,
    remindPresetAt: remindPresetAt,
    remindInPast: remindInPast,
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
})(typeof window !== "undefined" ? window : globalThis);
