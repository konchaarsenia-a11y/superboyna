(function (global) {
  "use strict";

  function readTelegramUser() {
    try {
      var tg = global.Telegram && global.Telegram.WebApp;
      if (!tg) return null;
      try { tg.ready(); tg.expand(); } catch (e0) {}
      var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (!u || !u.id) return null;
      return {
        telegramId: String(u.id),
        name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "Друг",
        username: u.username || "",
        photoUrl: u.photo_url || "",
        phone: "",
        initData: tg.initData || "",
        intent: "telegram"
      };
    } catch (e) {
      return null;
    }
  }

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10);
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/[^\d+]/g, "").trim();
  }

  function normalizeNick(nick) {
    return String(nick || "").trim().replace(/^@/, "");
  }

  function registerUser(data) {
    var name = String((data && data.name) || "").trim();
    var phone = normalizePhone(data && data.phone);
    var nick = normalizeNick(data && data.nick);
    if (!name) return { ok: false, message: "Укажите имя" };
    if (!phone || phone.length < 9) return { ok: false, message: "Укажите телефон" };
    var user = {
      telegramId: uid("web"),
      name: name,
      username: nick,
      phone: phone,
      photoUrl: "",
      initData: "",
      intent: (data && data.intent) || "register",
      createdAt: new Date().toISOString()
    };
    return { ok: true, user: user };
  }

  function loginUser(data) {
    var phone = normalizePhone(data && data.phone);
    var nick = normalizeNick(data && data.nick);
    if (!phone && !nick) return { ok: false, message: "Укажите телефон или ник" };
    var st = global.GBStore && global.GBStore.get();
    var saved = st && st.user;
    if (saved && saved.telegramId) {
      var samePhone = phone && normalizePhone(saved.phone) === phone;
      var sameNick = nick && normalizeNick(saved.username) === nick;
      if (samePhone || sameNick) {
        return {
          ok: true,
          user: Object.assign({}, saved, {
            intent: (data && data.intent) || "pp",
            phone: phone || saved.phone || "",
            username: nick || saved.username || ""
          })
        };
      }
    }
    // Демо-вход: создаём сессию по телефону/нику (позже — поиск в Бойне)
    var user = {
      telegramId: uid("login"),
      name: nick || "Подписчик",
      username: nick,
      phone: phone,
      photoUrl: "",
      initData: "",
      intent: (data && data.intent) || "pp",
      createdAt: new Date().toISOString()
    };
    return { ok: true, user: user, needsLink: true };
  }

  function guestUser(intent) {
    return {
      telegramId: uid("guest"),
      name: intent === "city" ? "Гость" : "Гость",
      username: "",
      phone: "",
      photoUrl: "",
      initData: "",
      intent: intent || "city",
      isGuest: true,
      createdAt: new Date().toISOString()
    };
  }

  function demoUser() {
    return {
      telegramId: "demo_" + String(Date.now()).slice(-6),
      name: "Демо",
      username: "demo",
      phone: "",
      photoUrl: "",
      initData: "",
      intent: "demo",
      isDemo: true
    };
  }

  /**
   * Сессия: TG → сохранённый user.
   * Авто-демо только если GB_CONFIG.allowDemoFallback === true.
   */
  function resolveSession() {
    var tgUser = readTelegramUser();
    if (tgUser) return { source: "telegram", user: tgUser };
    var st = global.GBStore && global.GBStore.get();
    if (st && st.user && st.user.telegramId && !st.user.loggedOut) {
      return { source: st.demo || st.user.isDemo ? "demo" : "local", user: st.user };
    }
    if (global.GB_CONFIG && global.GB_CONFIG.allowDemoFallback) {
      return { source: "demo", user: demoUser() };
    }
    return { source: "none", user: null };
  }

  function logout() {
    if (!global.GBStore) return;
    global.GBStore.set({
      user: null,
      pets: [],
      activePetId: null,
      subscription: null,
      partners: [],
      privilege: null,
      link: null,
      demo: false,
      page: "profile",
      intent: ""
    });
    try {
      var key = (global.GB_CONFIG && global.GB_CONFIG.storageKey) || "goodboy_v1";
      localStorage.removeItem(key);
    } catch (e) {}
  }

  global.GBAuth = {
    readTelegramUser: readTelegramUser,
    demoUser: demoUser,
    guestUser: guestUser,
    registerUser: registerUser,
    loginUser: loginUser,
    resolveSession: resolveSession,
    logout: logout,
    normalizePhone: normalizePhone,
    normalizeNick: normalizeNick
  };
})(window);
