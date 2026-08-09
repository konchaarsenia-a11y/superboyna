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
    var phoneZone = document.querySelector(".site-section--phone") || document.querySelector(".phone-stage");
    if (!hero && !phoneZone) return;
    var wash = hero && hero.querySelector(".hero-wash");
    var spot = hero && hero.querySelector(".hero-spot");
    var phone = document.getElementById("heroPhone");

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

    function onMove(e, el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      lx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ly = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }

    if (hero) {
      hero.addEventListener("pointermove", function (e) { onMove(e, hero); }, { passive: true });
    }
    if (phoneZone && phone) {
      phoneZone.addEventListener("pointermove", function (e) { onMove(e, phoneZone); }, { passive: true });
      phoneZone.addEventListener("pointerleave", function () {
        lx = 0.5;
        ly = 0.45;
        if (!ticking) {
          ticking = true;
          global.requestAnimationFrame(apply);
        }
      }, { passive: true });
    }
  }

  function initScrollParallax() {
    if (reduced()) return;
    var hero = document.querySelector(".site-hero");
    var stage = hero && (hero.querySelector(".hero-features") || hero.querySelector(".hero-stage"));
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
        stage.style.transform = "translate3d(0," + (p * 22).toFixed(1) + "px,0)";
        stage.style.opacity = String((1 - p * 0.45).toFixed(3));
      }
      if (copy) {
        copy.style.transform = "translate3d(0," + (p * 14).toFixed(1) + "px,0)";
        copy.style.opacity = String((1 - p * 0.35).toFixed(3));
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
    var screen = document.getElementById("phoneScreen");
    var slides = document.querySelectorAll(".phone-slide");
    var tabs = document.querySelectorAll(".phone-tabs [data-tab], .phone-tabs span");
    var toast = document.getElementById("phoneToast");
    if (!slides.length) return;

    var i = 0;
    var total = slides.length;
    var timer = null;
    var manual = false;

    function show(n) {
      i = ((n % total) + total) % total;
      slides.forEach(function (s, idx) {
        s.classList.toggle("is-on", idx === i);
      });
      tabs.forEach(function (t, idx) {
        var key = t.getAttribute("data-tab");
        var on = key != null ? Number(key) === i : idx === i;
        t.classList.toggle("is-on", on);
      });
    }

    function next() { show(i + 1); }
    function prev() { show(i - 1); }

    function stopAuto() {
      manual = true;
      if (timer) {
        global.clearInterval(timer);
        timer = null;
      }
    }

    function startAuto() {
      if (reduced() || manual) return;
      if (timer) global.clearInterval(timer);
      timer = global.setInterval(next, 4200);
    }

    show(0);

    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.preventDefault();
        stopAuto();
        var key = t.getAttribute("data-tab");
        show(key != null ? Number(key) : Array.prototype.indexOf.call(tabs, t));
      });
    });

    if (screen) {
      var startX = 0;
      var startY = 0;
      var tracking = false;

      screen.addEventListener("pointerdown", function (e) {
        tracking = true;
        startX = e.clientX;
        startY = e.clientY;
        try { screen.setPointerCapture(e.pointerId); } catch (err) {}
      });

      screen.addEventListener("pointerup", function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
        stopAuto();
        if (dx < 0) next();
        else prev();
      });

      screen.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { stopAuto(); next(); }
        if (e.key === "ArrowLeft") { stopAuto(); prev(); }
      });
    }

    startAuto();

    if (toast && !reduced()) {
      var toastOn = false;
      global.setTimeout(function () {
        toast.classList.add("is-on");
        toastOn = true;
      }, 1600);
      global.setInterval(function () {
        toastOn = !toastOn;
        toast.classList.toggle("is-on", toastOn);
      }, 4800);
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
