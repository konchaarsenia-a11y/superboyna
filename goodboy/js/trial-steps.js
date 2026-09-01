/**
 * Trial landing: подробности по тапу на карточки шагов (аккордеон).
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

  function closeAll(items, except) {
    items.forEach(function (item) {
      if (item === except) return;
      var btn = item.querySelector(".trial-step-card");
      var wrap = item.querySelector(".trial-step-detail-wrap");
      var panel = item.querySelector(".trial-step-detail");
      item.classList.remove("is-open");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (wrap) wrap.setAttribute("aria-hidden", "true");
      if (panel) panel.setAttribute("aria-hidden", "true");
    });
  }

  function init() {
    var items = document.querySelectorAll(".trial-step-item[data-step]");
    if (!items.length) return;

    items.forEach(function (item) {
      var key = item.getAttribute("data-step");
      var step = STEPS[key];
      var btn = item.querySelector(".trial-step-card");
      var wrap = item.querySelector(".trial-step-detail-wrap");
      var panel = item.querySelector(".trial-step-detail");
      if (!step || !btn || !wrap || !panel) return;

      panel.textContent = step.body;

      function toggle(ev) {
        if (ev) ev.preventDefault();
        var open = !item.classList.contains("is-open");
        closeAll(items, open ? item : null);
        item.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        wrap.setAttribute("aria-hidden", open ? "false" : "true");
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        if (open) {
          global.setTimeout(function () {
            item.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 80);
        }
      }

      btn.addEventListener("click", toggle);
    });
  }

  global.GBTrialSteps = { init: init };
})(window);
