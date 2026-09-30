/* Права как в boinya-c/app.main.js: ROLE_TABS, TAB_TREE_, tabHas_, canUseTasksMenu.
   Нижняя панель собирается из этих прав, ничего сверх дерева не показывается.
   «Цели» — только владелец (решение 27.09), в этом шаге экран-заглушка. */
(function (root) {
  "use strict";

  var ROLE_TABS = {
    all: ["orderScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "subsScreen", "subDetailScreen", "partnerHubScreen"],
    owner: ["orderScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "subsScreen", "subDetailScreen", "statsScreen", "retailPriceScreen", "peopleScreen", "partnerHubScreen"],
    manager: ["orderScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "partnerHubScreen"],
    cutter: ["cuttingScreen", "deferredScreen"],
    courier: ["courierScreen", "deferredScreen"],
    logistics: ["warehouseScreen", "deferredScreen"],
    partner: ["partnerHubScreen", "deferredScreen"],
    none: [],
    pending: [],
    denied: []
  };

  var TAB_TREE = {
    clientsScreen: ["month", "week"],
    priceScreen: ["calc", "pick"],
    deferredScreen: ["xfer", "buy", "orders", "pp", "remind"],
    templatesScreen: ["texts", "ai"],
    courierScreen: ["route", "assembly"],
    partnerHubScreen: ["orders", "people", "points", "nets", "notify"]
  };

  var TAB_DEFERRED_OFF = "deferredScreen.none";
  var LEGACY_TASKS = ["manager", "all", "courier", "logistics", "cutter"];
  var SIMPLE = { cutter: "Нарезка", courier: "Курьер", logistics: "Склад" };

  var NAV_LABELS = {
    orders: "Заказы",
    clients: "Клиенты",
    production: "Цех",
    warehouse: "Склад",
    goals: "Цели",
    more: "Ещё"
  };

  var ROLE_RU = {
    owner: "владелец",
    manager: "менеджер",
    all: "все рабочие",
    cutter: "нарезчик",
    courier: "курьер",
    logistics: "склад",
    pending: "ожидание",
    denied: "закрыт",
    none: "нет доступа",
    partner: "партнёр"
  };

  function allowedTabs(role, tabs) {
    var base = Array.isArray(tabs) ? tabs.slice() : (ROLE_TABS[role] || []).slice();
    if (LEGACY_TASKS.indexOf(role) >= 0 && !base.some(function (t) {
      return t === "deferredScreen" || String(t).indexOf("deferredScreen.") === 0;
    })) base = base.concat(["deferredScreen"]);
    return base;
  }

  function tabHasIn(tabs, id) {
    if (!tabs || !id) return false;
    if (tabs.indexOf(id) >= 0) return true;
    var i = id.indexOf(".");
    if (i > 0) return tabs.indexOf(id.slice(0, i)) >= 0;
    var parent = id;
    if (!TAB_TREE[parent]) return false;
    for (var k = 0; k < tabs.length; k++) {
      if (String(tabs[k]).indexOf(id + ".") === 0 && tabs[k] !== TAB_DEFERRED_OFF) return true;
    }
    return false;
  }

  function tabHas(access, id) {
    if (!access) return false;
    if (access.role === "owner") return true;
    return tabHasIn(access.tabs, id);
  }

  function canUseTasks(access) {
    if (!access) return false;
    if (access.role === "owner") return true;
    if (access.role === "none" && !access.ready) return false;
    return tabHas(access, "deferredScreen");
  }

  function subOn(access, parent, child) {
    return tabHas(access, parent + "." + child);
  }

  function isSimple(access) {
    if (!access || !SIMPLE[access.role]) return false;
    return !(access.customTabs && access.customTabs.length);
  }

  function navItems(access) {
    if (!access || isSimple(access)) return [];
    var h = function (id) { return tabHas(access, id); };
    var items = [];
    if (h("orderScreen") || h("clientsScreen")) items.push({ id: "orders", label: NAV_LABELS.orders });
    if (h("subsScreen") || h("subDetailScreen")) items.push({ id: "clients", label: NAV_LABELS.clients });
    else if (h("priceScreen")) items.push({ id: "clients", label: "Расчёт" });
    if (h("cuttingScreen") || h("courierScreen")) items.push({ id: "production", label: NAV_LABELS.production });
    if (h("warehouseScreen")) items.push({ id: "warehouse", label: NAV_LABELS.warehouse });
    if (h("templatesScreen") || h("statsScreen") || h("retailPriceScreen") || h("peopleScreen") || h("partnerHubScreen") || h("priceScreen") || access.role === "owner") {
      items.push({ id: "more", label: access.role === "partner" ? "Партнёры" : NAV_LABELS.more });
    }
    return items;
  }

  function orderSegs(access) {
    var segs = [];
    if (tabHas(access, "orderScreen")) segs.push({ id: "new", label: "Заказ" });
    if (tabHas(access, "clientsScreen.month") || tabHas(access, "clientsScreen.week") || tabHas(access, "clientsScreen")) {
      segs.push({ id: "month", label: "Месяц" });
    }
    return segs;
  }

  function normalize(res) {
    var role = String((res && res.role) || "none");
    var tabs = Array.isArray(res && res.tabs) ? res.tabs.slice() : (ROLE_TABS[role] || []).slice();
    var custom = Array.isArray(res && res.customTabs) ? res.customTabs.slice() : [];
    tabs = allowedTabs(role, tabs);
    return {
      ready: true,
      role: role,
      tabs: tabs,
      customTabs: custom,
      name: String((res && res.name) || ""),
      telegramId: String((res && res.telegramId) || "")
    };
  }

  root.BoinyaAccess = {
    NAV_LABELS: NAV_LABELS,
    ROLE_TABS: ROLE_TABS,
    ROLE_RU: ROLE_RU,
    SIMPLE: SIMPLE,
    TAB_DEFERRED_OFF: TAB_DEFERRED_OFF,
    allowedTabs: allowedTabs,
    tabHas: tabHas,
    canUseTasks: canUseTasks,
    isSimple: isSimple,
    navItems: navItems,
    orderSegs: orderSegs,
    normalize: normalize,
    TAB_TREE: TAB_TREE,
    tabsInclude: tabHasIn
  };
})(window);
