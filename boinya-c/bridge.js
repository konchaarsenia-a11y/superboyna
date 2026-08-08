/**
 * Бойня C TURBO — local-first:
 * UI почти никогда не ждёт GAS. Снапшот / IDB сразу, сеть только в фоне.
 * Запись в прод по умолчанию заблокирована.
 */
(function () {
  "use strict";
  var BASE = "./";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
  } catch (e0) {}

  var QUIET_MS = 120000; // 2 мин без блокирующих чтений в GAS
  var BG_MIN_DELAY = 45000; // фон не раньше чем через 45с
  var IDB_NAME = "boinya_c_snap_v1";

  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
  window.__BOINYA_C_TURBO__ = true;
  window.__BOINYA_C_DATA_BASE__ = BASE + "data/";
  window.__BOINYA_FAST_QUIET_UNTIL__ = Date.now() + QUIET_MS;
  window.__BOINYA_C_QUIET_UNTIL__ = window.__BOINYA_FAST_QUIET_UNTIL__;

  try {
    var u = new URL(location.href);
    if (u.searchParams.get("allowWrite") === "1") {
      window.__BOINYA_C_ALLOW_WRITE__ = true;
      try {
        localStorage.setItem("boinya_c_allow_write", "1");
      } catch (eW) {}
    } else if (
      localStorage.getItem("boinya_c_allow_write") === "1" &&
      u.searchParams.get("allowWrite") !== "0"
    ) {
      window.__BOINYA_C_ALLOW_WRITE__ = true;
    }
    if (u.searchParams.get("live") === "1") {
      // выключить turbo: ходить в GAS как обычно
      window.__BOINYA_C_TURBO__ = false;
      window.__BOINYA_C_QUIET_UNTIL__ = 0;
      window.__BOINYA_FAST_QUIET_UNTIL__ = 0;
    }
  } catch (e1) {}

  var SNAP = {
    weekDayCounts: null,
    clients: Object.create(null),
    cutting: Object.create(null),
    courier: Object.create(null),
    assembly: Object.create(null),
    warehouse: null,
    weekBanner: null,
    resolveDay: Object.create(null),
    ready: false
  };
  window.__BOINYA_FAST_SNAP__ = SNAP;
  window.__BOINYA_C_SNAP__ = SNAP;

  try {
    var inl = window.__BOINYA_FAST_INLINE__ || window.__BOINYA_C_INLINE__;
    if (inl) {
      if (inl.weekDayCounts) SNAP.weekDayCounts = inl.weekDayCounts;
      if (inl.weekBanner) SNAP.weekBanner = inl.weekBanner;
      if (inl.warehouse) SNAP.warehouse = inl.warehouse;
      if (inl.clients) {
        Object.keys(inl.clients).forEach(function (d) {
          SNAP.clients[d] = inl.clients[d];
        });
      }
      ["cutting", "courier", "assembly", "resolveDay"].forEach(function (k) {
        if (inl[k]) {
          Object.keys(inl[k]).forEach(function (d) {
            SNAP[k][d] = inl[k][d];
          });
        }
      });
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
  function turboOn() {
    return window.__BOINYA_C_TURBO__ !== false;
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

  // ——— IndexedDB снапшоты ———
  var _idb = null;
  function idbOpen() {
    if (_idb) return _idb;
    _idb = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains("snap")) {
            db.createObjectStore("snap", { keyPath: "key" });
          }
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
    return _idb;
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction("snap", "readonly");
          var r = tx.objectStore("snap").get(key);
          r.onsuccess = function () {
            resolve(r.result && r.result.value ? r.result.value : null);
          };
          r.onerror = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  function idbPut(key, value) {
    return idbOpen().then(function (db) {
      if (!db || !value) return;
      try {
        var tx = db.transaction("snap", "readwrite");
        tx.objectStore("snap").put({ key: key, value: value, at: Date.now() });
      } catch (e) {}
    });
  }

  function snapKey(action, params) {
    if (action === "getClients") return "clients:" + String(params.day || "");
    if (action === "getCutting") return "cutting:" + String(params.day || "");
    if (action === "getCourier") return "courier:" + String(params.day || "");
    if (action === "getAssembly") return "assembly:" + String(params.day || "");
    if (action === "getWarehouse" || action === "warehousePreview") return action;
    if (action === "getWeekDayCounts") return "weekDayCounts";
    if (action === "getWeekBannerState") return "weekBanner";
    if (action === "resolveDayForDate") return "resolve:" + String(params.date || "");
    return action;
  }

  function remember(action, params, res) {
    if (!res || res.status !== "success") return;
    var day = String(params.day || "");
    if (action === "getClients" && day) SNAP.clients[day] = res;
    else if (action === "getCutting" && day) SNAP.cutting[day] = res;
    else if (action === "getCourier" && day) SNAP.courier[day] = res;
    else if (action === "getAssembly" && day) SNAP.assembly[day] = res;
    else if (action === "getWeekDayCounts") SNAP.weekDayCounts = res;
    else if (action === "getWeekBannerState") SNAP.weekBanner = res;
    else if (action === "getWarehouse" || action === "warehousePreview") SNAP.warehouse = res;
    else if (action === "resolveDayForDate" && params.date) SNAP.resolveDay[String(params.date)] = res;
    idbPut(snapKey(action, params), res);
  }

  function fromMem(action, params) {
    var day = String(params.day || "");
    if (action === "getClients" && day && SNAP.clients[day]) return SNAP.clients[day];
    if (action === "getCutting" && day && SNAP.cutting[day]) return SNAP.cutting[day];
    if (action === "getCourier" && day && SNAP.courier[day]) return SNAP.courier[day];
    if (action === "getAssembly" && day && SNAP.assembly[day]) return SNAP.assembly[day];
    if (action === "getWeekDayCounts" && SNAP.weekDayCounts) return SNAP.weekDayCounts;
    if (action === "getWeekBannerState" && SNAP.weekBanner) return SNAP.weekBanner;
    if ((action === "getWarehouse" || action === "warehousePreview") && SNAP.warehouse) {
      return SNAP.warehouse;
    }
    if (action === "resolveDayForDate" && params.date && SNAP.resolveDay[String(params.date)]) {
      return SNAP.resolveDay[String(params.date)];
    }
    return null;
  }

  var _bgScheduled = Object.create(null);
  function bgRefresh(params, delayMs) {
    if (!turboOn() && !inQuiet()) {
      // non-turbo: still soft refresh
    }
    var key = snapKey(params.action, params);
    if (_bgScheduled[key]) return;
    _bgScheduled[key] = true;
    var wait = delayMs != null ? delayMs : Math.max(BG_MIN_DELAY, (window.__BOINYA_C_QUIET_UNTIL__ || 0) - Date.now() + 500);
    if (!turboOn()) wait = Math.min(wait, 800);
    setTimeout(function () {
      _bgScheduled[key] = false;
      try {
        var raw = typeof apiGet === "function" ? apiGet : null;
        if (typeof raw !== "function") return;
        var p = {};
        Object.keys(params || {}).forEach(function (k) {
          if (k === "_" || k === "nocache" || k === "force") return;
          p[k] = params[k];
        });
        raw(p, {
          cacheTtlMs: 30000,
          retries: 0,
          timeoutMs: 40000,
          __boinyaNoSnap: true,
          __boinyaCBg: true
        })
          .then(function (res) {
            remember(String(p.action), p, res);
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
      tip: "Для записи: ?allowWrite=1 (осторожно — прод GAS)"
    });
  };

  function fastStub(action, params) {
    if (action === "getClients") {
      return { status: "success", clients: [], day: params.day || "", sandbox: true, turboStub: true };
    }
    if (action === "getCutting") {
      return {
        status: "success",
        items: [],
        date: "",
        day: params.day || "",
        sandbox: true,
        turboStub: true,
        session: {}
      };
    }
    if (action === "getCourier" || action === "getAssembly") {
      return { status: "success", clients: [], day: params.day || "", sandbox: true, turboStub: true };
    }
    if (action === "getWeekDayCounts") {
      return { status: "success", counts: {}, sandbox: true, turboStub: true };
    }
    if (action === "getWeekBannerState") {
      return {
        status: "success",
        finished: false,
        pulled: false,
        refused: false,
        weekKey: params.weekKey || "",
        sandbox: true,
        turboStub: true
      };
    }
    if (action === "getWarehouse" || action === "warehousePreview") {
      return { status: "success", items: [], rows: [], sandbox: true, turboStub: true };
    }
    if (action === "resolveDayForDate") {
      return {
        status: "success",
        day: "Понедельник",
        date: params.date || "",
        sandbox: true,
        turboStub: true
      };
    }
    if (action === "telegramStatus" || action === "weekPullStatus" || action === "ping" || action === "keepWarm") {
      return { status: "success", ok: true, sandbox: true, turboStub: true };
    }
    return null;
  }

  // действия, где пустой stub опасен (люди «пропадут» в кэше UI)
  var NO_EMPTY_STUB = {
    listSubscriptions: 1,
    listSurvey: 1,
    getSubscription: 1,
    listDeferred: 1,
    listClientProfiles: 1,
    listPartners: 1,
    listAccess: 1,
    listBookings: 1,
    getViewCompare: 1,
    getMonthOverview: 1,
    crmInventory: 1
  };

  function trySnap(params, opts) {
    opts = opts || {};
    if (!params || !params.action) return null;
    if (opts.__boinyaCBg || opts.__boinyaNoSnap) return null;

    var action = String(params.action);
    var force = !!(opts.force || params.force === "1" || params._ || params.nocache);
    if (force && !turboOn()) return null;

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
          bgRefresh(params, turboOn() ? BG_MIN_DELAY : 500);
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
      // turbo/quiet — не блокируем старт
      if (turboOn() || inQuiet()) {
        bgRefresh(params, BG_MIN_DELAY);
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

    var mem = fromMem(action, params);
    if (mem) {
      bgRefresh(params, turboOn() ? BG_MIN_DELAY : 400);
      return Promise.resolve(mem);
    }

    // опасные списки — в turbo не подменяем пустым; пусть GAS (или ждём IDB hydrate)
    if (NO_EMPTY_STUB[action]) {
      if (turboOn() && inQuiet()) {
        // не стопорим весь UI: короткий timeout через stub только если уже hydrate прошёл
        // вернём null → GAS; но подрежем ожидание обёрткой ниже нельзя без патча
        return null;
      }
      return null;
    }

    if (turboOn() || inQuiet()) {
      var stub = fastStub(action, params);
      if (stub) {
        bgRefresh(params, BG_MIN_DELAY);
        return Promise.resolve(stub);
      }
    }

    return null;
  }

  window.__boinyaCTrySnap = trySnap;
  window.__boinyaFastTrySnap = trySnap;

  // async hydrate из IDB → потом файлы
  var hydrateJobs = [];
  hydrateJobs.push(
    idbOpen().then(function () {
      var keys = ["weekDayCounts", "weekBanner", "getWarehouse"];
      return Promise.all(
        keys.map(function (k) {
          return idbGet(k).then(function (v) {
            if (!v) return;
            if (k === "weekDayCounts") SNAP.weekDayCounts = v;
            if (k === "weekBanner") SNAP.weekBanner = v;
            if (k === "getWarehouse") SNAP.warehouse = v;
          });
        })
      );
    })
  );

  Object.keys(DAY_FILE).forEach(function (day) {
    hydrateJobs.push(
      idbGet("clients:" + day).then(function (v) {
        if (v) SNAP.clients[day] = v;
      })
    );
    hydrateJobs.push(
      idbGet("cutting:" + day).then(function (v) {
        if (v) SNAP.cutting[day] = v;
      })
    );
    hydrateJobs.push(
      idbGet("courier:" + day).then(function (v) {
        if (v) SNAP.courier[day] = v;
      })
    );
  });

  if (!SNAP.weekDayCounts) {
    hydrateJobs.push(
      loadJson(BASE + "data/weekDayCounts.json").then(function (j) {
        if (j && j.payload && j.payload.status === "success") {
          SNAP.weekDayCounts = j.payload;
          idbPut("weekDayCounts", j.payload);
        }
      })
    );
  }
  Object.keys(DAY_FILE).forEach(function (day) {
    if (SNAP.clients[day]) return;
    hydrateJobs.push(
      loadJson(BASE + "data/" + DAY_FILE[day]).then(function (j) {
        if (j && j.payload && j.payload.status === "success") {
          SNAP.clients[day] = j.payload;
          idbPut("clients:" + day, j.payload);
        }
      })
    );
  });

  // доп. снапшоты если есть файлы
  ["cutting", "courier", "assembly"].forEach(function (kind) {
    Object.keys(DAY_FILE).forEach(function (day) {
      var slug = DAY_FILE[day].replace("clients-", kind + "-");
      hydrateJobs.push(
        loadJson(BASE + "data/" + slug).then(function (j) {
          if (j && j.payload && j.payload.status === "success") {
            SNAP[kind][day] = j.payload;
            idbPut(kind + ":" + day, j.payload);
          }
        })
      );
    });
  });
  hydrateJobs.push(
    loadJson(BASE + "data/weekBanner.json").then(function (j) {
      if (j && j.payload && j.payload.status === "success") {
        SNAP.weekBanner = j.payload;
        idbPut("weekBanner", j.payload);
      }
    })
  );
  hydrateJobs.push(
    loadJson(BASE + "data/warehouse.json").then(function (j) {
      if (j && j.payload && j.payload.status === "success") {
        SNAP.warehouse = j.payload;
        idbPut("getWarehouse", j.payload);
      }
    })
  );

  window.__boinyaFastSeedReady = Promise.all(hydrateJobs).then(function () {
    SNAP.ready = true;
    return { ok: true, sandbox: true, turbo: turboOn(), quietMs: QUIET_MS };
  });
  window.__boinyaCSeedReady = window.__boinyaFastSeedReady;

  // бейдж TURBO
  try {
    function mountTurbo() {
      var b = document.getElementById("boinyaCBadge");
      if (b && turboOn()) b.textContent = "C · TURBO";
    }
    if (document.body) mountTurbo();
    else document.addEventListener("DOMContentLoaded", mountTurbo);
    setTimeout(mountTurbo, 50);
  } catch (eB) {}
})();
