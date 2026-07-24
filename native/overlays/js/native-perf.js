/**
 * SWR-кэш GET к Apps Script webhook + лёгкий splash.
 * Патчит window.fetch и XMLHttpRequest только в native/www копии.
 */
(function () {
  "use strict";
  var CACHE_PREFIX = "boinya_swr_v1:";
  var TTL_MS = 45 * 1000;
  var WEBHOOK_HINT = "script.google.com/macros";

  function isWebhookGet(url) {
    if (!url || typeof url !== "string") return false;
    if (url.indexOf(WEBHOOK_HINT) < 0) return false;
    if (/[?&]callback=/.test(url)) return true;
    return /[?&]action=/.test(url);
  }

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.t) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(key, body) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), body: body }));
    } catch (e) {}
  }

  function isFresh(entry) {
    return entry && Date.now() - entry.t < TTL_MS;
  }

  // --- splash ---
  try {
    var splash = document.createElement("div");
    splash.id = "boinya-native-splash";
    splash.setAttribute("aria-hidden", "true");
    splash.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:#0a0a0a;display:flex;" +
      "align-items:center;justify-content:center;transition:opacity .25s ease;" +
      "pointer-events:none;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;color:#f5f5f7;";
    splash.textContent = "GBI";
    function mountSplash() {
      if (!document.body) return;
      document.body.appendChild(splash);
      setTimeout(function () {
        splash.style.opacity = "0";
        setTimeout(function () {
          try { splash.remove(); } catch (e) {}
        }, 280);
      }, 420);
    }
    if (document.body) mountSplash();
    else document.addEventListener("DOMContentLoaded", mountSplash);
  } catch (e) {}

  // --- fetch SWR ---
  if (typeof window.fetch === "function") {
    var rawFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = ((init && init.method) || "GET").toUpperCase();
      if (method !== "GET" || !isWebhookGet(url)) {
        return rawFetch(input, init);
      }
      var cached = cacheGet(url);
      if (isFresh(cached)) {
        return Promise.resolve(
          new Response(cached.body, {
            status: 200,
            headers: { "Content-Type": "application/javascript" }
          })
        );
      }
      return rawFetch(input, init).then(function (res) {
        try {
          var clone = res.clone();
          clone.text().then(function (text) {
            cacheSet(url, text);
          });
        } catch (e) {}
        return res;
      });
    };
  }

  // Prefetch типичных дней после старта (не блокирует UI)
  function prefetch() {
    try {
      var base = null;
      // GOOGLE_WEBHOOK_URL объявляется позже в app — повторим чуть позже
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        try {
          if (typeof GOOGLE_WEBHOOK_URL === "string" && GOOGLE_WEBHOOK_URL) {
            base = GOOGLE_WEBHOOK_URL;
          }
        } catch (e) {}
        if (!base && tries < 40) return;
        clearInterval(timer);
        if (!base || typeof fetch !== "function") return;
        var days = ["Понедельник", "Вторник"];
        days.forEach(function (day) {
          var u =
            base +
            "?action=getClients&day=" +
            encodeURIComponent(day) +
            "&callback=boinyaPrefetch";
          fetch(u).catch(function () {});
        });
      }, 250);
    } catch (e) {}
  }
  if (document.readyState === "complete") prefetch();
  else window.addEventListener("load", prefetch);
})();
