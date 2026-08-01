/**
 * Бойня FAST bridge — мгновенные данные из /fast/data/ + регистрация SW.
 * Не зависит от Cloudflare. Прод-приложение не подключает этот файл.
 */
(function () {
  "use strict";
  var BASE = "";
  try {
    BASE = new URL(".", location.href).pathname.replace(/\/?$/, "/");
    // если открыли .../fast/app.html → data рядом
    if (BASE.indexOf("/fast") < 0 && /\/fast\//.test(location.pathname)) {
      BASE = location.pathname.replace(/\/[^/]*$/, "/");
    }
  } catch (e0) {
    BASE = "./";
  }

  function dataUrl(name) {
    return BASE + "data/" + name;
  }

  window.__BOINYA_FAST_EDITION__ = true;
  window.__BOINYA_FAST_DATA_BASE__ = BASE + "data/";

  // Регистрация SW как можно раньше
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).catch(function () {});
    }
  } catch (eSw) {}

  // Предзагрузка снапшотов в localStorage SWR-формат apiGet (ключи как у app)
  function seedApiMem(action, params, payload) {
    try {
      if (!payload || !payload.status) return;
      var p = Object.assign({ action: action }, params || {});
      var cacheKey = Object.keys(p)
        .sort()
        .map(function (k) {
          return k + "=" + p[k];
        })
        .join("&");
      var prefix = "boinya_api_v1:";
      localStorage.setItem(
        prefix + cacheKey,
        JSON.stringify({ t: Date.now(), res: payload })
      );
    } catch (e) {}
  }

  function loadJson(url) {
    return fetch(url, { credentials: "same-origin", cache: "default" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  window.__boinyaFastSeedReady = loadJson(dataUrl("meta.json")).then(function (meta) {
    if (!meta) return { ok: false };
    var jobs = [];
    jobs.push(
      loadJson(dataUrl("weekDayCounts.json")).then(function (j) {
        if (j && j.payload) seedApiMem("getWeekDayCounts", {}, j.payload);
      })
    );
    jobs.push(
      loadJson(dataUrl("bootstrap.json")).then(function (j) {
        if (j && j.payload) {
          seedApiMem("getBootstrap", { day: "Понедельник" }, j.payload);
          if (j.payload.weekDayCounts)
            seedApiMem("getWeekDayCounts", {}, j.payload.weekDayCounts);
          if (j.payload.access) seedApiMem("getMyAccess", {}, j.payload.access);
        }
      })
    );
    var dayMap = {
      mon: "Понедельник",
      tue: "Вторник",
      wed: "Среда",
      thu: "Четверг",
      fri: "Пятница",
      sat: "Суббота",
      sun: "Воскресенье",
      future: "Будущая неделя"
    };
    Object.keys(dayMap).forEach(function (k) {
      jobs.push(
        loadJson(dataUrl("clients-" + k + ".json")).then(function (j) {
          if (j && j.payload) seedApiMem("getClients", { day: dayMap[k] }, j.payload);
        })
      );
    });
    return Promise.all(jobs).then(function () {
      return { ok: true, at: meta.fetchedAt || null };
    });
  });
})();
