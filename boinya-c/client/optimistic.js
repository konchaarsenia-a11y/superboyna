/**
 * Optimistic слой: UI сразу ← IDB, сеть в outbox.
 */
(function () {
  "use strict";

  var flushing = false;

  async function applyLocalSave(payload) {
    var day = String(payload.day || "Понедельник");
    var block = (await window.BoinyaCIdb.getDay(day)) || { day: day, clients: [], date: "" };
    var clients = (block.clients || []).slice();
    var mk = String(payload.matchKey || payload.client || "")
      .trim()
      .toLowerCase();
    var idx = -1;
    for (var i = 0; i < clients.length; i++) {
      var c = clients[i];
      var cm = String(c.matchKey || c.name || "")
        .trim()
        .toLowerCase();
      if (cm === mk) {
        idx = i;
        break;
      }
    }
    var row = {
      name: payload.client,
      matchKey: mk,
      address: payload.address || "",
      note: payload.note || "",
      segment: payload.segment || "",
      basket: payload.basket || [],
      updatedAt: new Date().toISOString(),
      pending: true
    };
    if (idx >= 0) clients[idx] = Object.assign({}, clients[idx], row);
    else clients.push(row);
    await window.BoinyaCIdb.putDay(day, {
      date: block.date || payload.date || "",
      clients: clients,
      source: "optimistic"
    });
    await window.BoinyaCIdb.enqueue({
      type: "saveOrder",
      payload: payload
    });
    return { status: "success", optimistic: true, day: day, clients: clients };
  }

  async function applyLocalDelete(payload) {
    var day = String(payload.day || "");
    var mk = String(payload.matchKey || payload.client || "")
      .trim()
      .toLowerCase();
    var block = (await window.BoinyaCIdb.getDay(day)) || { clients: [] };
    var clients = (block.clients || []).filter(function (c) {
      var cm = String(c.matchKey || c.name || "")
        .trim()
        .toLowerCase();
      return cm !== mk;
    });
    await window.BoinyaCIdb.putDay(day, {
      date: block.date || "",
      clients: clients,
      source: "optimistic"
    });
    await window.BoinyaCIdb.enqueue({ type: "deleteClient", payload: payload });
    return { status: "success", optimistic: true, day: day, clients: clients };
  }

  async function flushOutbox() {
    if (flushing) return { busy: true };
    flushing = true;
    var report = { sent: 0, failed: 0 };
    try {
      var items = await window.BoinyaCIdb.listOutbox("pending");
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        try {
          var res;
          if (item.type === "saveOrder") res = await window.BoinyaCApi.saveOrder(item.payload);
          else if (item.type === "deleteClient") res = await window.BoinyaCApi.deleteClient(item.payload);
          else res = { status: "skip" };
          if (res && res.status === "success") {
            await window.BoinyaCIdb.markOutbox(item.id, {
              status: "done",
              doneAt: new Date().toISOString()
            });
            report.sent++;
          } else {
            await window.BoinyaCIdb.markOutbox(item.id, {
              tries: (item.tries || 0) + 1,
              lastError: "bad_status"
            });
            report.failed++;
          }
        } catch (e) {
          await window.BoinyaCIdb.markOutbox(item.id, {
            tries: (item.tries || 0) + 1,
            lastError: String(e)
          });
          report.failed++;
        }
      }
    } finally {
      flushing = false;
    }
    return report;
  }

  window.BoinyaCOpt = {
    saveOrder: applyLocalSave,
    deleteClient: applyLocalDelete,
    flush: flushOutbox
  };
})();
