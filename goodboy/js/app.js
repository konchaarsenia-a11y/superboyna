(function (global) {
  "use strict";

  var wired = false;

  function showGate(view) {
    var gate = document.getElementById("gate");
    var cabinet = document.getElementById("cabinet");
    if (gate) {
      gate.hidden = false;
      gate.style.display = "";
    }
    if (cabinet) {
      cabinet.hidden = true;
      cabinet.style.display = "none";
    }
    setGateView(view || "welcome");
    refreshTelegramBlock();
  }

  function showCabinet() {
    var gate = document.getElementById("gate");
    var cabinet = document.getElementById("cabinet");
    if (gate) {
      gate.hidden = true;
      gate.style.display = "none";
    }
    if (cabinet) {
      cabinet.hidden = false;
      cabinet.style.display = "";
    }
  }

  function setGateView(name) {
    document.querySelectorAll(".gate-panel").forEach(function (panel) {
      var on = panel.getAttribute("data-gate-view") === name;
      panel.hidden = !on;
    });
    ["gateLoginError", "gateRegisterError"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
    });
  }

  function refreshTelegramBlock() {
    var block = document.getElementById("gateTgBlock");
    var btn = document.getElementById("enterTelegram");
    var hint = document.getElementById("gateTgHint");
    if (!block || !btn) return;
    var tg = GBAuth.readTelegramUser();
    if (tg) {
      block.hidden = false;
      btn.textContent = "Продолжить как " + (tg.name || "Telegram");
      if (hint) {
        hint.hidden = false;
        hint.textContent = tg.username ? "@" + tg.username : "Вход через Telegram Mini App";
      }
    } else {
      block.hidden = true;
    }
  }

  function pageForIntent(intent, access) {
    if (access === "city" || intent === "city") return "map";
    if (intent === "pp") return "subscription";
    if (access === "limited") return "profile";
    return "profile";
  }

  function accessOf(user) {
    if (!user) return "full";
    if (user.access) return user.access;
    if (user.isGuest || user.intent === "city") return "city";
    if (user.hasSubscription === false || user.intent === "limited") return "limited";
    return "full";
  }

  function enterWithUser(user, opts) {
    opts = opts || {};
    var intent = user.intent || opts.intent || "";
    var access = accessOf(user);
    GBStore.set({
      user: user,
      demo: !!user.isDemo || !!user.isGuest || ((GB_CONFIG && GB_CONFIG.mode) !== "live"),
      intent: intent,
      access: access,
      page: opts.page || pageForIntent(intent, access)
    });
    showCabinet();
    loadCabinet(user, opts);
  }

  function applyBootstrap(payload, session) {
    var prev = global.GBStore.get() || {};
    var user = Object.assign({}, session.user, payload.user || {});
    var intent = user.intent || prev.intent || "";
    var access = accessOf(user);
    var page = prev.page || pageForIntent(intent, access);
    if (access === "city") page = "map";
    global.GBStore.set({
      demo: !!(payload && payload.demo) || !!user.isGuest || !!user.isDemo || ((global.GB_CONFIG && global.GB_CONFIG.mode) !== "live"),
      user: user,
      pets: payload.pets || [],
      activePetId: payload.activePetId || (payload.pets && payload.pets[0] && payload.pets[0].id) || null,
      subscription: payload.subscription || null,
      partners: payload.partners || [],
      privilege: payload.privilege || null,
      link: payload.link || null,
      bootError: "",
      intent: intent,
      access: access,
      page: page,
      mapFilter: prev.mapFilter || "all",
      mapPlaceId: prev.mapPlaceId || "p2"
    });
    GBUI.render();
  }

  function loadCabinet(user, opts) {
    opts = opts || {};
    GBApi.get({
      action: "gbMe",
      telegramId: user.telegramId || "",
      name: user.name || "",
      username: user.username || ""
    }).then(function (res) {
      if (!res || res.status !== "success") {
        throw new Error((res && res.message) || "gbMe failed");
      }
      applyBootstrap(res, { user: user });
      if (opts.needsLink && (user.phone || user.username)) {
        return GBApi.get({
          action: "gbLinkClient",
          telegramId: user.telegramId || "",
          phone: user.phone || "",
          nick: user.username || ""
        }).then(function (linkRes) {
          if (linkRes && linkRes.status === "success") {
            GBStore.set({
              link: linkRes.link || null,
              subscription: linkRes.subscription || GBStore.get().subscription,
              privilege: linkRes.privilege || GBStore.get().privilege
            });
            GBUI.render();
            GBUI.toast(linkRes.link && linkRes.link.clientNick
              ? "Подписка: " + linkRes.link.clientNick
              : "Вход выполнен");
          }
        });
      }
    }).catch(function (err) {
      GBStore.set({ bootError: String(err && err.message || err) });
      GBUI.toast("Не удалось загрузить кабинет");
    });
  }

  function bootstrap() {
    var session = GBAuth.resolveSession();
    if (!session.user) {
      showGate("welcome");
      return;
    }
    showCabinet();
    loadCabinet(session.user);
  }

  function savePetFromForm(ev) {
    ev.preventDefault();
    var form = ev.target;
    var st = GBStore.get();
    var pet = GBStore.activePet() || { id: "pet_" + Date.now() };
    var next = {
      id: pet.id,
      name: String(form.name.value || "").trim(),
      breed: String(form.breed.value || "").trim(),
      weightKg: Number(form.weightKg.value) || 0,
      ageYears: Number(form.ageYears.value) || 0,
      allergies: String(form.allergies.value || "").trim(),
      notes: String(form.notes.value || "").trim(),
      sex: pet.sex || ""
    };
    if (!next.name) {
      GBUI.toast("Укажите кличку");
      return;
    }

    GBApi.get({
      action: "gbSavePet",
      telegramId: (st.user && st.user.telegramId) || "",
      petJson: JSON.stringify(next)
    }).then(function (res) {
      if (!res || res.status !== "success") {
        GBUI.toast((res && res.message) || "Не сохранилось");
        return;
      }
      var saved = res.pet || next;
      var pets = (st.pets || []).slice();
      var found = false;
      for (var i = 0; i < pets.length; i++) {
        if (pets[i].id === pet.id || pets[i].id === saved.id) {
          pets[i] = saved;
          found = true;
          break;
        }
      }
      if (!found) pets.push(saved);
      GBStore.set({ pets: pets, activePetId: saved.id });
      GBUI.render();
      var details = document.getElementById("petEditDetails");
      if (details) details.open = false;
      GBUI.toast("Питомец сохранён");
    });
  }

  function linkByPhone(ev) {
    ev.preventDefault();
    var phone = String((document.getElementById("linkPhone") || {}).value || "").trim();
    var nick = String((document.getElementById("linkNick") || {}).value || "").trim();
    if (!phone && !nick) {
      GBUI.toast("Укажите телефон или ник");
      return;
    }
    var st = GBStore.get();
    var btn = ev.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Ищем…";
    }
    GBApi.get({
      action: "gbLinkClient",
      telegramId: (st.user && st.user.telegramId) || "",
      phone: phone,
      nick: nick
    }).then(function (res) {
      if (!res || res.status !== "success") {
        GBUI.toast((res && res.message) || "Клиент не найден");
        return;
      }
      GBStore.set({
        link: res.link || null,
        subscription: res.subscription || st.subscription,
        privilege: res.privilege || st.privilege,
        user: Object.assign({}, st.user, { phone: phone || (st.user && st.user.phone) || "" })
      });
      GBUI.render();
      GBUI.toast(res.link && res.link.clientNick ? "Привязано: " + res.link.clientNick : "Привязка обновлена");
    }).finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = (GBStore.get().link && GBStore.get().link.status === "linked")
          ? "Обновить привязку" : "Найти и привязать";
      }
    });
  }

  function copyPrivilegeCode() {
    var st = GBStore.get();
    var pr = st.privilege || {};
    var code = pr.eligible && pr.code ? pr.code : "";
    if (!code) {
      GBUI.toast("Сначала привяжите подписку");
      return;
    }
    function ok() { GBUI.toast("Код скопирован"); }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(code).then(ok).catch(function () {
        GBUI.toast(code);
      });
    } else {
      GBUI.toast(code);
    }
  }

  function doLogout(opts) {
    opts = opts || {};
    GBAuth.logout();
    showGate(opts.view || "welcome");
    if (!opts.silent) GBUI.toast("Вы вышли");
  }

  function initGate() {
    var root = document.getElementById("gbAppShell") || document;

    root.addEventListener("click", function (e) {
      var pathBtn = e.target.closest("[data-gate-path]");
      if (pathBtn) {
        var path = pathBtn.getAttribute("data-gate-path");
        if (path === "pp") setGateView("login");
        else if (path === "register") setGateView("register");
        else if (path === "try") {
          global.location.href = "try.html";
          return;
        } else if (path === "city") {
          enterWithUser(GBAuth.guestUser("city"), { page: "map" });
        }
        return;
      }

      if (e.target.closest("[data-gate-back]")) {
        setGateView("welcome");
        return;
      }

      if (e.target.id === "enterTelegram" || e.target.closest("#enterTelegram")) {
        var tg = GBAuth.readTelegramUser();
        if (!tg) {
          GBUI.toast("Откройте кабинет из Telegram");
          return;
        }
        tg.hasSubscription = true;
        tg.access = "full";
        enterWithUser(tg, { page: "profile" });
      }
    });

    var loginForm = document.getElementById("gateLoginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("gateLoginError");
        var res = GBAuth.loginUser({
          phone: loginForm.phone.value,
          nick: loginForm.nick.value,
          intent: "pp"
        });
        if (!res.ok) {
          if (err) {
            err.hidden = false;
            err.textContent = res.message;
          }
          return;
        }
        enterWithUser(res.user, { page: "subscription", needsLink: !!res.needsLink });
        GBUI.toast("Вход выполнен");
      });
    }

    var registerForm = document.getElementById("gateRegisterForm");
    if (registerForm) {
      registerForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("gateRegisterError");
        var hasSubEl = registerForm.querySelector('input[name="hasSub"]:checked');
        if (!hasSubEl) {
          if (err) {
            err.hidden = false;
            err.textContent = "Укажите, есть ли у вас подписка";
          }
          return;
        }
        var hasSub = hasSubEl.value === "yes";
        var res = GBAuth.registerUser({
          name: registerForm.name.value,
          phone: registerForm.phone.value,
          nick: registerForm.nick.value,
          hasSubscription: hasSub
        });
        if (!res.ok) {
          if (err) {
            err.hidden = false;
            err.textContent = res.message;
          }
          return;
        }
        enterWithUser(res.user, {
          page: hasSub ? "subscription" : "profile",
          needsLink: hasSub
        });
        GBUI.toast(hasSub
          ? "Аккаунт создан — привяжите заказ"
          : "Аккаунт создан · доступ ограничен");
      });
    }
  }

  function initNavigation() {
    document.querySelectorAll(".cabinet-nav [data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        GBUI.setPage(btn.getAttribute("data-page"));
      });
    });
  }

  function initDelegatedActions() {
    var root = document.getElementById("gbAppShell") || document;
    root.addEventListener("click", function (e) {
      var filterBtn = e.target.closest("[data-map-filter]");
      if (filterBtn) {
        GBStore.set({ mapFilter: filterBtn.getAttribute("data-map-filter") });
        GBUI.render();
        return;
      }
      var placeBtn = e.target.closest("[data-place]");
      if (placeBtn) {
        GBStore.set({ mapPlaceId: placeBtn.getAttribute("data-place") });
        GBUI.render();
        return;
      }
      if (e.target.id === "copyPrivilege" || e.target.closest("#copyPrivilege")) {
        copyPrivilegeCode();
        return;
      }
      if (e.target.id === "gbLogout" || e.target.closest("#gbLogout")) {
        doLogout();
        return;
      }
      if (e.target.id === "lockGoLogin" || e.target.closest("#lockGoLogin")) {
        doLogout({ view: "login", silent: true });
      }
    });

    root.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "petForm") savePetFromForm(e);
      if (e.target && e.target.id === "linkForm") linkByPhone(e);
    });
  }

  function wire() {
    if (wired) return;
    wired = true;
    initGate();
    initNavigation();
    initDelegatedActions();
  }

  function start() {
    wire();
    var st = GBStore.get();
    if (!st.page) GBStore.set({ page: "profile" });
    bootstrap();
  }

  global.GBBoot = {
    start: start,
    bootstrap: bootstrap,
    showGate: showGate,
    logout: doLogout
  };
})(window);
