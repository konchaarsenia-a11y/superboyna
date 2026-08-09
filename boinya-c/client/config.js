/**
 * Бойня C — конфиг.
 * По умолчанию: Worker+D1 (sandbox-снимок).
 * Cutover: ?cutover=1 → Worker проксирует в боевой GAS (свежие данные + запись в Sheets).
 */
(function () {
  "use strict";
  var PROXY = "https://boinya-c.konchaarsenia.workers.dev";
  var CUTOVER = false;
  try {
    var u = new URL(location.href);
    var q = u.searchParams.get("proxy");
    if (q) {
      PROXY = q;
      try {
        localStorage.setItem("boinya_c_proxy", q);
      } catch (e0) {}
    }
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
    // ?live=1 = старый путь напрямую в GAS (без Worker)
    if (u.searchParams.get("live") === "1") {
      PROXY = "";
      CUTOVER = false;
    }
  } catch (e1) {}
  if (!PROXY && !CUTOVER) {
    try {
      PROXY = localStorage.getItem("boinya_c_proxy") || "";
    } catch (e2) {}
  }
  window.__BOINYA_C_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_PROXY__ = window.__BOINYA_C_PROXY__;
  window.__BOINYA_C_CUTOVER__ = !!CUTOVER;
  window.__BOINYA_C__ = {
    edition: "C",
    sandbox: !CUTOVER,
    cutover: !!CUTOVER,
    proxy: window.__BOINYA_C_PROXY__,
    seedUrl: new URL("../data/seed.json", location.href).href,
    idbName: "boinya_c_v1",
    idbVersion: 1
  };
  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
})();
