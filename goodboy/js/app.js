(function (global) {
  "use strict";

  var wired = false;

  function reduced() {
    try {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

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
      tab: 0
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
      GBUI.closeOverlay("petOverlay");
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
      GBUI.closeOverlay("linkOverlay");
      GBUI.toast(res.link && res.link.clientNick ? "Привязано: " + res.link.clientNick : "Привязка обновлена");
      if (res.privilege && res.privilege.eligible) {
        setTimeout(function () { GBUI.toast("Скидка VARKA открыта"); }, 500);
      }
    });
  }

  function initCabinetTabs() {
    var screen = document.getElementById("cabinetScreen");
    var slides = document.querySelectorAll(".cabinet-slides .phone-slide");
    var tabs = document.querySelectorAll(".cabinet-tabs [data-tab]");
    if (!slides.length) return;

    var i = Number((GBStore.get() || {}).tab) || 0;

    function show(n) {
      GBUI.setTab(n);
      i = Number((GBStore.get() || {}).tab) || 0;
    }

    function next() { show(i + 1); }
    function prev() { show(i - 1); }

    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.preventDefault();
        show(Number(t.getAttribute("data-tab")) || 0);
      });
    });

    if (screen) {
      var startX = 0;
      var startY = 0;
      var tracking = false;

      screen.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".cabinet-overlay, .cabinet-overlay-card, button.ps-pet--btn, button.ps-card--btn")) return;
        tracking = true;
        startX = e.clientX;
        startY = e.clientY;
        try { screen.setPointerCapture(e.pointerId); } catch (err) {}
      });

      screen.addEventListener("pointerup", function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) next();
        else prev();
      });

      screen.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      });
    }

    show(i);
  }

  function initOverlays() {
    document.addEventListener("click", function (e) {
      if (e.target.id === "openPetEdit" || e.target.closest("#openPetEdit")) {
        GBUI.openOverlay("petOverlay");
      }
      if (e.target.id === "openLinkForm" || e.target.closest("#openLinkForm")) {
        GBUI.openOverlay("linkOverlay");
      }
      if (e.target.id === "petOverlayClose") GBUI.closeOverlay("petOverlay");
      if (e.target.id === "linkOverlayClose") GBUI.closeOverlay("linkOverlay");
      if (e.target.classList && e.target.classList.contains("cabinet-overlay") && !e.target.hidden) {
        e.target.hidden = true;
      }
    });
  }

  function wire() {
    if (wired) return;
    wired = true;
    var petForm = document.getElementById("petForm");
    if (petForm) petForm.addEventListener("submit", savePetFromForm);
    var linkForm = document.getElementById("linkForm");
    if (linkForm) linkForm.addEventListener("submit", linkByPhone);
    var enterDemo = document.getElementById("enterDemo");
    if (enterDemo) {
      enterDemo.addEventListener("click", function () {
        GBStore.set({ user: GBAuth.demoUser(), demo: true });
        bootstrap();
      });
    }
    initOverlays();
    initCabinetTabs();
  }

  function start() {
    wire();
    GBUI.setTab(0);
    GBUI.render();
    bootstrap();
  }

  global.GBBoot = { start: start, bootstrap: bootstrap };
})(window);
