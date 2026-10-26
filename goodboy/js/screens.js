(function (global) {
  "use strict";

  var PAGES = ["profile", "map", "subscription", "partners"];
  var TITLES = {
    profile: "Профиль",
    map: "Карта",
    subscription: "Подписка",
    partners: "Партнёры"
  };

  /** Какие вкладки видны при уровне доступа */
  function allowedPages(access) {
    if (access === "city") return ["map"];
    if (access === "lead") return ["profile"];
    if (access === "limited") return ["profile", "map"];
    return PAGES.slice();
  }

  function inBot() {
    try {
      var tg = global.Telegram && global.Telegram.WebApp;
      return !!(tg && tg.initData);
    } catch (e) {
      return false;
    }
  }

  function currentAccess(st) {
    if (st && st.access) return st.access;
    var u = st && st.user;
    if (!u) return "full";
    if (u.access) return u.access;
    if (u.access === "lead" || u.intent === "try") return "lead";
    if (u.isGuest || u.intent === "city") return "city";
    if (u.hasSubscription === false || u.intent === "limited") return "limited";
    return "full";
  }

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

  var MAP_FILTERS = [
    { id: "all", label: "Все" },
    { id: "cafe", label: "Кафе" },
    { id: "shop", label: "Зоомагазины" },
    { id: "vet", label: "Вет" },
    { id: "groom", label: "Груминг" },
    { id: "play", label: "Площадки" },
    { id: "park", label: "Парки" },
    { id: "partner", label: "Партнёры" }
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

  function deskGrid(left, right) {
    return "<div class=\"cabinet-desk-grid\"><div class=\"cabinet-desk-col\">" + left +
      "</div><div class=\"cabinet-desk-col\">" + right + "</div></div>";
  }

  function dogCardsHtml(dogs) {
    return (dogs || []).filter(function (d) { return d && d.name; }).map(function (d) {
      var subLine = [d.breed, d.weightKg ? d.weightKg + " кг" : ""].filter(Boolean).join(" · ");
      return "<div class=\"cabinet-pet-hero\">" +
        "<div class=\"ps-avatar cabinet-pet-avatar\">" + esc(petInitial(d.name)) + "</div>" +
        "<div class=\"cabinet-pet-copy\"><h2>" + esc(d.name) + "</h2>" +
        (subLine ? "<p>" + esc(subLine) + "</p>" : "") +
        "</div></div>";
    }).join("");
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
    var hasPet = !!pet;
    var p = hasPet ? pet : DEMO_PET;
    var access = currentAccess(st);
    var sub = [p.breed, p.weightKg ? p.weightKg + " кг" : "", p.ageYears ? p.ageYears + " года" : ""]
      .filter(Boolean).join(" · ");
    var chips = petChips(p);
    var user = st.user || {};
    var limitBanner = access === "limited"
      ? "<div class=\"cabinet-access-banner\">Ограниченный доступ · <a href=\"try.html\">оформить подписку</a></div>"
      : "";
    if (access === "lead") {
      var dogs = (st.pets || []).filter(function (d) { return d && d.name; });
      var dogCards = dogCardsHtml(dogs);
      return "<div class=\"cabinet-access-banner\">Заявка принята, менеджер свяжется с вами</div>" +
        deskGrid(
          "<div class=\"cabinet-block\">" +
            "<h3 class=\"cabinet-block-title\">Собаки</h3>" +
            (dogCards || "<p class=\"cabinet-hint\">Кличка не указана</p>") +
          "</div>",
          "<div class=\"cabinet-block\">" +
            "<h3 class=\"cabinet-block-title\">Ваш аккаунт</h3>" +
            "<div class=\"cabinet-kv\"><span>Имя</span><strong>" + esc(user.name || "") + "</strong></div>" +
            "<div class=\"cabinet-kv\"><span>Телефон</span><strong>" + esc(user.phone || "не указан") + "</strong></div>" +
            "<button type=\"button\" class=\"btn btn-ghost\" id=\"lockGoLogin\" style=\"margin-top:14px;\">У меня есть подписка — войти</button>" +
          "</div>"
        );
    }
    return (
      limitBanner +
      deskGrid(
      "<div class=\"cabinet-block\">" +
        (hasPet
          ? "<div class=\"cabinet-pet-hero\">" +
              "<div class=\"ps-avatar cabinet-pet-avatar\">" + esc(petInitial(p.name)) + "</div>" +
              "<div class=\"cabinet-pet-copy\">" +
                "<h2>" + esc(p.name) + "</h2>" +
                "<p>" + esc(sub) + "</p>" +
              "</div>" +
            "</div>" +
            "<div class=\"ps-stats cabinet-stats\">" +
              "<div><b>Вес</b><span>" + esc(p.weightKg ? p.weightKg + " кг" : "—") + "</span></div>" +
              "<div><b>Активность</b><span>" + esc(p.activity || "Высокая") + "</span></div>" +
              "<div><b>Рацион</b><span>" + esc(p.diet || p.allergies || "—") + "</span></div>" +
            "</div>" +
            "<div class=\"ps-chips\">" + chips.map(function (c) {
              return "<span>" + esc(c) + "</span>";
            }).join("") + "</div>"
          : "<div class=\"cabinet-empty-pet\">" +
              "<div class=\"ps-avatar cabinet-pet-avatar\">?</div>" +
              "<h2>Добавьте питомца</h2>" +
              "<p>Карточка помогает подобрать лакомства и вести подписку. Ниже — пример, как это выглядит.</p>" +
            "</div>" +
            "<div class=\"cabinet-demo-preview\" aria-label=\"Пример карточки\">" +
              "<p class=\"cabinet-demo-label\">Пример</p>" +
              "<div class=\"cabinet-pet-hero is-muted\">" +
                "<div class=\"ps-avatar cabinet-pet-avatar\">" + esc(petInitial(DEMO_PET.name)) + "</div>" +
                "<div class=\"cabinet-pet-copy\"><h2>" + esc(DEMO_PET.name) + "</h2><p>Корги · 12 кг · 3 года</p></div>" +
              "</div>" +
            "</div>") +
        "<div class=\"ps-tip\">" +
          "<b>Подсказка недели</b>" +
          "<span>После прогулки&nbsp;— 2&nbsp;шт сушёного лёгкого, не&nbsp;натощак.</span>" +
        "</div>" +
      "</div>",
      "<details class=\"cabinet-details\" id=\"petEditDetails\"" + (hasPet ? "" : " open") + ">" +
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
        (inBot() ? "" : "<button type=\"button\" class=\"btn btn-ghost\" id=\"gbLogout\" style=\"margin-top:14px;\">Выйти</button>") +
      "</div>"
      )
    );
  }

  function renderMapPage(st) {
    var access = currentAccess(st);
    var filter = st.mapFilter || "all";
    var cityBar = access === "city" && !inBot()
      ? "<div class=\"cabinet-access-banner cabinet-access-banner--row\">" +
          "<span>Только карта</span>" +
          "<button type=\"button\" class=\"btn\" id=\"gbLogout\" style=\"width:auto;padding:8px 12px;font-size:0.8rem;\">Войти</button>" +
        "</div>"
      : "";
    return (
      cityBar +
      "<div class=\"cabinet-filters\" role=\"tablist\" aria-label=\"Фильтр мест\">" +
        MAP_FILTERS.map(function (f) {
          return "<button type=\"button\" class=\"cabinet-chip" + (filter === f.id ? " is-on" : "") + "\" data-map-filter=\"" + f.id + "\" role=\"tab\" aria-selected=\"" + (filter === f.id ? "true" : "false") + "\">" + esc(f.label) + "</button>";
        }).join("") +
      "</div>" +
      deskGrid(
      "<div class=\"cabinet-map-wrap\">" +
        "<div class=\"cabinet-map\" id=\"cabinetMap\" role=\"application\" aria-label=\"Карта Минска\"></div>" +
      "</div>",
      "<article class=\"cabinet-place-card\" id=\"cabinetPlaceCard\"><p class=\"cabinet-hint\">Открываем места…</p></article>" +
      "<div class=\"cabinet-place-list\" id=\"cabinetPlaceList\"></div>"
      )
    );
  }

  function lineText(it) {
    var name = (it && (it.name || it.main)) || "Позиция";
    var grams = it && (it.grams != null ? it.grams : (it.val != null ? it.val : it.value));
    var unit = (it && it.unit) || "г";
    return name + (grams != null && grams !== "" ? " · " + grams + " " + unit : "");
  }

  function renderSubscriptionPage(st) {
    var access = currentAccess(st);
    if (access === "limited" || access === "city") {
      return (
        "<div class=\"cabinet-lock\">" +
          "<h2>Подписка</h2>" +
          "<p>Доставка и состав набора доступны после оформления подписки.</p>" +
          "<a class=\"btn\" href=\"try.html\">Хочу попробовать</a>" +
          "<button type=\"button\" class=\"btn btn-ghost\" id=\"lockGoLogin\" style=\"margin-top:10px;\">У меня есть подписка — войти</button>" +
        "</div>"
      );
    }
    var cab = st.cabinet || {};
    var linked = !!cab.linked || (st.link && st.link.status === "linked");
    var deliveries = cab.deliveries || [];
    var nearest = null;
    deliveries.forEach(function (d) { if (d.nearest) nearest = d; });
    if (!nearest && deliveries.length) nearest = deliveries[0];
    var dogs = (cab.dogs || []).map(function (d) { return d.name; }).filter(Boolean).join(", ");
    var addr = cab.address || {};
    var cards = deliveries.map(function (d) {
      var lines = (d.lines || []).map(function (it) { return "<span>" + esc(lineText(it)) + "</span>"; }).join("");
      return (
        "<div class=\"ps-card ps-card--rich cabinet-sub-card\">" +
          "<div class=\"ps-row\"><strong>" + esc(d.date || "Дата") + "</strong><em class=\"ps-badge\">" + esc(d.type || "") + "</em></div>" +
          (d.pair ? "<span>" + esc(d.pair) + "</span>" : "") +
          (dogs ? "<span>Собаки: " + esc(dogs) + "</span>" : "") +
          "<span>" + esc(d.address || addr.line || "") + "</span>" +
          "<div class=\"ps-list\">" + (lines || "<span>Состав пуст</span>") + "</div>" +
          (d.payText ? "<strong>" + esc(d.payText) + "</strong>" : "") +
        "</div>"
      );
    }).join("");
    var editLines = nearest && nearest.lines ? nearest.lines.map(lineText).join("\n") : "";
    var warn = st.stockWarn ? "<p class=\"cabinet-hint\">" + esc(st.stockWarn) + "</p>" : "";
    var dogBlock = dogCardsHtml(cab.dogs || []);
    var dogsHtml = dogBlock
      ? "<div class=\"cabinet-block\"><h3 class=\"cabinet-block-title\">Собаки</h3>" + dogBlock + "</div>"
      : "";
    var left = "<div class=\"cabinet-block\">" +
      "<h3 class=\"cabinet-block-title\">Следующая доставка</h3>" +
      "<div class=\"cabinet-kv\"><span>Клиент</span><strong>" + esc(cab.nick || (st.link && st.link.clientNick) || "—") + "</strong></div>" +
      (cards || "<p class=\"cabinet-hint\">" + (linked ? "В этом месяце доставок нет." : "Привяжите клиента по нику или телефону.") + "</p>") +
      "</div>" +
      (linked && nearest
        ? "<div class=\"cabinet-block\"><h3 class=\"cabinet-block-title\">Состав</h3>" + warn +
            "<form id=\"orderForm\" class=\"cabinet-form\">" +
              "<input type=\"hidden\" id=\"orderId\" value=\"" + esc(nearest.id || "") + "\" />" +
              "<div class=\"field\"><label>Состав, строка = название и граммы</label><textarea id=\"orderBasket\" rows=\"4\">" + esc(editLines) + "</textarea></div>" +
              "<div class=\"field\"><label>Дата</label><input id=\"orderDate\" type=\"date\" value=\"" + esc(nearest.date || "") + "\" /></div>" +
              "<label class=\"cabinet-hint\"><input id=\"confirmOnly\" type=\"checkbox\" /> Только после подтверждения</label>" +
              "<button type=\"submit\" class=\"btn\">Сохранить заказ</button>" +
              (st.stockWarn ? "<button type=\"button\" class=\"btn btn-ghost\" id=\"keepMissing\" style=\"margin-top:8px;\">Оставить своё изменение</button>" : "") +
            "</form></div>"
        : "");
    var right = dogsHtml +
      (linked && nearest
        ? "<div class=\"cabinet-block\"><h3 class=\"cabinet-block-title\">Адрес</h3>" +
            "<form id=\"addrForm\" class=\"cabinet-form\">" +
              "<div class=\"field\"><label>Улица и дом</label><input id=\"addrStreet\" value=\"" + esc(addr.street || "") + "\" /></div>" +
              "<div class=\"field-row\">" +
                "<div class=\"field\"><label>Подъезд</label><input id=\"addrEntrance\" value=\"" + esc(addr.entrance || "") + "\" /></div>" +
                "<div class=\"field\"><label>Код домофона</label><input id=\"addrDoor\" value=\"" + esc(addr.doorCode || "") + "\" /></div>" +
              "</div>" +
              "<div class=\"field-row\">" +
                "<div class=\"field\"><label>Этаж</label><input id=\"addrFloor\" value=\"" + esc(addr.floor || "") + "\" /></div>" +
                "<div class=\"field\"><label>Квартира</label><input id=\"addrFlat\" value=\"" + esc(addr.flat || "") + "\" /></div>" +
              "</div>" +
              "<button type=\"submit\" class=\"btn\">Сохранить адрес</button>" +
            "</form></div>"
        : "") +
      (linked || (nearest && nearest.payText)
        ? "<div class=\"cabinet-block\"><h3 class=\"cabinet-block-title\">Оплата</h3>" +
            (nearest && nearest.payText ? "<p class=\"cabinet-pay\">" + esc(nearest.payText) + "</p>" : "") +
            (linked
              ? "<button type=\"button\" class=\"btn btn-ghost\" id=\"pauseSub\">Пауза</button>" +
                "<p class=\"cabinet-hint\">Будущий заказ снимется, подписка уйдёт в АФК.</p>"
              : "") +
          "</div>"
        : "") +
      "<div class=\"cabinet-block\">" +
        "<h3 class=\"cabinet-block-title\">Привязать</h3>" +
        "<form id=\"linkForm\" class=\"cabinet-form\">" +
          "<div class=\"field\"><label>Ник</label><input id=\"linkNick\" name=\"nick\" placeholder=\"@nick\" autocomplete=\"off\" /></div>" +
          "<div class=\"field\"><label>Телефон</label><input id=\"linkPhone\" name=\"phone\" placeholder=\"+375…\" inputmode=\"tel\" autocomplete=\"tel\" /></div>" +
          "<button type=\"submit\" class=\"btn\">Найти</button>" +
        "</form>" +
      "</div>";
    return deskGrid(left, right);
  }

  function renderPartnersPage(st) {
    var access = currentAccess(st);
    if (access === "limited" || access === "city") {
      return (
        "<div class=\"cabinet-lock\">" +
          "<h2>Партнёры</h2>" +
          "<p>Скидки партнёров открываются с активной подпиской.</p>" +
          "<a class=\"btn\" href=\"try.html\">Хочу попробовать</a>" +
        "</div>"
      );
    }
    var pr = st.privilege || {};
    var partners = st.partners || [];
    var code = pr.eligible && pr.code ? pr.code : "";
    var partnerName = (partners[0] && partners[0].name) || "VARKA";

    return deskGrid(
      "<div class=\"cabinet-block\">" +
        "<div class=\"privilege-card\" id=\"privilegeCard\">" +
          "<p class=\"badge\">" + esc(pr.title || "Скидка VARKA") + "</p>" +
          "<div class=\"code\">" + esc(code || "••••") + "</div>" +
          "<p class=\"hint\">" + esc(pr.offerText || "Для активных подписчиков ПП") + "</p>" +
          (pr.eligible
            ? "<button type=\"button\" class=\"btn cabinet-copy-btn\" id=\"copyPrivilege\">Скопировать код</button>"
            : "<p class=\"hint\">Нужна активная подписка ПП — привяжите заказ во вкладке «Подписка».</p>") +
        "</div>" +
        "<div class=\"ps-tip\"><b>Как пользоваться</b><span>Покажите карточку в&nbsp;кабинете&nbsp;— скидка на&nbsp;кассе.</span></div>" +
      "</div>",
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

  function applyNavAccess(access) {
    var allow = allowedPages(access);
    var nav = document.querySelector(".cabinet-nav");
    var app = document.getElementById("cabinet");
    if (nav) {
      nav.classList.toggle("is-city-only", access === "city");
      nav.classList.toggle("is-limited", access === "limited" || access === "lead");
      document.querySelectorAll(".cabinet-nav [data-page]").forEach(function (btn) {
        var page = btn.getAttribute("data-page");
        var ok = allow.indexOf(page) >= 0;
        btn.hidden = !ok;
        btn.style.display = ok ? "" : "none";
      });
      if (access === "city") nav.style.gridTemplateColumns = "1fr";
      else if (access === "lead") nav.style.gridTemplateColumns = "1fr";
      else if (access === "limited") nav.style.gridTemplateColumns = "1fr 1fr";
      else nav.style.gridTemplateColumns = "repeat(4, 1fr)";
    }
    if (app) {
      app.classList.toggle("access-city", access === "city");
      app.classList.toggle("access-limited", access === "limited" || access === "lead");
      app.classList.toggle("access-full", access === "full");
    }
  }

  function applyPageState(name) {
    var st = global.GBStore.get() || {};
    var access = currentAccess(st);
    var allow = allowedPages(access);
    if (allow.indexOf(name) < 0) name = allow[0] || "profile";
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
    applyNavAccess(access);
  }

  function setPage(name) {
    var st = global.GBStore.get();
    var access = currentAccess(st);
    var allow = allowedPages(access);
    if (allow.indexOf(name) < 0) {
      GBUI.toast(access === "city"
        ? "В гостевом режиме доступна только карта"
        : "Раздел откроется с подпиской");
      name = allow[0] || "map";
    }
    var changed = st.page !== name;
    global.GBStore.set({ page: name });
    applyPageState(name);
    if (changed) {
      GBUI.render();
      try { window.scrollTo(0, 0); } catch (e) {}
    }
  }

  function render() {
    var st = global.GBStore.get();
    var pet = global.GBStore.activePet();
    var access = currentAccess(st);
    var allow = allowedPages(access);
    var page = st.page || "profile";
    if (allow.indexOf(page) < 0) page = allow[0] || "map";
    var details = document.getElementById("petEditDetails");
    var detailsOpen = details ? details.open : false;

    var demoEl = document.getElementById("demoBanner");
    if (demoEl) demoEl.style.display = st.demo ? "" : "none";

    var meta = document.getElementById("topMeta");
    if (meta) {
      var label = (st.user && st.user.name) ? st.user.name : "Гость";
      meta.textContent = label;
      meta.title = (st.user && st.user.name) || "Аккаунт";
    }

    if (page === "profile") {
      var pageProfile = document.getElementById("pageProfile");
      if (pageProfile) pageProfile.innerHTML = renderProfilePage(st, pet);
    } else if (page === "map") {
      var pageMap = document.getElementById("pageMap");
      if (pageMap) pageMap.innerHTML = renderMapPage(st);
    } else if (page === "subscription") {
      var pageSubscription = document.getElementById("pageSubscription");
      if (pageSubscription) pageSubscription.innerHTML = renderSubscriptionPage(st);
    } else if (page === "partners") {
      var pagePartners = document.getElementById("pagePartners");
      if (pagePartners) pagePartners.innerHTML = renderPartnersPage(st);
    }

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

    details = document.getElementById("petEditDetails");
    if (details && detailsOpen) details.open = true;

    applyPageState(page);
    if (page === "map" && global.GBMap && global.GBMap.mount) global.GBMap.mount();
  }

  global.GBUI = {
    toast: toast,
    setPage: setPage,
    applyPageState: applyPageState,
    render: render,
    esc: esc,
    PAGES: PAGES
  };
})(window);
