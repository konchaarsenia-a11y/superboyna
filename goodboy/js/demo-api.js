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
    return {
      status: "success",
      demo: true,
      user: user,
      pets: pets,
      activePetId: pets[0] ? pets[0].id : null,
      link: link,
      subscription: {
        status: link.status === "linked" ? "active" : "unlinked",
        segment: link.segment || "",
        nextDate: link.nextDate || "",
        nextDateLabel: link.nextDateLabel || (link.status === "linked" ? "Дата появится после связки" : "Привяжите подписку"),
        address: link.address || "",
        basket: link.basket || []
      },
      partners: partnersList(),
      privilege: privilegeFor(link)
    };
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
    return {
      status: "success",
      demo: true,
      link: link,
      subscription: {
        status: "active",
        segment: link.segment,
        nextDate: "",
        nextDateLabel: link.nextDateLabel,
        address: link.address,
        basket: []
      },
      privilege: privilegeFor(link)
    };
  }

  function dispatch(action, params) {
    params = params || {};
    if (action === "gbMe") return handleMe(params);
    if (action === "gbSavePet") return handleSavePet(params);
    if (action === "gbLinkClient") return handleLinkClient(params);
    if (action === "gbBootstrap") {
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
