/**
 * Live Activity «пульс дня» — лёгкая версия (без тяжёлого MutationObserver на весь DOM).
 * Тяжёлый observer на resume мог подвешивать страницы.
 */
(function () {
  "use strict";

  var started = false;
  var lastKey = "";
  var timer = null;
  var hiddenTimer = null;
  var busy = false;
  var hiddenAt = 0;

  function isManagerLike() {
    var btn = document.getElementById("tasksMenuBtn");
    if (btn && btn.classList.contains("show")) return true;
    try {
      if (typeof APP_ROLE === "string") {
        return APP_ROLE === "manager" || APP_ROLE === "owner" || APP_ROLE === "all";
      }
    } catch (e) {}
    return false;
  }

  function readDay() {
    var ids = ["day", "viewDaySelect", "cuttingDaySelect", "courierDaySelect"];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.value) return String(el.value);
    }
    return "День";
  }

  function readTasks() {
    var badge = document.getElementById("tasksBadge");
    if (!badge || badge.hidden) return 0;
    var n = parseInt(String(badge.textContent || "0").replace(/\D/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }

  function readClients() {
    var n = document.querySelectorAll("#clientsContainer .client-item-card").length;
    if (n) return n;
    n = document.querySelectorAll("#courierContainer .client-item-card, #courierList .client-item-card").length;
    return n || 0;
  }

  function payload() {
    var tasks = readTasks();
    return {
      kind: "managerDay",
      day: readDay(),
      clients: readClients(),
      tasks: tasks,
      subtitle: tasks > 0 ? "Расчёт ПП" : "День ок"
    };
  }

  function keyOf(p) {
    return [p.day, p.clients, p.tasks, p.subtitle].join("|");
  }

  function push(forceStart) {
    if (!window.BoinyaNative || busy) return;
    if (!isManagerLike()) {
      if (started) {
        started = false;
        lastKey = "";
        try {
          window.BoinyaNative.endLiveActivity({ kind: "managerDay" });
        } catch (e) {}
      }
      return;
    }
    var p = payload();
    var k = keyOf(p);
    if (!forceStart && k === lastKey) return;
    lastKey = k;
    busy = true;
    var done = function () {
      busy = false;
    };
    try {
      var req = !started
        ? window.BoinyaNative.startLiveActivity(p)
        : window.BoinyaNative.updateLiveActivity(p);
      Promise.resolve(req)
        .then(function (r) {
          if (!started && r && r.ok === false && r.reason === "unsupported") return;
          if (!started && !(r && r.ok === false)) started = true;
          if (started && r && r.ok === false && r.stub) return;
          if (!started && r && r.ok) started = true;
        })
        .catch(function () {})
        .then(done);
    } catch (e) {
      done();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      push(false);
    }, 1200);
  }

  function watchEl(el) {
    if (!el || el._boinyaIslandWatch) return;
    el._boinyaIslandWatch = true;
    try {
      var obs = new MutationObserver(schedule);
      obs.observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    } catch (e) {}
  }

  function attachWatchers() {
    watchEl(document.getElementById("tasksBadge"));
    watchEl(document.getElementById("clientsContainer"));
    ["day", "viewDaySelect", "cuttingDaySelect", "courierDaySelect"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el._boinyaIslandChange) {
        el._boinyaIslandChange = true;
        el.addEventListener("change", schedule);
      }
    });
  }

  function boot() {
    attachWatchers();
    // редкий poll вместо observer на весь document
    setInterval(function () {
      attachWatchers();
      schedule();
    }, 8000);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        hiddenAt = Date.now();
        clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(function () {
          if (started) {
            started = false;
            lastKey = "";
            try {
              window.BoinyaNative && window.BoinyaNative.endLiveActivity({ kind: "managerDay" });
            } catch (e) {}
          }
        }, 45 * 60 * 1000);
      } else {
        clearTimeout(hiddenTimer);
        // не дёргать ActivityKit сразу — сначала UI
        setTimeout(function () {
          push(true);
        }, 800);
      }
    });

    setTimeout(function () {
      push(true);
    }, 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
