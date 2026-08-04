(function (global) {
  "use strict";

  function toast(msg) {
    var el = document.getElementById("gbToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  function setScreen(name) {
    global.GBStore.set({ screen: name });
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("is-active", s.getAttribute("data-screen") === name);
    });
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-go") === name);
    });
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    var st = global.GBStore.get();
    var pet = global.GBStore.activePet();
    var demoEl = document.getElementById("demoBanner");
    if (demoEl) demoEl.style.display = st.demo ? "" : "none";

    var meta = document.getElementById("topMeta");
    if (meta) {
      meta.textContent = (st.user && st.user.name) ? st.user.name : "Гость";
    }

    // Home
    var hero = document.getElementById("homeHero");
    if (hero) {
      if (pet) {
        hero.innerHTML =
          "<p class=\"badge\">Ваш питомец</p>" +
          "<h2 class=\"pet-name\">" + esc(pet.name) + "</h2>" +
          "<p class=\"pet-sub\">" + esc([pet.breed, pet.weightKg ? pet.weightKg + " кг" : ""].filter(Boolean).join(" · ") || "Карточка питомца") + "</p>";
      } else {
        hero.innerHTML =
          "<p class=\"badge\">Goodboy</p>" +
          "<h2 class=\"pet-name\">Добавьте питомца</h2>" +
          "<p class=\"pet-sub\">Карточка — центр кабинета</p>";
      }
    }
    var subPanel = document.getElementById("homeSub");
    if (subPanel) {
      var sub = st.subscription || {};
      subPanel.innerHTML =
        "<div class=\"panel-row\"><div><div class=\"label\">Следующая доставка</div>" +
        "<div class=\"value\">" + esc(sub.nextDateLabel || sub.nextDate || "—") + "</div></div>" +
        "<span class=\"badge\">" + esc(sub.segment || sub.status || "…") + "</span></div>";
    }
    var privShort = document.getElementById("homePriv");
    if (privShort && st.privilege) {
      privShort.querySelector(".value").textContent = st.privilege.eligible
        ? (st.privilege.code || "Открыть карточку")
        : "Пока недоступно";
    }

    // Pet form
    var form = document.getElementById("petForm");
    if (form && pet) {
      form.name.value = pet.name || "";
      form.breed.value = pet.breed || "";
      form.weightKg.value = pet.weightKg || "";
      form.ageYears.value = pet.ageYears || "";
      form.allergies.value = pet.allergies || "";
      form.notes.value = pet.notes || "";
    }

    // Subscription
    var subBox = document.getElementById("subDetail");
    if (subBox) {
      var s = st.subscription || {};
      var link = st.link || {};
      subBox.innerHTML =
        "<div class=\"panel\"><div class=\"label\">Статус</div><div class=\"value\">" + esc(s.status || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Сегмент</div><div class=\"value\">" + esc(s.segment || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Дата</div><div class=\"value\">" + esc(s.nextDateLabel || s.nextDate || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Адрес</div><div class=\"value\">" + esc(s.address || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Привязка</div><div class=\"value\">" +
        esc(link.clientNick || link.status || "не привязано") + "</div></div>";
    }

    // Partners
    var plist = document.getElementById("partnersList");
    if (plist) {
      var partners = st.partners || [];
      if (!partners.length) {
        plist.innerHTML = "<div class=\"empty\">Партнёры появятся здесь</div>";
      } else {
        plist.innerHTML = partners.map(function (p) {
          return "<div class=\"list-item\" data-partner=\"" + esc(p.slug || p.id) + "\">" +
            "<h3>" + esc(p.name) + "</h3>" +
            "<p>" + esc(p.blurb || "") +
            (p.locationsCount ? " · " + p.locationsCount + " точек" : "") +
            "</p></div>";
        }).join("");
      }
    }

    // Privilege / Varok
    var card = document.getElementById("privilegeCard");
    var locs = document.getElementById("varokLocations");
    var pr = st.privilege;
    if (card && pr) {
      card.innerHTML =
        "<p class=\"badge\">" + esc(pr.title || "Скидка") + "</p>" +
        "<div class=\"code\">" + esc(pr.eligible && pr.code ? pr.code : "••••") + "</div>" +
        "<p class=\"hint\">" + esc(pr.offerText || "") + "</p>" +
        (pr.eligible
          ? "<p class=\"hint\">Покажите бариста</p>"
          : "<p class=\"hint\">" + esc(pr.reason === "need_pp" ? "Нужна активная подписка ПП" : "Скидка пока недоступна") + "</p>");
    }
    if (locs && pr && pr.locations) {
      locs.innerHTML = pr.locations.map(function (l) {
        return "<div class=\"panel\"><div class=\"value\">" + esc(l.name) + "</div>" +
          "<div class=\"label\">" + esc(l.address || "Минск") + "</div></div>";
      }).join("");
    }

    // Profile
    var prof = document.getElementById("profileBox");
    if (prof && st.user) {
      prof.innerHTML =
        "<div class=\"panel\"><div class=\"label\">Имя</div><div class=\"value\">" + esc(st.user.name || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Telegram</div><div class=\"value\">@" + esc(st.user.username || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Телефон</div><div class=\"value\">" + esc(st.user.phone || "не указан") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Версия</div><div class=\"value\">Goodboy " + esc((global.GB_CONFIG && global.GB_CONFIG.version) || "") + "</div></div>";
    }

    var linkPhone = document.getElementById("linkPhone");
    if (linkPhone && st.user && st.user.phone) linkPhone.value = st.user.phone;
  }

  global.GBUI = {
    toast: toast,
    setScreen: setScreen,
    render: render,
    esc: esc
  };
})(window);
