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
    var head = hero && hero.querySelector(".hero-head-stage");
    var copy = hero && hero.querySelector(".hero-copy");
    var shelves = document.querySelectorAll(".photo-shelves .shelf");
    if (!hero && !shelves.length) return;

    var ticking = false;
    function apply() {
      ticking = false;
      var y = global.scrollY || 0;
      var vh = global.innerHeight || 1;

      if (hero && (stage || copy || head)) {
        var h = hero.offsetHeight || 1;
        var p = Math.min(1, Math.max(0, y / h));
        if (p < 0.01) {
          if (stage) { stage.style.transform = ""; stage.style.opacity = ""; }
          if (head) { head.style.setProperty("--sy", "0px"); }
          if (copy) { copy.style.transform = ""; copy.style.opacity = ""; }
        } else {
          if (stage) {
            stage.style.transform = "translate3d(0," + (p * 18).toFixed(1) + "px,0)";
            stage.style.opacity = String((1 - p * 0.35).toFixed(3));
          }
          if (head) {
            head.style.setProperty("--sy", (p * 14).toFixed(1) + "px");
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

    document.querySelectorAll(".hf-card--jump[data-phone-tab]").forEach(function (card) {
      function jumpToPhone() {
        var tab = Number(card.getAttribute("data-phone-tab"));
        if (isNaN(tab)) return;
        stopAuto();
        show(tab);
        var section = document.getElementById("app");
        if (section) {
          section.scrollIntoView({
            behavior: reduced() ? "auto" : "smooth",
            block: "center"
          });
        }
        var phone = document.getElementById("phoneScreen");
        if (phone) phone.focus({ preventScroll: true });
      }
      card.addEventListener("click", jumpToPhone);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          jumpToPhone();
        }
      });
    });

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

  function initHeroHead() {
    var face = document.getElementById("gbHeroFace");
    var orbits = face ? face.querySelectorAll(".gb-orbit") : [];
    if (!face || !orbits.length) return;
    if (reduced()) return;

    var TAU = 0.12;
    var nodes = [];
    for (var i = 0; i < orbits.length; i++) {
      var el = orbits[i];
      var gaze = el.querySelector(".gb-gaze");
      if (!gaze) continue;
      nodes.push({
        el: el,
        gaze: gaze,
        maxRatio: Number(el.getAttribute("data-max")) || 0.22,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0
      });
    }
    if (!nodes.length) return;

    var touchDown = false;
    var lastTs = 0;
    var running = true;

    function capOf(eye) {
      var orb = eye.el.getBoundingClientRect();
      var g = eye.gaze.getBoundingClientRect();
      var room = (orb.width - g.width) * 0.5 - 1;
      return Math.max(3, Math.min(room, orb.width * eye.maxRatio));
    }

    function aimAt(clientX, clientY) {
      for (var n = 0; n < nodes.length; n++) {
        var eye = nodes[n];
        var r = eye.el.getBoundingClientRect();
        var dx = clientX - (r.left + r.width * 0.5);
        var dy = clientY - (r.top + r.height * 0.5);
        var len = Math.hypot(dx, dy);
        var cap = capOf(eye);
        if (len < 0.001) {
          eye.tx = 0;
          eye.ty = 0;
          continue;
        }
        var scale = Math.min(1, cap / len);
        eye.tx = dx * scale;
        eye.ty = dy * scale;
      }
    }

    function rest() {
      for (var n = 0; n < nodes.length; n++) {
        nodes[n].tx = 0;
        nodes[n].ty = 0;
      }
    }

    function tick(ts) {
      if (!running) return;
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      var k = 1 - Math.exp(-dt / TAU);
      for (var n = 0; n < nodes.length; n++) {
        var eye = nodes[n];
        eye.x += (eye.tx - eye.x) * k;
        eye.y += (eye.ty - eye.y) * k;
        if (Math.abs(eye.x) < 0.02) eye.x = 0;
        if (Math.abs(eye.y) < 0.02) eye.y = 0;
        eye.gaze.style.setProperty("--gx", eye.x.toFixed(2) + "px");
        eye.gaze.style.setProperty("--gy", eye.y.toFixed(2) + "px");
      }
      global.requestAnimationFrame(tick);
    }

    function isTouch(e) {
      return e.pointerType === "touch" || e.pointerType === "pen";
    }

    global.addEventListener("pointerdown", function (e) {
      if (!isTouch(e)) return;
      touchDown = true;
      aimAt(e.clientX, e.clientY);
    }, { passive: true });

    global.addEventListener("pointermove", function (e) {
      if (isTouch(e)) {
        if (!touchDown) return;
        aimAt(e.clientX, e.clientY);
        return;
      }
      aimAt(e.clientX, e.clientY);
    }, { passive: true });

    function endTouch() {
      if (!touchDown) return;
      touchDown = false;
      rest();
    }
    global.addEventListener("pointerup", function (e) {
      if (isTouch(e)) endTouch();
    }, { passive: true });
    global.addEventListener("pointercancel", function (e) {
      if (isTouch(e)) endTouch();
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      if (!touchDown) rest();
    });

    global.requestAnimationFrame(tick);
  }

  function init() {
    initNav();
    initProgress();
    initFeatureStagger();
    initHeroEntrance();
    initReveal();
    initPointerLight();
    initHeroHead();
    initScrollParallax();
    initPhoneDemo();
  }

  global.GBMotion = { init: init };
})(window);
