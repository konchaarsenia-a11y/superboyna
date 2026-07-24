/**
 * Восстановление UI после возврата из фона (iOS WKWebView часто «висит»).
 * Только native/www.
 */
(function () {
  "use strict";

  var hiddenAt = 0;
  var healing = false;

  function forceReflow() {
    try {
      var b = document.body;
      if (!b) return;
      // eslint-disable-next-line no-unused-expressions
      b.offsetHeight;
      b.style.transform = "translateZ(0)";
      requestAnimationFrame(function () {
        b.style.transform = "";
      });
    } catch (e) {}
  }

  function hardUnlock() {
    try {
      if (typeof window.clearBlockingOverlays === "function") {
        window.clearBlockingOverlays();
      }
    } catch (e) {}
    try {
      var save = document.getElementById("saveLoadOverlay");
      if (save) {
        save.classList.remove("open");
        save.style.display = "none";
        save.style.pointerEvents = "none";
      }
      var modal = document.getElementById("modalOverlay");
      if (modal && !modal.classList.contains("open")) {
        modal.style.display = "none";
        modal.style.pointerEvents = "none";
      }
      var splash = document.getElementById("boinya-native-splash");
      if (splash) splash.remove();
    } catch (e) {}
    try {
      document.documentElement.style.pointerEvents = "auto";
      document.documentElement.style.overflow = "";
      if (document.body) {
        document.body.style.pointerEvents = "auto";
        document.body.style.overflow = "";
        document.body.style.opacity = "1";
      }
      var app = document.querySelector(".app");
      if (app) {
        app.style.pointerEvents = "auto";
        app.style.opacity = "1";
      }
      document.querySelectorAll(".screen").forEach(function (s) {
        s.style.pointerEvents = "";
      });
    } catch (e) {}
    forceReflow();
  }

  function softReload() {
    try {
      // сброс SWR-кэша, чтобы не отдать «залипший» ответ
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf("boinya_swr_v1:") === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
    try {
      window.location.reload();
    } catch (e) {}
  }

  function onResume() {
    if (healing) return;
    healing = true;
    var awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hardUnlock();
    setTimeout(hardUnlock, 50);
    setTimeout(hardUnlock, 250);
    setTimeout(hardUnlock, 800);

    // После >25 сек в фоне страницы часто мёртвые — мягкий перезагруз
    if (awayMs > 25000) {
      setTimeout(softReload, 120);
      return;
    }
    setTimeout(function () {
      healing = false;
    }, 1000);
  }

  function onHide() {
    hiddenAt = Date.now();
  }

  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.hidden) onHide();
      else onResume();
    },
    true
  );

  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) onResume();
  });

  window.addEventListener("focus", function () {
    if (!document.hidden) onResume();
  });

  // Capacitor App plugin
  function bindCap() {
    try {
      var C = window.Capacitor;
      var App = C && C.Plugins && C.Plugins.App;
      if (!App || !App.addListener) return;
      App.addListener("appStateChange", function (state) {
        if (state && state.isActive) onResume();
        else onHide();
      });
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCap);
  } else {
    bindCap();
  }
  window.addEventListener("load", bindCap);
  setTimeout(bindCap, 1500);

  // Нативный хук из Swift (если вызовут)
  window.__boinyaNativeResume = onResume;
})();
