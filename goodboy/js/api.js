(function (global) {
  "use strict";

  /**
   * Единая точка вызова.
   * mode=demo → локальный GBDemoApi (параллельно Бойне).
   * mode=live → JSONP на webhookUrl (когда свяжем).
   */
  function useDemo() {
    var mode = (global.GB_CONFIG && global.GB_CONFIG.mode) || "demo";
    return mode !== "live" || !(global.GB_CONFIG && global.GB_CONFIG.webhookUrl);
  }

  function maybeFallbackDemo(action, params, res) {
    var allow = global.GB_CONFIG && global.GB_CONFIG.fallbackDemoOnUnknown;
    if (!allow || !global.GBDemoApi) return res;
    var msg = String((res && res.message) || (res && res.status) || "");
    if (res && (res.status === "unknown_action" || msg.indexOf("unknown") >= 0)) {
      return global.GBDemoApi.call(action, params);
    }
    return res;
  }

  function apiGet(params, opts) {
    opts = opts || {};
    var action = String((params && params.action) || "");

    if (useDemo()) {
      return global.GBDemoApi.call(action, params);
    }

    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 28000;
    var url = global.GB_CONFIG.webhookUrl;
    return new Promise(function (resolve, reject) {
      var cb = "gb_cb_" + Math.round(Math.random() * 1e9);
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("Таймаут ответа сервера"));
      }, timeoutMs);
      function cleanup() {
        clearTimeout(timer);
        try { delete global[cb]; } catch (e1) {}
        var s = document.getElementById(cb);
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
      global[cb] = function (res) {
        cleanup();
        Promise.resolve(maybeFallbackDemo(action, params, res)).then(resolve);
      };
      var q = Object.keys(params || {}).map(function (k) {
        return k + "=" + encodeURIComponent(params[k] == null ? "" : params[k]);
      }).join("&");
      var script = document.createElement("script");
      script.id = cb;
      script.async = true;
      script.src = url + "?" + q + "&callback=" + cb + "&_=" + Date.now();
      script.onerror = function () {
        cleanup();
        if (global.GB_CONFIG && global.GB_CONFIG.fallbackDemoOnUnknown && global.GBDemoApi) {
          global.GBDemoApi.call(action, params).then(resolve).catch(reject);
          return;
        }
        reject(new Error("Ошибка сети"));
      };
      (document.head || document.body).appendChild(script);
    });
  }

  function apiPost(payload) {
    var mode = (global.GB_CONFIG && global.GB_CONFIG.mode) || "demo";
    if (mode !== "live" || !(global.GB_CONFIG && global.GB_CONFIG.webhookUrl)) {
      var action = payload && payload.action;
      return global.GBDemoApi.call(action, payload);
    }
    var url = global.GB_CONFIG.webhookUrl;
    return fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {})
    }).then(function () {
      return { status: "sent" };
    }).catch(function () {
      return { status: "sent_opaque" };
    });
  }

  global.GBApi = { get: apiGet, post: apiPost };
})(window);
