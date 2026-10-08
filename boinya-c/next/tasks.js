/* Лист «Задачи»: те же разделы, что ☰ в старом приложении, и те же запросы. */
(function (root) {
  "use strict";

  var items = [];
  var filter = "all";
  var access = null;

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function L() { return root.BoinyaWeekLogic; }
  function esc(s) { return sh().esc(s); }

  function tid() {
    try {
      var u = api().telegramUser();
      return String((u && u.id) || localStorage.getItem("superboyna_tg_id") || "");
    } catch (e) { return ""; }
  }

  function allowed(sub) {
    if (!access) return false;
    if (access.role === "owner") return true;
    return ax().tabHas(access, "deferredScreen." + sub) || ax().tabHas(access, "deferredScreen");
  }

  function openItems() {
    return (items || []).filter(function (it) {
      return String((it && it.status) || "open").toLowerCase() === "open";
    });
  }

  function bucket(sub) {
    return openItems().filter(function (it) { return L().tasksSub(it) === sub; });
  }

  function filters() {
    var all = [
      { id: "all", label: "Все" },
      { id: "xfer", label: "Переносы" },
      { id: "buy", label: "Дозакуп" },
      { id: "orders", label: "Заказы" },
      { id: "pp", label: "ПП/БП" },
      { id: "remind", label: "Напоминания" }
    ];
    return all.filter(function (f) { return f.id === "all" || allowed(f.id); });
  }

  function visible() {
    if (filter === "all") {
      return openItems().filter(function (it) { return allowed(L().tasksSub(it)); });
    }
    return bucket(filter);
  }

  function row(it) {
    var sub = L().tasksSub(it);
    var subRu = { xfer: "Перенос", buy: "Дозакуп", orders: "Заказ", pp: "ПП/БП", remind: "Напоминание" }[sub] || sub;
    var title = it.title || it.client || it.mode || "Задача";
    var plWhen = it.payload && typeof it.payload === "object" ? it.payload : null;
    var when = it.remindAtMs || it.remindAt || (plWhen && (plWhen.remindAtMs || plWhen.remindAt)) || "";
    var whenLabel = sh().formatRemindWhen(when);
    return '<button type="button" class="b-li" data-act="task-open" data-id="' + esc(it.id) + '">' +
      '<span class="b-li__body"><span class="b-li__title">' + esc(title) + "</span>" +
      '<span class="b-li__sub">' + esc(subRu + (whenLabel ? ", " + whenLabel : "")) + "</span></span>" +
      '<span class="b-li__chev">Открыть</span></button>';
  }

  function paintSheet() {
    var chips = filters().map(function (f) {
      var n = f.id === "all" ? visible().length : bucket(f.id).length;
      var on = filter === f.id ? " b-chip--on" : "";
      var hot = n > 0 ? " b-chip--hot" : "";
      var badge = n > 0 ? '<span class="nx-hot">' + n + "</span>" : "";
      return '<button type="button" class="b-chip' + on + hot + '" data-act="task-filter" data-f="' + f.id + '">' + esc(f.label) + badge + "</button>";
    }).join("");
    var list = visible();
    var body = list.length
      ? '<div class="b-list">' + list.map(row).join("") + "</div>"
      : '<p class="b-note">Открытых задач в этом фильтре нет.</p>';
    var add = allowed("remind")
      ? '<button type="button" class="b-btn b-btn--sec" data-act="task-add" style="margin-bottom:12px">+ Напоминалка</button>'
      : "";
    sh().replaceTop({
      title: "Задачи · " + list.length,
      html: add + '<div class="b-row" style="margin-bottom:12px">' + chips + "</div>" + body +
        '<p class="b-note">Тап по строке — действия. Фильтры видны по правам в Доступах.</p>'
    });
  }

  async function refresh() {
    var res = await api().apiGet({
      action: "listDeferred",
      telegramId: tid(),
      status: "open",
      light: "1"
    }, { timeoutMs: 12000, cacheTtlMs: 8000 });
    items = (res && res.items) || [];
    if (root.__nxTasksCount) root.__nxTasksCount(items.filter(function (it) {
      return String((it.status || "open")).toLowerCase() === "open" && allowed(L().tasksSub(it));
    }).length);
  }

  function bind(acc) { access = acc; }

  async function open(acc) {
    access = acc;
    filter = "all";
    sh().openSheet({ title: "Задачи", html: sh().skeleton(3) });
    try { await refresh(); } catch (e) { items = []; }
    paintSheet();
  }

  function taskText(it) {
    var pl = it && it.payload;
    if (typeof pl === "string") {
      try { pl = JSON.parse(pl); } catch (ePl) { pl = {}; }
    }
    if (!pl || typeof pl !== "object") pl = {};
    return pl.text || pl.note || (it && (it.note || it.client)) || "";
  }

  async function actions(id) {
    var it = null;
    for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) it = items[i];
    if (!it) return;
    var sub = L().tasksSub(it);
    var pl = it.payload || {};
    if (typeof pl === "string") {
      try { pl = JSON.parse(pl); } catch (ePl) { pl = {}; }
    }
    var buttons = "";
    var mode = L().deferredMode(it);
    if (sub === "xfer") {
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-day" data-id="' + esc(id) + '">Открыть день</button>';
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-move" data-id="' + esc(id) + '" style="margin-top:8px">Перенести</button>';
    }
    if (mode === "partner") {
      var st = String(pl.orderStatus || "new").toLowerCase();
      var needSlot = !!(pl.needsSlot || !String(pl.deliverDateIso || "").trim());
      var po = esc(pl.partnerOrderId || "");
      if (needSlot) {
        buttons += '<button class="b-btn b-btn--main" type="button" data-act="task-slot" data-id="' + esc(id) + '" data-po="' + po + '">Назначить дату</button>';
      } else {
        if (st !== "in_transit" && st !== "delivered") {
          buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-transit" data-id="' + esc(id) + '" data-po="' + po + '">В пути</button>';
        }
        if (st !== "delivered") {
          buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-delivered" data-id="' + esc(id) + '" data-po="' + po + '" style="margin-top:8px">Доставлено</button>';
        }
      }
    } else if (sub === "orders") {
      buttons += '<button class="b-btn b-btn--main" type="button" data-act="task-resume" data-id="' + esc(id) + '">Открыть</button>';
    }
    if (sub === "remind" && /Предложить (продление|переход)/.test(String(it.title || ""))) {
      var bpNick = it.clientNick || it.nick || it.client || (pl && pl.client) || "";
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-bp" data-nick="' + esc(bpNick) + '">Открыть БП</button>';
    }
    if (mode === "bp_idle" || String(id).indexOf("bpidle:") === 0) {
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-bp" data-nick="' + esc(it.nick || it.client || "") + '">Открыть БП</button>';
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-hide-idle" data-id="' + esc(id) + '" style="margin-top:8px">Скрыть</button>';
    } else if (sub === "pp") {
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-edit-pp" data-id="' + esc(id) + '">Править</button>';
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-enroll" data-id="' + esc(id) + '" style="margin-top:8px">Внести</button>';
    }
    if (sub === "buy") {
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-buy" data-id="' + esc(id) + '">Собрать сообщение дозакупа</button>';
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-buy-refresh" style="margin-top:8px">Обновить дефицит</button>';
    }
    var note = taskText(it);
    if (sub === "remind") {
      var whenLabel = sh().formatRemindWhen(it.remindAtMs || it.remindAt || (pl && (pl.remindAtMs || pl.remindAt)) || "");
      if (whenLabel) note = whenLabel + (note ? "\n" + note : "");
    }
    var idle = mode === "bp_idle" || String(id).indexOf("bpidle:") === 0;
    if (!idle && mode !== "partner" && (sub === "orders" || sub === "pp")) {
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-remind" data-id="' + esc(id) + '" style="margin-top:8px">Напомнить</button>';
    }
    if (!idle) {
      var cancelLabel = mode === "partner" ? "Скрыть" : (sub === "remind" ? "Готово" : ((sub === "xfer" || sub === "buy") ? "Закрыть" : "Отменить"));
      buttons += '<button class="b-btn b-btn--sec" type="button" data-act="task-cancel" data-id="' + esc(id) + '" style="margin-top:8px">' + cancelLabel + "</button>";
    }
    sh().openSheet({
      title: it.title || "Задача",
      html: '<p class="b-note" style="margin-top:0;white-space:pre-wrap">' + esc(note) + "</p>" + buttons
    });
  }

  async function cancel(id) {
    var ok = await sh().confirm({ title: "Убрать из задач", text: "Убрать из задач?", ok: "Убрать", cancel: "Отмена" });
    if (!ok) return;
    var res = await api().apiGet({ action: "cancelDeferred", telegramId: tid(), id: id, _: String(Date.now()) }, { timeoutMs: 20000, cacheTtlMs: 0 });
    sh().toast(L().peopleToast(res, "убрано"));
    await refresh();
    sh().closeTop("ok");
    paintSheet();
  }

  async function remind(id) {
    var when = await sh().pickRemindAt({
      title: "Когда напомнить?",
      text: "Время по часам телефона.",
      options: [
        { value: "1h", label: "Через 1 час" },
        { value: "3h", label: "Через 3 часа" },
        { value: "tomorrow10", label: "Завтра в 10:00" }
      ]
    });
    if (!when || when.none) return;
    var res = await api().apiPost({
      action: "setDeferredReminder",
      telegramId: tid(),
      id: id,
      remindAt: when.toISOString(),
      remindAtMs: String(when.getTime())
    });
    sh().toast(L().peopleToast(res, "напоминание"));
  }

  async function addRemind() {
    var text = await sh().prompt({ title: "Напоминалка", text: "О чём напомнить?", ok: "Дальше" });
    if (text == null || !String(text).trim()) return;
    var when = await sh().pickRemindAt({
      title: "Когда напомнить?",
      text: "Время по часам телефона.",
      options: [
        { value: "1h", label: "Через 1 час" },
        { value: "3h", label: "Через 3 часа" },
        { value: "tomorrow10", label: "Завтра 10:00" }
      ]
    });
    if (!when || when.none) return;
    var id = "def_" + Date.now().toString(36);
    var res = await api().apiPost({
      action: "saveDeferred",
      telegramId: tid(),
      id: id,
      mode: "remind",
      title: String(text).trim(),
      status: "open",
      remindAt: when.toISOString(),
      remindAtMs: String(when.getTime()),
      payload: JSON.stringify({ mode: "remind", title: String(text).trim(), remindAt: when.toISOString() })
    });
    sh().toast(L().peopleToast(res, "напоминание"));
    await refresh();
    paintSheet();
  }

  async function buyMessage() {
    sh().toast("Собираю сообщение…");
    var today = new Date().toISOString().slice(0, 10);
    var res = await api().apiGet({ action: "composeWarehouseBuyMessage", force: "1", asOf: today, _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
    var text = res && res.text ? String(res.text) : "";
    if (!text) { sh().toast("Пусто"); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    } catch (e) {}
    sh().alert({ title: "Дозакуп", text: text.slice(0, 700) });
  }

  function onAct(act, node) {
    if (act === "task-filter") { filter = node.getAttribute("data-f"); paintSheet(); return true; }
    if (act === "task-open") { actions(node.getAttribute("data-id")); return true; }
    if (act === "task-cancel") { cancel(node.getAttribute("data-id")); return true; }
    if (act === "task-remind") { remind(node.getAttribute("data-id")); return true; }
    if (act === "task-add") { addRemind(); return true; }
    if (act === "task-resume") {
      var id = node.getAttribute("data-id");
      var it = null;
      for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) it = items[i];
      sh().closeAll();
      if (it && root.BoinyaOrders && root.BoinyaOrders.loadDeferred) {
        root.BoinyaOrders.loadDeferred(it.payload || {}, id);
        if (root.__nxOpenNew) root.__nxOpenNew();
      }
      return true;
    }
    if (act === "task-day") {
      var dayId = node.getAttribute("data-id");
      var dayIt = null;
      for (var di = 0; di < items.length; di++) if (String(items[di].id) === String(dayId)) dayIt = items[di];
      var dayName = dayIt && (dayIt.placedDay || (dayIt.payload && (dayIt.payload.placedDay || dayIt.payload.day))) || "";
      sh().closeAll();
      if (root.__nxOpenWeek) root.__nxOpenWeek(dayName);
      return true;
    }
    if (act === "task-transit" || act === "task-delivered") {
      partnerStatus(node.getAttribute("data-id"), node.getAttribute("data-po"), act === "task-delivered" ? "delivered" : "in_transit");
      return true;
    }
    if (act === "task-hide-idle") {
      var hideId = String(node.getAttribute("data-id") || "");
      items = items.filter(function (it) { return String(it.id) !== hideId; });
      sh().closeTop("ok");
      paintSheet();
      if (root.__nxTasksCount) root.__nxTasksCount(items.filter(function (it) {
        return String((it.status || "open")).toLowerCase() === "open" && allowed(L().tasksSub(it));
      }).length);
      return true;
    }
    if (act === "task-buy") { buyMessage(); return true; }
    if (act === "task-buy-refresh") {
      api().apiGet({ action: "warehousePreview", _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 }).then(function () {
        return refresh();
      }).then(paintSheet);
      return true;
    }
    if (act === "task-move") { moveTransfer(node.getAttribute("data-id")); return true; }
    if (act === "task-slot") { assignSlot(node.getAttribute("data-id"), node.getAttribute("data-po")); return true; }
    if (act === "task-enroll") { openEnroll(node.getAttribute("data-id")); return true; }
    if (act === "task-edit-pp") { openEdit(node.getAttribute("data-id")); return true; }
    if (act === "task-bp") {
      sh().closeAll();
      if (root.__nxOpenClients) root.__nxOpenClients("bp", node.getAttribute("data-nick") || "");
      return true;
    }
    return false;
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) return items[i];
    return null;
  }

  async function assignSlot(id, partnerOrderId) {
    var it = findItem(id);
    var picked = await sh().pickDate({
      title: "Дата",
      lead: (it && (it.title || it.client || it.clientNick)) || "Отложенный заказ",
      verb: "Назначить",
      loadMonth: function (key) {
        return api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 15000, cacheTtlMs: 20000 });
      }
    });
    if (picked == null) return;
    var dateIso = String(picked).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) { sh().toast("Выберите дату"); return; }
    if (root.BoinyaWeek && root.BoinyaWeek.confirmFullDay && !(await root.BoinyaWeek.confirmFullDay(dateIso))) return;
    var res = await api().apiGet({
      action: "partnerSetOrderSlot",
      telegramId: tid(),
      deferredId: id || "",
      partnerOrderId: partnerOrderId || "",
      id: partnerOrderId || id || "",
      deliverDateIso: dateIso,
      deliverTimeFrom: "19:00",
      deliverTimeTo: "22:00",
      _: String(Date.now())
    }, { timeoutMs: 25000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилась дата"); return; }
    sh().toast("Дата назначена · партнёру ушло уведомление");
    await refresh();
    sh().closeTop("ok");
    paintSheet();
  }

  function openEnroll(id) {
    var it = findItem(id);
    if (!it) return;
    sh().closeAll();
    if (root.BoinyaClients) root.BoinyaClients.armEnroll(it);
    if (root.__nxOpenClients) root.__nxOpenClients("calc");
  }

  function openEdit(id) {
    var it = findItem(id);
    if (!it || !it.payload) { sh().toast("Нет данных"); return; }
    sh().closeAll();
    if (root.BoinyaClients) root.BoinyaClients.armEdit(it);
    if (root.__nxOpenClients) root.__nxOpenClients("calc");
    sh().toast("Открыто в Расчёте — после правок снова «В отложенное»");
  }

  async function partnerStatus(id, partnerOrderId, status) {
    var res = await api().apiGet({
      action: "partnerSetOrderStatus",
      telegramId: tid(),
      deferredId: id || "",
      partnerOrderId: partnerOrderId || "",
      id: partnerOrderId || id || "",
      orderStatus: status,
      status: status,
      _: String(Date.now())
    }, { timeoutMs: 25000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") {
      sh().toast((res && res.message) || "Не обновилось");
      return;
    }
    sh().toast(status === "delivered" ? "Доставлено · партнёру ушло" : "В пути · партнёру ушло");
    await refresh();
    sh().closeTop("ok");
    paintSheet();
  }

  async function moveTransfer(id) {
    var it = null;
    for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) it = items[i];
    sh().toast("Загрузка переноса…");
    var res = await api().apiGet({
      action: "getTransferTask",
      telegramId: tid(),
      id: id,
      client: (it && (it.clientNick || (it.payload && it.payload.client))) || "",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success" || !res.item) {
      sh().toast("Задача не найдена");
      return;
    }
    var task = res.item;
    var p = task.payload || {};
    var go = await sh().confirm({
      title: "Перенос · " + (task.clientNick || p.client || ""),
      text: "Тип: " + (p.segment || "—") + "\nБыл день: " + (p.day || p.date || "—") + "\nПричина: " + (p.reason || "—"),
      ok: "Перенести на другой день",
      cancel: "Позже"
    });
    if (!go) return;
    var picked = await sh().pickDate({
      title: "Дата",
      lead: task.clientNick || p.client || "Перенос",
      value: p.dateIso || p.date || "",
      verb: "Перенести",
      loadMonth: function (key) {
        return api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 15000, cacheTtlMs: 20000 });
      }
    });
    if (!picked) return;
    var target = await api().apiGet({ action: "resolveDayForDate", date: picked }, { timeoutMs: 15000, cacheTtlMs: 0 });
    var newDate = (target && (target.newDate || target.date)) || picked;
    var newDay = (target && (target.dayName || target.day)) || "";
    if (!newDate) { sh().toast("Не удалось определить дату"); return; }
    if (root.BoinyaWeek && root.BoinyaWeek.confirmFullDay && !(await root.BoinyaWeek.confirmFullDay(newDate))) return;
    var cut = await sh().confirm({
      title: "Перенос клиента",
      text: "Нарезать сырьё на этого клиента в новом дне вместе со всеми?",
      ok: "Да, резать",
      alt: "Нет — только перенос",
      cancel: "Отмена"
    });
    if (!cut) return;
    var placed = await api().apiGet(L().placeTransferParams({
      telegramId: tid(),
      id: id,
      client: task.clientNick || p.client || "",
      matchKey: p.matchKey || "",
      address: p.address || "",
      phone: p.phone || "",
      note: p.note || "",
      segment: p.segment || "",
      newDate: newDate,
      newDay: newDay,
      cutRaw: cut === "alt" ? "no" : "yes"
    }), { timeoutMs: 35000, cacheTtlMs: 0 });
    sh().toast(L().peopleToast(placed, "перенесено"));
    if (L().writeAccepted(placed)) {
      if (root.BoinyaWeek && root.BoinyaWeek.noteMonth) {
        root.BoinyaWeek.noteMonth({
          op: "move",
          date: newDate,
          oldDate: p.dateIso || p.date || "",
          client: {
            name: task.clientNick || p.client || "",
            matchKey: p.matchKey || "",
            address: p.address || "",
            phone: p.phone || "",
            note: p.note || "",
            segment: p.segment || ""
          }
        });
      }
      await refresh();
      sh().closeAll();
    }
  }

  root.BoinyaTasks = { open: open, onAct: onAct, refresh: refresh, bind: bind };
})(window);
