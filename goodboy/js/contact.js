/**
 * Страница «Связь»: копирование почты + чат на сайте → submitGoodboyTry.
 */
(function (global) {
  "use strict";

  var DEFAULT_WEBHOOK =
    "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

  function webhookUrl() {
    if (global.GB_CONFIG && global.GB_CONFIG.leadWebhookUrl) return global.GB_CONFIG.leadWebhookUrl;
    return DEFAULT_WEBHOOK;
  }

  function contactEmail() {
    if (global.GB_CONFIG && global.GB_CONFIG.contactEmail) return global.GB_CONFIG.contactEmail;
    return "hello@goodboy.by";
  }

  function reduced() {
    try {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function sendNote(data) {
    var url = webhookUrl();
    var payload = {
      action: "submitGoodboyTry",
      name: data.name || "Гость",
      phone: "чат",
      pet: "связь",
      note: data.note || "",
      mode: "contact"
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

  function addBubble(thread, text, kind) {
    var el = document.createElement("div");
    el.className = "bubble " + (kind || "bubble-in");
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  function addTyping(thread) {
    var el = document.createElement("div");
    el.className = "bubble bubble-in bubble-typing";
    el.innerHTML = "<i></i><i></i><i></i>";
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  function burstPaws(x, y) {
    if (reduced()) return;
    var marks = ["🐾", "🐾", "✨", "🐾", "✨"];
    for (var i = 0; i < marks.length; i++) {
      (function (n) {
        var el = document.createElement("span");
        el.className = "contact-burst";
        el.textContent = marks[n];
        var ang = (-110 + n * 42) * Math.PI / 180;
        var dist = 48 + n * 10;
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.style.setProperty("--dx", Math.cos(ang) * dist + "px");
        el.style.setProperty("--dy", Math.sin(ang) * dist + "px");
        document.body.appendChild(el);
        global.setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 900);
      })(i);
    }
  }

  function initCopy() {
    var btn = document.getElementById("copyMail");
    if (!btn) return;
    var mail = btn.getAttribute("data-mail") || contactEmail();
    btn.addEventListener("click", function (ev) {
      var hint = btn.querySelector("em");
      function ok() {
        btn.classList.add("is-copied");
        if (hint) hint.textContent = "Скопировали";
        burstPaws(ev.clientX || (btn.getBoundingClientRect().left + 40), ev.clientY || (btn.getBoundingClientRect().top + 24));
        global.setTimeout(function () {
          btn.classList.remove("is-copied");
          if (hint) hint.textContent = "Нажмите, чтобы скопировать";
        }, 1800);
      }
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(mail).then(ok).catch(function () {
          global.location.href = "mailto:" + mail;
        });
      } else {
        global.location.href = "mailto:" + mail;
      }
    });
  }

  function initChat() {
    var form = document.getElementById("contactChat");
    var thread = document.getElementById("contactThread");
    var status = document.getElementById("contactStatus");
    if (!form || !thread) return;
    var btn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = String((form.name && form.name.value) || "").trim();
      var message = String((form.message && form.message.value) || "").trim();
      if (!message) {
        if (status) {
          status.hidden = false;
          status.className = "form-status is-error";
          status.textContent = "Напишите, чем помочь.";
        }
        return;
      }
      if (status) status.hidden = true;
      addBubble(thread, (name ? name + ": " : "") + message, "bubble-out");
      form.message.value = "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Отправляем…";
      }
      var typing = addTyping(thread);
      sendNote({
        name: name || "Гость с сайта",
        note: "Чат с сайта\n" + (name ? "Имя: " + name + "\n" : "") + message
      }).then(function () {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        addBubble(thread, "Передали команде. Если удобнее — напишите в Instagram @goodboy_rb.");
      }).catch(function () {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        addBubble(thread, "Не отправилось. Напишите в Instagram @goodboy_rb.");
      }).then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Отправить";
        }
      });
    });
  }

  function initCardTilt() {
    if (reduced()) return;
    var cards = document.querySelectorAll(".contact-card");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("pointermove", function (e) {
          var r = card.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform =
            "translateY(-8px) rotateX(" + (-y * 9).toFixed(2) + "deg) rotateY(" + (x * 10).toFixed(2) + "deg)";
        });
        card.addEventListener("pointerleave", function () {
          card.style.transform = "";
        });
      })(cards[i]);
    }
  }

  function initCursorGlow() {
    var glow = document.getElementById("contactCursor");
    if (!glow || reduced()) return;
    var x = global.innerWidth / 2;
    var y = global.innerHeight / 3;
    var tx = x;
    var ty = y;
    var ticking = false;
    function loop() {
      ticking = false;
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      glow.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
    global.addEventListener("pointermove", function (e) {
      tx = e.clientX;
      ty = e.clientY;
      glow.classList.add("is-on");
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(loop);
      }
    }, { passive: true });
    global.addEventListener("pointerleave", function () {
      glow.classList.remove("is-on");
    });
  }

  function initSmoothChat() {
    var links = document.querySelectorAll('a[href="#chat"]');
    var target = document.getElementById("chat");
    if (!target) return;
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (e) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
        var input = document.querySelector("#contactChat textarea");
        if (input) {
          global.setTimeout(function () { input.focus(); }, 420);
        }
      });
    }
  }

  function init() {
    initCopy();
    initChat();
    initCardTilt();
    initCursorGlow();
    initSmoothChat();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
