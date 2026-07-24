/**
 * Safe-area для iPhone (Dynamic Island / чёлка).
 * Только native/www: поднимает --safe-top, чтобы шапка не лезла под статус-бар.
 */
(function () {
  "use strict";

  // Доп. отступ вниз поверх системного inset (по просьбе: «опусти всё ниже»)
  var EXTRA_TOP = 20;
  var MIN_TOP = 54;
  var EXTRA_BOTTOM = 8;
  var MIN_BOTTOM = 20;

  function measureInset(side) {
    try {
      var el = document.createElement("div");
      el.style.cssText =
        "position:fixed;visibility:hidden;pointer-events:none;" +
        "padding-" + side + ":env(safe-area-inset-" + side + ",0px);";
      (document.body || document.documentElement).appendChild(el);
      var v = parseFloat(window.getComputedStyle(el)["padding" + side.charAt(0).toUpperCase() + side.slice(1)]) || 0;
      el.remove();
      return v;
    } catch (e) {
      return 0;
    }
  }

  function apply() {
    var top = measureInset("top");
    var bottom = measureInset("bottom");
    top = Math.max(MIN_TOP, top + EXTRA_TOP);
    bottom = Math.max(MIN_BOTTOM, bottom + EXTRA_BOTTOM);

    try {
      document.documentElement.style.setProperty("--safe-top", top + "px");
      document.documentElement.style.setProperty("--safe-bottom", bottom + "px");
      document.documentElement.style.setProperty("--tg-safe-area-inset-top", top + "px");
      document.documentElement.style.setProperty("--tg-content-safe-area-inset-top", top + "px");
    } catch (e) {}

    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.safeAreaInset = {
          top: top,
          bottom: bottom,
          left: 0,
          right: 0
        };
        window.Telegram.WebApp.contentSafeAreaInset = {
          top: top,
          bottom: bottom,
          left: 0,
          right: 0
        };
      }
    } catch (e) {}

    try {
      if (typeof window.syncAppTopSpacer === "function") window.syncAppTopSpacer();
    } catch (e) {}
  }

  function boot() {
    apply();
    [50, 200, 500, 1200, 2500].forEach(function (ms) {
      setTimeout(apply, ms);
    });
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", apply);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("load", apply);
})();
