/**
 * Бойня C — конфиг.
 *
 * LIVE по умолчанию: Worker — быстрое чтение из D1 + запись/revalidate в GAS.
 * Песочница только явно: ?cutover=0 или ?sandbox=1.
 *   ?via=direct — напрямую GAS (без кэша, медленнее).
 */
(function () {
  "use strict";
  var WORKER = "https://boinya-c.konchaarsenia.workers.dev";
  var PROXY = WORKER;
  var CUTOVER = true;
  var VIA = "worker"; // worker | direct
  try {
    var u = new URL(location.href);
    var cutQ = u.searchParams.get("cutover");
    var sandQ = u.searchParams.get("sandbox");
    var modeQ = u.searchParams.get("mode");
    var liveQ = u.searchParams.get("live");
    var explicitOff = cutQ === "0" || sandQ === "1";
    var explicitOn = cutQ === "1" || cutQ === "true" || modeQ === "live" || liveQ === "1";

    if (explicitOff && !explicitOn) {
      CUTOVER = false;
      try { localStorage.setItem("boinya_c_cutover", "0"); } catch (eOff) {}
    } else {
      CUTOVER = true;
      try { localStorage.setItem("boinya_c_cutover", "1"); } catch (eOn) {}
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
    if (liveQ === "1") {
      CUTOVER = true;
      PROXY = "";
      VIA = "direct";
    }

    // Закрепить режим в URL, чтобы TG/релоад не прыгал D1↔LIVE
    try {
      var pin = new URL(location.href);
      var changed = false;
      if (CUTOVER) {
        if (pin.searchParams.get("sandbox") === "1") {
          pin.searchParams.delete("sandbox");
          changed = true;
        }
        if (pin.searchParams.get("cutover") !== "1") {
          pin.searchParams.set("cutover", "1");
          changed = true;
        }
      } else if (pin.searchParams.get("cutover") !== "0" && pin.searchParams.get("sandbox") !== "1") {
        pin.searchParams.set("cutover", "0");
        changed = true;
      }
      if (changed) history.replaceState(null, "", pin.toString());
    } catch (ePin) {}
  } catch (e1) {}

  if (!CUTOVER && !PROXY) {
    PROXY = WORKER;
  }

  window.__BOINYA_C_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_PROXY__ = window.__BOINYA_C_PROXY__;
  window.__BOINYA_C_CUTOVER__ = !!CUTOVER;
  window.__boinyaCBadgeLabel = CUTOVER ? "C · LIVE" : "C · D1";
  window.__boinyaCBadgeTitle = CUTOVER
    ? "LIVE: чтение из D1, запись в боевые Google Sheets"
    : "Песочница D1: save/move/delete в D1; в Google Sheets не пишет (нужен LIVE)";
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
  try {
    document.title = CUTOVER ? "Бойня C · LIVE" : "Бойня C · sandbox";
  } catch (eT) {}
})();
