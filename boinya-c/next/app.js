/* Сборка next: вход, права, вкладки, заглушки. Форма заказа — orders.js. */
(function (root) {
  "use strict";

  var route = { tab: "orders", seg: "new" };
  var priceView = "";
  var priceFrom = null;
  var access = null;
  var tasksN = 0;
  var booting = false;
  var bootGen = 0;
  var watchTimer = null;
  var moreView = "";
  var partnersOpen = "";
  var suppressNav = false;
  var flyCache = [];
  var routeLocked = false;
  var shownKey = "";
  var deskToken = "";
  var deskStartUrl = "";
  var deskPoll = null;

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function ord() { return root.BoinyaOrders; }
  function wk() { return root.BoinyaWeek; }
  function tasksMod() { return root.BoinyaTasks; }
  function people() { return root.BoinyaPeople; }
  function clients() { return root.BoinyaClients; }
  function tpl() { return root.BoinyaTemplates; }
  function prod() { return root.BoinyaProduction; }
  function wh() { return root.BoinyaWarehouse; }
  function retail() { return root.BoinyaRetailAdmin; }
  function stats() { return root.BoinyaStats; }
  function partners() { return root.BoinyaPartners; }
  function goalsMod() { return root.BoinyaGoals; }
  function expensesMod() { return root.BoinyaExpenses; }

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
    if (ax().tabHas(access, "courierScreen.route")) list.push({ id: "route", label: "Курьер" });
    return list;
  }

  function ensureSeg() {
    if (route.tab === "orders" && route.seg === "week") route.seg = "month";
    if (route.tab === "orders") {
      var os = orderSegs();
      if (!os.some(function (s) { return s.id === route.seg; })) route.seg = (os[0] && os[0].id) || "new";
    } else if (route.tab === "production") {
      var ps = prodSegs();
      if (!ps.some(function (s) { return s.id === route.seg; })) route.seg = (ps[0] && ps[0].id) || "cut";
    } else if (route.tab === "clients") {
      if (route.seg === "calc" || route.seg === "pick") {
        priceView = route.seg;
        return;
      }
      var cs = clients() ? clients().segs(access) : [];
      if (!cs.length) {
        var tool = ax().tabHas(access, "priceScreen.calc") ? "calc" : "";
        if (!tool && ax().tabHas(access, "priceScreen.pick") && ax().tabHas(access, "templatesScreen.ai")) tool = "pick";
        if (tool) {
          if (!priceFrom) priceFrom = { tab: "orders", seg: "new", moreView: "" };
          priceView = tool;
          route.seg = tool;
          return;
        }
      }
      priceView = "";
      if (!cs.some(function (s) { return s.id === route.seg; })) route.seg = (cs[0] && cs[0].id) || "pp";
    } else {
      priceView = "";
    }
  }

  function canPriceTool() {
    if (!access || ax().isSimple(access)) return false;
    return ax().tabHas(access, "priceScreen.calc") || (ax().tabHas(access, "priceScreen.pick") && ax().tabHas(access, "templatesScreen.ai"));
  }

  function showPriceTool() {
    if (!canPriceTool()) return false;
    if (priceView) return true;
    return route.tab === "orders" || route.tab === "clients" || route.tab === "production" || route.tab === "warehouse" || route.tab === "more";
  }

  function enterPrice(which) {
    if (which !== "calc" && which !== "pick") return;
    if (!priceView) priceFrom = { tab: route.tab, seg: route.seg, moreView: moreView };
    priceView = which;
    route.tab = "clients";
    route.seg = which;
    moreView = "";
    sh().closeAll();
    sh().resetScroll();
    render();
  }

  function leavePrice() {
    var back = priceFrom || { tab: "clients", seg: "pp", moreView: "" };
    priceView = "";
    priceFrom = null;
    route.tab = back.tab || "clients";
    route.seg = back.seg || "";
    moreView = back.moreView || "";
    if (route.tab !== "clients") priceView = "";
    sh().resetScroll();
    render();
  }

  function headerSub() {
    if (q().get("shot") === "states") return "состояния экранов";
    if (route.tab === "orders" && route.seg === "new" && ax().tabHas(access, "orderScreen")) return ord().contextLine();
    if (route.tab === "orders" && (route.seg === "week" || route.seg === "month")) return wk().contextLine();
    if (route.tab === "more") {
      var who = access.name || "Бойня";
      var role = ax().ROLE_RU[access.role] || access.role;
      var mode = root.__boinyaCBadgeLabel || "";
      return [who, role, mode].filter(Boolean).join(", ");
    }
    if (route.tab === "clients") {
      var cl = { pp: "ПП", afk: "АФК", bp: "БП", survey: "Опросник", calc: "Расчёт", pick: "Подбор" };
      return cl[route.seg] || "Клиенты";
    }
    if (route.tab === "goals") return "Личные и общие";
    if (route.tab === "warehouse" || (ax().isSimple(access) && access.role === "logistics")) {
      return wh() ? wh().contextLine() : "Склад";
    }
    if (route.tab === "production" || (ax().isSimple(access) && (access.role === "cutter" || access.role === "courier"))) {
      var pr = { cut: "Нарезка", pack: "Сборка", route: "Курьер" };
      return pr[route.seg] || (access.role === "cutter" ? "Нарезка" : "Цех");
    }
    if (route.tab === "more" && moreView === "templates") return "Шаблоны";
    if (ax().isSimple(access)) return ax().ROLE_RU[access.role] || "";
    return "Этот раздел пока в старой версии";
  }

  function headerTitle() {
    if (priceView === "calc") return "Расчёт";
    if (priceView === "pick") return "Подбор";
    if (q().get("shot") === "states") return "Состояния";
    if (route.tab === "goals") return "Цели";
    if (route.tab === "more" && (moreView === "staff" || moreView === "people")) return "Сотрудники";
    if (route.tab === "more" && moreView === "settings") return "Настройки";
    if (route.tab === "more") return ax().NAV_LABELS.more || "Ещё";
    if (ax().isSimple(access)) return ax().SIMPLE[access.role] || "Бойня";
    var map = ax().NAV_LABELS;
    if (route.tab === "orders" && route.seg === "new" && ord().getState().isEdit) return "Правка заказа";
    return map[route.tab] || "Бойня";
  }

  function badgeLabel() {
    return String(root.__boinyaCBadgeLabel || (root.__BOINYA_C_CUTOVER__ ? "C · LIVE" : "")).replace(/\s*·\s*/g, " ");
  }

  function withBadge(sub) {
    var badge = badgeLabel();
    var text = sub || "";
    if (!badge) return text;
    if (text.indexOf(badge) >= 0) return text;
    return text ? (text + ", " + badge) : badge;
  }

  function paintChrome() {
    var nav = ax().navItems(access);
    try { document.body.setAttribute("data-nx-role", access && access.role ? access.role : ""); } catch (eRole) {}
    sh().chrome({
      title: headerTitle(),
      bell: ax().canUseTasks(access),
      badge: tasksN,
      calc: showPriceTool(),
      nav: nav,
      active: route.tab
    });
    bindLongPress();
  }

  function haptic() {
    try {
      var tg = root.Telegram && root.Telegram.WebApp;
      if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) tg.HapticFeedback.impactOccurred("medium");
    } catch (e) {}
  }

  function orderFlyoutItems() {
    var role = access.role;
    var custom = access.customTabs && access.customTabs.length;
    var items = [
      { id: "clientsScreen", label: "Просмотр", roles: "manager,owner,all", go: function () { route.tab = "orders"; route.seg = ax().tabHas(access, "clientsScreen.week") ? "week" : "month"; moreView = ""; } },
      { id: "priceScreen", label: "Расчёт", roles: "manager,owner,all", go: function () { enterPrice("calc"); } },
      { id: "templatesScreen", label: "Шаблоны", roles: "manager,owner,all", go: function () { route.tab = "more"; moreView = "templates"; } },
      { id: "subsScreen", label: "Подписки", roles: "owner,all", go: function () { route.tab = "clients"; route.seg = "pp"; moreView = ""; } },
      { id: "statsScreen", label: "Статистика", roles: "owner,all", go: function () { route.tab = "more"; moreView = "stats"; } },
      { id: "retailPriceScreen", label: "Прайс", roles: "owner,all", go: function () { route.tab = "more"; moreView = "price"; } },
      { id: "peopleScreen", label: "Сотрудники", roles: "owner,all", go: function () { route.tab = "more"; moreView = "staff"; } }
    ];
    return items.filter(function (it) {
      if (!ax().tabHas(access, it.id)) return false;
      if (role === "owner" || custom) return true;
      return it.roles.split(",").indexOf(role) >= 0;
    });
  }

  function orderFlyoutAllowed() {
    var ids = ["clientsScreen", "priceScreen", "templatesScreen", "subsScreen", "subDetailScreen", "statsScreen", "retailPriceScreen", "peopleScreen"];
    return ids.some(function (id) { return ax().tabHas(access, id); });
  }

  function bindPress(btn, open) {
    if (!btn || btn._nxPress) return;
    btn._nxPress = true;
    var timer = null;
    var armed = false;
    function clear() { if (timer) { clearTimeout(timer); timer = null; } }
    function start() {
      clear();
      armed = false;
      timer = setTimeout(function () { armed = true; }, 480);
    }
    function finish(e) {
      var fire = armed;
      clear();
      armed = false;
      if (!fire) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      suppressNav = true;
      open();
      haptic();
      setTimeout(function () { if (suppressNav) suppressNav = false; }, 400);
    }
    btn.addEventListener("touchstart", start, { passive: true });
    btn.addEventListener("mousedown", start);
    btn.addEventListener("touchend", finish);
    btn.addEventListener("mouseup", finish);
    btn.addEventListener("touchcancel", function () { armed = false; clear(); });
    btn.addEventListener("mouseleave", function () { armed = false; clear(); });
    btn.addEventListener("click", function (e) {
      if (!suppressNav) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNav = false;
    }, true);
  }

  function bindLongPress() {
    var ordersBtn = document.querySelector("#nxNav [data-tab='orders']");
    var prodBtn = document.querySelector("#nxNav [data-tab='production']");
    bindPress(ordersBtn, function () {
      if (!orderFlyoutAllowed()) { suppressNav = false; return; }
      var items = orderFlyoutItems();
      if (!items.length) { suppressNav = false; return; }
      flyCache = items;
      sh().openSheet({
        title: "Заказы",
        html: items.map(function (it, i) {
          return '<button type="button" class="b-btn b-btn--sec" style="margin-top:8px" data-act="fly-go" data-i="' + i + '">' + sh().esc(it.label) + "</button>";
        }).join("")
      });
    });
    bindPress(prodBtn, function () {
      var items = [];
      if (ax().tabHas(access, "courierScreen.route")) items.push({ label: "Курьер", seg: "route" });
      if (ax().tabHas(access, "courierScreen.assembly")) items.push({ label: "Сборка", seg: "pack" });
      if (!items.length) { suppressNav = false; return; }
      sh().openSheet({
        title: "Цех",
        html: items.map(function (it) {
          return '<button type="button" class="b-btn b-btn--sec" style="margin-top:8px" data-act="cfly" data-seg="' + it.seg + '">' + sh().esc(it.label) + "</button>";
        }).join("")
      });
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
    if (access.role === "cutter" || access.role === "courier") {
      if (access.role === "cutter") route.seg = "cut";
      else if (route.seg !== "pack" && route.seg !== "route") route.seg = "route";
      route.tab = "production";
      paintChrome();
      prod().bind(access);
      prod().show(route.seg);
      return;
    }
    if (access.role === "logistics") {
      route.tab = "warehouse";
      paintChrome();
      wh().bind(access);
      wh().show();
      return;
    }
    paintChrome();
    sh().dock("");
    var title = ax().SIMPLE[access.role] || "Раздел";
    sh().main(stub(title, "Экран этой роли в новом приложении ещё не собран. Откройте старую версию — там всё как раньше."));
  }

  function paintStub(title, text) {
    paintChrome();
    sh().dock("");
    var back = route.tab === "goals"
      ? '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>'
      : "";
    sh().main(back + stub(title, text));
  }

  function routeKey() {
    return [route.tab, route.seg, moreView, priceView].join("/");
  }

  function tabAllowed(tab) {
    if (!access) return false;
    if (tab === "goals") {
      var role = access.role;
      return role !== "partner" && role !== "none" && role !== "pending" && role !== "denied";
    }
    var nav = ax().navItems(access);
    var i;
    for (i = 0; i < nav.length; i++) if (nav[i].id === tab) return true;
    return false;
  }

  function applyEntryRoute() {
    var nav = ax().navItems(access);
    route.tab = (nav[0] && nav[0].id) || "orders";
    route.seg = "";
    moreView = "";
    priceView = "";
    priceFrom = null;
    if (q().get("tab")) route.tab = q().get("tab");
    if (q().get("seg")) route.seg = q().get("seg");
    if (q().get("view") === "people" || q().get("view") === "staff") { route.tab = "more"; moreView = "staff"; }
    if (q().get("view") === "settings") { route.tab = "more"; moreView = "settings"; }
    if (q().get("view") === "templates") { route.tab = "more"; moreView = "templates"; }
    if (q().get("view") === "price") { route.tab = "more"; moreView = "price"; }
    if (q().get("view") === "stats") { route.tab = "more"; moreView = "stats"; }
    if (q().get("view") === "partners") { route.tab = "more"; moreView = "partners"; }
    if (access.role === "partner" && !q().get("tab")) { route.tab = "more"; moreView = "partners"; }
    if (route.seg === "calc" || route.seg === "pick") {
      priceView = route.seg;
      if (!priceFrom) priceFrom = { tab: "orders", seg: "new", moreView: "" };
    }
    ensureSeg();
  }

  function settleRoute() {
    if (!routeLocked) {
      applyEntryRoute();
      routeLocked = true;
      return;
    }
    if (!tabAllowed(route.tab)) {
      var nav = ax().navItems(access);
      route.tab = (nav[0] && nav[0].id) || "orders";
      route.seg = "";
      moreView = "";
      priceView = "";
      priceFrom = null;
    }
    ensureSeg();
  }

  function paintSameOrRender() {
    if (shownKey && shownKey === routeKey()) paintChrome();
    else render();
  }

  function render() {
    if (route.tab !== "production" && prod() && prod().pauseBackground) prod().pauseBackground();
    if (route.tab !== "goals" && goalsMod() && goalsMod().leave) goalsMod().leave();
    if (!access) return;
    if (q().get("shot") === "states") { paintStates(); return; }
    if (ax().isSimple(access) && route.tab !== "goals" && route.tab !== "more") {
      paintSimple();
      shownKey = routeKey();
      return;
    }
    ensureSeg();
    if (route.tab === "orders" && route.seg === "week") route.seg = "month";
    shownKey = routeKey();
    if (route.tab === "orders" && route.seg === "new" && ax().tabHas(access, "orderScreen")) {
      paintChrome();
      ord().paint();
      ord().paintSegs(orderSegs(), "new");
      return;
    }
    if (route.tab === "orders" && route.seg === "month") {
      paintChrome();
      wk().setRole(access.role);
      wk().show(route.seg, access.role);
      return;
    }
    if (route.tab === "orders") {
      paintChrome();
      sh().dock("");
      sh().main(segsHtml(orderSegs(), "oseg", route.seg) + stub("Заказы", "Этот сегмент ещё в старой версии."));
      return;
    }
    if (route.tab === "clients") {
      paintChrome();
      clients().bind(access);
      clients().show(route.seg);
      return;
    }
    if (route.tab === "production") {
      paintChrome();
      prod().bind(access);
      prod().show(route.seg);
      return;
    }
    if (route.tab === "warehouse") {
      paintChrome();
      wh().bind(access);
      wh().show();
      return;
    }
    if (route.tab === "goals") {
      if (!access || access.role === "partner" || access.role === "none" || access.role === "pending" || access.role === "denied") {
        paintStub("Цели", "Этот раздел для команды.");
        return;
      }
      paintChrome();
      goalsMod().bind(access);
      if (expensesMod()) expensesMod().bind(access);
      goalsMod().show();
      return;
    }
    if (route.tab === "more" && (moreView === "people" || moreView === "staff") && ax().tabHas(access, "peopleScreen")) {
      paintChrome();
      wk().setRole(access.role);
      people().show({ view: "staff" });
      return;
    }
    if (route.tab === "more" && moreView === "settings" && ax().tabHas(access, "peopleScreen")) {
      paintChrome();
      people().show({ view: "settings" });
      return;
    }
    if (route.tab === "more" && moreView === "templates" && ax().tabHas(access, "templatesScreen")) {
      paintChrome();
      tpl().bind(access);
      tpl().show();
      return;
    }
    if (route.tab === "more" && moreView === "price" && ax().tabHas(access, "retailPriceScreen")) {
      paintChrome();
      retail().bind(access);
      retail().show();
      return;
    }
    if (route.tab === "more" && moreView === "stats" && ax().tabHas(access, "statsScreen")) {
      paintChrome();
      stats().bind(access);
      stats().show();
      return;
    }
    if (route.tab === "more" && moreView === "partners" && ax().tabHas(access, "partnerHubScreen")) {
      paintChrome();
      partners().bind(access);
      partners().show(partnersOpen);
      partnersOpen = "";
      return;
    }
    paintChrome();
    sh().dock("");
    var more = "";
    if (ax().tabHas(access, "peopleScreen")) {
      more += '<button type="button" class="b-li" data-act="more-staff"><span class="b-li__body"><span class="b-li__title">Сотрудники</span><span class="b-li__sub">Роли, зарплата, сообщение складу</span></span><span class="b-li__chev">›</span></button>';
      more += '<button type="button" class="b-li" data-act="more-settings"><span class="b-li__body"><span class="b-li__title">Настройки</span><span class="b-li__sub">Склады и точка выезда</span></span><span class="b-li__chev">›</span></button>';
    }
    if (ax().tabHas(access, "templatesScreen")) {
      more += '<button type="button" class="b-li" data-act="more-templates"><span class="b-li__body"><span class="b-li__title">Шаблоны</span><span class="b-li__sub">Тексты и карточки лакомств</span></span><span class="b-li__chev">›</span></button>';
    }
    if (ax().tabHas(access, "retailPriceScreen")) {
      more += '<button type="button" class="b-li" data-act="more-price"><span class="b-li__body"><span class="b-li__title">Прайс</span><span class="b-li__sub">Цены розницы и порог доставки</span></span><span class="b-li__chev">›</span></button>';
    }
    if (ax().tabHas(access, "statsScreen")) {
      more += '<button type="button" class="b-li" data-act="more-stats"><span class="b-li__body"><span class="b-li__title">Статистика</span><span class="b-li__sub">Оборот, расходы, проба</span></span><span class="b-li__chev">›</span></button>';
    }
    if (ax().tabHas(access, "partnerHubScreen")) {
      more += '<button type="button" class="b-li" data-act="more-partners"><span class="b-li__body"><span class="b-li__title">Партнёры</span><span class="b-li__sub">Заявки, точки, сети, пуши</span></span><span class="b-li__chev">›</span></button>';
    }
    if (access.role !== "partner") {
      var goalsSub = access.role === "owner" ? "Задачи, общие и показатели" : "Свои и общие задачи";
      more += '<button type="button" class="b-li" data-act="more-goals"><span class="b-li__body"><span class="b-li__title">Цели</span><span class="b-li__sub">' + goalsSub + '</span></span><span class="b-li__chev">›</span></button>';
    }
    if (api().hasDesktopLogin && api().hasDesktopLogin()) {
      more += '<button type="button" class="b-li" data-act="desk-logout"><span class="b-li__body"><span class="b-li__title">Выйти</span><span class="b-li__sub">Вход с компьютера через Telegram</span></span><span class="b-li__chev">›</span></button>';
    }
    sh().main('<div class="b-list">' + (more || '<p class="b-note">В этом разделе пока пусто.</p>') + "</div>" + '<p class="b-mark">' + sh().esc(badgeLabel() || "Бойня") + "</p>");
  }

  function helpText() {
    if (q().get("shot") === "states") return "Так выглядят пустой экран, загрузка, ошибка и долгий запрос. Кнопка «Повторить» зовёт тот же запрос ещё раз.";
    if (route.tab === "orders" && route.seg === "new") {
      return "Новый заказ. Тип, ник, адрес, день и состав. Оранжевая кнопка сохраняет в ту же таблицу. «На потом» кладёт заказ в задачи. Полный день — от 8 человек, черта сверху. Тост появляется под шапкой и не закрывает «Итого».";
    }
    if (route.tab === "orders" && route.seg === "week") {
      return "Неделя: дни Пн–Вс и «Будущая неделя». Карточка — править, перенести, удалить, слот ПП. «Выбрать» — несколько человек сразу. Баннер закрытия недели только у владельца, повторное нажатие не запускает второе закрытие.";
    }
    if (route.tab === "orders" && route.seg === "month") {
      return "Месяц: люди на дне крупно, дата мелко, точки ПП, БП, розница и партнёр. Под сеткой заказы этого дня. Тап по строке — править, перенести, удалить. «Завершить неделю» подтягивает месяц сама и не копирует понедельник на будущую неделю.";
    }
    if (route.tab === "more" && (moreView === "people" || moreView === "staff")) {
      return "Сотрудники: заявки, роль и зарплата за выбранный месяц. Месяц сразу показывает назначения и сумму. Сумму считает статистика. Сообщение складу — список сырья на ближайшую нарезку и комментарий, задача для роли склада. Карточка человека: пояс, вкладки, уведомления. Подтянуть из месяца и синхронизация с листом — в меню.";
    }
    if (route.tab === "more" && moreView === "settings") {
      return "Настройки: склады и точка выезда. Название, адрес, координаты и какая точка выезд. Остатки склада не делятся.";
    }
    if (route.tab === "goals") return "Цели: свои задачи и блок Общие. При создании выберите Мне, Общая или сотрудника. Владелец видит задачи каждого, показатели с деньгами и журнал «Расходы». Процент — сколько отмечено на этом горизонте. Личное в проект не входит.";
    if (route.tab === "clients" && (route.seg === "pp" || route.seg === "afk" || route.seg === "bp" || route.seg === "survey")) {
      return "Клиенты: ПП, АФК, БП и опросник — те же списки, что в старой версии. Карточка сохраняет в ту же таблицу.";
    }
    if (route.tab === "clients" && route.seg === "calc") {
      return "Расчёт: подписка или розница, собаки, доставки, пакеты и фракции. «Собрать сообщение» считает цену как раньше. «Внести в ПП» пишет в лист подписок. Для розницы «Внести заказ» открывает новый заказ и переносит состав, ник и выбор доставки. Дату, адрес и остальное менеджер дополняет сам.";
    }
    if (route.tab === "clients" && route.seg === "pick") {
      return "Подбор по анкете. Состав и текст — те же правила, что в старом подборе. «В расчёт» переносит набор в расчёт.";
    }
    if (route.tab === "more" && moreView === "templates") {
      return "Шаблоны: тексты и опросники, копировать, править, удалить. Карточки лакомств — описание позиции, свой текст и примечание.";
    }
    if (route.tab === "warehouse") {
      return "Склад на сегодня или неделя F+B. «Позиции» — план, нужно и есть. «Дозакуп» копирует сообщение. «Закрыть дефициты» гасит открытые дефициты нарезки. В остатках прежнее поле «дозакуп» и «Сохранить» — это приход в таблицу. Новых полей прихода здесь нет.";
    }
    if (route.tab === "more" && moreView === "price") {
      return "Прайс розницы: доставка, порог «бесплатно от» и цены позиций. Сохранение пишет в ту же таблицу. Уже сохранённые заказы не пересчитываются.";
    }
    if (route.tab === "more" && moreView === "stats") {
      return "Статистика по формулам владельца. В деньги попадает только доставка с отметкой «отвёз». Строки сверху вниз: главное, откуда деньги, себестоимость, расходы месяца, сверка с расходами, зарплата, БП, партнёры. Расходы вводятся только в Цели, страница «Расходы». Аренда по умолчанию 900, если за месяц её нет. Налог 20% с чистого после сверки. «Расчёт по датам» внизу. «Экспорт TSV» копирует выгрузку.";
    }
    if (route.tab === "more" && moreView === "partners") {
      return "Партнёры: заявки с датой 19:00–22:00, люди, точки, сети и пуши. «Мини-апп» открывает партнёрку. Сид сетей здесь нет. Вкладка «БП» — только у владельца: кто привёл клиента.";
    }
    if (route.tab === "production" && route.seg === "cut") {
      return "Нарезка дня, включая «Будущая неделя». «Начать нарезку», галочки «Выложено» и «Нарезано». «!» — нет на следующую. У жевалок вторая «!» — излишек на запас. Весовые позиции без излишка: вес после сушки в Сборке. «Сегодня режет» можно сменить в любой момент. «Завершить нарезку» спрашивает по неотмеченным: заготовлена или нет в наличии.";
    }
    if (route.tab === "production" && route.seg === "pack") {
      return "Сборка: пакеты по составу, форматы можно выключить. «Вес после сушки» — граммы сухого по позиции склада; сырьё считается через коэффициент. Пустое поле оставляет план. «Собрано» пишет в таблицу. «Пропечатка пакетов» — ручная отметка «пропечатано без лакомств». Отдельного сервера печати нет.";
    }
    if (route.tab === "production" && route.seg === "route") {
      return "Курьер: день, точка выезда (её можно сменить здесь), один или два курьера. «Собрать маршруты» считает порядок как раньше. Галочка «доставлено», карта, телефон, «Не получил» создаёт перенос. Выплата за день в данных не хранится. Курьер и нарезчик заходят без нижней панели.";
    }
    return "Этот экран ещё не перенесён. Кнопка «Открыть в старой версии» ведёт в привычное приложение. Данные те же.";
  }

  function openGuide() {
    sh().openSheet({
      title: "Справка",
      html: '<button class="b-btn b-btn--sec" type="button" data-act="menu">Раздел</button>' +
        '<button class="b-btn b-btn--sec" type="button" data-act="help" style="margin-top:8px">Как пользоваться</button>'
    });
  }

  function openHelp() {
    sh().openSheet({ title: "Как пользоваться", html: '<p style="margin:0 0 12px">' + sh().esc(helpText()) + "</p>" + '<p class="b-note">Полная инструкция лежит в файле next/HELP.md.</p>' });
  }

  function openMenu() {
    var screen = route.tab + "/" + route.seg;
    var weekTools = "";
    if (route.tab === "more" && (moreView === "staff" || moreView === "people") && access && access.role === "owner") {
      weekTools = '<button class="sheet-act" type="button" data-act="wpull">Подтянуть из месяца</button>' +
        '<button class="sheet-act" type="button" data-act="p-resync">Синхронизировать с листом</button>';
    }
    sh().openSheet({
      title: "Раздел",
      html: weekTools + '<button class="b-btn b-btn--sec" type="button" data-act="bug">Сообщить о проблеме</button>' +
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
    tasksMod().open(access);
  }

  async function refreshTasks() {
    if (!access || !ax().canUseTasks(access)) { tasksN = 0; return; }
    tasksMod().bind(access);
    try { await tasksMod().refresh(); } catch (e) { tasksN = 0; }
  }

  function onAct(act, node, ev) {
    if (act === "nav") {
      if (suppressNav) { suppressNav = false; return; }
      priceView = "";
      priceFrom = null;
      route.tab = node.getAttribute("data-tab");
      route.seg = "";
      if (route.tab !== "more") moreView = "";
      ensureSeg();
      sh().resetScroll();
      render();
      return;
    }
    if (act === "fly-go") {
      var fly = flyCache[Number(node.getAttribute("data-i"))];
      sh().closeTop("ok");
      if (fly && fly.go) fly.go();
      sh().resetScroll();
      render();
      return;
    }
    if (act === "cfly") {
      route.tab = "production";
      route.seg = node.getAttribute("data-seg") || "route";
      moreView = "";
      sh().closeTop("ok");
      sh().resetScroll();
      render();
      return;
    }
    if (act === "more-people" || act === "more-staff") { moreView = "staff"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-settings") { moreView = "settings"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-templates") { moreView = "templates"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-price") { moreView = "price"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-stats") { moreView = "stats"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-partners") { moreView = "partners"; route.tab = "more"; sh().resetScroll(); render(); return; }
    if (act === "more-goals") { route.tab = "goals"; moreView = ""; sh().resetScroll(); render(); return; }
    if (act === "more-back") { route.tab = "more"; moreView = ""; priceView = ""; priceFrom = null; sh().resetScroll(); render(); return; }
    if (act === "price-tools") {
      var tools = [];
      if (ax().tabHas(access, "priceScreen.calc")) tools.push({ id: "calc", label: "Расчёт" });
      if (ax().tabHas(access, "priceScreen.pick") && ax().tabHas(access, "templatesScreen.ai")) tools.push({ id: "pick", label: "Подбор" });
      if (tools.length === 1) { enterPrice(tools[0].id); return; }
      sh().openSheet({
        title: "Расчёт и подбор",
        html: tools.map(function (it) {
          return '<button type="button" class="b-btn b-btn--sec" style="margin-top:8px" data-act="price-open" data-tool="' + it.id + '">' + sh().esc(it.label) + "</button>";
        }).join("")
      });
      return;
    }
    if (act === "price-open") { enterPrice(node.getAttribute("data-tool")); return; }
    if (act === "price-back") { leavePrice(); return; }
    if (act === "oseg" || act === "pseg" || act === "wseg" || act === "cseg") {
      route.seg = node.getAttribute("data-seg");
      if (act === "oseg") route.tab = "orders";
      if (act === "pseg") route.tab = "production";
      if (act === "wseg") route.tab = "warehouse";
      if (act === "cseg") route.tab = "clients";
      sh().resetScroll();
      render();
      return;
    }
    if (act === "guide") { openGuide(); return; }
    if (act === "help") { openHelp(); return; }
    if (act === "menu") { openMenu(); return; }
    if (act === "tasks") { openTasks(); return; }
    if (act === "bug") { sh().closeTop("ok"); sendBug(); return; }
    if (act === "gate-retry") { boot(); return; }
    if (act === "desk-open") { openDesktopTelegram(); return; }
    if (act === "desk-logout") { logoutDesktop(); return; }
    if (act === "gate-ask") { askAccess(); return; }
    if (act === "go-new") {
      route.tab = "orders";
      route.seg = "new";
      if (q().get("shot") === "states") history.replaceState(null, "", location.pathname);
      sh().resetScroll();
      render();
      return;
    }
    if (act === "retry-demo") { sh().toast("Повтор запроса"); return; }
    if (act === "show-loader") { sh().loader({ title: "Сохраняю заказ…", step: "шаг 2 из 3, запись в лист" }); return; }
    if (act === "loader-hide") { sh().closeLoader(); return; }
    if (tasksMod() && tasksMod().onAct(act, node)) return;
    if (people() && people().onAct(act, node)) return;
    if (clients() && clients().onAct(act, node)) return;
    if (tpl() && tpl().onAct(act, node)) return;
    if (prod() && prod().onAct(act, node, ev)) return;
    if (wh() && wh().onAct(act, node)) return;
    if (retail() && retail().onAct(act, node)) return;
    if (stats() && stats().onAct(act, node)) return;
    if (partners() && partners().onAct(act, node)) return;
    if (expensesMod() && expensesMod().onAct(act, node)) return;
    if (goalsMod() && goalsMod().onAct(act, node)) return;
    if (wk() && wk().onAct(act, node)) return;
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

  function insideTelegramApp() {
    try {
      var tg = root.Telegram && root.Telegram.WebApp;
      if (!tg) return false;
      if (String(tg.initData || "")) return true;
      if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return true;
      var platform = String(tg.platform || "");
      if (platform && platform !== "unknown") return true;
      if (root.parent && root.parent !== root) return true;
    } catch (eTg) {}
    return false;
  }

  function stopDeskPoll() {
    if (deskPoll) clearInterval(deskPoll);
    deskPoll = null;
  }

  function mountTgWidget(username) {
    var host = document.getElementById("nxTgWidget");
    if (!host || !/^[A-Za-z0-9_]{4,32}$/.test(String(username || ""))) return;
    root.__boinyaTgAuth = function (user) {
      if (!user || !user.id || !user.hash) return;
      var keys = ["auth_date", "first_name", "id", "last_name", "photo_url", "username"];
      var sp = new URLSearchParams();
      keys.forEach(function (k) {
        if (user[k] == null || user[k] === "") return;
        sp.append(k, String(user[k]));
      });
      sp.append("hash", String(user.hash));
      api().rememberLogin(sp.toString());
      stopDeskPoll();
      boot();
    };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", String(username));
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "8");
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-onauth", "__boinyaTgAuth(user)");
    host.appendChild(s);
  }

  function showDesktopLogin(info, errText) {
    stopDeskPoll();
    deskToken = info && info.token ? String(info.token) : "";
    deskStartUrl = info && info.startUrl ? String(info.startUrl) : "";
    sh().hideGate();
    sh().chrome({ title: "Бойня", sub: "Вход с компьютера", bell: false, nav: [], active: "" });
    sh().dock("");
    sh().main("");
    var widget = info && info.botUsername ? '<div id="nxTgWidget" class="nx-desk-widget"></div>' : "";
    var deep = deskStartUrl
      ? '<button class="b-btn b-btn--sec" type="button" data-act="desk-open" style="margin-top:8px">Открыть Telegram и подтвердить</button>'
      : "";
    var note = info && info.botUsername
      ? "Кнопка Telegram входит в этом окне. Если вместо неё ошибка домена, в BotFather у бота Бойни: /setdomain → konchaarsenia-a11y.github.io. Либо «Открыть Telegram»: нажмите Start и вернитесь на эту вкладку."
      : "Нужен обновлённый сервер Бойни. Нажмите «Повторить» после выкладки Worker.";
    sh().gate({
      title: "Войти через Telegram",
      text: errText || "Бойня на компьютере открывается в браузере на весь экран. Роль та же, что в мини-аппе.",
      actions: widget + deep +
        '<button class="b-btn b-btn--main" type="button" data-act="gate-retry" style="margin-top:8px">Повторить</button>' +
        '<p class="b-note" style="margin-top:10px">' + sh().esc(note) + "</p>"
    });
    if (info && info.botUsername) mountTgWidget(info.botUsername);
  }

  async function openDesktopGate() {
    var info = null;
    try {
      info = await api().apiGet({ action: "startDesktopAuth" }, { timeoutMs: 8000, retries: 0, cacheTtlMs: 0 });
    } catch (eD) {
      info = null;
    }
    if (!info || info.status !== "success" || !info.botUsername) {
      showDesktopLogin(null, "Сервер входа ещё не ответил. Нажмите «Повторить». Пока Бойню можно открыть из бота в Telegram.");
      return;
    }
    showDesktopLogin(info, "");
  }

  function startDeskPoll() {
    stopDeskPoll();
    var token = deskToken;
    if (!token) return;
    var left = 90;
    deskPoll = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        stopDeskPoll();
        sh().toast("Telegram не подтвердил вход. Нажмите ещё раз.");
        return;
      }
      api().apiGet({ action: "pollDesktopAuth", token: token }, { timeoutMs: 8000, retries: 0, cacheTtlMs: 0 }).then(function (res) {
        if (token !== deskToken || !res || !res.linked || !res.tgLogin) return;
        stopDeskPoll();
        api().rememberLogin(res.tgLogin);
        boot();
      }).catch(function () {});
    }, 2000);
  }

  function openDesktopTelegram() {
    if (deskStartUrl) {
      try { root.open(deskStartUrl, "_blank", "noopener"); } catch (eOpen) {}
    }
    sh().toast("В Telegram нажмите Start и вернитесь сюда");
    startDeskPoll();
  }

  function logoutDesktop() {
    stopDeskPoll();
    deskToken = "";
    deskStartUrl = "";
    if (api().clearLogin) api().clearLogin();
    try { localStorage.removeItem("nx_access_v1"); } catch (eOut) {}
    access = null;
    boot();
  }

  async function askAccess() {
    var u = api().telegramUser() || {};
    await api().apiPost({
      action: "requestAccess",
      telegramId: String(u.id || ""),
      name: String(u.first_name || ""),
      username: String(u.username || "")
    });
    showFail("Заявка отправлена", "Ваша заявка отправлена! Пожалуйста, подождите...", "");
    sh().toast("Заявка отправлена");
  }

  function keepCached(text) {
    sh().hideGate();
    if (text) sh().toast(text);
  }

  function watchTelegram() {
    if (root.__NEXT_API_HOOK__ || watchTimer) return;
    var tries = 0;
    watchTimer = setInterval(function () {
      tries += 1;
      var live = api().liveInitData ? api().liveInitData() : "";
      if (live) {
        clearInterval(watchTimer);
        watchTimer = null;
        boot();
        return;
      }
      if (tries >= 20) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
    }, 400);
  }

  async function boot() {
    var ticket = ++bootGen;
    booting = true;
    sh().hideGate();
    var cachedAccess = null;
    try { cachedAccess = JSON.parse(localStorage.getItem("nx_access_v1") || "null"); } catch (eC) { cachedAccess = null; }
    var hadCache = !!(cachedAccess && cachedAccess.role && cachedAccess.role !== "none" && cachedAccess.role !== "pending" && cachedAccess.role !== "denied");
    if (hadCache) {
      access = ax().normalize(cachedAccess);
      settleRoute();
      paintSameOrRender();
    } else if (!access) {
      sh().main(sh().skeleton(4));
    }
    try {
      var init = root.__NEXT_API_HOOK__ ? "hook" : await api().waitForInitData(1600);
      if (ticket !== bootGen) return;
      var login = !init && api().loginData ? api().loginData() : "";
      if (!init && !login) {
        if (insideTelegramApp()) {
          if (hadCache) keepCached("Telegram ещё не ответил, показываю как было");
          else showFail("Откройте через Telegram", "Бойня работает только внутри Telegram (кнопка бота). Вне Telegram доступа нет.",
            '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
          watchTelegram();
          return;
        }
        await openDesktopGate();
        if (ticket !== bootGen) return;
        watchTelegram();
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
        }, { timeoutMs: 8000, retries: 1, cacheTtlMs: 0 });
      } catch (e) { res = null; }
      if (ticket !== bootGen) return;
      if (!res || res.status !== "success" || res.authRequired) {
        if (hadCache) {
          keepCached(res && res.authRequired ? "Подпись Telegram устарела, показываю как было" : "Не обновилось, показываю как было");
          return;
        }
        if (res && res.authRequired) {
          if (!init && login) {
            if (api().clearLogin) api().clearLogin();
            await openDesktopGate();
            return;
          }
          showFail("Нужен Telegram", "Подпись Telegram не прошла проверку. Нажмите «Повторить» или откройте мини-апп из бота.",
            '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
        } else {
          showFail("Нет связи", "Не удалось проверить доступ. Проверьте интернет и нажмите «Повторить».",
            '<button class="b-btn b-btn--main" type="button" data-act="gate-retry">Повторить</button>');
        }
        return;
      }
    access = ax().normalize(res);
    try { localStorage.setItem("nx_access_v1", JSON.stringify({ role: access.role, tabs: access.tabs, name: access.name, telegramId: access.telegramId })); } catch (eSave) {}
    if (u.first_name) access.name = String(u.first_name || "") + (u.last_name ? " " + u.last_name : "");
    var role = access.role;
    if (role === "none" || role === "pending" || role === "denied" || !access.tabs.length) {
      if (role === "denied") showFail("Доступ закрыт", "Обратитесь к владельцу.", "");
      else if (role === "pending") showFail("Заявка отправлена", "Ваша заявка отправлена! Пожалуйста, подождите...", "");
      else showFail("Нет доступа", "К сожалению, у вас нет доступа. Нажмите ниже для отправки заявки",
        '<button class="b-btn b-btn--main" type="button" data-act="gate-ask">Запросить доступ</button>');
      return;
    }
    sh().hideGate();
    settleRoute();
    paintSameOrRender();
    if (access.role === "owner" && expensesMod()) {
      expensesMod().bind(access);
    }
    refreshTasks().then(function () { if (access) paintChrome(); });
    if (ax().tabHas(access, "orderScreen")) {
      ord().loadDays();
      ord().bootPrices();
      ord().syncProfiles();
    }
    } finally {
      if (ticket === bootGen) booting = false;
    }
  }

  var pokeTimer = 0;
  function pokeOne(skip, getter) {
    if (skip) return;
    try {
      var mod = getter();
      if (mod && mod.refreshQuiet) mod.refreshQuiet();
    } catch (eM) {}
  }
  function pokeNow() {
    try { if (wk() && wk().noteMonth) wk().noteMonth({ op: "touch" }); } catch (eW) {}
    try { if (tasksMod() && tasksMod().refresh) tasksMod().refresh(); } catch (eT) {}
    var onMore = route.tab === "more";
    pokeOne(route.tab === "production", prod);
    pokeOne(route.tab === "warehouse", wh);
    pokeOne(route.tab === "clients", clients);
    pokeOne(route.tab === "goals", goalsMod);
    pokeOne(route.tab === "goals", expensesMod);
    pokeOne(onMore && moreView === "stats", stats);
    pokeOne(onMore && moreView === "partners", partners);
    pokeOne(onMore && moreView === "price", retail);
    pokeOne(onMore && moreView === "templates", tpl);
    pokeOne(onMore && (moreView === "staff" || moreView === "people" || moreView === "settings"), people);
  }

  function start() {
    root.__nxAfterWrite = function () {
      clearTimeout(pokeTimer);
      pokeTimer = setTimeout(pokeNow, 80);
    };
    root.__nxOrderVisible = function () {
      return route.tab === "orders" && route.seg === "new" && q().get("shot") !== "states";
    };
    root.__nxWeekVisible = function () {
      return route.tab === "orders" && (route.seg === "week" || route.seg === "month") && q().get("shot") !== "states";
    };
    root.__nxOpenNew = function () {
      route.tab = "orders";
      route.seg = "new";
      render();
    };
    root.__nxOpenWeek = function (day) {
      route.tab = "orders";
      route.seg = "week";
      if (day) wk().setDay(day);
      render();
    };
    root.__nxSetSeg = function (tab, seg) {
      route.tab = tab;
      route.seg = seg;
      if (seg === "calc" || seg === "pick") priceView = seg;
    };
    root.__nxPriceView = function (which) {
      if (which !== "calc" && which !== "pick") return;
      priceView = which;
      route.tab = "clients";
      route.seg = which;
      paintChrome();
    };
    root.__nxOpenPartners = function (nextTab) {
      route.tab = "more";
      moreView = "partners";
      partnersOpen = nextTab || "";
      render();
    };
    root.__nxOpenClients = function (nextSeg, nick) {
      if (nextSeg === "calc" || nextSeg === "pick") {
        if (!priceView) priceFrom = { tab: route.tab, seg: route.seg, moreView: moreView };
        priceView = nextSeg;
      } else {
        priceView = "";
      }
      route.tab = "clients";
      route.seg = nextSeg || "pp";
      if (nick && clients()) clients().setSearch(nick);
      render();
    };
    root.__nxTasksCount = function (n) {
      tasksN = Number(n) || 0;
      if (access) paintChrome();
    };
    root.__nxAfterWeekPaint = function () {
      if (!access || route.tab !== "orders") return;
      if (route.seg !== "week" && route.seg !== "month") return;
      var seg = wk().segment();
      if (seg && seg !== route.seg) route.seg = seg;
      paintChrome();
      var box = document.getElementById("nxSegs");
      if (!box) return;
      var items = orderSegs();
      box.innerHTML = items.map(function (s) {
        return '<button type="button" class="b-seg__item' + (s.id === route.seg ? " b-seg__item--on" : "") + '" data-act="oseg" data-seg="' + s.id + '">' + sh().esc(s.label) + "</button>";
      }).join("");
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
      if (tg) {
        tg.ready();
        function lockSwipes() {
          if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
          if (tg.expand) tg.expand();
        }
        lockSwipes();
        if (tg.onEvent) {
          tg.onEvent("themeChanged", function () {
            if (root.__boinyaApplyScheme) root.__boinyaApplyScheme();
          });
          tg.onEvent("viewportChanged", function (ev) {
            if (ev && ev.isStateStable === false) return;
            lockSwipes();
            if (sh().syncKeyboard) sh().syncKeyboard();
          });
          tg.onEvent("fullscreenChanged", function () { lockSwipes(); });
        }
      }
      if (root.__boinyaApplyScheme) root.__boinyaApplyScheme();
    } catch (e) {}
    document.addEventListener("visibilitychange", function () {
      if (!prod() || !prod().pauseBackground) return;
      if (document.hidden) prod().pauseBackground();
      else if (route.tab === "production" && prod().resumeBackground) prod().resumeBackground();
    });
    boot();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window);
