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
        initData: tg.initData || ""
      };
    } catch (e) {
      return null;
    }
  }

  function demoUser() {
    return {
      telegramId: "demo_" + String(Date.now()).slice(-6),
      name: "Демо",
      username: "demo",
      photoUrl: "",
      initData: "",
      isDemo: true
    };
  }

  /**
   * Сессия: TG → сохранённый user → демо (если allowDemoFallback).
   */
  function resolveSession() {
    var tgUser = readTelegramUser();
    if (tgUser) return { source: "telegram", user: tgUser };
    var st = global.GBStore && global.GBStore.get();
    if (st && st.user && st.user.telegramId) {
      return { source: st.demo ? "demo" : "local", user: st.user };
    }
    if (global.GB_CONFIG && global.GB_CONFIG.allowDemoFallback) {
      return { source: "demo", user: demoUser() };
    }
    return { source: "none", user: null };
  }

  global.GBAuth = {
    readTelegramUser: readTelegramUser,
    demoUser: demoUser,
    resolveSession: resolveSession
  };
})(window);
