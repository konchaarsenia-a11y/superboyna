/**
 * Бойня FAST — единственное место настройки прокси.
 * После деплоя Cloudflare Worker вставьте URL сюда (или задайте до загрузки app.html).
 *
 * Пример: https://boinya-fast.YOUR_SUBDOMAIN.workers.dev
 */
(function () {
  "use strict";
  // ← ЗАМЕНИТЕ после: npx wrangler deploy (см. fast/README.md)
  var PROXY = "";

  // если пусто — берём из ?proxy= / localStorage (удобно для теста без правки файла)
  try {
    var u = new URL(location.href);
    var q = u.searchParams.get("proxy");
    if (q) {
      PROXY = q;
      try { localStorage.setItem("boinya_fast_proxy", q); } catch (e0) {}
    }
  } catch (e1) {}
  if (!PROXY) {
    try { PROXY = localStorage.getItem("boinya_fast_proxy") || ""; } catch (e2) {}
  }

  window.__BOINYA_FAST_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_EDITION__ = true;
})();
