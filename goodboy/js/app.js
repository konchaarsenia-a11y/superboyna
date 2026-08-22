(function (global) {
  "use strict";

  var wired = false;

  function applyBootstrap(payload, session) {
    global.GBStore.set({
      demo: !!(payload && payload.demo) || ((global.GB_CONFIG && global.GB_CONFIG.mode) !== "live"),
      user: Object.assign({}, session.user, payload.user || {}),
      pets: payload.pets || [],
      activePetId: payload.activePetId || (payload.pets && payload.pets[0] && payload.pets[0].id) || null,
      subscription: payload.subscription || null,
      partners: payload.partners || [],
      privilege: payload.privilege || null,
      link: payload.link || null,
      bootError: "",
      page: "profile",
      mapFilter: "all",
      mapPlaceId: "p2"
    });
    GBUI.render();
  }

  function bootstrap() {
    var gate = document.getElementById("gate");
    var cabinet = document.getElementById("cabinet");
    var session = GBAuth.resolveSession();
    if (!session.user) {
      if (gate) gate.style.display = "";
      if (cabinet) cabinet.style.display = "none";
      return;
    }
    if (gate) gate.style.display = "none";
    if (cabinet) cabinet.style.display = "";

    GBApi.get({
      action: "gbMe",
      telegramId: session.user.telegramId || "",
      name: session.user.name || "",
      username: session.user.username || ""
    }).then(function (res) {
      if (!res || res.status !== "success") {
        throw new Error((res && res.message) || "gbMe failed");
      }
      applyBootstrap(res, session);
    }).catch(function (err) {
      GBStore.set({ bootError: String(err && err.message || err) });
      GBUI.toast("Не удалось загрузить кабинет");
    });
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
      if (res.privilege && res.privilege.eligible) {
        setTimeout(function () { GBUI.toast("Скидка VARKA открыта"); }, 500);
      }
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
    var code = pr.eligible && pr.code ? pr.code : "GB-DEMO";
    function ok() { GBUI.toast("Код скопирован"); }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(code).then(ok).catch(function () {
        GBUI.toast(code);
      });
    } else {
      GBUI.toast(code);
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
    var enterDemo = document.getElementById("enterDemo");
    if (enterDemo) {
      enterDemo.addEventListener("click", function () {
        GBStore.set({ user: GBAuth.demoUser(), demo: true });
        bootstrap();
      });
    }
    initNavigation();
    initDelegatedActions();
  }

  function start() {
    wire();
    GBUI.setPage("profile");
    GBUI.render();
    bootstrap();
  }

  global.GBBoot = { start: start, bootstrap: bootstrap };
})(window);
