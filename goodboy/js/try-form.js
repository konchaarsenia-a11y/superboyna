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

  function val(form, name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el.nodeName) return String(el.value || "").trim();
    if (el.length && el[0] && el[0].type === "radio") {
      for (var i = 0; i < el.length; i++) {
        if (el[i].checked) return String(el[i].value || "").trim();
      }
      return "";
    }
    return String((el.value || "")).trim();
  }

  function sendLeadJsonp(data) {
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
        "mode=" + encodeURIComponent(data.mode || "short"),
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

  function sendLeadPost(data) {
    var url = webhookUrl();
    var payload = {
      action: "submitGoodboyTry",
      name: data.name || "",
      phone: data.phone || "",
      pet: data.pet || "",
      note: data.note || "",
      mode: data.mode || "short"
    };
    return fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function () {
      return { status: "ok" };
    }).catch(function () {
      return { status: "ok" };
    });
  }

  function sendLead(data) {
    if (data.mode === "full" || (data.note && data.note.length > 900)) {
      return sendLeadPost(data);
    }
    return sendLeadJsonp(data);
  }

  function line(n, title, text) {
    if (!text) return "";
    return n + ". " + title + ": " + text;
  }

  function qBlock(form, n) {
    return form.querySelector('.try-q[data-q="' + n + '"]');
  }

  function isSkipped(form, n) {
    var block = qBlock(form, n);
    return !!(block && block.classList.contains("is-skipped"));
  }

  function packQ(form, n, title, text) {
    if (isSkipped(form, n)) return line(String(n), title, "не знаю");
    return line(String(n), title, text);
  }

  function setQuestionSkipped(block, skipped) {
    if (!block) return;
    block.classList.toggle("is-skipped", skipped);
    var answer = block.querySelector(".try-q-answer");
    if (answer) {
      var fields = answer.querySelectorAll("input, textarea");
      for (var i = 0; i < fields.length; i++) {
        fields[i].disabled = skipped;
        if (skipped) fields[i].value = "";
      }
    }
    var skipBtn = block.querySelector("[data-try-skip]");
    if (skipBtn) {
      skipBtn.textContent = skipped ? "Пропущено — нажмите, чтобы ответить" : "Не знаю / пропустить";
      skipBtn.setAttribute("aria-pressed", skipped ? "true" : "false");
    }
  }

  function clearQuestionSkips(form) {
    var blocks = form.querySelectorAll(".try-q.is-skipped");
    for (var i = 0; i < blocks.length; i++) setQuestionSkipped(blocks[i], false);
  }

  function initSkipControls(form) {
    var skipBtns = form.querySelectorAll("[data-try-skip]");
    for (var i = 0; i < skipBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var block = btn.closest(".try-q");
          if (!block) return;
          setQuestionSkipped(block, !block.classList.contains("is-skipped"));
        });
      })(skipBtns[i]);
    }
    var answers = form.querySelectorAll(".try-q-answer input, .try-q-answer textarea");
    for (var j = 0; j < answers.length; j++) {
      (function (field) {
        field.addEventListener("input", function () {
          var block = field.closest(".try-q");
          if (block && block.classList.contains("is-skipped")) setQuestionSkipped(block, false);
        });
      })(answers[j]);
    }
  }

  function packNote(form) {
    var parts = ["Анкета: полная"];
    var q1n = val(form, "q1_name");
    var q1p = val(form, "q1_pet");
    if (q1n || q1p) {
      parts.push("1. Имя: " + (q1n || "—") + "; питомец: " + (q1p || "—"));
    }
    var q2 = [val(form, "q2_breed"), val(form, "q2_age"), val(form, "q2_weight")].filter(Boolean).join(", ");
    var rows = [
      packQ(form, 2, "Порода / возраст / вес", q2),
      packQ(form, 3, "Активность", val(form, "q3_activity")),
      packQ(form, 4, "Дрессировка", val(form, "q4_training")),
      packQ(form, 5, "Уже давали", val(form, "q5_tried")),
      packQ(form, 6, "Аллергии / исключения", val(form, "q6_allergies")),
      packQ(form, 7, "Особенно нужны", val(form, "q7_need")),
      packQ(form, 8, "Не нужны", val(form, "q8_skip")),
      packQ(form, 9, "Расход в месяц", val(form, "q9_amount")),
      line("10", "Бюджет", val(form, "q10_budget")),
      packQ(form, 11, "Размер лакомств", val(form, "q11_size")),
      line("12", "Доставка раз в месяц", val(form, "q12_monthly")),
      line("13", "Кинолог в подписке", val(form, "q13_trainer"))
    ];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i]) parts.push(rows[i]);
    }
    return parts.join("\n");
  }

  function initTryForm() {
    var form = document.getElementById("tryForm");
    if (!form) return;
    var status = document.getElementById("tryFormStatus");
    var btn = form.querySelector('button[type="submit"]');
    var toggle = document.getElementById("tryFullToggle");
    var extra = document.getElementById("tryFullFields");

    function setDisabled(root, disableAll) {
      if (!root) return;
      var fields = root.querySelectorAll("input, textarea");
      for (var i = 0; i < fields.length; i++) {
        if (disableAll || fields[i].closest(".try-q.is-skipped")) {
          fields[i].disabled = true;
        } else {
          fields[i].disabled = false;
        }
      }
    }

    initSkipControls(form);

    function syncFull() {
      var on = !!(toggle && toggle.checked);
      form.classList.toggle("is-full", on);
      if (extra) {
        extra.hidden = !on;
        extra.classList.toggle("is-open", on);
        setDisabled(extra, !on);
      }
      var shortOnly = form.querySelectorAll(".try-short-only");
      for (var s = 0; s < shortOnly.length; s++) {
        setDisabled(shortOnly[s], on);
      }
      if (on) {
        if (!val(form, "q1_name") && form.name && form.name.value) form.q1_name.value = form.name.value;
        if (!val(form, "q1_pet") && form.pet && form.pet.value) form.q1_pet.value = form.pet.value;
      } else {
        if (form.name && !String(form.name.value || "").trim() && form.q1_name) form.name.value = form.q1_name.value || "";
        if (form.pet && !String(form.pet.value || "").trim() && form.q1_pet) form.pet.value = form.q1_pet.value || "";
      }
      if (toggle) toggle.setAttribute("aria-checked", on ? "true" : "false");
    }
    if (toggle) {
      toggle.addEventListener("change", syncFull);
      syncFull();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var full = !!(toggle && toggle.checked);
      var data = {
        phone: val(form, "phone"),
        name: full ? (val(form, "q1_name") || val(form, "name")) : val(form, "name"),
        pet: full ? (val(form, "q1_pet") || val(form, "pet")) : val(form, "pet"),
        mode: full ? "full" : "short",
        note: full ? packNote(form) : ""
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
            clearQuestionSkips(form);
            syncFull();
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
