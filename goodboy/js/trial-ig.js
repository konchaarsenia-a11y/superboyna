/**
 * Trial NFC: Instagram DM — на iPhone ig.me не подставляет ?text=,
 * поэтому копируем текст в буфер по тапу и открываем Direct.
 */
(function (global) {
  "use strict";

  var IG_USER = "goodboy_rb";
  var IG_URL = "https://ig.me/m/" + IG_USER;
  var IG_MSG =
    "Привет! Хочу бесплатный период GOOD BOY — набор под моего питомца.";

  function isIos() {
    return /iPhone|iPad|iPod/i.test(global.navigator.userAgent || "");
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, text.length);
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch (e) {}
        resolve();
      }

      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(resolve).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  function ensureToast() {
    var el = document.getElementById("trialIgToast");
    if (el) return el;
    el = document.createElement("div");
    el.id = "trialIgToast";
    el.className = "trial-ig-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
  }

  function showToast(msg) {
    var el = ensureToast();
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("is-on");
    }, 4200);
  }

  function openIg() {
    global.location.href = IG_URL;
  }

  function init() {
    var btn = document.getElementById("subIgBtn");
    if (!btn) return;

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      copyText(IG_MSG).then(function () {
        showToast(
          isIos()
            ? "Текст скопирован — в Direct нажмите «Вставить» и отправьте"
            : "Текст скопирован — вставьте в Direct, если не подставился сам"
        );
        setTimeout(openIg, isIos() ? 450 : 200);
      });
    });
  }

  global.GBTrialIg = { init: init, message: IG_MSG, url: IG_URL };
})(window);
