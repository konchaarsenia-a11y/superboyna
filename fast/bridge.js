/**
 * Бойня FAST — мгновенные ответы из /fast/data/ (Pages CDN),
 * GAS только фоном. Прод этот файл не подключает.
 */
(function () {
  "use strict";
  var BASE = "./";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
  } catch (e0) {}

  window.__BOINYA_FAST_EDITION__ = true;
  window.__BOINYA_FAST_DATA_BASE__ = BASE + "data/";

  var SNAP = {
    weekDayCounts: null,
    clients: Object.create(null),
    ready: false
  };
  window.__BOINYA_FAST_SNAP__ = SNAP;

  var DAY_FILE = {
    Понедельник: "clients-mon.json",
    Вторник: "clients-tue.json",
    Среда: "clients-wed.json",
    Четверг: "clients-thu.json",
    Пятница: "clients-fri.json",
    Суббота: "clients-sat.json",
    Воскресенье: "clients-sun.json",
    "Будущая неделя": "clients-future.json"
  };

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).catch(function () {});
    }
  } catch (eSw) {}

  function loadJson(url) {
    return fetch(url, { credentials: "same-origin", cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function bgRefresh(params) {
    try {
      var raw = typeof apiGet === "function" ? apiGet : null;
      if (typeof raw !== "function") return;
      var p = {};
      Object.keys(params || {}).forEach(function (k) {
        if (k === "_" || k === "nocache" || k === "force") return;
        p[k] = params[k];
      });
      // __boinyaNoSnap — обойти снапшот, реально сходить в GAS
      raw(p, { cacheTtlMs: 20000, retries: 0, timeoutMs: 35000, __boinyaNoSnap: true })
        .then(function (res) {
          if (!res || res.status !== "success") return;
          if (p.action === "getWeekDayCounts") SNAP.weekDayCounts = res;
          if (p.action === "getClients" && p.day) SNAP.clients[p.day] = res;
        })
        .catch(function () {});
    } catch (e) {}
  }

  /**
   * Вызывается из патча apiGet в fast/app.html.
   * Возвращает Promise с данными ИЛИ null (тогда обычный GAS).
   */
  window.__boinyaFastTrySnap = function (params, opts) {
    opts = opts || {};
    if (!params || !params.action) return null;
    var action = String(params.action);
    var force = !!(opts.force || params.force === "1" || params._ || params.nocache);

    if (action === "getWeekDayCounts" && SNAP.weekDayCounts && !force) {
      bgRefresh({ action: "getWeekDayCounts" });
      return Promise.resolve(SNAP.weekDayCounts);
    }
    if (action === "getClients") {
      var day = String(params.day || "");
      if (day && SNAP.clients[day] && !force) {
        bgRefresh({ action: "getClients", day: day });
        return Promise.resolve(SNAP.clients[day]);
      }
    }
    return null;
  };

  var jobs = [];
  jobs.push(
    loadJson(BASE + "data/weekDayCounts.json").then(function (j) {
      if (j && j.payload && j.payload.status === "success") SNAP.weekDayCounts = j.payload;
    })
  );
  Object.keys(DAY_FILE).forEach(function (day) {
    jobs.push(
      loadJson(BASE + "data/" + DAY_FILE[day]).then(function (j) {
        if (j && j.payload && j.payload.status === "success") SNAP.clients[day] = j.payload;
      })
    );
  });

  window.__boinyaFastSeedReady = Promise.all(jobs).then(function () {
    SNAP.ready = true;
    return {
      ok: !!(SNAP.weekDayCounts || Object.keys(SNAP.clients).length),
      days: Object.keys(SNAP.clients).length,
      counts: !!SNAP.weekDayCounts
    };
  });
})();
