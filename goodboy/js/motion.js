/**
 * Motion + overlays: nav, reveal, phone mockup, soft pointer light.
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

  function initFeatureStagger() {
    if (reduced()) return;
    var articles = document.querySelectorAll(".feature-rail article.reveal");
    articles.forEach(function (el, i) {
      el.style.transitionDelay = (0.06 + i * 0.07).toFixed(2) + "s";
    });
  }

  function initPointerLight() {
    if (reduced()) return;
    var hero = document.querySelector(".site-hero");
    if (!hero) return;
    var wash = hero.querySelector(".hero-wash");
    var spot = hero.querySelector(".hero-spot");
    var phone = document.getElementById("heroPhone");
    if (!wash && !spot && !phone) return;

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
      if (phone) {
        var ry = ((lx - 0.5) * 14).toFixed(2);
        var rx = ((0.5 - ly) * 8).toFixed(2);
        phone.style.setProperty("--ry", ry + "deg");
        phone.style.setProperty("--rx", rx + "deg");
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

    hero.addEventListener("pointerleave", function () {
      lx = 0.7;
      ly = 0.35;
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
  }

  function initScrollParallax() {
    if (reduced()) return;
    var hero = document.querySelector(".site-hero");
    var stage = hero && hero.querySelector(".hero-stage");
    var copy = hero && hero.querySelector(".hero-copy");
    if (!hero || (!stage && !copy)) return;

    var ticking = false;
    function apply() {
      ticking = false;
      var y = global.scrollY || 0;
      if (y < 4) {
        if (stage) {
          stage.style.transform = "";
          stage.style.opacity = "";
        }
        if (copy) {
          copy.style.transform = "";
          copy.style.opacity = "";
        }
        return;
      }
      var h = hero.offsetHeight || 1;
      var p = Math.min(1, Math.max(0, y / h));
      if (stage) {
        stage.style.transform = "translate3d(0," + (p * 28).toFixed(1) + "px,0)";
        stage.style.opacity = String((1 - p * 0.55).toFixed(3));
      }
      if (copy) {
        copy.style.transform = "translate3d(0," + (p * 18).toFixed(1) + "px,0)";
        copy.style.opacity = String((1 - p * 0.4).toFixed(3));
      }
    }

    global.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
  }

  function initPhoneDemo() {
    var slides = document.querySelectorAll(".phone-slide");
    var tabs = document.querySelectorAll(".phone-tabs span");
    var toast = document.getElementById("phoneToast");
    if (!slides.length) return;

    var i = 0;
    var total = slides.length;

    function show(n) {
      i = ((n % total) + total) % total;
      slides.forEach(function (s, idx) {
        s.classList.toggle("is-on", idx === i);
      });
      tabs.forEach(function (t, idx) {
        t.classList.toggle("is-on", idx === i);
      });
    }

    show(0);
    if (reduced()) return;

    global.setInterval(function () {
      show(i + 1);
    }, 3200);

    if (toast) {
      var toastOn = false;
      global.setTimeout(function () {
        toast.classList.add("is-on");
        toastOn = true;
      }, 1600);
      global.setInterval(function () {
        toastOn = !toastOn;
        toast.classList.toggle("is-on", toastOn);
      }, 4200);
    }
  }

  function init() {
    initNav();
    initFeatureStagger();
    initReveal();
    initPointerLight();
    initScrollParallax();
    initPhoneDemo();
  }

  global.GBMotion = { init: init };
})(window);
