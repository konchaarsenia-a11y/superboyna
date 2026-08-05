/**
 * Монтирование кабинета + старт.
 * Сайт и TG Mini App используют один cabinet.html.
 */
(function (global) {
  "use strict";

  var started = false;
  var VER = (global.GB_CONFIG && global.GB_CONFIG.version) || "0.1.1";

  function isTelegram() {
    try {
      var tg = global.Telegram && global.Telegram.WebApp;
      if (!tg) return false;
      if (tg.initData && String(tg.initData).length > 0) return true;
      if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return true;
    } catch (e) {}
    return false;
  }

  function wantMiniapp() {
    if (isTelegram()) return true;
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("miniapp") === "1" || q.get("tg") === "1") return true;
    } catch (e2) {}
    if (/app\.html$/i.test(location.pathname)) return true;
    return false;
  }

  function openAppMode() {
    document.body.classList.add("mode-app");
    try {
      if (location.hash !== "#app") {
        history.replaceState(null, "", location.pathname + location.search + "#app");
      }
    } catch (e) {}
  }

  function closeAppMode() {
    if (document.body.classList.contains("is-miniapp")) return;
    document.body.classList.remove("mode-app");
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
    try { window.scrollTo(0, 0); } catch (e2) {}
  }

  function mountCabinet() {
    var root = document.getElementById("gb-mount");
    if (!root) return Promise.reject(new Error("no #gb-mount"));
    if (root.getAttribute("data-mounted") === "1") return Promise.resolve(root);
    var url = "cabinet.html?v=" + encodeURIComponent(VER);
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("cabinet fetch " + r.status);
      return r.text();
    }).then(function (html) {
      root.innerHTML = html;
      root.setAttribute("data-mounted", "1");
      return root;
    });
  }

  function startAppLogic() {
    if (started) return;
    started = true;
    if (global.GBBoot && typeof global.GBBoot.start === "function") {
      global.GBBoot.start();
    }
  }

  function boot(opts) {
    opts = opts || {};
    var mini = opts.forceMiniapp || wantMiniapp();
    if (mini) {
      document.body.classList.add("is-miniapp", "mode-app");
    } else if (location.hash === "#app" || opts.openApp) {
      openAppMode();
    }

    return mountCabinet().then(function () {
      startAppLogic();
    }).catch(function (err) {
      var root = document.getElementById("gb-mount");
      if (root) {
        root.innerHTML = "<div class=\"app\"><p class=\"lead\">Не удалось загрузить кабинет. Обновите страницу.</p></div>";
        root.style.display = "block";
      }
      console.error(err);
    });
  }

  function wireSite() {
    document.querySelectorAll("[data-open-app]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        openAppMode();
        boot({ openApp: true });
      });
    });
    var exitBtn = document.getElementById("appExit");
    if (exitBtn) {
      exitBtn.addEventListener("click", function () {
        closeAppMode();
      });
    }
    window.addEventListener("hashchange", function () {
      if (location.hash === "#app") {
        openAppMode();
        boot({ openApp: true });
      } else if (!document.body.classList.contains("is-miniapp")) {
        closeAppMode();
      }
    });
  }

  global.GBSite = {
    boot: boot,
    openAppMode: openAppMode,
    closeAppMode: closeAppMode,
    wireSite: wireSite,
    wantMiniapp: wantMiniapp
  };
})(window);
