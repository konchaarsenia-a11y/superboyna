/**
 * Trial NFC: Instagram DM — на iPhone ig.me не подставляет ?text=,
 * поэтому копируем текст в буфер синхронно по тапу и открываем Direct.
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

  function copyTextSync(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "2em";
      ta.style.height = "2em";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (e) {}

    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      try {
        global.navigator.clipboard.writeText(text);
        return true;
      } catch (e2) {}
    }
    return false;
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

    function onTap(ev) {
      ev.preventDefault();
      var copied = copyTextSync(IG_MSG);
      showToast(
        copied
          ? (isIos()
            ? "Текст скопирован — в Direct нажмите «Вставить»"
            : "Текст скопирован — вставьте в Direct")
          : "Скопируйте текст вручную из подсказки ниже"
      );
      openIg();
    }

    btn.addEventListener("click", onTap);
  }

  global.GBTrialIg = { init: init, message: IG_MSG, url: IG_URL };
})(window);
