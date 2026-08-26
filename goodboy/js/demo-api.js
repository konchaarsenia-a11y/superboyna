/**
 * Локальный API Goodboy (параллельно Бойне).
 * Позже заменим на живой бэкенд и свяжем с конвейером.
 */
(function (global) {
  "use strict";

  var VAROK_LOCATIONS = [];
  for (var i = 1; i <= 12; i++) {
    VAROK_LOCATIONS.push({
      id: "varok_" + i,
      name: "VARKA · точка " + i,
      address: "Адрес уточняется",
      city: "Минск",
      active: true
    });
  }

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10);
  }

  function loadDb() {
    try {
      var raw = localStorage.getItem("goodboy_demo_db");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { users: {}, pets: {}, links: {} };
  }

  function saveDb(db) {
    try { localStorage.setItem("goodboy_demo_db", JSON.stringify(db)); } catch (e2) {}
  }

  function privilegeFor(link) {
    var hasPp = !!(link && link.segment && String(link.segment).toUpperCase() === "ПП");
    return {
      partnerSlug: "varok",
      eligible: hasPp,
      reason: hasPp ? "ok" : "need_pp",
      title: "Скидка VARKA",
      offerText: "Условия скидки уточняются с сетью VARKA",
      code: hasPp ? ("GB-" + String((link && link.matchKey) || "DEMO").slice(0, 6).toUpperCase()) : "",
      codeLabel: hasPp ? "Покажите код бариста" : "",
      validUntil: hasPp ? "сегодня" : "",
      howTo: [
        "Откройте карточку скидки в Goodboy",
        "Покажите бариста в кофейне VARKA",
        "Скидка для активных подписчиков ПП (после согласования условий)"
      ],
      locations: VAROK_LOCATIONS
    };
  }

  function partnersList() {
    return [{
      id: "varok",
      slug: "varok",
      name: "VARKA",
      blurb: "12 кофеен в Минске — лакомства Бойни уже на витрине",
      locationsCount: 12
    }];
  }

  function ensureUser(db, telegramId, meta) {
    var id = String(telegramId || "");
    if (!id) id = "anon";
    if (!db.users[id]) {
      db.users[id] = {
        id: "u_" + id,
        telegramId: id,
        name: (meta && meta.name) || "Гость",
        username: (meta && meta.username) || "",
        phone: "",
        createdAt: new Date().toISOString()
      };
    } else if (meta) {
      if (meta.name) db.users[id].name = meta.name;
      if (meta.username) db.users[id].username = meta.username;
    }
    return db.users[id];
  }

  function petsFor(db, telegramId) {
    var out = [];
    Object.keys(db.pets).forEach(function (pid) {
      if (db.pets[pid].ownerTelegramId === String(telegramId)) out.push(db.pets[pid]);
    });
    return out;
  }

  function resolveDemoStage(link, subscription) {
    var linked = !!(link && link.status === "linked");
    var seg = String((subscription && subscription.segment) || (link && link.segment) || "").toUpperCase();
    var days = subscription && subscription.daysUntil;
    if (days == null && subscription && subscription.nextDate) {
      try {
        var m = String(subscription.nextDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          var target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          var now = new Date();
          var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          days = Math.round((target - today) / 86400000);
        }
      } catch (eD) {}
    }
    var catalog = {
      unlinked: { id: "unlinked", badge: "не привязана", title: "Привяжите заказ", text: "Укажите телефон или Instagram-ник из Бойни.", progress: 8 },
      waiting_stock: { id: "waiting_stock", badge: "ждём", title: "Ждём, пока Барни сократит запасы лакомств", text: "Пока доедаете текущий набор — новый не торопим.", progress: 22 },
      scheduled: { id: "scheduled", badge: "в плане", title: "Доставка уже в календаре", text: "Дата зафиксирована. Скоро начнём заготовку.", progress: 38 },
      preparing: { id: "preparing", badge: "готовим", title: "Заготавливаем новые лакомства", text: "Сушим и комплектуем набор под вашего питомца.", progress: 55 },
      packing: { id: "packing", badge: "собираем", title: "Собираем ваш набор", text: "Упаковываем и готовим к курьеру.", progress: 72 },
      on_the_way: { id: "on_the_way", badge: "в пути", title: "Набор уже в пути", text: "Курьер везёт доставку по адресу.", progress: 88 },
      delivered: { id: "delivered", badge: "получен", title: "Набор у вас", text: "Следующий цикл начнём вовремя.", progress: 100 },
      trial: { id: "trial", badge: "пробный", title: "Пробный период", text: "Идёт тестовый набор.", progress: 40 }
    };
    if (!linked) return catalog.unlinked;
    if (days == null || isNaN(days)) {
      return (seg === "БП" || seg === "BP") ? catalog.trial : catalog.waiting_stock;
    }
    if (days <= 1) return catalog.on_the_way;
    if (days <= 3) return catalog.packing;
    if (days <= 9) return catalog.preparing;
    if (days <= 16) return catalog.scheduled;
    if (seg === "БП" || seg === "BP") return catalog.trial;
    return catalog.waiting_stock;
  }

  function attachStage(payload) {
    var stage = resolveDemoStage(payload.link, payload.subscription);
    payload.subscription = Object.assign({}, payload.subscription || {}, {
      daysUntil: payload.subscription && payload.subscription.daysUntil,
      stage: stage,
      stageId: stage.id,
      stageBadge: stage.badge,
      stageTitle: stage.title,
      stageText: stage.text,
      stageProgress: stage.progress
    });
    return payload;
  }

  function handleMe(params) {
    var db = loadDb();
    var user = ensureUser(db, params.telegramId, {
      name: params.name,
      username: params.username
    });
    var pets = petsFor(db, user.telegramId);
    if (!pets.length) {
      var pet = {
        id: uid("pet"),
        ownerTelegramId: user.telegramId,
        name: "",
        breed: "",
        weightKg: 0,
        ageYears: 0,
        sex: "",
        allergies: "",
        notes: ""
      };
      // пустая карточка не пушим — пусть пользователь заполнит
      pets = [];
    }
    var link = db.links[user.telegramId] || { matchKey: "", clientNick: "", status: "unlinked", segment: "" };
    saveDb(db);
    var subscription = {
      status: link.status === "linked" ? "active" : "unlinked",
      segment: link.segment || "",
      nextDate: link.nextDate || "",
      nextDateLabel: link.nextDateLabel || (link.status === "linked" ? "Дата появится, когда пора готовить набор" : "Привяжите подписку"),
      daysUntil: link.daysUntil != null ? link.daysUntil : (link.status === "linked" ? 18 : null),
      address: link.address || "",
      basket: link.basket || []
    };
    return attachStage({
      status: "success",
      demo: true,
      user: user,
      pets: pets,
      activePetId: pets[0] ? pets[0].id : null,
      link: link,
      subscription: subscription,
      partners: partnersList(),
      privilege: privilegeFor(link)
    });
  }

  function handleSavePet(params) {
    var db = loadDb();
    var tg = String(params.telegramId || "");
    ensureUser(db, tg, {});
    var pet = {};
    try {
      pet = typeof params.petJson === "string" ? JSON.parse(params.petJson) : (params.pet || {});
    } catch (e) {
      return { status: "error", message: "bad_pet_json" };
    }
    var name = String(pet.name || "").trim();
    if (!name) return { status: "error", message: "Укажите кличку" };
    var id = String(pet.id || "").trim() || uid("pet");
    var row = {
      id: id,
      ownerTelegramId: tg,
      name: name,
      breed: String(pet.breed || "").trim(),
      weightKg: Number(pet.weightKg) || 0,
      ageYears: Number(pet.ageYears) || 0,
      sex: String(pet.sex || ""),
      allergies: String(pet.allergies || "").trim(),
      notes: String(pet.notes || "").trim(),
      updatedAt: new Date().toISOString()
    };
    db.pets[id] = row;
    saveDb(db);
    return { status: "success", pet: row, demo: true };
  }

  /**
   * Демо-привязка: не ходит в Бойню.
   * Имитирует успех, если есть телефон или ник. Сегмент ПП — если в нике/заметке нет «бп».
   */
  function handleLinkClient(params) {
    var db = loadDb();
    var tg = String(params.telegramId || "");
    var user = ensureUser(db, tg, {});
    var phone = String(params.phone || "").trim();
    var nick = String(params.nick || "").trim().replace(/^@/, "");
    if (!phone && !nick) {
      return { status: "error", message: "Укажите телефон или ник" };
    }
    var isBp = /бп|bp/i.test(nick);
    var link = {
      status: "linked",
      clientNick: nick || ("tel:" + phone),
      matchKey: (nick || phone).toLowerCase().replace(/[\s.]/g, "_"),
      segment: isBp ? "БП" : "ПП",
      phone: phone,
      address: "Минск (демо-адрес)",
      nextDate: "",
      nextDateLabel: "Демо · дата после связки с Бойней",
      basket: [],
      linkedAt: new Date().toISOString()
    };
    db.links[tg] = link;
    if (phone) user.phone = phone;
    db.users[tg] = user;
    saveDb(db);
    return attachStage({
      status: "success",
      demo: true,
      link: link,
      user: user,
      subscription: {
        status: "active",
        segment: link.segment,
        nextDate: "",
        nextDateLabel: link.nextDateLabel,
        daysUntil: 18,
        address: link.address,
        basket: []
      },
      privilege: privilegeFor(link)
    });
  }

  function handleRegister(params) {
    var db = loadDb();
    var name = String(params.name || "").trim();
    var phone = String(params.phone || "").trim();
    var nick = String(params.nick || params.username || "").trim().replace(/^@/, "");
    var hasSub = String(params.hasSubscription || "") === "1" || params.hasSubscription === true;
    if (!name) return { status: "error", message: "Укажите имя" };
    if (!phone || phone.replace(/\D/g, "").length < 9) return { status: "error", message: "Укажите телефон" };
    var tg = String(params.telegramId || "").trim() || uid("web");
    var user = ensureUser(db, tg, { name: name, username: nick });
    user.phone = phone;
    user.access = hasSub ? "full" : "limited";
    db.users[tg] = user;
    saveDb(db);
    var me = handleMe({ telegramId: tg, name: name, username: nick });
    me.user = Object.assign({}, me.user, { access: user.access, hasSubscription: hasSub, phone: phone });
    me.needsLink = hasSub;
    me.registered = true;
    return me;
  }

  function handleLogin(params) {
    var phone = String(params.phone || "").trim();
    var nick = String(params.nick || params.username || "").trim().replace(/^@/, "");
    if (!phone && !nick) return { status: "error", message: "Укажите телефон или ник" };
    var tg = String(params.telegramId || "").trim() || uid("login");
    var linkRes = handleLinkClient({
      telegramId: tg,
      phone: phone,
      nick: nick
    });
    if (linkRes.status !== "success") {
      // demo: всё равно пускаем с needsLink
      var db = loadDb();
      var user = ensureUser(db, tg, { name: nick || "Подписчик", username: nick });
      if (phone) user.phone = phone;
      user.access = "full";
      db.users[tg] = user;
      saveDb(db);
      var me = handleMe({ telegramId: tg, name: user.name, username: nick });
      me.needsLink = true;
      me.loggedIn = true;
      return me;
    }
    linkRes.needsLink = false;
    linkRes.loggedIn = true;
    if (linkRes.user) linkRes.user.access = "full";
    return linkRes;
  }

  function dispatch(action, params) {
    params = params || {};
    if (action === "gbMe") return handleMe(params);
    if (action === "gbSavePet") return handleSavePet(params);
    if (action === "gbLinkClient") return handleLinkClient(params);
    if (action === "gbRegister") return handleRegister(params);
    if (action === "gbLogin") return handleLogin(params);
    if (action === "gbEnsureSheets" || action === "gbBootstrap") {
      return { status: "success", demo: true, message: "local ok", partners: partnersList() };
    }
    return { status: "error", message: "unknown_action:" + action };
  }

  /** Promise API как у будущего сетевого слоя */
  function call(action, params) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(dispatch(action, params));
      }, 120);
    });
  }

  global.GBDemoApi = { call: call, dispatch: dispatch, varokLocations: VAROK_LOCATIONS };
})(window);
