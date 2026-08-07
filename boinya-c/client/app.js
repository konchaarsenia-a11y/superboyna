(function () {
  "use strict";

  var dayEl = document.getElementById("day");
  var listEl = document.getElementById("list");
  var statusEl = document.getElementById("status");
  var outboxEl = document.getElementById("outbox");
  var nameEl = document.getElementById("fName");
  var addrEl = document.getElementById("fAddr");
  var noteEl = document.getElementById("fNote");

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function renderClients(clients) {
    listEl.innerHTML = "";
    if (!clients || !clients.length) {
      listEl.innerHTML = '<div class="row"><p>Пусто на этот день (в песочнице).</p></div>';
      return;
    }
    clients.forEach(function (c) {
      var div = document.createElement("div");
      div.className = "row";
      var basket = Array.isArray(c.basket) ? c.basket : [];
      var basketTxt = basket
        .map(function (b) {
          return (b.name || "") + (b.sub ? " / " + b.sub : "") + " " + (b.val || b.value || "");
        })
        .join(" · ");
      div.innerHTML =
        "<h3></h3><p class='addr'></p><p class='basket'></p>" +
        (c.pending ? "<div class='meta'>ожидает sync…</div>" : "") +
        "<div class='bar'><button type='button' class='danger del'>Удалить локально</button></div>";
      div.querySelector("h3").textContent = c.name + (c.segment ? " · " + c.segment : "");
      div.querySelector(".addr").textContent = c.address || "без адреса";
      div.querySelector(".basket").textContent = basketTxt || "состав пуст";
      div.querySelector(".del").addEventListener("click", function () {
        removeClient(c);
      });
      listEl.appendChild(div);
    });
  }

  async function refreshOutbox() {
    var pending = await window.BoinyaCIdb.listOutbox("pending");
    outboxEl.textContent = "outbox: " + pending.length + " pending";
  }

  async function loadDay() {
    var day = dayEl.value;
    setStatus("чтение IDB…");
    var t0 = performance.now();
    var res = await window.BoinyaCApi.getClients(day);
    renderClients(res.clients || []);
    var ms = Math.round(performance.now() - t0);
    setStatus("день «" + day + "» · " + (res.source || "?") + " · " + ms + " мс", "ok");
    await refreshOutbox();
  }

  async function removeClient(c) {
    var day = dayEl.value;
    var res = await window.BoinyaCOpt.deleteClient({
      day: day,
      client: c.name,
      matchKey: c.matchKey || c.name
    });
    renderClients(res.clients || []);
    setStatus("удалено локально (optimistic)", "warn");
    await refreshOutbox();
    window.BoinyaCOpt.flush().then(refreshOutbox);
  }

  async function saveDemo() {
    var day = dayEl.value;
    var name = String(nameEl.value || "").trim() || "zzz_test_c";
    var payload = {
      day: day,
      client: name,
      matchKey: name.toLowerCase(),
      address: addrEl.value || "",
      note: noteEl.value || "",
      segment: "Р",
      basket: [{ cat: "demo", name: "ЛЁГКОЕ", sub: "Среднее", val: 100 }]
    };
    var t0 = performance.now();
    var res = await window.BoinyaCOpt.saveOrder(payload);
    renderClients(res.clients || []);
    setStatus("сохранено в IDB за " + Math.round(performance.now() - t0) + " мс (optimistic)", "ok");
    await refreshOutbox();
    window.BoinyaCOpt.flush().then(refreshOutbox);
  }

  async function boot() {
    setStatus("старт песочницы…");
    var seeded = await window.BoinyaCIdb.getMeta("seededAt");
    if (!seeded) {
      await window.BoinyaCApi.loadSeedIntoIdb();
      setStatus("seed загружен в IndexedDB", "ok");
    }
    var proxy = (window.__BOINYA_C__ && window.__BOINYA_C__.proxy) || "";
    document.getElementById("proxyHint").textContent = proxy
      ? "Worker: " + proxy
      : "Worker не задан — только IDB/seed (это ок для фазы 0)";
    await loadDay();
    setInterval(function () {
      window.BoinyaCOpt.flush().then(refreshOutbox).catch(function () {});
    }, 4000);
  }

  document.getElementById("btnReload").addEventListener("click", loadDay);
  document.getElementById("btnSeed").addEventListener("click", async function () {
    await window.BoinyaCApi.loadSeedIntoIdb();
    await loadDay();
    setStatus("seed перезалит", "ok");
  });
  document.getElementById("btnFlush").addEventListener("click", async function () {
    var r = await window.BoinyaCOpt.flush();
    setStatus("flush: sent " + r.sent + ", failed " + r.failed, r.failed ? "warn" : "ok");
    await refreshOutbox();
  });
  document.getElementById("btnClear").addEventListener("click", async function () {
    await window.BoinyaCIdb.clearAll();
    await window.BoinyaCApi.loadSeedIntoIdb();
    await loadDay();
    setStatus("IDB сброшен + seed", "warn");
  });
  document.getElementById("btnSave").addEventListener("click", saveDemo);
  dayEl.addEventListener("change", loadDay);

  boot().catch(function (e) {
    setStatus(String(e), "warn");
  });
})();
