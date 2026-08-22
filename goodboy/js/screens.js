(function (global) {
  "use strict";

  var PAGES = ["profile", "map", "subscription", "partners"];
  var TITLES = {
    profile: "Профиль",
    map: "Карта",
    subscription: "Подписка",
    partners: "Партнёры"
  };

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

  var DEMO_PLACES = [
    { id: "p1", cat: "play", name: "Площадка у Свислочи", meta: "Dog-friendly · вода · тень", dist: "1.2 км", x: 28, y: 36, hot: false },
    { id: "p2", cat: "vet", name: "Ветклиника «Хвост»", meta: "Открыто до 21:00", dist: "0.8 км", x: 58, y: 48, hot: true },
    { id: "p3", cat: "cafe", name: "VARKA · Карского 23", meta: "Кофейня · лакомства на витрине", dist: "1.5 км", x: 72, y: 28, hot: false },
    { id: "p4", cat: "groom", name: "Груминг SoftPaw", meta: "−10% по карточке GOOD BOY", dist: "2.1 км", x: 40, y: 68, hot: false }
  ];

  var MAP_FILTERS = [
    { id: "all", label: "Все" },
    { id: "play", label: "Площадки" },
    { id: "vet", label: "Вет" },
    { id: "groom", label: "Груминг" },
    { id: "cafe", label: "Кафе" }
  ];

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

  function renderProfilePage(st, pet) {
    var p = petView(pet);
    var hasPet = !!pet;
    var sub = [p.breed, p.weightKg ? p.weightKg + " кг" : "", p.ageYears ? p.ageYears + " года" : ""]
      .filter(Boolean).join(" · ");
    var chips = petChips(p);
    var user = st.user || {};
    return (
      "<div class=\"cabinet-block\">" +
        "<div class=\"cabinet-pet-hero\">" +
          "<div class=\"ps-avatar cabinet-pet-avatar\">" + esc(petInitial(p.name)) + "</div>" +
          "<div class=\"cabinet-pet-copy\">" +
            "<h2>" + esc(p.name || "Добавьте питомца") + "</h2>" +
            "<p>" + esc(hasPet ? sub : "Заполните карточку — подберём лакомства точнее") + "</p>" +
          "</div>" +
        "</div>" +
        (hasPet
          ? "<div class=\"ps-stats cabinet-stats\">" +
              "<div><b>Вес</b><span>" + esc(p.weightKg ? p.weightKg + " кг" : "—") + "</span></div>" +
              "<div><b>Активность</b><span>" + esc(p.activity || "Высокая") + "</span></div>" +
              "<div><b>Рацион</b><span>" + esc(p.diet || p.allergies || "—") + "</span></div>" +
            "</div>" +
            "<div class=\"ps-chips\">" + chips.map(function (c) {
              return "<span>" + esc(c) + "</span>";
            }).join("") + "</div>"
          : "<p class=\"cabinet-hint\">Пока демо-карточка Бима. Сохраните своего питомца ниже.</p>") +
        "<div class=\"ps-tip\">" +
          "<b>Подсказка недели</b>" +
          "<span>После прогулки&nbsp;— 2&nbsp;шт сушёного лёгкого, не&nbsp;натощак.</span>" +
        "</div>" +
      "</div>" +

      "<details class=\"cabinet-details\" id=\"petEditDetails\">" +
        "<summary>Редактировать питомца</summary>" +
        "<form id=\"petForm\" class=\"cabinet-form\">" +
          "<div class=\"field\"><label>Кличка</label><input name=\"name\" required placeholder=\"Бим\" autocomplete=\"off\" /></div>" +
          "<div class=\"field-row\">" +
            "<div class=\"field\"><label>Порода</label><input name=\"breed\" placeholder=\"Корги\" /></div>" +
            "<div class=\"field\"><label>Вес, кг</label><input name=\"weightKg\" type=\"number\" min=\"0\" step=\"0.1\" inputmode=\"decimal\" /></div>" +
          "</div>" +
          "<div class=\"field\"><label>Возраст, лет</label><input name=\"ageYears\" type=\"number\" min=\"0\" step=\"0.5\" inputmode=\"decimal\" /></div>" +
          "<div class=\"field\"><label>Аллергии / не ест</label><textarea name=\"allergies\" rows=\"2\" placeholder=\"Курица…\"></textarea></div>" +
          "<div class=\"field\"><label>Заметки</label><textarea name=\"notes\" rows=\"2\" placeholder=\"Характер, предпочтения…\"></textarea></div>" +
          "<button type=\"submit\" class=\"btn\">Сохранить</button>" +
        "</form>" +
      "</details>" +

      "<div class=\"cabinet-block\">" +
        "<h3 class=\"cabinet-block-title\">Ваш аккаунт</h3>" +
        "<div class=\"cabinet-kv\"><span>Имя</span><strong>" + esc(user.name || "Гость") + "</strong></div>" +
        "<div class=\"cabinet-kv\"><span>Telegram</span><strong>" + esc(user.username ? "@" + user.username : "—") + "</strong></div>" +
        "<div class=\"cabinet-kv\"><span>Телефон</span><strong>" + esc(user.phone || "не указан") + "</strong></div>" +
      "</div>"
    );
  }

  function renderMapPage(st) {
    var filter = st.mapFilter || "all";
    var activeId = st.mapPlaceId || "p2";
    var places = DEMO_PLACES.filter(function (pl) {
      return filter === "all" || pl.cat === filter;
    });
    if (!places.some(function (pl) { return pl.id === activeId; })) {
      activeId = places[0] ? places[0].id : "";
    }
    var pins = places.map(function (pl) {
      var cls = "ps-pin" + (pl.hot ? " ps-pin--hot" : "") + (pl.id === activeId ? " is-active" : "");
      return "<button type=\"button\" class=\"" + cls + "\" data-place=\"" + pl.id + "\" style=\"--x:" + pl.x + "%;--y:" + pl.y + "%\" aria-label=\"" + esc(pl.name) + "\"></button>";
    }).join("");
    var nearest = places.find(function (pl) { return pl.id === activeId; }) || places[0];
    return (
      "<div class=\"cabinet-filters\" role=\"tablist\" aria-label=\"Фильтр мест\">" +
        MAP_FILTERS.map(function (f) {
          return "<button type=\"button\" class=\"cabinet-chip" + (filter === f.id ? " is-on" : "") + "\" data-map-filter=\"" + f.id + "\">" + esc(f.label) + "</button>";
        }).join("") +
      "</div>" +
      "<div class=\"cabinet-map-wrap\">" +
        "<div class=\"ps-map cabinet-map\" id=\"cabinetMap\">" + pins +
          "<div class=\"ps-map-label\">" + esc(nearest ? "рядом " + nearest.dist : "Минск") + "</div>" +
        "</div>" +
      "</div>" +
      "<div class=\"cabinet-place-list\">" +
        places.map(function (pl) {
          return (
            "<button type=\"button\" class=\"cabinet-place" + (pl.id === activeId ? " is-active" : "") + "\" data-place=\"" + pl.id + "\">" +
              "<div><strong>" + esc(pl.name) + "</strong><span>" + esc(pl.meta) + "</span></div>" +
              "<em>" + esc(pl.dist) + "</em>" +
            "</button>"
          );
        }).join("") +
      "</div>"
    );
  }

  function renderSubscriptionPage(st) {
    var sub = st.subscription || {};
    var link = st.link || {};
    var linked = link.status === "linked";
    var items = (sub.basket && sub.basket.length)
      ? sub.basket.map(function (b) {
          return (b.name || b.main || "Позиция") + (b.val || b.value ? " · " + (b.val || b.value) + (b.unit || " г") : "");
        })
      : ["Лёгкое говяжье · 100 г", "Рубец · 80 г", "Треска сушёная · 60 г"];
    var badge = linked && sub.status === "active" ? "в пути" : (linked ? esc(sub.status || "активна") : "не привязана");
    var when = linked
      ? esc(sub.nextDateLabel || sub.nextDate || "Дата уточняется") + (link.address || sub.address ? " · " + esc(link.address || sub.address) : "")
      : "Привяжите заказ — покажем дату и состав";
    var progress = linked ? 78 : 12;

    return (
      "<div class=\"cabinet-block\">" +
        "<div class=\"ps-card ps-card--rich cabinet-sub-card\">" +
          "<div class=\"ps-row\"><strong>Месячный набор</strong><em class=\"ps-badge\">" + badge + "</em></div>" +
          "<span>" + when + "</span>" +
          "<div class=\"ps-bar\"><i style=\"--w:" + progress + "%\"></i></div>" +
          "<div class=\"ps-list\">" + items.map(function (line) {
            return "<span>" + esc(line) + "</span>";
          }).join("") + "</div>" +
        "</div>" +
        (linked
          ? "<div class=\"ps-tip\"><b>Осталось 8 дней</b><span>Следующий набор соберём автоматически&nbsp;— можно поменять состав до&nbsp;среды.</span></div>"
          : "<p class=\"cabinet-hint\">Демо: введите телефон или ник из заказа Бойни.</p>") +
      "</div>" +

      "<div class=\"cabinet-block\">" +
        "<h3 class=\"cabinet-block-title\">" + (linked ? "Детали подписки" : "Привязать заказ") + "</h3>" +
        (linked
          ? "<div class=\"cabinet-kv\"><span>Сегмент</span><strong>" + esc(sub.segment || "—") + "</strong></div>" +
            "<div class=\"cabinet-kv\"><span>Клиент</span><strong>" + esc(link.clientNick || "—") + "</strong></div>" +
            "<div class=\"cabinet-kv\"><span>Адрес</span><strong>" + esc(link.address || sub.address || "—") + "</strong></div>"
          : "") +
        "<form id=\"linkForm\" class=\"cabinet-form\">" +
          "<div class=\"field\"><label>Телефон</label><input id=\"linkPhone\" name=\"phone\" placeholder=\"+375…\" inputmode=\"tel\" autocomplete=\"tel\" /></div>" +
          "<div class=\"field\"><label>Ник / Instagram</label><input id=\"linkNick\" name=\"nick\" placeholder=\"@nick\" autocomplete=\"off\" /></div>" +
          "<button type=\"submit\" class=\"btn\">" + (linked ? "Обновить привязку" : "Найти и привязать") + "</button>" +
        "</form>" +
        "<a class=\"btn btn-ghost cabinet-cta-link\" href=\"try.html\">Хочу попробовать подписку</a>" +
      "</div>"
    );
  }

  function renderPartnersPage(st) {
    var pr = st.privilege || {};
    var partners = st.partners || [];
    var code = pr.eligible && pr.code ? pr.code : "";
    var partnerName = (partners[0] && partners[0].name) || "VARKA";

    return (
      "<div class=\"cabinet-block\">" +
        "<div class=\"privilege-card\" id=\"privilegeCard\">" +
          "<p class=\"badge\">" + esc(pr.title || "Скидка VARKA") + "</p>" +
          "<div class=\"code\">" + esc(code || "GB-DEMO") + "</div>" +
          "<p class=\"hint\">" + esc(pr.offerText || "Для активных подписчиков ПП") + "</p>" +
          (pr.eligible
            ? "<button type=\"button\" class=\"btn cabinet-copy-btn\" id=\"copyPrivilege\">Скопировать код</button>"
            : "<p class=\"hint\">Нужна активная подписка ПП — привяжите заказ во вкладке «Подписка».</p>") +
        "</div>" +
        "<div class=\"ps-tip\"><b>Как пользоваться</b><span>Покажите карточку в&nbsp;кабинете&nbsp;— скидка на&nbsp;кассе.</span></div>" +
      "</div>" +

      "<div class=\"cabinet-block\">" +
        "<h3 class=\"cabinet-block-title\">Партнёры рядом</h3>" +
        "<div class=\"cabinet-partner-list\">" +
          "<article class=\"cabinet-partner-card is-featured\">" +
            "<div class=\"ps-row\"><strong>" + esc(partnerName) + "</strong><em class=\"ps-badge\">" + (pr.eligible ? "−15%" : "скоро") + "</em></div>" +
            "<span>Кофейня · для подписчиков</span>" +
          "</article>" +
          "<article class=\"cabinet-partner-card\"><strong>Груминг SoftPaw</strong><span>−10% по карточке GOOD&nbsp;BOY</span></article>" +
          "<article class=\"cabinet-partner-card\"><strong>Pet Walk</strong><span>1 прогулка в&nbsp;подарок в&nbsp;месяц</span></article>" +
        "</div>" +
      "</div>"
    );
  }

  function applyPageState(name) {
    if (PAGES.indexOf(name) < 0) name = "profile";
    document.querySelectorAll(".cabinet-page").forEach(function (el) {
      var on = el.getAttribute("data-page") === name;
      el.classList.toggle("is-active", on);
      el.hidden = !on;
    });
    document.querySelectorAll(".cabinet-nav [data-page]").forEach(function (btn) {
      var on = btn.getAttribute("data-page") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var title = document.getElementById("cabinetTitle");
    if (title) title.textContent = TITLES[name] || "Кабинет";
    var pages = document.getElementById("cabinetPages");
    if (pages) pages.setAttribute("data-active", name);
  }

  function setPage(name) {
    var st = global.GBStore.get();
    var changed = st.page !== name;
    if (PAGES.indexOf(name) < 0) name = "profile";
    global.GBStore.set({ page: name });
    applyPageState(name);
    if (changed) {
      try { window.scrollTo(0, 0); } catch (e) {}
    }
  }

  function render() {
    var st = global.GBStore.get();
    var pet = global.GBStore.activePet();

    var demoEl = document.getElementById("demoBanner");
    if (demoEl) demoEl.style.display = st.demo ? "" : "none";

    var meta = document.getElementById("topMeta");
    if (meta) {
      var label = (st.user && st.user.name) ? st.user.name : "Гость";
      meta.textContent = label.length > 12 ? label.slice(0, 11) + "…" : label;
      meta.title = (st.user && st.user.name) || "Аккаунт";
    }

    var pageProfile = document.getElementById("pageProfile");
    var pageMap = document.getElementById("pageMap");
    var pageSubscription = document.getElementById("pageSubscription");
    var pagePartners = document.getElementById("pagePartners");

    if (pageProfile) pageProfile.innerHTML = renderProfilePage(st, pet);
    if (pageMap) pageMap.innerHTML = renderMapPage(st);
    if (pageSubscription) pageSubscription.innerHTML = renderSubscriptionPage(st);
    if (pagePartners) pagePartners.innerHTML = renderPartnersPage(st);

    var form = document.getElementById("petForm");
    if (form) {
      var p = pet || {};
      form.name.value = p.name || "";
      form.breed.value = p.breed || "";
      form.weightKg.value = p.weightKg || "";
      form.ageYears.value = p.ageYears || "";
      form.allergies.value = p.allergies || "";
      form.notes.value = p.notes || "";
    }

    var linkPhone = document.getElementById("linkPhone");
    if (linkPhone && st.user && st.user.phone) linkPhone.value = st.user.phone;

    setPage(st.page || "profile");
  }

  global.GBUI = {
    toast: toast,
    setPage: setPage,
    render: render,
    esc: esc,
    PAGES: PAGES
  };
})(window);
