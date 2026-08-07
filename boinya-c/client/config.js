/**
 * Песочница C — конфиг копии миниаппа.
 */
(function () {
  "use strict";
  var PROXY = "";
  try {
    var u = new URL(location.href);
    var q = u.searchParams.get("proxy");
    if (q) {
      PROXY = q;
      try {
        localStorage.setItem("boinya_c_proxy", q);
      } catch (e0) {}
    }
  } catch (e1) {}
  if (!PROXY) {
    try {
      PROXY = localStorage.getItem("boinya_c_proxy") || "";
    } catch (e2) {}
  }
  window.__BOINYA_C_PROXY__ = String(PROXY || "").trim();
  window.__BOINYA_FAST_PROXY__ = window.__BOINYA_C_PROXY__;
  window.__BOINYA_C__ = {
    edition: "C",
    sandbox: true,
    proxy: window.__BOINYA_C_PROXY__,
    seedUrl: new URL("../data/seed.json", location.href).href,
    idbName: "boinya_c_v1",
    idbVersion: 1
  };
  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
})();
