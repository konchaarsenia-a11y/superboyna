/**
 * Бойня C TURBO — local-first / instant View + переносы.
 * Просмотр и moveClient не ждут GAS. Прод-таблицу не пишем (без allowWrite).
 */
(function () {
  "use strict";
  var BASE = "./";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
  } catch (e0) {}

  var QUIET_MS = 300000; // 5 мин
  var BG_MIN_DELAY = 60000;
  var IDB_NAME = "boinya_c_snap_v2";

  window.__BOINYA_C_EDITION__ = true;
  window.__BOINYA_FAST_EDITION__ = true;
  // turbo ON и в cutover: быстрые таймауты; локальные stubs отключены в trySnap
  window.__BOINYA_C_TURBO__ = true;
  window.__BOINYA_C_DATA_BASE__ = BASE + "data/";
  if (window.__BOINYA_C_CUTOVER__) {
    window.__BOINYA_FAST_QUIET_UNTIL__ = 0;
    window.__BOINYA_C_QUIET_UNTIL__ = 0;
  } else {
    window.__BOINYA_FAST_QUIET_UNTIL__ = Date.now() + QUIET_MS;
    window.__BOINYA_C_QUIET_UNTIL__ = window.__BOINYA_FAST_QUIET_UNTIL__;
  }

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
    if (u.searchParams.get("live") === "1" && u.searchParams.get("via") === "direct") {
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
    viewCompare: Object.create(null), // by day name
    viewByDate: Object.create(null), // by dateIso
    dateToDay: Object.create(null),
    monthOverview: Object.create(null), // by month yyyy-mm
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
      if (inl.monthOverview) {
        Object.keys(inl.monthOverview).forEach(function (m) {
          SNAP.monthOverview[m] = inl.monthOverview[m];
        });
      }
      if (inl.dateToDay) {
        Object.keys(inl.dateToDay).forEach(function (d) {
          SNAP.dateToDay[d] = inl.dateToDay[d];
        });
      }
      if (inl.clients) {
        Object.keys(inl.clients).forEach(function (d) {
          SNAP.clients[d] = inl.clients[d];
        });
      }
      if (inl.viewCompare) {
        Object.keys(inl.viewCompare).forEach(function (d) {
          putView_(inl.viewCompare[d]);
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
  function preferD1() {
    // PROXY = Worker. Cutover тоже идёт через Worker (тот проксирует в GAS).
    // ?live=1 = напрямую GAS без Worker.
    try {
      if (new URL(location.href).searchParams.get("live") === "1") return false;
    } catch (e0) {}
    try {
      return !!(window.__BOINYA_C_PROXY__ || window.__BOINYA_FAST_PROXY__ || "").trim();
    } catch (e) {
      return !!(window.__BOINYA_C_PROXY__ || "").trim();
    }
  }

  function isCutover() {
    return !!window.__BOINYA_C_CUTOVER__;
  }

  function hasProxy() {
    try {
      return !!(window.__BOINYA_C_PROXY__ || window.__BOINYA_FAST_PROXY__ || "").trim();
    } catch (e) {
      return false;
    }
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
  var DAY_KEY = {
    Понедельник: "mon",
    Вторник: "tue",
    Среда: "wed",
    Четверг: "thu",
    Пятница: "fri",
    Суббота: "sat",
    Воскресенье: "sun",
    "Будущая неделя": "future"
  };

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

  function putView_(res) {
    if (!res || res.status !== "success") return;
    var day = String(res.day || "");
    var iso = String(res.dateIso || "");
    if (day) SNAP.viewCompare[day] = res;
    if (iso) {
      SNAP.viewByDate[iso] = res;
      if (day) SNAP.dateToDay[iso] = day;
    }
    if (day) idbPut("view:" + day, res);
    if (iso) idbPut("viewDate:" + iso, res);
  }

  function rebuildViewFromClients_(day) {
    day = String(day || "");
    if (!day) return null;
    var block = SNAP.clients[day];
    var clients = block && Array.isArray(block.clients) ? block.clients.slice() : [];
    var date = "";
    var dateIso = "";
    try {
      var items = (SNAP.weekDayCounts && SNAP.weekDayCounts.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].day === day) {
          date = items[i].date || "";
          break;
        }
      }
    } catch (e) {}
    if (date) {
      var m = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) dateIso = m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }
    var prev = SNAP.viewCompare[day];
    if (prev && prev.dateIso && !dateIso) dateIso = prev.dateIso;
    if (prev && prev.date && !date) date = prev.date;
    var res = {
      status: "success",
      day: day,
      targetDay: day,
      date: date,
      dateIso: dateIso,
      dateNotInWeek: false,
      futureSlot: day === "Будущая неделя",
      monthSheet: "sandbox",
      calendar: true,
      week: clients,
      // как в GAS: month = календарные «сироты», не копия недели
      month: (prev && Array.isArray(prev.month) ? prev.month.slice() : []),
      sandbox: true,
      local: true
    };
    putView_(res);
    return res;
  }

  function synthViewCompare(params) {
    var day = String(params.day || "");
    var dateIso = String(params.date || "");
    if (!day && dateIso && SNAP.dateToDay[dateIso]) day = SNAP.dateToDay[dateIso];
    if (dateIso && SNAP.viewByDate[dateIso]) return SNAP.viewByDate[dateIso];
    if (day && SNAP.viewCompare[day]) {
      var base = SNAP.viewCompare[day];
      var cl = SNAP.clients[day] && SNAP.clients[day].clients;
      // sandbox: week из локальных clients после move; month НЕ затираем (это дельта календаря).
      // cutover сюда почти не заходит (trySnap → сеть), но на всякий случай не портим month.
      if (cl && !isCutover()) {
        base = Object.assign({}, base, {
          week: cl.slice(),
          month: Array.isArray(base.month) ? base.month.slice() : []
        });
        putView_(base);
      }
      return base;
    }
    if (day) return rebuildViewFromClients_(day);
    if (dateIso) {
      return {
        status: "success",
        day: "",
        date: dateIso,
        dateIso: dateIso,
        dateNotInWeek: true,
        week: [],
        month: [],
        calendar: true,
        monthSheet: "sandbox",
        sandbox: true,
        turboStub: true
      };
    }
    return {
      status: "success",
      day: "",
      week: [],
      month: [],
      calendar: true,
      sandbox: true,
      turboStub: true
    };
  }

  function synthResolveDay(params) {
    var iso = String(params.date || "");
    if (SNAP.resolveDay[iso]) return SNAP.resolveDay[iso];
    var dayName = SNAP.dateToDay[iso] || "";
    if (!dayName && SNAP.viewByDate[iso]) dayName = SNAP.viewByDate[iso].day || "";
    var res;
    if (dayName) {
      res = {
        status: "success",
        date: iso,
        dayName: dayName,
        day: dayName,
        onWeek: true,
        sandbox: true
      };
    } else {
      res = {
        status: "success",
        date: iso,
        dayName: "",
        day: "",
        onWeek: false,
        calendarOnly: true,
        sandbox: true,
        turboStub: true
      };
    }
    SNAP.resolveDay[iso] = res;
    return res;
  }

  function clientMatch_(c, name, matchKey) {
    var mk = String(matchKey || "")
      .trim()
      .toLowerCase();
    var nm = String(name || "").trim();
    var cm = String(c.matchKey || c.name || "")
      .trim()
      .toLowerCase();
    if (mk && cm === mk) return true;
    if (nm && String(c.name || "") === nm) return true;
    if (mk && String(c.name || "").toLowerCase() === mk) return true;
    return false;
  }

  function takeClient_(day, name, matchKey) {
    var block = SNAP.clients[day];
    if (!block || !Array.isArray(block.clients)) return null;
    for (var i = 0; i < block.clients.length; i++) {
      if (clientMatch_(block.clients[i], name, matchKey)) {
        var row = block.clients[i];
        block.clients.splice(i, 1);
        rebuildViewFromClients_(day);
        idbPut("clients:" + day, block);
        return row;
      }
    }
    return null;
  }

  function putClient_(day, row) {
    if (!day || !row) return;
    if (!SNAP.clients[day]) {
      SNAP.clients[day] = { status: "success", clients: [], day: day, sandbox: true };
    }
    var list = SNAP.clients[day].clients;
    var mk = String(row.matchKey || row.name || "").toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (clientMatch_(list[i], row.name, mk)) {
        list[i] = row;
        rebuildViewFromClients_(day);
        idbPut("clients:" + day, SNAP.clients[day]);
        return;
      }
    }
    list.push(row);
    rebuildViewFromClients_(day);
    idbPut("clients:" + day, SNAP.clients[day]);
  }

  function localMove_(params) {
    var oldDay = String(params.oldDay || "");
    var newDay = String(params.newDay || "");
    var name = String(params.client || "");
    var mk = String(params.matchKey || "");
    var newDate = String(params.newDate || "");
    if (newDate && !newDay && SNAP.dateToDay[newDate]) newDay = SNAP.dateToDay[newDate];

    var row = null;
    if (oldDay) row = takeClient_(oldDay, name, mk);
    if (!row) {
      // найти в любом дне
      Object.keys(SNAP.clients).forEach(function (d) {
        if (row) return;
        row = takeClient_(d, name, mk);
        if (row) oldDay = d;
      });
    }
    if (!row) {
      row = {
        name: name,
        matchKey: mk || name.toLowerCase(),
        address: "",
        note: "",
        basket: [],
        sandbox: true
      };
    }
    if (newDay) putClient_(newDay, row);
    else if (newDate) {
      // календарь вне недели — кладём в viewByDate stub
      var prev = SNAP.viewByDate[newDate] || {
        status: "success",
        day: "",
        dateIso: newDate,
        dateNotInWeek: true,
        week: [],
        month: [],
        calendar: true,
        sandbox: true
      };
      var month = (prev.month || []).filter(function (c) {
        return !clientMatch_(c, name, mk);
      });
      month.push(row);
      prev.month = month;
      prev.week = [];
      prev.dateNotInWeek = true;
      putView_(prev);
    }
    try {
      if (typeof showToast === "function") showToast("Песочница: перенос локально (не в таблицу)");
    } catch (eT) {}
    return { status: "success", sandbox: true, local: true, wrote: "idb" };
  }

  function localDelete_(params) {
    var day = String(params.day || "");
    var name = String(params.client || "");
    var mk = String(params.matchKey || "");
    if (day) takeClient_(day, name, mk);
    else {
      Object.keys(SNAP.clients).forEach(function (d) {
        takeClient_(d, name, mk);
      });
    }
    return { status: "success", sandbox: true, local: true };
  }

  function localSaveOrder_(params) {
    var day = String(params.day || "");
    var name = String(params.client || "").trim();
    if (!day || !name) return { status: "error", message: "no_day_or_client", sandbox: true };
    var basket = params.basket;
    if (typeof basket === "string") {
      try {
        basket = JSON.parse(basket);
      } catch (e) {
        basket = [];
      }
    }
    var row = {
      name: name,
      matchKey: String(params.matchKey || name).toLowerCase(),
      address: params.address || "",
      note: params.note || "",
      segment: params.segment || "",
      basket: basket || [],
      orderCount: Array.isArray(basket) ? basket.length : 0,
      updatedAt: new Date().toISOString(),
      sandbox: true
    };
    putClient_(day, row);
    return { status: "success", sandbox: true, local: true, wrote: "idb" };
  }

  var LOCAL_MUT = {
    moveClient: 1,
    deleteClient: 1,
    saveOrder: 1,
    saveBooking: 1
  };

  function snapKey(action, params) {
    if (action === "getClients") return "clients:" + String(params.day || "");
    if (action === "getCutting") return "cutting:" + String(params.day || "");
    if (action === "getCourier") return "courier:" + String(params.day || "");
    if (action === "getAssembly") return "assembly:" + String(params.day || "");
    if (action === "getViewCompare") {
      return "view:" + String(params.day || params.date || "");
    }
    if (action === "getMonthOverview") return "month:" + String(params.month || "");
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
    else if (action === "getViewCompare") {
      putView_(res);
      // синхронизируем clients из week, чтобы synth не откатывал список
      var d = String(res.day || day || "");
      if (d && Array.isArray(res.week)) {
        SNAP.clients[d] = {
          status: "success",
          day: d,
          clients: res.week.slice(),
          source: res.source || "view"
        };
        idbPut("clients:" + d, SNAP.clients[d]);
      }
    }
    else if (action === "getMonthOverview" && params.month) {
      SNAP.monthOverview[String(params.month)] = res;
    } else if (action === "getWeekDayCounts") SNAP.weekDayCounts = res;
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
    if (action === "getViewCompare") return synthViewCompare(params);
    if (action === "getMonthOverview") {
      var month = String(params.month || "");
      if (month && SNAP.monthOverview[month]) return SNAP.monthOverview[month];
      // любой закэшированный месяц
      var keys = Object.keys(SNAP.monthOverview);
      if (keys.length) return SNAP.monthOverview[keys[0]];
      return null;
    }
    if (action === "getWeekDayCounts" && SNAP.weekDayCounts) return SNAP.weekDayCounts;
    if (action === "getWeekBannerState" && SNAP.weekBanner) return SNAP.weekBanner;
    if ((action === "getWarehouse" || action === "warehousePreview") && SNAP.warehouse) {
      return SNAP.warehouse;
    }
    if (action === "resolveDayForDate" && params.date) return synthResolveDay(params);
    return null;
  }

  var _bgScheduled = Object.create(null);
  function bgRefresh(params, delayMs) {
    var a = String((params && params.action) || "");
    // sandbox turbo: не гоняем GAS на просмотр (локальный seed).
    // cutover: обязательно догоняем Worker/D1 — иначе UI залипает на пустом stub.
    if (!isCutover() && turboOn()) {
      if (
        a === "getViewCompare" ||
        a === "getMonthOverview" ||
        a === "resolveDayForDate" ||
        a === "moveClient" ||
        a === "getClients"
      ) {
        return;
      }
    }
    var key = snapKey(params.action, params);
    if (_bgScheduled[key]) return;
    _bgScheduled[key] = true;
    var wait =
      delayMs != null
        ? delayMs
        : Math.max(BG_MIN_DELAY, (window.__BOINYA_C_QUIET_UNTIL__ || 0) - Date.now() + 500);
    if (!turboOn()) wait = Math.min(wait, 800);
    if (isCutover()) wait = Math.min(wait, delayMs != null ? delayMs : 180);
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
          cacheTtlMs: isCutover() ? 15000 : 30000,
          retries: 0,
          timeoutMs: isCutover() ? 6000 : 40000,
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
    var action = String(params.action);
    // Worker (D1 или cutover→GAS) принимает запись — не блокируем
    if (isCutover() || hasProxy() || (typeof preferD1 === "function" && preferD1())) return null;
    // локальные мутации обрабатывает trySnap
    if (turboOn() && LOCAL_MUT[action]) return null;
    if (window.__BOINYA_C_ALLOW_WRITE__) return null;
    if (!WRITE_RE.test(action)) return null;
    try {
      if (typeof showToast === "function") {
        showToast("Песочница C: запись в таблицу выключена");
      }
    } catch (eT) {}
    return Promise.resolve({
      status: "error",
      message: "sandbox_write_blocked",
      sandbox: true
    });
  };

  function fastStub(action, params) {
    if (action === "getClients") {
      return { status: "success", clients: [], day: params.day || "", sandbox: true, turboStub: true };
    }
    if (action === "getViewCompare") return synthViewCompare(params);
    if (action === "getMonthOverview") {
      return {
        status: "success",
        month: params.month || "",
        days: [],
        sandbox: true,
        turboStub: true
      };
    }
    if (action === "getCutting") {
      return { status: "success", items: [], date: "", day: params.day || "", sandbox: true, turboStub: true, session: {} };
    }
    if (action === "getCourier" || action === "getAssembly") {
      return { status: "success", clients: [], day: params.day || "", sandbox: true, turboStub: true };
    }
    if (action === "getWeekDayCounts") {
      return { status: "success", items: [], counts: {}, total: 0, sandbox: true, turboStub: true };
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
    if (action === "resolveDayForDate") return synthResolveDay(params);
    if (action === "telegramStatus" || action === "weekPullStatus" || action === "ping" || action === "keepWarm") {
      return { status: "success", ok: true, sandbox: true, turboStub: true };
    }
    return null;
  }

  var NO_EMPTY_STUB = {
    listSubscriptions: 1,
    listSurvey: 1,
    getSubscription: 1,
    listDeferred: 1,
    listClientProfiles: 1,
    listPartners: 1,
    listAccess: 1,
    listBookings: 1,
    crmInventory: 1
  };

  function trySnap(params, opts) {
    opts = opts || {};
    if (!params || !params.action) return null;
    if (opts.__boinyaCBg || opts.__boinyaNoSnap) return null;

    var action = String(params.action);

    // Cutover LIVE: Просмотр/списки — ВСЕГДА Worker (D1 ~0.3с).
    // Seed/IDB нельзя отдавать как финальный ответ: UI не перерисует bgRefresh → «пропали люди».
    // getMyAccess — НЕ stub role:all: роли с листа «Доступы» через Worker→GAS.
    if (isCutover()) {
      if (LOCAL_MUT[action] || WRITE_RE.test(action)) return null;
      return null;
    }

    // Sandbox Worker+D1
    if (preferD1()) {
      if (action === "getMyAccess") {
        return Promise.resolve({
          status: "success",
          role: "all",
          access: "active",
          telegramId: String(params.telegramId || ""),
          name: params.name || "",
          tabs: [],
          sandbox: true
        });
      }
      return null;
    }

    // ——— мгновенные локальные мутации (офлайн / без PROXY) ———
    if (turboOn() && LOCAL_MUT[action]) {
      if (action === "moveClient") return Promise.resolve(localMove_(params));
      if (action === "deleteClient") return Promise.resolve(localDelete_(params));
      if (action === "saveOrder" || action === "saveBooking") return Promise.resolve(localSaveOrder_(params));
    }

    var blocked = window.__boinyaCGuardWrite(params);
    if (blocked) return blocked;

    // в turbo игнорируем cache-bust `_` на чтениях — иначе снова GAS
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
      if (turboOn() || inQuiet()) {
        return Promise.resolve({
          status: "success",
          role: "all",
          access: "active",
          telegramId: String(params.telegramId || ""),
          name: params.name || "",
          tabs: [],
          sandbox: true
        });
      }
      return null;
    }

    var mem = fromMem(action, params);
    if (mem) {
      if (!turboOn()) bgRefresh(params, 400);
      return Promise.resolve(mem);
    }

    if (NO_EMPTY_STUB[action]) return null;

    if (turboOn() || inQuiet()) {
      var stub = fastStub(action, params);
      if (stub) return Promise.resolve(stub);
    }
    return null;
  }

  window.__boinyaCTrySnap = trySnap;
  window.__boinyaFastTrySnap = trySnap;

  // hydrate
  var hydrateJobs = [];
  hydrateJobs.push(
    idbOpen().then(function () {
      return Promise.all(
        ["weekDayCounts", "weekBanner", "getWarehouse"].map(function (k) {
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
      idbGet("view:" + day).then(function (v) {
        if (v) putView_(v);
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

  hydrateJobs.push(
    loadJson(BASE + "data/dateToDay.json").then(function (j) {
      if (j && j.map) {
        Object.keys(j.map).forEach(function (d) {
          SNAP.dateToDay[d] = j.map[d];
        });
      }
    })
  );

  hydrateJobs.push(
    loadJson(BASE + "data/monthOverview.json").then(function (j) {
      if (j && j.payload && j.payload.status === "success") {
        var m = j.payload.month || "2026-08";
        SNAP.monthOverview[m] = j.payload;
        idbPut("month:" + m, j.payload);
      }
    })
  );

  Object.keys(DAY_FILE).forEach(function (day) {
    var key = DAY_KEY[day];
    if (!SNAP.clients[day]) {
      hydrateJobs.push(
        loadJson(BASE + "data/" + DAY_FILE[day]).then(function (j) {
          if (j && j.payload && j.payload.status === "success") {
            SNAP.clients[day] = j.payload;
            idbPut("clients:" + day, j.payload);
          }
        })
      );
    }
    hydrateJobs.push(
      loadJson(BASE + "data/view-" + key + ".json").then(function (j) {
        if (j && j.payload && j.payload.status === "success") putView_(j.payload);
      })
    );
    ["cutting", "courier", "assembly"].forEach(function (kind) {
      hydrateJobs.push(
        loadJson(BASE + "data/" + kind + "-" + key + ".json").then(function (j) {
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
    // достроить view из clients если файлов view не было
    Object.keys(DAY_FILE).forEach(function (day) {
      if (!SNAP.viewCompare[day] && SNAP.clients[day]) rebuildViewFromClients_(day);
    });
    SNAP.ready = true;
    return { ok: true, sandbox: true, turbo: turboOn(), quietMs: QUIET_MS };
  });
  window.__boinyaCSeedReady = window.__boinyaFastSeedReady;

  try {
    function mountTurbo() {
      var b = document.getElementById("boinyaCBadge");
      if (!b) return;
      b.textContent = window.__boinyaCBadgeLabel || (window.__BOINYA_C_CUTOVER__ ? "C · LIVE" : "C · D1");
      if (window.__boinyaCBadgeTitle) b.title = window.__boinyaCBadgeTitle;
    }
    if (document.body) mountTurbo();
    else document.addEventListener("DOMContentLoaded", mountTurbo);
    setTimeout(mountTurbo, 50);
  } catch (eB) {}
})();
