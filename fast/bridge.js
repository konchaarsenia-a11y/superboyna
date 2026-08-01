/**
 * Бойня FAST — мгновенный старт:
 * 1) inline seed (seed-inline.js) — без fetch
 * 2) 20с тишины: чтения не ходят в GAS (только фон после тишины)
 * 3) getMyAccess из localStorage
 */
(function () {
  "use strict";
  var BASE = "./";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
  } catch (e0) {}

  window.__BOINYA_FAST_EDITION__ = true;
  window.__BOINYA_FAST_DATA_BASE__ = BASE + "data/";
  // первые 20с — UI из снапшотов, GAS не дёргаем на чтении
  window.__BOINYA_FAST_QUIET_UNTIL__ = Date.now() + 20000;

  var SNAP = {
    weekDayCounts: null,
    clients: Object.create(null),
    ready: false
  };
  window.__BOINYA_FAST_SNAP__ = SNAP;

  // inline первым делом
  try {
    var inl = window.__BOINYA_FAST_INLINE__;
    if (inl) {
      if (inl.weekDayCounts) SNAP.weekDayCounts = inl.weekDayCounts;
      if (inl.clients) {
        Object.keys(inl.clients).forEach(function (d) {
          SNAP.clients[d] = inl.clients[d];
        });
      }
      SNAP.ready = true;
    }
  } catch (eIn) {}

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).catch(function () {});
    }
  } catch (eSw) {}

  function inQuiet() {
    return Date.now() < (window.__BOINYA_FAST_QUIET_UNTIL__ || 0);
  }

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

  function bgRefresh(params, delayMs) {
    var wait = delayMs != null ? delayMs : inQuiet() ? Math.max(0, window.__BOINYA_FAST_QUIET_UNTIL__ - Date.now()) + 300 : 400;
    setTimeout(function () {
      try {
        var raw = typeof apiGet === "function" ? apiGet : null;
        if (typeof raw !== "function") return;
        var p = {};
        Object.keys(params || {}).forEach(function (k) {
          if (k === "_" || k === "nocache" || k === "force") return;
          p[k] = params[k];
        });
        raw(p, { cacheTtlMs: 20000, retries: 0, timeoutMs: 35000, __boinyaNoSnap: true })
          .then(function (res) {
            if (!res || res.status !== "success") return;
            if (p.action === "getWeekDayCounts") SNAP.weekDayCounts = res;
            if (p.action === "getClients" && p.day) SNAP.clients[p.day] = res;
          })
          .catch(function () {});
      } catch (e) {}
    }, wait);
  }

  window.__boinyaFastTrySnap = function (params, opts) {
    opts = opts || {};
    if (!params || !params.action) return null;
    var action = String(params.action);
    var force = !!(opts.force || params.force === "1" || params._ || params.nocache);
    if (force) return null;

    // роль — из localStorage, без GAS
    if (action === "getMyAccess") {
      try {
        var rawAcc = localStorage.getItem("superboyna_access_v1");
        var acc = rawAcc ? JSON.parse(rawAcc) : null;
        var tid = String(params.telegramId || "");
        if (
          acc &&
          String(acc.telegramId || "") === tid &&
          acc.role &&
          acc.role !== "none" &&
          acc.role !== "pending" &&
          acc.role !== "denied"
        ) {
          if (!inQuiet()) bgRefresh(params, 500);
          return Promise.resolve({
            status: "success",
            role: acc.role,
            access: "active",
            telegramId: tid,
            name: params.name || "",
            tabs: []
          });
        }
      } catch (eA) {}
      if (inQuiet()) {
        // не блокируем старт — открыть как all, роль догонит
        return Promise.resolve({
          status: "success",
          role: "all",
          access: "active",
          telegramId: String(params.telegramId || ""),
          name: params.name || "",
          tabs: [],
          fastQuiet: true
        });
      }
      return null;
    }

    if (action === "getWeekDayCounts" && SNAP.weekDayCounts) {
      bgRefresh({ action: "getWeekDayCounts" });
      return Promise.resolve(SNAP.weekDayCounts);
    }
    if (action === "getClients") {
      var day = String(params.day || "");
      if (day && SNAP.clients[day]) {
        bgRefresh({ action: "getClients", day: day });
        return Promise.resolve(SNAP.clients[day]);
      }
      if (inQuiet()) {
        return Promise.resolve({ status: "success", clients: [], day: day, fastQuiet: true });
      }
    }

    // прочие чтения в тишине — не блокировать UI пустым успехом / кэшем
    if (inQuiet() && !/^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup)/i.test(action)) {
      if (action === "getWeekBannerState") {
        return Promise.resolve({
          status: "success",
          finished: false,
          pulled: false,
          refused: false,
          weekKey: params.weekKey || "",
          fastQuiet: true
        });
      }
      if (action === "listDeferred" || action === "listSurvey" || action === "listSubscriptions") {
        return Promise.resolve({ status: "success", items: [], fastQuiet: true });
      }
      if (action === "getCourier" || action === "getAssembly" || action === "getCutting") {
        return Promise.resolve({ status: "success", clients: [], items: [], fastQuiet: true });
      }
      if (action === "telegramStatus" || action === "weekPullStatus") {
        return Promise.resolve({ status: "success", ok: true, fastQuiet: true });
      }
      // неизвестное чтение — отложить GAS
      bgRefresh(params);
      return Promise.resolve({ status: "success", fastQuiet: true, items: [], clients: [] });
    }

    return null;
  };

  // догрузить data/* если inline пуст / устарел
  var jobs = [];
  if (!SNAP.weekDayCounts) {
    jobs.push(
      loadJson(BASE + "data/weekDayCounts.json").then(function (j) {
        if (j && j.payload && j.payload.status === "success") SNAP.weekDayCounts = j.payload;
      })
    );
  }
  Object.keys(DAY_FILE).forEach(function (day) {
    if (SNAP.clients[day]) return;
    jobs.push(
      loadJson(BASE + "data/" + DAY_FILE[day]).then(function (j) {
        if (j && j.payload && j.payload.status === "success") SNAP.clients[day] = j.payload;
      })
    );
  });

  window.__boinyaFastSeedReady = Promise.all(jobs).then(function () {
    SNAP.ready = true;
    return { ok: true, inline: !!window.__BOINYA_FAST_INLINE__, quietMs: 20000 };
  });
})();
