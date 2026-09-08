/**
 * Trial landing: карточка шага меняет текст на подробный (без аккордеона).
 * Тексты карточек — дословно от владельца.
 */
(function (global) {
  "use strict";

  var STEPS = {
    ask: {
      body:
        "Перед сборкой бесплатного набора мы попросим у вас информацию о вашем питомце: о его интересах, активности, аллергиях и других важных для подбора лакомств моментах"
    },
    week: {
      body: "Питомец дегустирует набор в течение недели"
    },
    feedback: {
      body: "Вы делитесь обратной связью: что понравилось, что нет"
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
