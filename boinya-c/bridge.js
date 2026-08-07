/**
 * Бойня C — слой поверх копии миниаппа:
 * seed/IDB → мгновенный Заказ; запись в прод по умолчанию ЗАБЛОКИРОВАНА.
 */
(function () {
  "use strict";
  var BASE = "./";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
  } catch (e0) {}

  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true; // совместимость с патчами sync
  window.__BOINYA_C_DATA_BASE__ = BASE + "data/";
  window.__BOINYA_FAST_QUIET_UNTIL__ = Date.now() + 20000;
  window.__BOINYA_C_QUIET_UNTIL__ = window.__BOINYA_FAST_QUIET_UNTIL__;

  // запись в живую таблицу только с ?allowWrite=1
  try {
    var u = new URL(location.href);
    if (u.searchParams.get("allowWrite") === "1") {
      window.__BOINYA_C_ALLOW_WRITE__ = true;
      try {
        localStorage.setItem("boinya_c_allow_write", "1");
      } catch (eW) {}
    } else if (localStorage.getItem("boinya_c_allow_write") === "1" && u.searchParams.get("allowWrite") !== "0") {
      window.__BOINYA_C_ALLOW_WRITE__ = true;
    }
  } catch (e1) {}

  var SNAP = {
    weekDayCounts: null,
    clients: Object.create(null),
    ready: false
  };
  window.__BOINYA_FAST_SNAP__ = SNAP;
  window.__BOINYA_C_SNAP__ = SNAP;

  try {
    var inl = window.__BOINYA_FAST_INLINE__ || window.__BOINYA_C_INLINE__;
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
    return Date.now() < (window.__BOINYA_C_QUIET_UNTIL__ || 0);
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
    var wait =
      delayMs != null
        ? delayMs
        : inQuiet()
          ? Math.max(0, window.__BOINYA_C_QUIET_UNTIL__ - Date.now()) + 300
          : 400;
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

  var WRITE_RE =
    /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub|request|setup|create|add|remove|toggle|mark|send|prepare|register|upsert|sync)/i;

  window.__boinyaCGuardWrite = function (params) {
    if (!params || !params.action) return null;
    if (window.__BOINYA_C_ALLOW_WRITE__) return null;
    if (!WRITE_RE.test(String(params.action))) return null;
    try {
      if (typeof showToast === "function") {
        showToast("Песочница C: запись в таблицу выключена");
      }
    } catch (eT) {}
    return Promise.resolve({
      status: "error",
      message: "sandbox_write_blocked",
      sandbox: true,
      tip: "Для записи добавь ?allowWrite=1 (осторожно — пойдёт в прод GAS)"
    });
  };

  function trySnap(params, opts) {
    opts = opts || {};
    if (!params || !params.action) return null;
    var action = String(params.action);
    var force = !!(opts.force || params.force === "1" || params._ || params.nocache);
    if (force) return null;

    var blocked = window.__boinyaCGuardWrite(params);
    if (blocked) return blocked;

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
        return Promise.resolve({
          status: "success",
          role: "all",
          access: "active",
          telegramId: String(params.telegramId || ""),
          name: params.name || "",
          tabs: [],
          fastQuiet: true,
          sandbox: true
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
        return Promise.resolve({ status: "success", clients: [], day: day, fastQuiet: true, sandbox: true });
      }
    }

    if (
      action === "listSubscriptions" ||
      action === "listSurvey" ||
      action === "getSubscription" ||
      action === "listDeferred" ||
      action === "listClientProfiles" ||
      action === "listPartners" ||
      action === "listAccess" ||
      action === "listBookings" ||
      action === "getViewCompare" ||
      action === "getMonthOverview" ||
      action === "crmInventory"
    ) {
      return null;
    }

    if (inQuiet() && !WRITE_RE.test(action)) {
      if (action === "getWeekBannerState") {
        return Promise.resolve({
          status: "success",
          finished: false,
          pulled: false,
          refused: false,
          weekKey: params.weekKey || "",
          fastQuiet: true,
          sandbox: true
        });
      }
      if (action === "telegramStatus" || action === "weekPullStatus") {
        return Promise.resolve({ status: "success", ok: true, fastQuiet: true, sandbox: true });
      }
      return null;
    }
    return null;
  }

  window.__boinyaCTrySnap = trySnap;
  window.__boinyaFastTrySnap = trySnap;

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
    return { ok: true, sandbox: true, quietMs: 20000 };
  });
  window.__boinyaCSeedReady = window.__boinyaFastSeedReady;
})();
