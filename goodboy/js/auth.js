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

  function isLive() {
    return global.GB_CONFIG && global.GB_CONFIG.mode === "live" && global.GB_CONFIG.webhookUrl;
  }

  function userFromApi(payload, extras) {
    extras = extras || {};
    var u = (payload && payload.user) || {};
    var access = u.access || extras.access || "limited";
    return {
      telegramId: String(u.telegramId || extras.telegramId || uid("web")),
      name: String(u.name || extras.name || "Друг"),
      username: String(u.username || extras.username || ""),
      phone: String(u.phone || extras.phone || ""),
      photoUrl: "",
      initData: "",
      intent: extras.intent || (access === "full" ? "pp" : "limited"),
      hasSubscription: access === "full" || !!u.hasSubscription,
      access: access,
      createdAt: u.createdAt || new Date().toISOString()
    };
  }

  /** Локальная регистрация (demo / офлайн). */
  function registerUserLocal(data) {
    var name = String((data && data.name) || "").trim();
    var phone = normalizePhone(data && data.phone);
    var nick = normalizeNick(data && data.nick);
    var hasSub = !!(data && data.hasSubscription);
    if (!name) return { ok: false, message: "Укажите имя" };
    if (!phone || phone.length < 9) return { ok: false, message: "Укажите телефон" };
    var user = {
      telegramId: uid("web"),
      name: name,
      username: nick,
      phone: phone,
      photoUrl: "",
      initData: "",
      intent: hasSub ? "pp" : "limited",
      hasSubscription: hasSub,
      access: hasSub ? "full" : "limited",
      createdAt: new Date().toISOString()
    };
    return { ok: true, user: user, needsLink: hasSub };
  }

  /** Локальный вход (demo / офлайн). */
  function loginUserLocal(data) {
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
            intent: "pp",
            hasSubscription: true,
            access: "full",
            phone: phone || saved.phone || "",
            username: nick || saved.username || ""
          }),
          needsLink: !(saved.hasSubscription && saved.access === "full")
        };
      }
    }
    var user = {
      telegramId: uid("login"),
      name: nick || "Подписчик",
      username: nick,
      phone: phone,
      photoUrl: "",
      initData: "",
      intent: "pp",
      hasSubscription: true,
      access: "full",
      createdAt: new Date().toISOString()
    };
    return { ok: true, user: user, needsLink: true };
  }

  function requestOtp(data) {
    data = data || {};
    var purpose = data.purpose || "login";
    var phone = normalizePhone(data.phone);
    var nick = normalizeNick(data.nick);
    var name = String(data.name || "").trim();
    var hasSub = !!data.hasSubscription;
    var tg = readTelegramUser();

    if (!isLive() || !global.GBApi) {
      // demo: мгновенный «код» 000000
      return Promise.resolve({
        ok: true,
        challengeId: "demo_" + Date.now(),
        delivery: "demo",
        botLink: "",
        message: "Демо-режим: введите код 000000",
        demoCode: "000000",
        pending: { purpose: purpose, phone: phone, nick: nick, name: name, hasSubscription: hasSub }
      });
    }

    var payload = {
      action: "gbRequestOtp",
      purpose: purpose,
      phone: phone,
      nick: nick,
      name: name,
      hasSubscription: hasSub ? "1" : "0"
    };
    if (tg && tg.telegramId) {
      payload.telegramId = tg.telegramId;
      payload.initData = tg.initData || "";
    }
    return global.GBApi.get(payload).then(function (res) {
      if (!res || res.status !== "success") {
        return { ok: false, message: (res && res.message) || "Не удалось отправить код" };
      }
      return {
        ok: true,
        challengeId: res.challengeId,
        delivery: res.delivery,
        botLink: res.botLink || "",
        botUsername: res.botUsername || "",
        sent: !!res.sent,
        message: res.message || "",
        pending: { purpose: purpose, phone: phone, nick: nick, name: name, hasSubscription: hasSub }
      };
    }).catch(function (err) {
      return { ok: false, message: String(err && err.message || err) };
    });
  }

  function verifyOtp(data) {
    data = data || {};
    var code = String(data.code || "").replace(/\D/g, "");
    var challengeId = String(data.challengeId || "");
    if (!challengeId || code.length < 4) {
      return Promise.resolve({ ok: false, message: "Введите код из Telegram" });
    }

    if (!isLive() || !global.GBApi || String(challengeId).indexOf("demo_") === 0) {
      if (code !== "000000") return Promise.resolve({ ok: false, message: "Демо: код 000000" });
      var pending = data.pending || {};
      if (pending.purpose === "register") {
        return Promise.resolve(registerUserLocal(pending));
      }
      return Promise.resolve(loginUserLocal(pending));
    }

    return global.GBApi.get({
      action: "gbVerifyOtp",
      challengeId: challengeId,
      code: code
    }).then(function (res) {
      if (!res || res.status !== "success") {
        return {
          ok: false,
          message: (res && res.message) || "Неверный код",
          botLink: res && res.botLink,
          code: res && res.code
        };
      }
      var user = userFromApi(res, {
        intent: (res.user && res.user.access === "full") ? "pp" : "limited"
      });
      return { ok: true, user: user, bootstrap: res, needsLink: false };
    }).catch(function (err) {
      return { ok: false, message: String(err && err.message || err) };
    });
  }

  function authTelegram() {
    var tg = readTelegramUser();
    if (!tg) return Promise.resolve({ ok: false, message: "Откройте кабинет из Telegram" });
    if (!isLive() || !global.GBApi) {
      tg.hasSubscription = true;
      tg.access = "full";
      return Promise.resolve({ ok: true, user: tg, needsLink: true });
    }
    return global.GBApi.get({
      action: "gbAuthTelegram",
      telegramId: tg.telegramId,
      name: tg.name || "",
      username: tg.username || "",
      initData: tg.initData || ""
    }).then(function (res) {
      if (!res || res.status !== "success") {
        return { ok: false, message: (res && res.message) || "Telegram не подтверждён" };
      }
      var user = userFromApi(res, {
        telegramId: tg.telegramId,
        intent: (res.user && res.user.access === "full") ? "pp" : "limited"
      });
      user.initData = tg.initData || "";
      return { ok: true, user: user, bootstrap: res };
    }).catch(function (err) {
      return { ok: false, message: String(err && err.message || err) };
    });
  }

  /** @deprecated прямой логин без OTP — оставлен для demo fallback */
  function registerUser(data) {
    return requestOtp(Object.assign({}, data, { purpose: "register" }));
  }

  function loginUser(data) {
    return requestOtp(Object.assign({}, data, { purpose: "login" }));
  }

  function guestUser(intent) {
    return {
      telegramId: uid("guest"),
      name: "Гость",
      username: "",
      phone: "",
      photoUrl: "",
      initData: "",
      intent: intent || "city",
      isGuest: true,
      hasSubscription: false,
      access: "city",
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
      intent: "",
      access: "full"
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
    requestOtp: requestOtp,
    verifyOtp: verifyOtp,
    authTelegram: authTelegram,
    registerUserLocal: registerUserLocal,
    loginUserLocal: loginUserLocal,
    userFromApi: userFromApi,
    resolveSession: resolveSession,
    logout: logout,
    normalizePhone: normalizePhone,
    normalizeNick: normalizeNick
  };
})(window);
