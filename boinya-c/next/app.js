/* Сборка next: вход, права, вкладки, заглушки. Форма заказа — orders.js. */
(function (root) {
  "use strict";

  var route = { tab: "orders", seg: "new" };
  var access = null;
  var tasksN = 0;
  var booting = false;

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function ord() { return root.BoinyaOrders; }

  function q() {
    return new URLSearchParams(location.search);
  }

  function oldHref() {
    return "app.html" + (location.search || "");
  }

  function stub(title, text) {
    return sh().empty({
      icon: "doc",
      title: title,
      text: text,
      action: '<a class="b-btn b-btn--sec" href="' + sh().esc(oldHref()) + '">Открыть в старой версии</a>'
    });
  }

  function segsHtml(items, act, current) {
    if (!items.length) return "";
    return '<div class="b-seg" style="margin-bottom:16px">' + items.map(function (s) {
      return '<button type="button" class="b-seg__item' + (s.id === current ? " b-seg__item--on" : "") + '" data-act="' + act + '" data-seg="' + s.id + '">' + sh().esc(s.label) + "</button>";
    }).join("") + "</div>";
  }

  function orderSegs() {
    return ax().orderSegs(access);
  }

  function prodSegs() {
    var list = [];
    if (ax().tabHas(access, "cuttingScreen")) list.push({ id: "cut", label: "Нарезка" });
    if (ax().tabHas(access, "courierScreen.assembly")) list.push({ id: "pack", label: "Сборка" });
    if (ax().tabHas(access, "courierScreen.route")) list.push({ id: "route", label: "Маршрут" });
    return list;
  }

  function ensureSeg() {
    if (route.tab === "orders") {
      var os = orderSegs();
      if (!os.some(function (s) { return s.id === route.seg; })) route.seg = (os[0] && os[0].id) || "new";
    } else if (route.tab === "production") {
      var ps = prodSegs();
      if (!ps.some(function (s) { return s.id === route.seg; })) route.seg = (ps[0] && ps[0].id) || "cut";
    } else if (route.tab === "warehouse") {
      if (["stock", "buy", "move"].indexOf(route.seg) < 0) route.seg = "stock";
    } else if (route.tab === "clients") {
      if (["pp", "afk", "bp", "survey"].indexOf(route.seg) < 0) route.seg = "pp";
    }
  }

  function headerSub() {
    if (q().get("shot") === "states") return "состояния экранов";
    if (route.tab === "orders" && route.seg === "new" && ax().tabHas(access, "orderScreen")) return ord().contextLine();
    if (route.tab === "more") {
      var who = access.name || "Бойня";
      var role = ax().ROLE_RU[access.role] || access.role;
      var mode = root.__boinyaCBadgeLabel || "";
      return [who, role, mode].filter(Boolean).join(" · ");
    }
    if (ax().isSimple(access)) return ax().ROLE_RU[access.role] || "";
    return "Этот раздел пока в старой версии";
  }

  function headerTitle() {
    if (q().get("shot") === "states") return "Состояния";
    if (ax().isSimple(access)) return ax().SIMPLE[access.role] || "Бойня";
    var map = { orders: "Заказы", clients: "Клиенты", production: "Производство", warehouse: "Склад", more: "Ещё", goals: "Цели" };
    if (route.tab === "orders" && route.seg === "new" && ord().getState().isEdit) return "Правка заказа";
    return map[route.tab] || "Бойня";
  }

  function paintChrome() {
    var nav = ax().isSimple(access) ? [] : ax().navItems(access);
    sh().chrome({
      title: headerTitle(),
      sub: headerSub(),
      bell: ax().canUseTasks(access),
      badge: tasksN,
      nav: nav,
      active: route.tab
    });
  }

  function paintStates() {
    paintChrome();
    sh().busy(true, 9);
    sh().dock("");
    sh().main(
      '<p class="b-lbl">Пусто</p>' +
      sh().empty({ icon: "doc", title: "Заказов нет", text: "На выбранный день список пуст.", action: '<button class="b-btn b-btn--sec" type="button" data-act="go-new">+ Новый заказ</button>' }) +
      '<p class="b-lbl">Загрузка</p>' + sh().skeleton(3) +
      '<p class="b-note">каркас вместо спиннера</p>' +
      '<p class="b-lbl">Ошибка</p>' +
      sh().errorBox({ title: "Не удалось загрузить склад", text: "Нет связи с сервером. Данные от 09:12 ниже.", act: "retry-demo" }) +
      '<p class="b-lbl">Кнопка-загрузка</p>' +
      '<button class="b-btn b-btn--main b-btn--loading" type="button" disabled><span class="b-spin"></span> Сохраняю…</button>' +
      '<p class="b-lbl">Лоадер</p>' +
      '<button class="b-btn b-btn--sec" type="button" data-act="show-loader">Показать лоадер-лист</button>' +
      '<p class="b-note" style="margin-top:8px">Полоса под шапкой — запрос дольше 8 с. Экран не блокируется. «Скрыть» у лоадера появляется через 4 с.</p>'
    );
  }

  function paintSimple() {
    paintChrome();
    sh().dock("");
    var title = ax().SIMPLE[access.role] || "Раздел";
    sh().main(stub(title, "Экран этой роли в новом приложении ещё не собран. Откройте старую версию — там всё как раньше."));
  }

  function paintStub(title, text) {
    paintChrome();
    sh().dock("");
    sh().main(stub(title, text));
  }

  function render() {
    if (!access) return;
    if (q().get("shot") === "states") { paintStates(); return; }
    if (ax().isSimple(access)) { paintSimple(); return; }
    ensureSeg();
    if (route.tab === "orders" && route.seg === "new" && ax().tabHas(access, "orderScreen")) {
      paintChrome();
      ord().paint();
      ord().paintSegs(orderSegs(), "new");
      return;
    }
    if (route.tab === "orders") {
      paintChrome();
      sh().dock("");
      var name = route.seg === "month" ? "Месяц" : "Неделя";
      sh().main(segsHtml(orderSegs(), "oseg", route.seg) + stub(name, "Список заказов за " + name.toLowerCase() + " ещё в старой версии. Новый заказ уже здесь."));
      return;
    }
    if (route.tab === "clients") {
      paintChrome();
      sh().dock("");
      var chips = [
        { id: "pp", label: "ПП" },
        { id: "afk", label: "АФК" },
        { id: "bp", label: "БП" },
        { id: "survey", label: "Опросник" }
      ];
      sh().main(segsHtml(chips, "cseg", route.seg) + stub("Клиенты", "Списки подписок, карточка и расчёт пока открываются в старой версии."));
      return;
    }
    if (route.tab === "production") {
      paintChrome();
      sh().dock("");
      var labels = { cut: "Нарезка", pack: "Сборка", route: "Маршрут" };
      sh().main(segsHtml(prodSegs(), "pseg", route.seg) + stub(labels[route.seg] || "Производство", "Нарезка, сборка и маршрут пока в старой версии."));
      return;
    }
    if (route.tab === "warehouse") {
      paintChrome();
      sh().dock("");
      var wh = [
        { id: "stock", label: "Остатки" },
        { id: "buy", label: "Дозакуп" },
        { id: "move", label: "Движения" }
      ];
      var whName = { stock: "Остатки", buy: "Дозакуп", move: "Движения" }[route.seg];
      sh().main(segsHtml(wh, "wseg", route.seg) + stub(whName, "Склад пока в старой версии."));
      return;
    }
    if (route.tab === "goals") {
      paintStub("Цели скоро", "Раздел для владельца ещё готовится. Здесь пока пусто — отдельным обновлением.");
      return;
    }
    paintChrome();
    sh().dock("");
    sh().main(
      '<p class="b-note" style="margin:8px 0 16px">Партнёры, шаблоны, прайс, статистика, доступы и неделя — в старой версии. Версия приложения указана ниже.</p>' +
      stub("Ещё", "Откройте старую версию, чтобы работать с этими разделами.") +
      '<p class="b-mark">' + sh().esc(root.__boinyaCBadgeLabel || "Бойня") + "</p>"
    );
  }

  function helpText() {
    if (q().get("shot") === "states") return "Так выглядят пустой экран, загрузка, ошибка и долгий запрос. Кнопка «Повторить» зовёт тот же запрос ещё раз.";
    if (route.tab === "orders" && route.seg === "new") {
      return "Новый заказ. Тип, клиент, адрес, день и состав. Оранжевая кнопка сохраняет в ту же таблицу, что и старая форма. «На потом» кладёт заказ в задачи. День с 6 заказами и больше подсвечен как полный. Суббота и воскресенье остаются в полосе.";
    }
    if (route.tab === "goals") return "Цели — новый раздел только у владельца. В этом обновлении экрана ещё нет.";
    return "Этот экран ещё не перенесён. Кнопка «Открыть в старой версии» ведёт в привычное приложение. Данные те же.";
  }

  function openHelp() {
    sh().openSheet({ title: "Как пользоваться", html: '<p style="margin:0 0 12px">' + sh().esc(helpText()) + "</p>" + '<p class="b-note">Полная инструкция лежит в файле next/HELP.md.</p>' });
  }

  function openMenu() {
    var screen = route.tab + "/" + route.seg;
    sh().openSheet({
      title: "Раздел",
      html: '<button class="b-btn b-btn--sec" type="button" data-act="bug">Сообщить о проблеме</button>' +
        '<p class="b-note" style="margin-top:8px">К сообщению приложатся экран «' + sh().esc(screen) + "», роль и черновик заказа, если он открыт.</p>" +
        '<a class="b-btn b-btn--sec" style="margin-top:8px" href="' + sh().esc(oldHref()) + '">Открыть в старой версии</a>'
    });
  }

  async function sendBug() {
    var text = await sh().prompt({ title: "Сообщить о проблеме", text: "Что случилось? Экран и роль уйдут вместе с текстом.", ok: "Отправить" });
    if (text == null || !String(text).trim()) return;
    var st = ord().getState();
    await api().apiPost({
      action: "reportBug",
      text: String(text).trim(),
      screen: route.tab + "/" + route.seg,
      role: access ? access.role : "",
      client: st.client || "",
      day: st.day || "",
      date: st.deliveryDate || ""
    });
    sh().toast("Сообщение ушло");
  }

  function openTasks() {
    sh().openSheet({
      title: "Задачи" + (tasksN ? " · " + tasksN : ""),
      html: stub("Задачи", "Список переносов, дозакупа, «на потом» и напоминаний пока в старой версии. Колокольчик и счётчик уже считают открытые.")
    });
  }

  async function refreshTasks() {
    if (!access || !ax().canUseTasks(access)) { tasksN = 0; return; }
    var tid = "";
    try {
      var u = api().telegramUser();
      tid = String((u && u.id) || localStorage.getItem("superboyna_tg_id") || "");
    } catch (e) {}
    var res = await api().apiGet({ action: "listDeferred", telegramId: tid, status: "open", light: "1" }, { timeoutMs: 12000, cacheTtlMs: 15000 });
    var items = (res && res.items) || [];
    tasksN = items.filter(function (it) { return String((it && it.status) || "open").toLowerCase() === "open"; }).length;
  }

  function onAct(act, node) {
    if (act === "nav") {
      route.tab = node.getAttribute("data-tab");
      route.seg = "";
      ensureSeg();
      render();
      return;
    }
    if (act === "oseg" || act === "pseg" || act === "wseg" || act === "cseg") {
      route.seg = node.getAttribute("data-seg");
      if (act === "oseg") route.tab = "orders";
      if (act === "pseg") route.tab = "production";
      if (act === "wseg") route.tab = "warehouse";
      if (act === "cseg") route.tab = "clients";
      render();
      return;
    }
    if (act === "help") { openHelp(); return; }
    if (act === "menu") { openMenu(); return; }
    if (act === "tasks") { openTasks(); return; }
    if (act === "bug") { sh().closeTop("ok"); sendBug(); return; }
    if (act === "gate-retry") { boot(); return; }
    if (act === "gate-ask") { askAccess(); return; }
    if (act === "go-new") {
      route.tab = "orders";
      route.seg = "new";
      if (q().get("shot") === "states") history.replaceState(null, "", location.pathname);
      render();
      return;
    }
    if (act === "retry-demo") { sh().toast("Повтор запроса"); return; }
    if (act === "show-loader") { sh().loader({ title: "Сохраняю заказ…", step: "шаг 2 из 3 · запись в лист" }); return; }
    if (act === "loader-hide") { sh().closeLoader(); return; }
    if (route.tab === "orders" && route.seg === "new") ord().onAct(act, node);
  }

  function showFail(title, text, button) {
    sh().hideGate();
    sh().chrome({ title: "Бойня", sub: "", bell: false, nav: [], active: "" });
    sh().dock("");
    sh().main("");
    sh().gate({
      title: title,
      text: text,
      actions: button || ""
    });
  }

  async function askAccess() {
    var u = api().telegramUser() || {};
    await api().apiPost({
      action: "requestAccess",
      telegramId: String(u.id || ""),
      name: String(u.first_name || ""),
      username: String(u.username || "")
    });
    showFail("Ожидание", "Заявка отправлена. Владелец назначит роль.", "");
    sh().toast("Заявка отправлена");
  }

  async function boot() {
    if (booting) return;
    booting = true;
    sh().hideGate();
    sh().main(sh().skeleton(4));
    var init = api().initData();
    if (!init && !root.__NEXT_API_HOOK__) {
      booting = false;
      showFail("Откройте через Telegram", "Бойня работает только внутри Telegram (кнопка бота). Вне Telegram доступа нет.",
        '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
      return;
    }
    var u = api().telegramUser() || {};
    var res = null;
    try {
      res = await api().apiGet({
        action: "getMyAccess",
        telegramId: String(u.id || ""),
        name: String((u.first_name || "") + (u.last_name ? " " + u.last_name : "")),
        username: String(u.username || "")
      }, { timeoutMs: 12000, retries: 1, cacheTtlMs: 0 });
    } catch (e) { res = null; }
    booting = false;
    if (!res || res.status !== "success") {
      showFail("Нет связи", "Не удалось проверить доступ. Проверьте интернет и нажмите «Повторить».",
        '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
      return;
    }
    if (res.authRequired) {
      showFail("Нужен Telegram", "Подпись Telegram не прошла проверку. Закройте и откройте мини-апп заново из бота.",
        '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
      return;
    }
    access = ax().normalize(res);
    if (u.first_name) access.name = String(u.first_name || "") + (u.last_name ? " " + u.last_name : "");
    var role = access.role;
    if (role === "none" || role === "pending" || role === "denied" || !access.tabs.length) {
      if (role === "denied") showFail("Доступ закрыт", "Обратитесь к владельцу.", "");
      else if (role === "pending") showFail("Ожидание", "Заявка отправлена. Владелец назначит роль.", "");
      else showFail("Нет доступа", "Нажмите «Запросить доступ». Владелец увидит заявку.",
        '<button class="b-btn b-btn--main" type="button" data-act="gate-ask">Запросить доступ</button>');
      return;
    }
    sh().hideGate();
    var nav = ax().navItems(access);
    route.tab = (nav[0] && nav[0].id) || "orders";
    route.seg = "";
    ensureSeg();
    if (q().get("tab")) route.tab = q().get("tab");
    if (q().get("seg")) route.seg = q().get("seg");
    ensureSeg();
    render();
    refreshTasks().then(function () { if (access) paintChrome(); });
    if (ax().tabHas(access, "orderScreen")) {
      ord().loadDays();
      ord().bootPrices();
    }
  }

  function start() {
    root.__nxOrderVisible = function () {
      return route.tab === "orders" && route.seg === "new" && q().get("shot") !== "states";
    };
    root.__nxAfterOrderPaint = function () {
      if (!access) return;
      if (route.tab === "orders" && route.seg === "new" && q().get("shot") !== "states") {
        paintChrome();
        ord().paintSegs(orderSegs(), "new");
      }
    };
    sh().mount(document.getElementById("app"));
    sh().setHandler(onAct);
    try {
      var tg = root.Telegram && root.Telegram.WebApp;
      if (tg) { tg.ready(); tg.expand(); }
    } catch (e) {}
    boot();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window);
