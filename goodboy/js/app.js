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
    if (opts.bootstrap && opts.bootstrap.status === "success") {
      applyBootstrap(opts.bootstrap, { user: user });
      showCabinet();
      if (opts.needsLink && (user.phone || user.username) && !(opts.bootstrap.link && opts.bootstrap.link.status === "linked" && opts.bootstrap.link.segment)) {
        GBApi.postJson(cabinetAuth({
          action: "gbCabinetLink",
          phone: user.phone || "",
          nick: user.username || ""
        })).then(function (linkRes) {
          if (linkRes && linkRes.status === "success") applyCabinet(linkRes);
          else if (linkRes && linkRes.message) GBUI.toast(linkRes.message);
        });
      }
      return;
    }
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
      refreshCabinet();
      if (opts.needsLink && (user.phone || user.username)) {
        return GBApi.postJson(cabinetAuth({
          action: "gbCabinetLink",
          phone: user.phone || "",
          nick: user.username || ""
        })).then(function (linkRes) {
          if (linkRes && linkRes.status === "success") {
            applyCabinet(linkRes);
            GBUI.toast(linkRes.link && linkRes.link.clientNick
              ? "Подписка: " + linkRes.link.clientNick
              : "Вход выполнен");
          } else if (linkRes && linkRes.message) GBUI.toast(linkRes.message);
        });
      }
    }).catch(function (err) {
      GBStore.set({ bootError: String(err && err.message || err) });
      GBUI.toast("Не удалось загрузить кабинет");
    });
  }

  function draftTid() {
    var st = GBStore.get();
    if (st.user && st.user.telegramId) return String(st.user.telegramId);
    return "web_" + Math.random().toString(36).slice(2, 10);
  }

  function readDogs(form) {
    var dogs = [];
    [1, 2].forEach(function (n) {
      var name = String((form.elements["dog" + n + "name"] || {}).value || "").trim();
      var breed = String((form.elements["dog" + n + "breed"] || {}).value || "").trim();
      var weight = String((form.elements["dog" + n + "weight"] || {}).value || "").trim();
      var allergies = String((form.elements["dog" + n + "allergies"] || {}).value || "").trim();
      if (!name && !breed && !weight && !allergies) return;
      dogs.push({ name: name, breed: breed, weight: weight, allergies: allergies });
    });
    return dogs;
  }

  function cabinetAuth(extra) {
    var body = Object.assign({}, extra || {});
    var init = rawInitData();
    if (init) body.initData = init;
    else {
      var st = GBStore.get();
      body.telegramId = (st.user && st.user.telegramId) || "";
    }
    return body;
  }

  function applyCabinet(res) {
    if (!res || (res.status !== "success" && res.status !== "warn")) return;
    var patch = { cabinet: res.status === "success" ? res : (GBStore.get().cabinet || null) };
    if (res.link) patch.link = res.link;
    if (res.dogs && res.dogs.length) {
      var pets = (GBStore.get().pets || []).slice();
      res.dogs.forEach(function (d, i) {
        if (!d || !d.name) return;
        if (pets[i]) pets[i] = Object.assign({}, pets[i], { name: d.name });
        else pets.push({ id: "dog_" + d.slot, name: d.name });
      });
      patch.pets = pets;
      if (!GBStore.get().activePetId && pets[0]) patch.activePetId = pets[0].id;
    }
    if (res.status === "warn") patch.stockWarn = res.message || "";
    else patch.stockWarn = "";
    GBStore.set(patch);
    GBUI.render();
  }

  function refreshCabinet() {
    return GBApi.postJson(cabinetAuth({ action: "gbCabinet" })).then(function (res) {
      if (res && res.status === "success") applyCabinet(res);
    }).catch(function () {});
  }

  function parseBasketLines(text) {
    return String(text || "").split(/\n/).map(function (line) {
      var raw = String(line || "").trim();
      if (!raw) return null;
      var m = raw.match(/^(.*?)(?:\s·\s|\s+)(\d+(?:[.,]\d+)?)\s*(г|гр|шт)?\s*$/i);
      if (!m) return { name: raw, grams: "", unit: "г" };
      return { name: m[1].trim(), grams: Number(String(m[2]).replace(",", ".")), unit: /шт/i.test(m[3] || "") ? "шт" : "г" };
    }).filter(Boolean);
  }

  function saveCabinetOrder(extra) {
    var basket = parseBasketLines((document.getElementById("orderBasket") || {}).value || "");
    var body = cabinetAuth(Object.assign({
      action: "gbCabinetSave",
      orderId: (document.getElementById("orderId") || {}).value || "",
      newDate: (document.getElementById("orderDate") || {}).value || "",
      basketJson: JSON.stringify(basket),
      confirmOnly: (document.getElementById("confirmOnly") || {}).checked ? "1" : "0"
    }, extra || {}));
    return GBApi.postJson(body).then(function (res) {
      if (res && res.status === "warn") {
        GBStore.set({ stockWarn: res.message || "" });
        GBUI.render();
        GBUI.toast(res.message || "Позиции сейчас нет");
        return;
      }
      if (!res || res.status !== "success") {
        GBUI.toast((res && res.message) || "Не сохранилось");
        return;
      }
      applyCabinet(res);
      GBUI.toast(res.message || (res.applied === false ? "менеджер свяжется с вами" : "Сохранено"));
    });
  }

  function rawInitData() {
    try {
      var tg = global.Telegram && global.Telegram.WebApp;
      return tg && tg.initData ? String(tg.initData) : "";
    } catch (e) {
      return "";
    }
  }

  function enterFromPayload(res) {
    if (!res || res.status !== "success" || !res.user) return false;
    var lead = String(res.user.access || "") === "lead";
    var user = GBAuth.userFromApi(res, { intent: lead ? "try" : "pp", access: lead ? "lead" : "" });
    if (lead) {
      user.access = "lead";
      user.intent = "try";
      user.isGuest = true;
      user.hasSubscription = false;
    }
    applyBootstrap(res, { user: user });
    showCabinet();
    return true;
  }

  function showBotLogin(res) {
    showGate("login");
    var err = document.getElementById("gateLoginError");
    var msg = res && res.message ? String(res.message) : "";
    if (err && msg) {
      err.hidden = false;
      err.textContent = msg;
    }
  }

  function bootstrapFromBot() {
    showCabinet();
    GBApi.postJson({
      action: "gbTelegramEnter",
      initData: rawInitData()
    }).then(function (res) {
      if (enterFromPayload(res)) {
      if (String(res.user.access || "") !== "lead") refreshCabinet();
      return;
    }
      showBotLogin(res);
    }).catch(function () {
      showBotLogin({ message: "Не удалось войти" });
    });
  }

  function bootstrap() {
    if (rawInitData()) {
      bootstrapFromBot();
      return;
    }
    var session = GBAuth.resolveSession();
    if (!session.user) {
      showGate("welcome");
      return;
    }
    if (session.user.access === "lead" || session.user.intent === "try") {
      GBStore.set({
        user: session.user,
        access: "lead",
        intent: "try",
        page: "profile",
        demo: false,
        subscription: null,
        link: null
      });
      showCabinet();
      if (global.GBUI) GBUI.render();
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
      GBUI.toast("Укажите ник или телефон");
      return;
    }
    var st = GBStore.get();
    var btn = ev.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Ищем…";
    }
    GBApi.postJson(cabinetAuth({
      action: "gbCabinetLink",
      phone: phone,
      nick: nick
    })).then(function (res) {
      if (!res || res.status !== "success") {
        GBUI.toast((res && res.message) || "Клиент не найден");
        return;
      }
      applyCabinet(res);
      GBStore.set({ user: Object.assign({}, st.user, { phone: phone || (st.user && st.user.phone) || "" }) });
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
    showGate(opts.view || (rawInitData() ? "login" : "welcome"));
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
        }
        return;
      }

      if (e.target.closest("[data-gate-back]")) {
        setGateView(rawInitData() ? "login" : "welcome");
        return;
      }

      if (e.target.id === "enterTelegram" || e.target.closest("#enterTelegram")) {
        if (rawInitData()) {
          bootstrapFromBot();
          return;
        }
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
        var btn = loginForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Входим…";
        }
        var loginCall = rawInitData()
          ? GBApi.postJson({
              action: "gbBindTelegram",
              initData: rawInitData(),
              phone: loginForm.phone.value,
              nick: loginForm.nick.value
            }).then(function (payload) {
              if (!payload || payload.status !== "success" || !payload.user) {
                return { ok: false, message: (payload && payload.message) || "Кабинет не найден" };
              }
              return { ok: true, user: GBAuth.userFromApi(payload, { intent: "pp" }), bootstrap: payload };
            })
          : (function () {
              var tid = draftTid();
              var body = cabinetAuth({
                action: "gbCabinetLink",
                phone: loginForm.phone.value,
                nick: loginForm.nick.value
              });
              body.telegramId = tid;
              return GBApi.postJson(body).then(function (payload) {
              if (!payload || payload.status !== "success") {
                return { ok: false, message: (payload && payload.message) || "Подписка не найдена" };
              }
              return {
                ok: true,
                user: {
                  telegramId: (payload.user && payload.user.telegramId) || tid,
                  name: (payload.user && payload.user.name) || payload.nick || "Подписчик",
                  username: String(loginForm.nick.value || "").replace(/^@/, ""),
                  phone: loginForm.phone.value,
                  access: "full",
                  hasSubscription: true,
                  intent: "pp"
                },
                cabinet: payload
              };
            });
            })();
        loginCall.catch(function () {
          return { ok: false, message: "Не удалось войти" };
        }).then(function (res) {
          if (!res.ok) {
            if (err) {
              err.hidden = false;
              err.textContent = res.message;
            }
            return;
          }
          enterWithUser(res.user, {
            page: "subscription",
            needsLink: !!res.needsLink,
            bootstrap: res.bootstrap || null
          });
          if (res.cabinet) applyCabinet(res.cabinet);
          else refreshCabinet();
          GBUI.toast("Вход выполнен");
        }).finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Войти";
          }
        });
      });
    }

    var registerForm = document.getElementById("gateRegisterForm");
    if (registerForm) {
      registerForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("gateRegisterError");
        var dogs = readDogs(registerForm);
        var dogOk = dogs.length > 0;
        for (var di = 0; di < dogs.length; di++) {
          if (!dogs[di].name || !dogs[di].breed || !dogs[di].weight) dogOk = false;
        }
        if (!String(registerForm.name.value || "").trim() || !String(registerForm.phone.value || "").trim() || !String(registerForm.nick.value || "").trim() || !dogOk) {
          if (err) {
            err.hidden = false;
            err.textContent = "Укажите имя, телефон, ник и собаку: кличка, порода, вес";
          }
          return;
        }
        var btn = registerForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Создаём…";
        }
        var registerBody = {
          action: "gbCabinetRegister",
          name: registerForm.name.value,
          phone: registerForm.phone.value,
          nick: registerForm.nick.value,
          dogsJson: JSON.stringify(dogs)
        };
        if (rawInitData()) registerBody.initData = rawInitData();
        else registerBody.telegramId = draftTid();
        GBApi.postJson(registerBody).catch(function () {
          return { status: "error", message: "Не удалось зарегистрироваться" };
        }).then(function (payload) {
          if (payload && payload.status === "accepted") {
            showGate("accepted");
            return;
          }
          if (!payload || payload.status !== "success") {
            if (err) {
              err.hidden = false;
              err.textContent = (payload && payload.message) || "Не удалось зарегистрироваться";
            }
            return;
          }
          var user = {
            telegramId: (payload.user && payload.user.telegramId) || registerBody.telegramId || "",
            name: registerForm.name.value,
            username: String(registerForm.nick.value || "").replace(/^@/, ""),
            phone: registerForm.phone.value,
            access: "full",
            hasSubscription: true,
            intent: "pp"
          };
          if (rawInitData()) {
            user = GBAuth.userFromApi({ user: payload.user || user }, { intent: "pp" });
          }
          enterWithUser(user, { page: "subscription" });
          applyCabinet(payload);
          GBUI.toast("Подписка найдена");
        }).finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Создать аккаунт";
          }
        });
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
        return;
      }
      if (e.target.id === "pauseSub" || e.target.closest("#pauseSub")) {
        GBApi.postJson(cabinetAuth({ action: "gbCabinetPause" })).then(function (res) {
          if (!res || res.status !== "success") {
            GBUI.toast((res && res.message) || "Пауза не записалась");
            return;
          }
          applyCabinet(res);
          GBUI.toast("Пауза записана");
        });
        return;
      }
      if (e.target.id === "keepMissing" || e.target.closest("#keepMissing")) {
        saveCabinetOrder({ keepMissing: "1" });
      }
    });

    root.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "petForm") savePetFromForm(e);
      if (e.target && e.target.id === "linkForm") linkByPhone(e);
      if (e.target && e.target.id === "orderForm") {
        e.preventDefault();
        saveCabinetOrder();
      }
      if (e.target && e.target.id === "addrForm") {
        e.preventDefault();
        GBApi.postJson(cabinetAuth({
          action: "gbCabinetSave",
          street: (document.getElementById("addrStreet") || {}).value || "",
          entrance: (document.getElementById("addrEntrance") || {}).value || "",
          doorCode: (document.getElementById("addrDoor") || {}).value || "",
          floor: (document.getElementById("addrFloor") || {}).value || "",
          flat: (document.getElementById("addrFlat") || {}).value || ""
        })).then(function (res) {
          if (!res || res.status !== "success") {
            GBUI.toast((res && res.message) || "Адрес не записался");
            return;
          }
          applyCabinet(res);
          GBUI.toast("Адрес сохранён");
        });
      }
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
