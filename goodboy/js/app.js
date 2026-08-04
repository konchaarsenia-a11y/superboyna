(function (global) {
  "use strict";

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
      bootError: ""
    });
    GBUI.render();
  }

  function bootstrap() {
    var session = GBAuth.resolveSession();
    if (!session.user) {
      document.getElementById("gate").style.display = "";
      document.getElementById("cabinet").style.display = "none";
      return;
    }
    document.getElementById("gate").style.display = "none";
    document.getElementById("cabinet").style.display = "";

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
      GBUI.toast(res.link && res.link.clientNick ? "Привязано: " + res.link.clientNick : "Привязка обновлена");
      if (res.privilege && res.privilege.eligible) {
        setTimeout(function () { GBUI.toast("Скидка Варок открыта"); }, 500);
      }
    });
  }

  function onPartnerClick(ev) {
    var item = ev.target.closest("[data-partner]");
    if (!item) return;
    if (item.getAttribute("data-partner") === "varok") GBUI.setScreen("privilege");
  }

  function wire() {
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.addEventListener("click", function () {
        GBUI.setScreen(b.getAttribute("data-go"));
      });
    });
    var petForm = document.getElementById("petForm");
    if (petForm) petForm.addEventListener("submit", savePetFromForm);
    var linkForm = document.getElementById("linkForm");
    if (linkForm) linkForm.addEventListener("submit", linkByPhone);
    var plist = document.getElementById("partnersList");
    if (plist) plist.addEventListener("click", onPartnerClick);
    document.querySelectorAll("[data-go]").forEach(function (el) {
      if (el.closest(".nav")) return;
      el.addEventListener("click", function () {
        var s = el.getAttribute("data-go");
        if (s) GBUI.setScreen(s);
      });
    });
    var enterDemo = document.getElementById("enterDemo");
    if (enterDemo) {
      enterDemo.addEventListener("click", function () {
        GBStore.set({ user: GBAuth.demoUser(), demo: true });
        bootstrap();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    wire();
    GBUI.setScreen("home");
    GBUI.render();
    bootstrap();
  });
})(window);
