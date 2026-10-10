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
      if (e.target && e.target.closest && e.target.closest(".phone-stage")) return;
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
      phoneZone.addEventListener("pointerover", function (e) {
        if (!e.target || !e.target.closest || !e.target.closest(".phone-stage")) return;
        lx = 0.5;
        ly = 0.45;
        if (!ticking) {
          ticking = true;
          global.requestAnimationFrame(apply);
        }
      }, { passive: true });
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

  function initPhoneDemo() {
    var screen = document.getElementById("phoneScreen");
    var track = document.querySelector(".phone-slides");
    var stage = document.querySelector(".phone-stage");
    var slides = document.querySelectorAll(".phone-slide");
    var tabs = document.querySelectorAll(".phone-tabs [data-tab], .phone-tabs span");
    var prevBtn = document.getElementById("phonePrev");
    var nextBtn = document.getElementById("phoneNext");
    var toast = document.getElementById("phoneToast");
    if (!track || !slides.length) return;

    var i = 0;
    var total = slides.length;
    var timer = null;
    var manual = false;
    var drag = null;
    var snapTimer = null;
    var wheelLock = false;

    function indexFromScroll() {
      var w = track.clientWidth || 1;
      return Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / w)));
    }

    function setTabs(n) {
      i = Math.max(0, Math.min(total - 1, n));
      slides.forEach(function (s, idx) {
        s.classList.toggle("is-on", idx === i);
      });
      tabs.forEach(function (t, idx) {
        var key = t.getAttribute("data-tab");
        var on = key != null ? Number(key) === i : idx === i;
        t.classList.toggle("is-on", on);
        if (t.tagName === "BUTTON") t.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function scrollToIndex(n, behavior) {
      var w = track.clientWidth || 1;
      var target = ((n % total) + total) % total;
      track.scrollTo({
        left: target * w,
        behavior: reduced() ? "auto" : (behavior || "smooth")
      });
      setTabs(target);
    }

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
      timer = global.setInterval(function () {
        scrollToIndex(indexFromScroll() + 1, "smooth");
      }, 4200);
    }

    function hold(on) {
      if (stage) stage.classList.toggle("is-interacting", !!on);
    }

    function releaseSnap() {
      if (snapTimer) global.clearTimeout(snapTimer);
      snapTimer = global.setTimeout(function () {
        track.classList.remove("is-dragging");
        hold(false);
        scrollToIndex(indexFromScroll(), "smooth");
      }, 70);
    }

    setTabs(0);

    track.addEventListener("scroll", function () {
      var n = indexFromScroll();
      if (n !== i) setTabs(n);
    }, { passive: true });

    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.preventDefault();
        stopAuto();
        var key = t.getAttribute("data-tab");
        scrollToIndex(key != null ? Number(key) : Array.prototype.indexOf.call(tabs, t), "smooth");
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        stopAuto();
        scrollToIndex(indexFromScroll() - 1, "smooth");
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        stopAuto();
        scrollToIndex(indexFromScroll() + 1, "smooth");
      });
    }

    if (screen) {
      screen.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          stopAuto();
          scrollToIndex(indexFromScroll() + 1, "smooth");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          stopAuto();
          scrollToIndex(indexFromScroll() - 1, "smooth");
        }
      });
    }

    /* Мышь: тянем вбок. Вертикаль не перехватываем — страница скроллится. Тач — нативный snap. */
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") return;
      if (e.button != null && e.button !== 0) return;
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: track.scrollLeft,
        axis: ""
      };
    });

    track.addEventListener("pointermove", function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (drag.axis !== "x") {
          drag = null;
          return;
        }
        stopAuto();
        hold(true);
        track.classList.add("is-dragging");
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var rect = track.getBoundingClientRect();
      var scale = rect.width ? track.clientWidth / rect.width : 1;
      track.scrollLeft = drag.left - dx * scale;
    });

    function endDrag(e) {
      if (!drag || (e && drag.id !== e.pointerId)) return;
      var wasX = drag.axis === "x";
      drag = null;
      if (!wasX) return;
      track.classList.remove("is-dragging");
      hold(false);
      scrollToIndex(indexFromScroll(), "smooth");
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    track.addEventListener("wheel", function (e) {
      var absX = Math.abs(e.deltaX);
      var absY = Math.abs(e.deltaY);
      var horizontal = absX > absY && absX > 1;
      /* Щелчок колёсика мыши (крупный deltaY). Мелкий трекпад по вертикали не трогаем. */
      var mouseNotch = e.deltaMode === 1 || e.deltaMode === 2 || (absY >= 50 && absX < 8);
      if (!horizontal && !(absY > absX && mouseNotch)) return;
      e.preventDefault();
      stopAuto();
      hold(true);
      if (horizontal) {
        var rect = track.getBoundingClientRect();
        var scale = rect.width ? track.clientWidth / rect.width : 1;
        track.classList.add("is-dragging");
        track.scrollLeft += e.deltaX * scale;
        releaseSnap();
        return;
      }
      if (wheelLock) return;
      wheelLock = true;
      scrollToIndex(indexFromScroll() + (e.deltaY > 0 ? 1 : -1), "smooth");
      global.setTimeout(function () {
        wheelLock = false;
        hold(false);
      }, 320);
    }, { passive: false });

    startAuto();

    document.querySelectorAll(".hf-card--jump[data-phone-tab]").forEach(function (card) {
      function jumpToPhone() {
        var tab = Number(card.getAttribute("data-phone-tab"));
        if (isNaN(tab)) return;
        stopAuto();
        scrollToIndex(tab, "smooth");
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
