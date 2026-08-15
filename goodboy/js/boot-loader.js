/**
 * GOOD BOY boot loader — собачка на медленном интернете.
 * Inline SVG, без тяжёлых картинок. Прячет себя на window.load.
 */
(function (global) {
  "use strict";

  var MIN_MS = 700;
  var MAX_MS = 12000;
  var tips = [
    "Хвостик уже виляет — ещё чуть-чуть…",
    "Нюхаем пакеты на складе…",
    "Ищем лакомство поинтереснее…",
    "Ждём курьера с набором…",
    "Проверяем, где ближайшая площадка…",
    "Считаем шаги до миски…"
  ];

  function reduced() {
    try {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function initLoader() {
    var el = document.getElementById("gbBoot");
    if (!el) return;

    var tipEl = el.querySelector("[data-boot-tip]");
    var started = Date.now();
    var tipIdx = 0;
    var tipTimer = null;
    var done = false;

    if (tipEl && tips.length) {
      tipEl.textContent = tips[0];
      tipTimer = global.setInterval(function () {
        tipIdx = (tipIdx + 1) % tips.length;
        tipEl.textContent = tips[tipIdx];
      }, 1800);
    }

    function hide() {
      if (done) return;
      done = true;
      if (tipTimer) global.clearInterval(tipTimer);
      var wait = Math.max(0, MIN_MS - (Date.now() - started));
      global.setTimeout(function () {
        el.classList.add("is-done");
        document.documentElement.classList.remove("gb-booting");
        global.setTimeout(function () {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }, reduced() ? 0 : 480);
      }, wait);
    }

    if (document.readyState === "complete") {
      hide();
    } else {
      global.addEventListener("load", hide);
      global.setTimeout(hide, MAX_MS);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoader);
  } else {
    initLoader();
  }
})(window);
