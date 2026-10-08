/* Транспорт как у старого мини-аппа: initData, cutover=1, запись POST text/plain.
   Чтение — JSONP на тот же webhook. Сервер не меняется.
   boinya-c/app.main.js apiGetRaw_ / apiPostRaw_. */
(function (root) {
  "use strict";

  var ORIGIN = "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";
  var mem = Object.create(null);
  var inflight = Object.create(null);
  var busyN = 0;
  var busyTimer = null;
  var busyAt = 0;
  var busyTick = null;

  function webhook() {
    return String(root.__BOINYA_C_PROXY__ || root.__BOINYA_FAST_PROXY__ || ORIGIN);
  }

  var INIT_KEY = "nx_tg_init_v1";
  var LOGIN_KEY = "nx_tg_login_v1";

  function liveInitData() {
    try {
      var tg = root.Telegram && root.Telegram.WebApp;
      return String((tg && tg.initData) || "");
    } catch (e) {
      return "";
    }
  }

  function hashInitData() {
    try {
      var h = String((root.location && root.location.hash) || "");
      if (h.charAt(0) === "#") h = h.slice(1);
      var m = h.match(/(?:^|&)tgWebAppData=([^&]*)/);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
    } catch (e2) {
      return "";
    }
  }

  function rememberedInit() {
    try {
      return String((root.sessionStorage && root.sessionStorage.getItem(INIT_KEY)) || "");
    } catch (e3) {
      return "";
    }
  }

  function rememberInit(raw) {
    if (!raw) return;
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(INIT_KEY, raw);
    } catch (e4) {}
  }

  function initData() {
    var live = liveInitData();
    if (live) {
      rememberInit(live);
      return live;
    }
    var hashed = hashInitData();
    if (hashed) {
      rememberInit(hashed);
      return hashed;
    }
    return rememberedInit();
  }

  function storeGet(store, key) {
    try {
      if (!store || !store.getItem) return "";
      return String(store.getItem(key) || "");
    } catch (eS) {
      return "";
    }
  }

  function storeSet(store, key, val) {
    try {
      if (store && store.setItem) store.setItem(key, val);
    } catch (eSet) {}
  }

  function storeDel(store, key) {
    try {
      if (store && store.removeItem) store.removeItem(key);
    } catch (eDel) {}
  }

  function loginData() {
    if (liveInitData()) return "";
    return storeGet(root.sessionStorage, LOGIN_KEY) || storeGet(root.localStorage, LOGIN_KEY);
  }

  function rememberLogin(raw) {
    var v = String(raw || "");
    if (!v) return;
    storeSet(root.sessionStorage, LOGIN_KEY, v);
    storeSet(root.localStorage, LOGIN_KEY, v);
  }

  function clearLogin() {
    storeDel(root.sessionStorage, LOGIN_KEY);
    storeDel(root.localStorage, LOGIN_KEY);
  }

  function hasDesktopLogin() {
    return !liveInitData() && !!loginData();
  }

  function waitForInitData(maxMs) {
    var limit = maxMs == null ? 1600 : maxMs;
    var started = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        var live = liveInitData();
        if (live) {
          rememberInit(live);
          resolve(live);
          return;
        }
        if (Date.now() - started >= limit) {
          resolve(initData());
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });
  }

  function userFromInit(raw) {
    var m = String(raw || "").match(/(?:^|&)user=([^&]*)/);
    if (!m) return null;
    try {
      var ju = JSON.parse(decodeURIComponent(m[1].replace(/\+/g, " ")));
      return ju && ju.id ? ju : null;
    } catch (e5) {
      return null;
    }
  }

  function telegramUser() {
    try {
      var tg = root.Telegram && root.Telegram.WebApp;
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u && u.id) return u;
    } catch (e) {}
    return userFromInit(liveInitData()) || userFromInit(hashInitData()) || userFromInit(rememberedInit()) || userFromLogin(loginData()) || {};
  }

  function userFromLogin(raw) {
    var src = String(raw || "");
    if (!src || src.indexOf("hash=") < 0) return null;
    try {
      var sp = new URLSearchParams(src);
      var id = Number(sp.get("id") || 0);
      if (!id) return null;
      var u = { id: id };
      if (sp.get("first_name")) u.first_name = sp.get("first_name");
      if (sp.get("last_name")) u.last_name = sp.get("last_name");
      if (sp.get("username")) u.username = sp.get("username");
      return u;
    } catch (eL) {
      return null;
    }
  }

  function stamp(params) {
    var out = {};
    var src = params || {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    if (!out.initData) {
      var raw = initData();
      if (raw) out.initData = raw;
    }
    if (!out.initData && !out.tgLogin) {
      var login = loginData();
      if (login) out.tgLogin = login;
    }
    if (root.__BOINYA_C_CUTOVER__ && out.cutover == null && out.mode !== "live") out.cutover = "1";
    return out;
  }

  function showBusy(on) {
    var shell = root.BoinyaShell;
    if (!shell || !shell.busy) return;
    if (!on) {
      shell.busy(false);
      return;
    }
    var sec = Math.max(8, Math.round((Date.now() - busyAt) / 1000));
    shell.busy(true, sec);
  }

  function trackStart() {
    busyN += 1;
    if (busyN !== 1) return;
    busyAt = Date.now();
    clearTimeout(busyTimer);
    clearInterval(busyTick);
    busyTimer = setTimeout(function () {
      if (busyN > 0) showBusy(true);
      busyTick = setInterval(function () {
        if (busyN > 0) showBusy(true);
      }, 1000);
    }, 8000);
  }

  function trackEnd() {
    busyN = Math.max(0, busyN - 1);
    if (busyN > 0) return;
    clearTimeout(busyTimer);
    clearInterval(busyTick);
    showBusy(false);
  }

  function cacheKey(params) {
    return Object.keys(params).filter(function (k) {
      return k !== "_" && k !== "nocache" && k !== "initData" && k !== "tgLogin";
    }).sort().map(function (k) { return k + "=" + params[k]; }).join("&");
  }

  function parseBody(raw) {
    var text = String(raw || "").trim();
    try {
      var j = JSON.parse(text);
      if (j && typeof j === "object") return j;
    } catch (e) {}
    var m = text.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
    if (m) {
      try {
        var j2 = JSON.parse(m[1]);
        if (j2 && typeof j2 === "object") return j2;
      } catch (e2) {}
    }
    return { status: "success", sent_opaque: true, cutover: true };
  }

  function jsonp(params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var cb = "nxcb_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6);
      var q = Object.keys(params).filter(function (k) {
        return params[k] != null && params[k] !== "";
      }).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("timeout"));
      }, timeoutMs || 28000);
      function cleanup() {
        clearTimeout(timer);
        try { delete root[cb]; } catch (e) { root[cb] = undefined; }
        try { s.remove(); } catch (e2) {}
      }
      root[cb] = function (data) {
        cleanup();
        resolve(data);
      };
      s.onerror = function () {
        cleanup();
        reject(new Error("network"));
      };
      var base = String(params.action || "") === "materializeWeek" ? ORIGIN : webhook();
      s.src = base + "?" + q + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  function postWrite(params, timeoutMs) {
    var action = String(params.action || "");
    return new Promise(function (resolve) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        resolve({
          status: "error",
          message: "timeout_waiting_sheets",
          sheetsVerified: false,
          optimistic: false,
          timedOut: true
        });
      }, timeoutMs || 22000);
      var skip = { basket: 1, note: 1, permanentNote: 1, address: 1, phone: 1, geo: 1, survey: 1, addressFull: 1, payload: 1 };
      var q = Object.keys(params).filter(function (k) {
        if (skip[k]) return false;
        return params[k] != null && params[k] !== "";
      }).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      fetch(webhook() + (q ? "?" + q : ""), {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(params),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        return r.text();
      }).then(function (text) {
        clearTimeout(timer);
        resolve(parseBody(text));
      }).catch(function () {
        clearTimeout(timer);
        if (/^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient|saveDeferred)$/i.test(action)) {
          resolve({
            status: "error",
            message: "network_waiting_sheets",
            sheetsVerified: false,
            optimistic: false
          });
          return;
        }
        resolve({ status: "error", message: "Ошибка сети" });
      });
    });
  }

  var WRITE = /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient|saveSubscription|saveDeferred|setDeferredReminder|requestAccess|reportBug|notifyMissedDelivery|placeTransferTask)$/i;

  function remember(key, ttl, res) {
    if (!(ttl > 0) || !key || !res) return;
    if (res.status && res.status !== "success") return;
    var now = Date.now();
    mem[key] = {
      exp: now + ttl,
      staleUntil: now + Math.max(ttl * 4, 120000),
      res: res
    };
  }

  var MONTH_READS = ["getMonthOverview", "getCalendarMonthPeople", "getViewCompare", "getWeekDayCounts"];

  function bustMem(actions) {
    var want = null;
    if (actions && actions.length) {
      want = {};
      for (var i = 0; i < actions.length; i++) want[String(actions[i])] = 1;
    }
    Object.keys(mem).forEach(function (k) {
      var am = String(k).match(/(?:^|&)action=([^&]*)/);
      var action = am ? decodeURIComponent(am[1]) : "";
      if (!want || want[action]) delete mem[k];
    });
  }

  function isMutating(action) {
    action = String(action || "");
    if (!action) return false;
    if (WRITE.test(action)) return true;
    if (/^(get|list|suggest|poll|ping|compose|resolve|unlock|export)/i.test(action)) return false;
    if (/^partner(List|Hub)/i.test(action)) return false;
    if (action === "warehousePreview") return false;
    return /^(save|set|update|delete|remove|add|cancel|finish|start|close|move|place|mark|notify|partner|request|report|prepare)/i.test(action);
  }

  function noteWrite(res, action) {
    if (!res || res.status === "error") return res;
    var ok = res.status === "success" || res.status === "accepted" || res.writeId || res.sheetsVerified || res.pendingSheets || res.d1Verified || res.wrote;
    if (!ok) return res;
    bustMem(null);
    try {
      if (typeof root.__nxAfterWrite === "function") root.__nxAfterWrite(String(action || ""));
    } catch (e) {}
    return res;
  }

  function network(params, opts) {
    var action = String(params.action || "");
    return WRITE.test(action) ? postWrite(params, opts.timeoutMs || 22000) : jsonp(params, opts.timeoutMs || 28000);
  }

  function bounded(promise, ms) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        resolve({ status: "error", message: "timeout", timedOut: true });
      }, ms);
      promise.then(function (res) {
        clearTimeout(timer);
        resolve(res == null ? { status: "error", message: "empty" } : res);
      }, function () {
        clearTimeout(timer);
        resolve({ status: "error", message: "timeout", timedOut: true });
      });
    });
  }

  function refresh(params, opts, key, ttl) {
    if (key && inflight[key]) return;
    var p = network(params, opts).then(function (res) {
      remember(key, ttl, res);
      return res;
    }).finally(function () {
      if (key && inflight[key] === p) delete inflight[key];
    });
    if (key) inflight[key] = p;
  }

  function apiGet(params, opts) {
    opts = opts || {};
    params = stamp(params);
    var action = String(params.action || "");
    if (typeof root.__NEXT_API_HOOK__ === "function") {
      return Promise.resolve(root.__NEXT_API_HOOK__(params, opts)).then(function (res) {
        return res == null ? { status: "error", message: "empty" } : res;
      });
    }
    var ttl = opts.cacheTtlMs != null ? opts.cacheTtlMs : 0;
    var key = cacheKey(params);
    var now = Date.now();
    var hit = !opts.bypassMem && key ? mem[key] : null;
    if (ttl > 0 && hit && hit.exp > now) return Promise.resolve(hit.res);
    if (ttl > 0 && hit && hit.staleUntil > now) {
      refresh(params, opts, key, ttl);
      return Promise.resolve(hit.res);
    }
    if (key && inflight[key]) return inflight[key];
    var retries = Math.max(0, Number(opts.retries) || 0);
    var timeoutMs = (opts.timeoutMs || 28000) + 500;
    function runChain(left) {
      return bounded(network(params, opts), timeoutMs).then(function (res) {
        var bad = !res || res.status === "error" || res.timedOut;
        if (bad && left > 0) return runChain(left - 1);
        return res;
      });
    }
    trackStart();
    var p = runChain(retries).then(function (res) {
      if (WRITE.test(action) || isMutating(action)) noteWrite(res, action);
      remember(key, ttl, res);
      return res;
    }).finally(function () {
      if (key && inflight[key] === p) delete inflight[key];
      trackEnd();
    });
    if (key) inflight[key] = p;
    return p;
  }

  function apiPost(payload) {
    payload = stamp(payload);
    if (typeof root.__NEXT_API_HOOK__ === "function") {
      return Promise.resolve(root.__NEXT_API_HOOK__(payload, { post: true })).then(function (res) {
        return res == null ? { status: "error", message: "empty" } : res;
      });
    }
    trackStart();
    return postWrite(payload, 25000).then(function (res) {
      if (isMutating(String(payload.action || ""))) noteWrite(res, payload.action);
      return res;
    }).finally(trackEnd);
  }

  root.BoinyaApi = {
    apiGet: apiGet,
    apiPost: apiPost,
    initData: initData,
    liveInitData: liveInitData,
    loginData: loginData,
    rememberLogin: rememberLogin,
    clearLogin: clearLogin,
    hasDesktopLogin: hasDesktopLogin,
    waitForInitData: waitForInitData,
    telegramUser: telegramUser,
    webhook: webhook,
    bustMem: bustMem
  };
})(window);
