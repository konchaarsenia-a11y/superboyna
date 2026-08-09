/**
 * Бойня C — конфиг.
 *
 * Sandbox (по умолчанию): Worker+D1 снимок.
 * Cutover LIVE ?cutover=1: Worker — быстрое чтение из D1 + запись/revalidate в GAS.
 *   ?cutover=1&via=direct — напрямую GAS (без кэша, медленнее).
 */
(function () {
  "use strict";
  var WORKER = "https://boinya-c.konchaarsenia.workers.dev";
  var PROXY = WORKER;
  var CUTOVER = false;
  var VIA = "worker"; // worker | direct
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

    var viaQ = u.searchParams.get("via");
    if (viaQ === "direct" || viaQ === "gas") VIA = "direct";
    else if (viaQ === "worker") VIA = "worker";

    var q = u.searchParams.get("proxy");
    if (q) {
      PROXY = q;
      try {
        localStorage.setItem("boinya_c_proxy", q);
      } catch (e0) {}
    } else if (CUTOVER && VIA === "direct") {
      PROXY = "";
    } else {
      PROXY = WORKER;
    }

    // ?live=1 = cutover + direct GAS
    if (u.searchParams.get("live") === "1") {
      CUTOVER = true;
      PROXY = "";
      VIA = "direct";
    }
  } catch (e1) {}

  if (!CUTOVER && !PROXY) {
    PROXY = WORKER;
  }

  window.__BOINYA_C_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_PROXY__ = window.__BOINYA_C_PROXY__;
  window.__BOINYA_C_CUTOVER__ = !!CUTOVER;
  // turbo оставляем: короткие таймауты / без bootIdle prefetch-шторма
  window.__BOINYA_C_ALLOW_WRITE__ = true;
  if (CUTOVER) {
    window.__BOINYA_C_QUIET_UNTIL__ = 0;
    window.__BOINYA_FAST_QUIET_UNTIL__ = 0;
  }
  window.__BOINYA_C__ = {
    edition: "C",
    sandbox: !CUTOVER,
    cutover: !!CUTOVER,
    via: VIA,
    proxy: window.__BOINYA_C_PROXY__,
    seedUrl: new URL("../data/seed.json", location.href).href,
    idbName: "boinya_c_v1",
    idbVersion: 1
  };
  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
})();
