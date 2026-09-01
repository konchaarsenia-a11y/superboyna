/**
 * Trial landing: карточка шага меняет текст на подробный (без аккордеона).
 */
(function (global) {
  "use strict";

  var STEPS = {
    pet: {
      title: "Питомец",
      lead: "Расскажете, кто он",
      body:
        "Напишите нам в Direct — зададим пару вопросов про питомца: " +
        "кличка, порода, вес, аллергии и что любит из лакомств. " +
        "Набор собираем не «для всех», а именно под вашего питомца."
    },
    try: {
      title: "Пробуете",
      lead: "Неделя бесплатно",
      body:
        "Привезём пробный набор на неделю — бесплатно. " +
        "Смотрите, как питомец ест дома: аппетит, настроение, аллергии. " +
        "Без обязательств продолжать."
    },
    decide: {
      title: "Решаете",
      lead: "Подходит — продолжим",
      body:
        "Понравилось — оформим подписку с удобной доставкой. " +
        "Нужно подкрутить состав — подстроим по отклику питомца. " +
        "Не подошло — просто скажете, без давления."
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
