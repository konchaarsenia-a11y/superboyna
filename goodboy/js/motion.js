/**
 * GOOD BOY motion — cinematic, restrained.
 * Nav · progress · hero entrance · reveals · shelves · phone.
 * Respects prefers-reduced-motion.
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

  function initProgress() {
    var bar = document.getElementById("scrollProgress");
    if (!bar) return;
    var ticking = false;
    function apply() {
      ticking = false;
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      var p = Math.min(1, Math.max(0, (global.scrollY || 0) / max));
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
    global.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
    apply();
  }

  function initHeroEntrance() {
    var hero = document.querySelector(".site-hero");
    if (!hero) return;
    if (reduced()) {
      hero.classList.add("is-ready");
      return;
    }
    // next frame — CSS transitions kick from .is-ready
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        hero.classList.add("is-ready");
      });
    });
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
        // kick shelf parallax once strip appears
        global.dispatchEvent(new Event("scroll"));
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.14 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  function initFeatureStagger() {
    if (reduced()) return;
    var articles = document.querySelectorAll(".feature-rail article.reveal");
    articles.forEach(function (el, i) {
      el.style.transitionDelay = (0.05 + i * 0.08).toFixed(2) + "s";
    });
    var cards = document.querySelectorAll(".hero-features .hf-card");
    cards.forEach(function (el, i) {
      el.style.setProperty("--hf-delay", (0.42 + i * 0.09).toFixed(2) + "s");
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
        var dx = ((lx - 0.5) * 14).toFixed(1);
        var dy = ((ly - 0.5) * 10).toFixed(1);
        wash.style.setProperty("--mx", dx + "px");
        wash.style.setProperty("--my", dy + "px");
      }
      if (phone) {
        var ry = ((lx - 0.5) * 10).toFixed(2);
        var rx = ((0.5 - ly) * 6).toFixed(2);
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
    var shelves = document.querySelectorAll(".photo-shelves .shelf");
    if (!hero && !shelves.length) return;

    var ticking = false;
    function apply() {
      ticking = false;
      var y = global.scrollY || 0;
      var vh = global.innerHeight || 1;

      if (hero && (stage || copy)) {
        var h = hero.offsetHeight || 1;
        var p = Math.min(1, Math.max(0, y / h));
        if (p < 0.01) {
          if (stage) { stage.style.transform = ""; stage.style.opacity = ""; }
          if (copy) { copy.style.transform = ""; copy.style.opacity = ""; }
        } else {
          if (stage) {
            stage.style.transform = "translate3d(0," + (p * 18).toFixed(1) + "px,0)";
            stage.style.opacity = String((1 - p * 0.35).toFixed(3));
          }
          if (copy) {
            copy.style.transform = "translate3d(0," + (p * 10).toFixed(1) + "px,0)";
            copy.style.opacity = String((1 - p * 0.28).toFixed(3));
          }
        }
      }

      for (var i = 0; i < shelves.length; i++) {
        var el = shelves[i];
        var r = el.getBoundingClientRect();
        var mid = r.top + r.height * 0.5;
        var t = (mid - vh * 0.5) / vh;
        var fromRight = el.classList.contains("shelf-from-right");
        var dir = fromRight ? 1 : -1;
        el.style.transform = "translate3d(" + (t * 14 * dir).toFixed(2) + "px,0,0)";
      }
    }

    global.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(apply);
      }
    }, { passive: true });
    apply();
  }

  function initPhoneCallouts(picks, getIndex) {
    var grid = document.getElementById("phoneShowcaseGrid");
    var svg = document.getElementById("phoneCallouts");
    var phone = document.getElementById("heroPhone");
    if (!grid || !svg || !phone || !picks.length) return null;

    var NS = "http://www.w3.org/2000/svg";
    var layers = [];
    var targets = { 0: 0.26, 1: 0.42, 2: 0.58, 3: 0.74 };

    picks.forEach(function (pick) {
      var path = document.createElementNS(NS, "path");
      path.setAttribute("class", "phone-callout-path");
      path.setAttribute("data-tab", pick.getAttribute("data-tab"));
      svg.appendChild(path);

      var dotStart = document.createElementNS(NS, "circle");
      dotStart.setAttribute("class", "phone-callout-dot phone-callout-dot--start");
      dotStart.setAttribute("r", "3.5");
      svg.appendChild(dotStart);

      var dotEnd = document.createElementNS(NS, "circle");
      dotEnd.setAttribute("class", "phone-callout-dot phone-callout-dot--end");
      dotEnd.setAttribute("r", "4");
      svg.appendChild(dotEnd);

      layers.push({ pick: pick, path: path, dotStart: dotStart, dotEnd: dotEnd });
    });

    function update() {
      var active = getIndex();
      if (global.innerWidth < 880) {
        svg.style.display = "none";
        return;
      }
      svg.style.display = "block";
      var gridRect = grid.getBoundingClientRect();
      var w = Math.max(1, gridRect.width);
      var h = Math.max(1, gridRect.height);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);

      var phoneRect = phone.getBoundingClientRect();

      layers.forEach(function (layer) {
        var tab = Number(layer.pick.getAttribute("data-tab"));
        var pickRect = layer.pick.getBoundingClientRect();
        var x1 = pickRect.right - gridRect.left + 1;
        var y1 = pickRect.top + pickRect.height * 0.5 - gridRect.top;
        var x2 = phoneRect.left - gridRect.left - 1;
        var y2 = phoneRect.top + phoneRect.height * (targets[tab] || 0.5) - gridRect.top;
        var bend = Math.max(36, (x2 - x1) * 0.42);
        var d = "M" + x1 + " " + y1 +
          " C" + (x1 + bend) + " " + y1 + " " + (x2 - bend) + " " + y2 + " " + x2 + " " + y2;

        layer.path.setAttribute("d", d);
        layer.dotStart.setAttribute("cx", x1);
        layer.dotStart.setAttribute("cy", y1);
        layer.dotEnd.setAttribute("cx", x2);
        layer.dotEnd.setAttribute("cy", y2);
        layer.dotEnd.setAttribute("r", on ? "4.5" : "3.5");

        var on = tab === active;
        layer.path.classList.toggle("is-on", on);
        layer.dotStart.classList.toggle("is-on", on);
        layer.dotEnd.classList.toggle("is-on", on);
      });
    }

    var resizeTimer;
    global.addEventListener("resize", function () {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(update, 80);
    });

    if (typeof global.ResizeObserver !== "undefined") {
      var ro = new global.ResizeObserver(update);
      ro.observe(grid);
      ro.observe(phone);
    }

    global.setTimeout(update, 120);
    global.setTimeout(update, 600);

    return update;
  }

  function initPhoneDemo() {
    var screen = document.getElementById("phoneScreen");
    var slides = document.querySelectorAll(".phone-slide");
    var tabs = document.querySelectorAll(".phone-tabs [data-tab], .phone-tabs span");
    var picks = document.querySelectorAll(".phone-pick[data-tab]");
    var toast = document.getElementById("phoneToast");
    if (!slides.length) return;

    var i = 1;
    var total = slides.length;
    var timer = null;
    var manual = false;
    var updateCallouts = initPhoneCallouts(picks, function () { return i; });

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
      picks.forEach(function (p) {
        var pickKey = p.getAttribute("data-tab");
        var pickOn = pickKey != null && Number(pickKey) === i;
        p.classList.toggle("is-on", pickOn);
        p.setAttribute("aria-selected", pickOn ? "true" : "false");
      });
      if (updateCallouts) updateCallouts();
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

    show(i);

    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.preventDefault();
        stopAuto();
        var key = t.getAttribute("data-tab");
        show(key != null ? Number(key) : Array.prototype.indexOf.call(tabs, t));
      });
    });

    picks.forEach(function (p) {
      p.addEventListener("click", function () {
        stopAuto();
        var key = p.getAttribute("data-tab");
        if (key != null) show(Number(key));
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
      }, 1800);
      global.setInterval(function () {
        toastOn = !toastOn;
        toast.classList.toggle("is-on", toastOn);
      }, 5200);
    }
  }

  function init() {
    initNav();
    initProgress();
    initFeatureStagger();
    initHeroEntrance();
    initReveal();
    initPointerLight();
    initScrollParallax();
    initPhoneDemo();
  }

  global.GBMotion = { init: init };
})(window);
