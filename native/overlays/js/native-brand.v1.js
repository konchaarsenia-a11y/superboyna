/**
 * Good Boy / GBI branding — только натив (оверлей после sync).
 * Шапка: логотип бульдога + GBI + подпись GOOD BOY.
 */
(function () {
  "use strict";
  if (window.__gbiBrandReady) return;
  window.__gbiBrandReady = true;

  var LOGO_SRC = "assets/logo-gbi-dog.png";

  function brandTitle(raw) {
    var s = String(raw || "");
    var ver = "";
    var m = s.match(/\bv?\d+(?:\.\d+){1,3}\b/i);
    if (m) ver = " " + m[0];
    if (/Бойня[-‑]?Конвейер/i.test(s) || /конвейер/i.test(s) || !s.trim()) {
      return "GBI" + ver;
    }
    return s.replace(/Бойня[-‑]?Конвейер/gi, "GBI");
  }

  function ensureBrand() {
    var title = document.getElementById("appHeaderTitle");
    if (!title) return;

    var row = title.closest(".header-row") || title.parentElement;
    if (!row) return;

    var wrap = document.getElementById("gbiBrand");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "gbiBrand";
      wrap.className = "gbi-brand";

      var img = document.createElement("img");
      img.className = "gbi-logo";
      img.src = LOGO_SRC;
      img.alt = "GOOD BOY";
      img.width = 40;
      img.height = 40;
      img.decoding = "async";

      var text = document.createElement("div");
      text.className = "gbi-brand-text";

      var sub = document.createElement("div");
      sub.className = "gbi-sub";
      sub.textContent = "GOOD BOY";

      title.parentNode.insertBefore(wrap, title);
      text.appendChild(title);
      text.appendChild(sub);
      wrap.appendChild(img);
      wrap.appendChild(text);
    }

    title.textContent = brandTitle(title.textContent);
  }

  function patchTitleSetter() {
    var el = document.getElementById("appHeaderTitle");
    if (!el || el.__gbiTitlePatched) return;
    el.__gbiTitlePatched = true;

    var desc = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    if (!desc || !desc.set) return;

    Object.defineProperty(el, "textContent", {
      configurable: true,
      enumerable: true,
      get: function () {
        return desc.get.call(this);
      },
      set: function (v) {
        desc.set.call(this, brandTitle(v));
      }
    });

    var idesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");
    if (idesc && idesc.set) {
      Object.defineProperty(el, "innerText", {
        configurable: true,
        enumerable: true,
        get: function () {
          return idesc.get.call(this);
        },
        set: function (v) {
          idesc.set.call(this, brandTitle(v));
        }
      });
    }
  }

  function boot() {
    ensureBrand();
    patchTitleSetter();
    try {
      document.title = "GBI · GOOD BOY";
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Веб иногда переписывает title после ролей — догоняем
  setTimeout(boot, 400);
  setTimeout(boot, 1600);
})();
