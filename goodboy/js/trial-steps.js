/**
 * Trial landing: карточка шага меняет текст на подробный (без аккордеона).
 */
(function (global) {
  "use strict";

  var STEPS = {
    ask: {
      title: "Анкета",
      lead: "Перед сборкой набора",
      body:
        "Перед сборкой бесплатного набора спросим про питомца: интересы, " +
        "активность, аллергии и другие детали для подбора лакомств."
    },
    week: {
      title: "Неделя",
      lead: "Питомец пробует дома",
      body:
        "Одна доставка — неделя лакомств. Питомец дегустирует набор дома. " +
        "Формат, вкус и жёсткость подбираем лично."
    },
    feedback: {
      title: "Отзыв",
      lead: "Правим набор под вас",
      body:
        "Делитесь обратной связью: что понравилось, что нет. " +
        "После этого внесём правки — и набор станет идеальным."
    }
  };

  function closeAll(items, except) {
    items.forEach(function (item) {
      if (item === except) return;
      setDetail(item, false);
    });
  }

  function setDetail(item, on) {
    var btn = item.querySelector(".trial-step-card");
    var longFace = item.querySelector(".trial-step-face--long");
    item.classList.toggle("is-detail", on);
    if (btn) btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (longFace) longFace.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function init() {
    var items = document.querySelectorAll(".trial-step-item[data-step]");
    if (!items.length) return;

    items.forEach(function (item) {
      var key = item.getAttribute("data-step");
      var step = STEPS[key];
      var btn = item.querySelector(".trial-step-card");
      var detailText = item.querySelector(".trial-step-detail-text");
      if (!step || !btn || !detailText) return;

      detailText.textContent = step.body;

      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var on = !item.classList.contains("is-detail");
        closeAll(items, on ? item : null);
        setDetail(item, on);
      });
    });
  }

  global.GBTrialSteps = { init: init };
})(window);
