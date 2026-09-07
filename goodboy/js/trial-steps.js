/**
 * Trial landing: карточка шага меняет текст на подробный (без аккордеона).
 */
(function (global) {
  "use strict";

  var STEPS = {
    first: {
      title: "1-я доставка",
      lead: "Дегустация + отзыв",
      body:
        "Питомец пробует стартовый набор. Пишете, чего добавить, что убрать " +
        "и какая жёсткость нужна."
    },
    second: {
      title: "2-я доставка",
      lead: "Уже под ваши вкусы",
      body:
        "Собираем бокс строго по вашим комментариям — свежо и под питомца. " +
        "Доставка раз в неделю."
    },
    decide: {
      title: "Решаете",
      lead: "Комфортно — продолжим",
      body:
        "Стало удобнее — продолжаем по выверенному плану. " +
        "Не подошло — просто скажете. Без давления."
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
