/**
 * API песочницы: Worker если задан proxy, иначе локальный fake из IDB/seed.
 * В прод GAS не ходим.
 */
(function () {
  "use strict";

  function cfg() {
    return window.__BOINYA_C__ || {};
  }

  async function callProxy(action, params) {
    var base = cfg().proxy;
    if (!base) return null;
    var url = new URL(base.replace(/\/?$/, "/"));
    url.searchParams.set("action", action);
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] == null || k === "action") return;
      var v = params[k];
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    });
    var res = await fetch(url.toString(), { credentials: "omit" });
    if (!res.ok) throw new Error("proxy http " + res.status);
    return res.json();
  }

  window.BoinyaCApi = {
    async getClients(day) {
      try {
        var remote = await callProxy("getClients", { day: day });
        if (remote && remote.status === "success") return remote;
      } catch (e) {}
      var local = await window.BoinyaCIdb.getDay(day);
      return {
        status: "success",
        sandbox: true,
        day: day,
        source: local ? local.source || "idb" : "empty",
        clients: (local && local.clients) || []
      };
    },

    async saveOrder(payload) {
      try {
        var remote = await callProxy("saveOrder", payload);
        if (remote && remote.status === "success") return remote;
      } catch (e) {}
      return {
        status: "success",
        sandbox: true,
        wrote: "local-only",
        updatedAt: new Date().toISOString()
      };
    },

    async deleteClient(payload) {
      try {
        var remote = await callProxy("deleteClient", payload);
        if (remote && remote.status === "success") return remote;
      } catch (e) {}
      return { status: "success", sandbox: true, wrote: "local-only" };
    },

    async loadSeedIntoIdb() {
      var url = cfg().seedUrl;
      var res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("seed http " + res.status);
      var seed = await res.json();
      var days = seed.days || {};
      var names = Object.keys(days);
      for (var i = 0; i < names.length; i++) {
        var d = names[i];
        var block = days[d];
        await window.BoinyaCIdb.putDay(d, {
          date: block.date || "",
          clients: block.clients || [],
          source: "seed"
        });
      }
      await window.BoinyaCIdb.setMeta("weekKey", seed.weekKey || "");
      await window.BoinyaCIdb.setMeta("seededAt", new Date().toISOString());
      return { ok: true, days: names.length };
    }
  };
})();
