/**
 * Лендинг: заявка на пробный набор → Instagram DM.
 */
(function (global) {
  "use strict";

  var IG_DM = "https://ig.me/m/goodboy_rb";

  function cleanInsta(v) {
    return String(v || "").trim().replace(/^@+/, "");
  }

  function buildMessage(data) {
    return [
      "Здравствуйте! Хочу пробный набор GOOD BOY.",
      "Имя: " + data.name,
      "Телефон: " + data.phone,
      "Instagram: @" + data.instagram
    ].join("\n");
  }

  function init() {
    var form = document.getElementById("trialForm");
    var status = document.getElementById("formStatus");
    if (!form) return;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(form);
      var data = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        instagram: cleanInsta(fd.get("instagram"))
      };
      if (!data.name || !data.phone || !data.instagram) {
        if (status) {
          status.hidden = false;
          status.textContent = "Заполните имя, телефон и ник в Instagram.";
        }
        return;
      }

      var msg = buildMessage(data);
      try {
        global.localStorage.setItem("gb_trial_lead", JSON.stringify({
          at: Date.now(),
          name: data.name,
          phone: data.phone,
          instagram: data.instagram
        }));
      } catch (e) {}

      try {
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg);
        }
      } catch (e2) {}

      if (status) {
        status.hidden = false;
        status.textContent = "Текст заявки скопирован. Сейчас откроем Instagram — вставьте сообщение в директ, если оно не подставилось само.";
      }

      global.open(IG_DM, "_blank", "noopener");
    });
  }

  global.GBLanding = { init: init };
})(window);
