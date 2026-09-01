/**
 * Trial landing: подробности по тапу на карточки шагов.
 */
(function (global) {
  "use strict";

  var STEPS = {
    pet: {
      title: "Питомец",
      body:
        "Напишите нам в Direct — зададим пару вопросов про питомца: " +
        "кличка, порода, вес, аллергии и что любит из лакомств.\n\n" +
        "Набор собираем не «для всех», а именно под вашего питомца."
    },
    try: {
      title: "Пробуете",
      body:
        "Привезём пробный набор на неделю — бесплатно.\n\n" +
        "Смотрите, как питомец ест дома: аппетит, настроение, аллергии. " +
        "Без обязательств продолжать."
    },
    decide: {
      title: "Решаете",
      body:
        "Понравилось — оформим подписку с удобной доставкой.\n\n" +
        "Нужно подкрутить состав — подстроим по отклику питомца. " +
        "Не подошло — просто скажете, без давления."
    }
  };

  function init() {
    var sheet = document.getElementById("trialStepSheet");
    var cards = document.querySelectorAll(".trial-step-card[data-step]");
    if (!sheet || !cards.length) return;

    var backdrop = sheet.querySelector(".trial-sheet-backdrop");
    var closeBtn = sheet.querySelector(".trial-sheet-close");
    var titleEl = document.getElementById("trialSheetTitle");
    var bodyEl = document.getElementById("trialSheetBody");
    var activeCard = null;

    function open(stepKey, card) {
      var step = STEPS[stepKey];
      if (!step) return;

      if (activeCard) activeCard.setAttribute("aria-expanded", "false");
      activeCard = card;
      if (activeCard) activeCard.setAttribute("aria-expanded", "true");

      titleEl.textContent = step.title;
      bodyEl.textContent = step.body;

      sheet.hidden = false;
      sheet.setAttribute("aria-hidden", "false");
      document.body.classList.add("trial-sheet-open");
      requestAnimationFrame(function () {
        sheet.classList.add("is-open");
      });
      closeBtn.focus();
    }

    function close() {
      sheet.classList.remove("is-open");
      sheet.setAttribute("aria-hidden", "true");
      document.body.classList.remove("trial-sheet-open");
      if (activeCard) {
        activeCard.setAttribute("aria-expanded", "false");
        activeCard.focus();
        activeCard = null;
      }
      setTimeout(function () {
        if (!sheet.classList.contains("is-open")) sheet.hidden = true;
      }, 280);
    }

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        open(card.getAttribute("data-step"), card);
      });
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          open(card.getAttribute("data-step"), card);
        }
      });
    });

    if (backdrop) backdrop.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && sheet.classList.contains("is-open")) close();
    });
  }

  global.GBTrialSteps = { init: init };
})(window);
