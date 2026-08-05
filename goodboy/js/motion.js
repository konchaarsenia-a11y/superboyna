/**
 * Motion + overlays: nav, scroll reveal, soft pointer light.
 * Без тяжёлых либ. Учитывает prefers-reduced-motion.
 */
(function (global) {
  "use strict";

  function reduced() {
    try {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function initNav() {
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-solid", (global.scrollY || 0) > 18);
    };
    onScroll();
    global.addEventListener("scroll", onScroll, { passive: true });
  }

  function initReveal() {
    var nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;
    if (reduced() || !("IntersectionObserver" in global)) {
      nodes.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  function initPointerLight() {
    if (reduced()) return;
    var hero = document.querySelector(".site-hero");
    if (!hero) return;
    var wash = hero.querySelector(".hero-wash");
    var spot = hero.querySelector(".hero-spot");
    if (!wash && !spot) return;

    var ticking = false;
    var lx = 0.7;
    var ly = 0.35;

    function apply() {
      ticking = false;
      if (spot) {
        spot.style.setProperty("--spot-x", (lx * 100).toFixed(2) + "%");
        spot.style.setProperty("--spot-y", (ly * 100).toFixed(2) + "%");
      }
      if (wash) {
        var dx = ((lx - 0.5) * 18).toFixed(1);
        var dy = ((ly - 0.5) * 14).toFixed(1);
        wash.style.setProperty("--mx", dx + "px");
        wash.style.setProperty("--my", dy + "px");
      }
    }

    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      if (!r.width || !r.height) return;
      lx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ly = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
  }

  function init() {
    initNav();
    initReveal();
    initPointerLight();
  }

  global.GBMotion = { init: init };
})(window);
