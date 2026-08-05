/** Минимум motion: только nav при скролле */
(function (global) {
  "use strict";
  function init() {
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-solid", (global.scrollY || 0) > 20);
    };
    onScroll();
    global.addEventListener("scroll", onScroll, { passive: true });
  }
  global.GBMotion = { init: init };
})(window);
