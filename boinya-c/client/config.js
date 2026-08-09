/**
 * Бойня C — конфиг.
 *
 * По умолчанию: Worker+D1 (sandbox-снимок).
 * Cutover LIVE: ?cutover=1 → напрямую в боевой GAS (как прод по скорости + запись в Sheets).
 * Опционально: ?cutover=1&via=worker → через Worker (медленнее на +1 hop).
 */
(function () {
  "use strict";
  var WORKER = "https://boinya-c.konchaarsenia.workers.dev";
  var PROXY = WORKER;
  var CUTOVER = false;
  var VIA_WORKER = false;
  try {
    var u = new URL(location.href);
    if (u.searchParams.get("cutover") === "1" || u.searchParams.get("mode") === "live") {
      CUTOVER = true;
      try {
        localStorage.setItem("boinya_c_cutover", "1");
      } catch (e1) {}
    } else if (u.searchParams.get("cutover") === "0" || u.searchParams.get("sandbox") === "1") {
      CUTOVER = false;
      try {
        localStorage.setItem("boinya_c_cutover", "0");
      } catch (e2) {}
    } else {
      try {
        CUTOVER = localStorage.getItem("boinya_c_cutover") === "1";
      } catch (e3) {}
    }

    VIA_WORKER = u.searchParams.get("via") === "worker";

    var q = u.searchParams.get("proxy");
    if (q) {
      PROXY = q;
      try {
        localStorage.setItem("boinya_c_proxy", q);
      } catch (e0) {}
    } else if (CUTOVER && !VIA_WORKER) {
      // LIVE: без Worker — один hop в GAS, как боевой миниапп
      PROXY = "";
    } else if (CUTOVER && VIA_WORKER) {
      PROXY = WORKER;
    }

    // ?live=1 = то же, что cutover напрямую в GAS (совместимость)
    if (u.searchParams.get("live") === "1") {
      PROXY = "";
      CUTOVER = true;
    }
  } catch (e1) {}

  if (!CUTOVER && !PROXY) {
    try {
      PROXY = localStorage.getItem("boinya_c_proxy") || WORKER;
    } catch (e2) {
      PROXY = WORKER;
    }
  }

  window.__BOINYA_C_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_PROXY__ = window.__BOINYA_C_PROXY__;
  window.__BOINYA_C_CUTOVER__ = !!CUTOVER;
  // в LIVE не включаем turbo/local stubs — они дают ложные «пустые» ответы и лишние круги
  if (CUTOVER) {
    window.__BOINYA_C_TURBO__ = false;
    window.__BOINYA_C_QUIET_UNTIL__ = 0;
    window.__BOINYA_FAST_QUIET_UNTIL__ = 0;
    window.__BOINYA_C_ALLOW_WRITE__ = true;
  }
  window.__BOINYA_C__ = {
    edition: "C",
    sandbox: !CUTOVER,
    cutover: !!CUTOVER,
    viaWorker: !!(CUTOVER && PROXY),
    proxy: window.__BOINYA_C_PROXY__,
    seedUrl: new URL("../data/seed.json", location.href).href,
    idbName: "boinya_c_v1",
    idbVersion: 1
  };
  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
})();
