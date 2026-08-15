/**
 * Заявка «Хочу попробовать» → webhook Apps Script (submitGoodboyTry).
 */
(function (global) {
  "use strict";

  var DEFAULT_WEBHOOK =
    "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

  function webhookUrl() {
    if (global.GB_CONFIG && global.GB_CONFIG.leadWebhookUrl) return global.GB_CONFIG.leadWebhookUrl;
    if (global.GB_CONFIG && global.GB_CONFIG.webhookUrl) return global.GB_CONFIG.webhookUrl;
    return DEFAULT_WEBHOOK;
  }

  function sendLead(data) {
    var url = webhookUrl();
    return new Promise(function (resolve, reject) {
      var cb = "gb_try_" + Math.round(Math.random() * 1e9);
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("timeout"));
      }, 20000);
      function cleanup() {
        clearTimeout(timer);
        try { delete global[cb]; } catch (e) {}
        var s = document.getElementById(cb);
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
      global[cb] = function (res) {
        cleanup();
        resolve(res || {});
      };
      var q = [
        "action=submitGoodboyTry",
        "name=" + encodeURIComponent(data.name || ""),
        "phone=" + encodeURIComponent(data.phone || ""),
        "pet=" + encodeURIComponent(data.pet || ""),
        "note=" + encodeURIComponent(data.note || ""),
        "callback=" + cb
      ].join("&");
      var script = document.createElement("script");
      script.id = cb;
      script.async = true;
      script.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + q;
      script.onerror = function () {
        cleanup();
        reject(new Error("network"));
      };
      (document.head || document.body).appendChild(script);
    });
  }

  function initTryForm() {
    var form = document.getElementById("tryForm");
    if (!form) return;
    var status = document.getElementById("tryFormStatus");
    var btn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        name: (form.name.value || "").trim(),
        phone: (form.phone.value || "").trim(),
        pet: (form.pet.value || "").trim(),
        note: (form.note.value || "").trim()
      };

      if (!data.name || !data.phone || !data.pet) {
        if (status) {
          status.hidden = false;
          status.className = "form-status is-error";
          status.textContent = "Заполните имя, телефон и кличку питомца.";
        }
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Отправляем…";
      }
      if (status) {
        status.hidden = false;
        status.className = "form-status";
        status.textContent = "Отправляем заявку…";
      }

      sendLead(data)
        .then(function (res) {
          if (res && res.status === "ok") {
            form.reset();
            if (status) {
              status.className = "form-status is-ok";
              status.textContent = "Заявка отправлена. Мы напишем в течение часа.";
            }
            return;
          }
          throw new Error((res && res.message) || "fail");
        })
        .catch(function () {
          if (status) {
            status.className = "form-status is-error";
            status.textContent = "Не удалось отправить. Обновите страницу или напишите в Instagram @goodboy_rb.";
          }
        })
        .then(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Отправить заявку";
          }
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTryForm);
  } else {
    initTryForm();
  }
})(window);
