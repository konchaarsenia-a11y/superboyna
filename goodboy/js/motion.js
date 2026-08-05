/**
 * Лёгкий motion-слой: scroll reveal, nav solid, parallax orb.
 * Только transform/opacity. Учитывает prefers-reduced-motion.
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

  function initReveal() {
    var nodes = document.querySelectorAll(".reveal, .shot");
    if (!nodes.length) return;
    if (reduced() || !("IntersectionObserver" in global)) {
      nodes.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  function initNav() {
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-solid", global.scrollY > 24);
    };
    onScroll();
    global.addEventListener("scroll", onScroll, { passive: true });
  }

  function initParallax() {
    if (reduced()) return;
    var orb = document.querySelector(".hero-orb");
    var stage = document.querySelector(".hero-stage");
    if (!orb && !stage) return;
    var ticking = false;
    var latestY = 0;
    function apply() {
      ticking = false;
      var y = latestY;
      if (orb) orb.style.transform = "translate3d(0," + (y * 0.12) + "px,0)";
      if (stage) stage.style.transform = "translate3d(0," + (y * 0.06) + "px,0)";
    }
    global.addEventListener("scroll", function () {
      latestY = global.scrollY || 0;
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
  }

  function init() {
    initNav();
    initReveal();
    initParallax();
  }

  global.GBMotion = { init: init };
})(window);
