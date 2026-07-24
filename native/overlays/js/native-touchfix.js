/**
 * Починка «мёртвых» кнопок в iOS Capacitor WebView.
 * Только native/www — исходный app.html не трогаем.
 */
(function () {
  "use strict";

  function cssBoost() {
    if (document.getElementById("boinya-native-touch-css")) return;
    var s = document.createElement("style");
    s.id = "boinya-native-touch-css";
    s.textContent = [
      "button, .tab-link, .seg-btn, .order-flyout-btn, a, label, .pack-type-cell,",
      ".client-card, .cut-row, input, select, textarea {",
      "  touch-action: manipulation;",
      "  cursor: pointer;",
      "  -webkit-user-select: none;",
      "  user-select: none;",
      "}",
      "input, textarea { -webkit-user-select: text; user-select: text; }",
      ".modal-overlay:not(.open), .save-load-overlay:not(.open),",
      ".tasks-drawer-overlay:not(.open), .yandex-route-overlay:not(.open) {",
      "  pointer-events: none !important;",
      "  display: none !important;",
      "}",
      "#boinya-native-splash { pointer-events: none !important; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }

  function unlock() {
    try {
      if (typeof window.clearBlockingOverlays === "function") {
        window.clearBlockingOverlays();
      }
    } catch (e) {}
    try {
      document.body && (document.body.style.pointerEvents = "auto");
      document.documentElement.style.pointerEvents = "auto";
      var app = document.querySelector(".app");
      if (app) app.style.pointerEvents = "auto";
      var top = document.getElementById("appTopBar");
      if (top) top.style.pointerEvents = "auto";
    } catch (e) {}
    try {
      document.querySelectorAll(".modal-overlay, .save-load-overlay, .tasks-drawer-overlay").forEach(function (el) {
        if (!el.classList.contains("open")) {
          el.style.pointerEvents = "none";
          el.style.display = "none";
        }
      });
    } catch (e) {}
    try {
      if (typeof window.syncAppTopSpacer === "function") window.syncAppTopSpacer();
    } catch (e) {}
    try {
      if (typeof window.recoverUiFocus === "function") window.recoverUiFocus();
    } catch (e) {}
  }

  function boot() {
    cssBoost();
    unlock();
    [100, 400, 1000, 2000].forEach(function (ms) {
      setTimeout(unlock, ms);
    });

    // После системных диалогов / возврата в апп WebView иногда глотает тачи
    document.addEventListener(
      "visibilitychange",
      function () {
        if (!document.hidden) setTimeout(unlock, 30);
      },
      true
    );
    window.addEventListener("focus", function () {
      setTimeout(unlock, 30);
    });
    window.addEventListener("pageshow", function () {
      setTimeout(unlock, 30);
    });

    // Любой тап — страховка от залипшего overlay
    document.addEventListener(
      "touchstart",
      function () {
        try {
          var modal = document.getElementById("modalOverlay");
          var save = document.getElementById("saveLoadOverlay");
          var bad =
            (modal && !modal.classList.contains("open") && modal.style.pointerEvents === "auto") ||
            (save && !save.classList.contains("open") && (save.style.display === "flex" || save.classList.contains("open")));
          if (bad) unlock();
        } catch (e) {}
      },
      { passive: true, capture: true }
    );

    // Двойной тап по «пустой» зоне через 2 сек без реакции — жёсткий unlock (редко)
    var lastTouch = 0;
    document.addEventListener(
      "touchend",
      function () {
        var now = Date.now();
        if (now - lastTouch < 350) unlock();
        lastTouch = now;
      },
      { passive: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("load", function () {
    setTimeout(unlock, 50);
  });
})();
