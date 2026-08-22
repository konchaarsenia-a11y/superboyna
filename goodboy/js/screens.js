(function (global) {
  "use strict";

  var DEMO_PET = {
    name: "Бим",
    breed: "Корги",
    weightKg: 12,
    ageYears: 3,
    allergies: "Без курицы",
    notes: "Чувствит. желудок · Любит сушеное",
    activity: "Высокая",
    diet: "Без курицы"
  };

  var DEMO_DELIVERY = {
    title: "Месячный набор",
    status: "в пути",
    when: "Завтра · 11:00–15:00 · Минск",
    progress: 78,
    items: ["Лёгкое говяжье · 100 г", "Рубец · 80 г", "Треска сушёная · 60 г"],
    tipTitle: "Осталось 8 дней",
    tipText: "Следующий набор соберём автоматически — можно поменять состав до среды."
  };

  function toast(msg) {
    var el = document.getElementById("gbToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function petView(pet) {
    return pet || DEMO_PET;
  }

  function petInitial(name) {
    var n = String(name || "").trim();
    return n ? n.charAt(0).toUpperCase() : "?";
  }

  function petChips(pet) {
    var chips = [];
    if (pet.allergies) chips.push(pet.allergies);
    if (pet.notes) {
      pet.notes.split(/[·,;]/).forEach(function (part) {
        var t = String(part || "").trim();
        if (t && chips.indexOf(t) < 0) chips.push(t);
      });
    }
    if (!chips.length) chips = ["Без курицы", "Чувствит. желудок", "Любит сушеное"];
    return chips.slice(0, 4);
  }

  function renderPetSlide(pet) {
    var p = petView(pet);
    var sub = [p.breed, p.weightKg ? p.weightKg + " кг" : "", p.ageYears ? p.ageYears + " года" : ""]
      .filter(Boolean).join(" · ");
    var chips = petChips(p);
    return (
      "<p class=\"ps-kicker\">Питомец</p>" +
      "<button type=\"button\" class=\"ps-pet ps-pet--btn\" id=\"openPetEdit\" aria-label=\"Редактировать карточку питомца\">" +
        "<div class=\"ps-avatar\">" + esc(petInitial(p.name)) + "</div>" +
        "<div><strong>" + esc(p.name || "Бим") + "</strong><span>" + esc(sub || "Корги · 12 кг · 3 года") + "</span></div>" +
      "</button>" +
      "<div class=\"ps-stats\">" +
        "<div><b>Вес</b><span>" + esc(p.weightKg ? p.weightKg + " кг" : "12 кг") + "</span></div>" +
        "<div><b>Активность</b><span>" + esc(p.activity || "Высокая") + "</span></div>" +
        "<div><b>Рацион</b><span>" + esc(p.diet || p.allergies || "Без курицы") + "</span></div>" +
      "</div>" +
      "<div class=\"ps-chips\">" + chips.map(function (c) {
        return "<span>" + esc(c) + "</span>";
      }).join("") + "</div>" +
      "<div class=\"ps-tip\">" +
        "<b>Подсказка недели</b>" +
        "<span>После прогулки&nbsp;— 2&nbsp;шт сушёного лёгкого, не&nbsp;натощак.</span>" +
      "</div>"
    );
  }

  function renderDeliverySlide(st) {
    var sub = st.subscription || {};
    var link = st.link || {};
    var demo = !link || link.status !== "linked";
    var d = DEMO_DELIVERY;
    var items = (sub.basket && sub.basket.length)
      ? sub.basket.map(function (b) {
          return (b.name || b.main || "Позиция") + (b.val || b.value ? " · " + (b.val || b.value) + (b.unit || " г") : "");
        })
      : d.items;
    var badge = sub.status === "active" ? "в пути" : (demo ? "демо" : esc(sub.status || "—"));
    var when = sub.nextDateLabel || sub.address || d.when;
    if (link.address && sub.nextDateLabel) when = sub.nextDateLabel + " · " + link.address;
    return (
      "<p class=\"ps-kicker\">Доставка</p>" +
      "<button type=\"button\" class=\"ps-card ps-card--rich ps-card--btn\" id=\"openLinkForm\" aria-label=\"Подписка и привязка\">" +
        "<div class=\"ps-row\"><strong>" + esc(d.title) + "</strong><em class=\"ps-badge\">" + badge + "</em></div>" +
        "<span>" + esc(when) + "</span>" +
        "<div class=\"ps-bar\"><i style=\"--w:" + d.progress + "%\"></i></div>" +
        "<div class=\"ps-list\">" + items.map(function (line) {
          return "<span>" + esc(line) + "</span>";
        }).join("") + "</div>" +
      "</button>" +
      "<div class=\"ps-tip\">" +
        "<b>" + esc(d.tipTitle) + "</b>" +
        "<span>" + esc(d.tipText) + "</span>" +
      "</div>"
    );
  }

  function renderCitySlide() {
    return (
      "<p class=\"ps-kicker\">Город</p>" +
      "<div class=\"ps-map\">" +
        "<span class=\"ps-pin\" style=\"--x:28%;--y:36%\"></span>" +
        "<span class=\"ps-pin ps-pin--hot\" style=\"--x:58%;--y:48%\"></span>" +
        "<span class=\"ps-pin\" style=\"--x:72%;--y:28%\"></span>" +
        "<span class=\"ps-pin\" style=\"--x:40%;--y:68%\"></span>" +
        "<div class=\"ps-map-label\">рядом 1.2 км</div>" +
      "</div>" +
      "<div class=\"ps-place\"><strong>Площадка у Свислочи</strong><span>Dog-friendly · вода · тень</span></div>" +
      "<div class=\"ps-place\"><strong>Ветклиника «Хвост»</strong><span>Открыто до 21:00 · 0.8&nbsp;км</span></div>"
    );
  }

  function renderPartnersSlide(st) {
    var pr = st.privilege || {};
    var partnerName = (st.partners && st.partners[0] && st.partners[0].name) || "VARKA";
    var discount = pr.eligible ? "−15%" : "скоро";
    return (
      "<p class=\"ps-kicker\">Партнёры</p>" +
      "<div class=\"ps-card ps-card--rich\">" +
        "<div class=\"ps-row\"><strong>" + esc(partnerName) + "</strong><em class=\"ps-badge\">" + esc(discount) + "</em></div>" +
        "<span>Кофейня · для подписчиков</span>" +
      "</div>" +
      "<div class=\"ps-place\"><strong>Груминг SoftPaw</strong><span>−10% по карточке GOOD&nbsp;BOY</span></div>" +
      "<div class=\"ps-place\"><strong>Pet Walk</strong><span>1 прогулка в&nbsp;подарок в&nbsp;месяц</span></div>" +
      "<div class=\"ps-tip\">" +
        "<b>Как пользоваться</b>" +
        "<span>Покажите карточку в&nbsp;кабинете&nbsp;— скидка на&nbsp;кассе.</span>" +
      "</div>"
    );
  }

  function setTab(n) {
    var slides = document.querySelectorAll(".cabinet-slides .phone-slide");
    var tabs = document.querySelectorAll(".cabinet-tabs [data-tab]");
    var total = slides.length;
    if (!total) return;
    var i = ((Number(n) % total) + total) % total;
    global.GBStore.set({ tab: i });
    slides.forEach(function (s, idx) {
      s.classList.toggle("is-on", idx === i);
    });
    tabs.forEach(function (t) {
      var key = Number(t.getAttribute("data-tab"));
      t.classList.toggle("is-on", key === i);
    });
  }

  function render() {
    var st = global.GBStore.get();
    var pet = global.GBStore.activePet();

    var demoEl = document.getElementById("demoBanner");
    if (demoEl) demoEl.style.display = st.demo ? "" : "none";

    var slidePet = document.getElementById("slidePet");
    var slideDelivery = document.getElementById("slideDelivery");
    var slideCity = document.getElementById("slideCity");
    var slidePartners = document.getElementById("slidePartners");

    if (slidePet) slidePet.innerHTML = renderPetSlide(pet);
    if (slideDelivery) slideDelivery.innerHTML = renderDeliverySlide(st);
    if (slideCity) slideCity.innerHTML = renderCitySlide();
    if (slidePartners) slidePartners.innerHTML = renderPartnersSlide(st);

    var form = document.getElementById("petForm");
    var p = petView(pet);
    if (form) {
      form.name.value = pet ? (pet.name || "") : "";
      form.breed.value = pet ? (pet.breed || "") : "";
      form.weightKg.value = pet ? (pet.weightKg || "") : "";
      form.ageYears.value = pet ? (pet.ageYears || "") : "";
      form.allergies.value = pet ? (pet.allergies || "") : "";
      form.notes.value = pet ? (pet.notes || "") : "";
    }

    var subBox = document.getElementById("subDetail");
    if (subBox) {
      var s = st.subscription || {};
      var link = st.link || {};
      subBox.innerHTML =
        "<div class=\"panel\"><div class=\"label\">Статус</div><div class=\"value\">" + esc(s.status || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Сегмент</div><div class=\"value\">" + esc(s.segment || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Дата</div><div class=\"value\">" + esc(s.nextDateLabel || s.nextDate || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Адрес</div><div class=\"value\">" + esc(s.address || link.address || "—") + "</div></div>" +
        "<div class=\"panel\"><div class=\"label\">Привязка</div><div class=\"value\">" +
        esc(link.clientNick || link.status || "не привязано") + "</div></div>";
    }

    var linkPhone = document.getElementById("linkPhone");
    if (linkPhone && st.user && st.user.phone) linkPhone.value = st.user.phone;

    if (typeof st.tab === "number") setTab(st.tab);
  }

  function openOverlay(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function closeOverlay(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  global.GBUI = {
    toast: toast,
    setTab: setTab,
    render: render,
    esc: esc,
    openOverlay: openOverlay,
    closeOverlay: closeOverlay
  };
})(window);
