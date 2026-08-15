/**
 * Заявка «Хочу попробовать» на странице подписки.
 * Пока без бэкенда: сохраняет в localStorage и показывает статус.
 */
(function () {
  "use strict";

  function initTryForm() {
    var form = document.getElementById("tryForm");
    if (!form) return;
    var status = document.getElementById("tryFormStatus");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        name: (form.name.value || "").trim(),
        phone: (form.phone.value || "").trim(),
        pet: (form.pet.value || "").trim(),
        note: (form.note.value || "").trim(),
        at: new Date().toISOString()
      };

      if (!data.name || !data.phone || !data.pet) {
        if (status) {
          status.hidden = false;
          status.className = "form-status is-error";
          status.textContent = "Заполните имя, телефон и кличку питомца.";
        }
        return;
      }

      try {
        var key = "gb_try_leads";
        var list = [];
        try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch (err) { list = []; }
        if (!Array.isArray(list)) list = [];
        list.push(data);
        localStorage.setItem(key, JSON.stringify(list.slice(-50)));
      } catch (err2) {}

      form.reset();
      if (status) {
        status.hidden = false;
        status.className = "form-status is-ok";
        status.textContent = "Заявка отправлена. Мы напишем в течение часа.";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTryForm);
  } else {
    initTryForm();
  }
})();
