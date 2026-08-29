
    const GOOGLE_WEBHOOK_ORIGIN = "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec";

    const GOOGLE_WEBHOOK_URL = (window.__BOINYA_C_PROXY__ || window.__BOINYA_FAST_PROXY__ || GOOGLE_WEBHOOK_ORIGIN);
    const DEFAULT_CITY = "Минск";
    const APP_VERSION = window.__BOINYA_APP_VERSION__ || "v71115912";
    try {
      var _hdrBoot = document.getElementById("appHeaderTitle");
      if (_hdrBoot) _hdrBoot.innerText = "Бойня C " + APP_VERSION;
    } catch (eBootVer) {}
    const YANDEX_ROUTE_PAGE = "https://konchaarsenia-a11y.github.io/superboyna/yandex-route.html";
    const MINSK_CENTER = { lat: 53.9023, lon: 27.5619 };
    const MINSK_RADIUS_KM = 20;
    const DEPOT_PRESETS = ["Белецкого 10к2"];
    const POST_OFFICES = {
      euro: [
        { address: "Минск, ул. Монтажников, 2", lat: 53.8695, lon: 27.4855 },
        { address: "Минск, ул. Неманская, 67", lat: 53.9538, lon: 27.4335 },
        { address: "Минск, ул. 50 лет Победы, 5а", lat: 53.9385, lon: 27.4860 },
        { address: "Минск, ул. Мележа, 5", lat: 53.9380, lon: 27.5905 },
        { address: "Минск, ул. Притыцкого, 29", lat: 53.9085, lon: 27.4540 },
        { address: "Минск, ул. Казимировская, 6", lat: 53.8470, lon: 27.4765 },
        { address: "Минск, ул. Плеханова, 38", lat: 53.8665, lon: 27.6200 },
        { address: "Минск, пр. Дзержинского, 104", lat: 53.8465, lon: 27.4820 },
        { address: "Минск, пр. Рокоссовского, 99", lat: 53.8705, lon: 27.6010 },
        { address: "Минск, ул. Уманская, 54", lat: 53.8910, lon: 27.4470 },
        { address: "Минск, ул. Есенина, 76", lat: 53.8415, lon: 27.5155 },
        { address: "Минск, ул. Казинца, 52а", lat: 53.8560, lon: 27.5120 },
        { address: "Минск, ул. Маяковского, 154", lat: 53.8690, lon: 27.6205 },
        { address: "Минск, ул. Гошкевича, 3", lat: 53.8440, lon: 27.4700 },
        { address: "Минск, ул. Алибегова, 13", lat: 53.8890, lon: 27.5305 }
      ],
      bel: [
        { address: "Минск, пр. Независимости, 10", lat: 53.9005, lon: 27.5620 },
        { address: "Минск, ул. Притыцкого, 91", lat: 53.9095, lon: 27.4300 },
        { address: "Минск, ул. Якуба Коласа, 51", lat: 53.9280, lon: 27.5850 },
        { address: "Минск, пр. Партизанский, 6", lat: 53.8840, lon: 27.5805 },
        { address: "Минск, ул. Тимирязева, 65", lat: 53.9275, lon: 27.5080 },
        { address: "Минск, ул. Сурганова, 43", lat: 53.9285, lon: 27.5955 },
        { address: "Минск, пр. Дзержинского, 23", lat: 53.8800, lon: 27.5100 },
        { address: "Минск, ул. Рафиева, 60", lat: 53.8455, lon: 27.4505 },
        { address: "Минск, ул. Каховская, 27", lat: 53.8700, lon: 27.6500 },
        { address: "Минск, ул. Ложинская, 22", lat: 53.9530, lon: 27.6050 }
      ]
    };
    let selectedDeliveryMethod = null;
    let selectedAddressGeo = null; // {lat, lon, address, yandexUrl}
    let selectedPostOfficeGeo = null;
    let noteRoles = { mgr: false, cut: false, cour: true };
    let orderNotes = [{ text: "", roles: { mgr: false, cut: false, cour: true }, permanent: false }];
    let priceBasket = [];
    let priceBaskets = { 1: [], 2: [] };
    let priceDogCount = 1;
    let priceActiveDog = 1;
    let priceDogNames = { 1: "", 2: "" };
    let priceMode = "pp";
    function makeEmptyPriceModeStore() {
      return {
        baskets: { 1: [], 2: [] },
        dogCount: 1,
        activeDog: 1,
        dogNames: { 1: "", 2: "" },
        lastMessage: "",
        apiCache: null,
        packCounts: { small: 0, medium: 0, large: 0, legs: 0 },
        note: ""
      };
    }
    var priceByMode = {
      pp: makeEmptyPriceModeStore(),
      retail: makeEmptyPriceModeStore()
    };
    let postOfficeSuggestTimer = null;
    let postOfficeSuggestSeq = 0;
    let addressSuggestTimer = null;
    let addressSuggestSeq = 0;
    let addressSuggestPaused = false;
    let cuttingItemsCache = [];
    let cuttingCompletionCache = null;
    let cuttingDetailExpanded_ = false;
    let cuttingLocalFlags = Object.create(null); // row -> {laid, done, outNext, ts}
    let assemblyLocalFlags = Object.create(null); // nameKey -> {assembled, printed, ts}
    let courierLocalFlags = Object.create(null); // nameKey -> {delivered, ts}
    let cuttingSession = {
      active: false,
      startedAt: 0,
      timerId: null,
      day: "",
      pollId: null,
      fingerprint: "",
      pendingWrites: 0,
      quietUntil: 0,
      celebrateCutTimer: null,
      celebrateCutQueued: 0
    };
    var _cuttingLoadSeq = 0;
    var _courierLoadSeq = 0;
    var _assemblyLoadSeq = 0;
    var _viewClientsLoadSeq = 0;
    var _deliveryDateResolveSeq = 0;
    var _monthOverviewLoadSeq = 0;
    let routePlanState = {
      courierCount: 1,
      routes: [[], []],
      geoCache: {},
      matrix: null,
      depot: null
    };
    let departTimeLocked = false;

    let APP_ROLE = "all";
    let myTelegramId = "";
    let myAccessName = "";
    const TG_ID_LS = "superboyna_tg_id";

    function readTelegramIdFromUrl_() {
      try {
        var u = new URL(location.href);
        var q = String(u.searchParams.get("tid") || u.searchParams.get("telegramId") || "").trim();
        if (q && /^\d{5,15}$/.test(q)) return q;
      } catch (eU) {}
      return "";
    }

    function readTelegramIdFromTg() {
      try {
        var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (u && u.id) return String(u.id);
      } catch (e0) {}
      try {
        var raw = (tg && tg.initData) || "";
        if (!raw) return "";
        var m = String(raw).match(/(?:^|&)user=([^&]+)/);
        if (!m) return "";
        var ju = JSON.parse(decodeURIComponent(m[1]));
        if (ju && ju.id) return String(ju.id);
      } catch (e1) {}
      try {
        var fromUrl = readTelegramIdFromUrl_();
        if (fromUrl) return fromUrl;
      } catch (e2) {}
      return "";
    }

    function loadStoredTelegramId() {
      try { return String(localStorage.getItem(TG_ID_LS) || "").trim(); } catch (e) { return ""; }
    }

    function storeTelegramId(id) {
      id = String(id || "").trim();
      if (!id) return;
      myTelegramId = id;
      try { localStorage.setItem(TG_ID_LS, id); } catch (e) {}
    }

    async function ensureTelegramId() {
      if (myTelegramId) return myTelegramId;
      var id = readTelegramIdFromTg() || loadStoredTelegramId();
      if (id) { storeTelegramId(id); return id; }
      var entered = await uiPromptAsync(
        "Ваш Telegram ID (цифры). Нужен для задач ☰.\nУзнать: @userinfobot или настройки Telegram.",
        ""
      );
      if (entered === null) return "";
      id = String(entered || "").replace(/\D/g, "");
      if (!id) {
        showToast("Нужен Telegram ID");
        return "";
      }
      storeTelegramId(id);
      return id;
    }
    window.ensureTelegramId = ensureTelegramId;
    const ROLE_TABS = {
      all: ["orderScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "subsScreen", "subDetailScreen", "statsScreen", "peopleScreen", "partnerHubScreen"],
      owner: ["orderScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "subsScreen", "subDetailScreen", "statsScreen", "peopleScreen", "partnerHubScreen"],
      manager: ["orderScreen", "clientsScreen", "priceScreen", "deferredScreen", "templatesScreen"],
      cutter: ["cuttingScreen"],
      courier: ["courierScreen"],
      logistics: ["warehouseScreen"],
      none: [],
      pending: [],
      denied: []
    };
    const MAIN_TABS = ["orderScreen", "cuttingScreen", "courierScreen", "warehouseScreen", "partnerHubScreen"];

    let courierSub = "route";
    let weekTabUnlocked = false;
    let packTypesEnabled = {
      "маленький": true,
      "средний": true,
      "большой": true,
      "целое": true,
      "крафт": true
    };
    let assemblyCache = null;
    const FLYOUT_SCREENS = ["clientsScreen", "priceScreen", "deferredScreen", "templatesScreen", "subsScreen", "subDetailScreen", "statsScreen", "peopleScreen"];
    let deferredCache = [];
    let deferredOpenCount = 0;
    let deferredCacheAt = 0;
    let deferredFetchInFlight = null;
    window._enrollDeferredId = "";
    window._enrollDirect = false;

    let tg = null;
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        function lockTgSwipes_() {
          try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e1) {}
          try { if (tg.enableClosingConfirmation) tg.enableClosingConfirmation(); } catch (e2) {}
          try { if (tg.expand) tg.expand(); } catch (e3) {}
        }
        lockTgSwipes_();
        try {
          if (tg.onEvent) {
            tg.onEvent("viewportChanged", lockTgSwipes_);
            tg.onEvent("fullscreenChanged", lockTgSwipes_);
          }
        } catch (eEv) {}
        try {
          if (tg.setHeaderColor) tg.setHeaderColor("#0a0a0a");
          if (tg.setBackgroundColor) tg.setBackgroundColor("#0a0a0a");
        } catch (e) {}

        try {
          if (tg.isFullscreen && typeof tg.exitFullscreen === "function") {
            tg.exitFullscreen();
          }
        } catch (e) {}
      }
    } catch (e) {}

    (function installButtonPressFeedback_() {
      var SEL = "button,.btn-action,.btn-save,.seg-btn,.tab-link,.crm-mini-btn,.route-mini," +
        ".modal-day-btn,.order-day-chip,.order-flyout-btn,.sub-tab,.help-fab,.bug-fab,.tasks-menu-btn";
      var lastHaptic = 0;
      function btnFrom(t) {
        if (!t || !t.closest) return null;
        var b = t.closest(SEL);
        if (!b) return null;
        if (b.disabled || b.getAttribute("aria-disabled") === "true") return null;
        if (b.classList && b.classList.contains("is-empty") && b.disabled) return null;
        return b;
      }
      function clearPress() {
        try {
          document.querySelectorAll(".is-pressing").forEach(function (el) {
            el.classList.remove("is-pressing");
          });
        } catch (eC) {}
      }
      function onDown(ev) {
        var b = btnFrom(ev.target);
        if (!b) return;
        b.classList.add("is-pressing");
        var now = Date.now();
        if (now - lastHaptic > 45) {
          lastHaptic = now;
          try {
            if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) {
              tg.HapticFeedback.impactOccurred("light");
            }
          } catch (eH) {}
        }
      }
      function onUp() { clearPress(); }
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("pointercancel", onUp, true);
      document.addEventListener("lostpointercapture", onUp, true);
      window.addEventListener("blur", clearPress);
    })();

    try {
      document.addEventListener("touchmove", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest(".view-col, #notesModalBody, .modal-sheet, .screen-scroll")) return;
      }, { passive: true });
    } catch (eTm) {}

    function applyTelegramSafeArea() {
      var top = 12;
      var bottom = 20;
      try {
        if (tg) {
          var sa = tg.safeAreaInset || {};
          var csa = tg.contentSafeAreaInset || {};
          top = Math.max(top, Number(sa.top) || 0, Number(csa.top) || 0);
          bottom = Math.max(bottom, Number(sa.bottom) || 0, Number(csa.bottom) || 0);
          if (tg.isFullscreen) bottom = Math.max(bottom, 34);

          bottom = Math.max(bottom, 28);
        }
      } catch (e) {}
      document.documentElement.style.setProperty("--safe-top", top + "px");
      document.documentElement.style.setProperty("--safe-bottom", bottom + "px");
      try { if (typeof syncAppTopSpacer === "function") syncAppTopSpacer(); } catch (eSp) {}
    }

    applyTelegramSafeArea();
    if (tg && typeof tg.onEvent === "function") {
      ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"].forEach(function (ev) {
        try { tg.onEvent(ev, applyTelegramSafeArea); } catch (e) {}
      });
    }
    window.addEventListener("resize", applyTelegramSafeArea);

    let modalResolver = null;

    function unlockPageScroll_() {
      try {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        document.body.style.pointerEvents = "auto";
        document.documentElement.style.pointerEvents = "auto";
        var overlay = document.getElementById("modalOverlay");
        if (overlay && !overlay.classList.contains("open")) {
          overlay.style.display = "none";
          overlay.style.pointerEvents = "none";
        }
      } catch (eU) {}
    }

    function recoverUiFocus() {
      try {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } catch (e) {}
      unlockPageScroll_();

      setTimeout(function () {
        unlockPageScroll_();
        window.scrollTo(0, window.scrollY || 0);
      }, 50);
    }

    function isEditableFocus() {
      const a = document.activeElement;
      if (!a) return false;
      const tag = (a.tagName || "").toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.isContentEditable;
    }

    function dismissKeyboard() {
      if (!isEditableFocus()) return;
      try { document.activeElement.blur(); } catch (e) {}
    }

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.closest && t.closest("input, textarea, select, .addr-suggest, .modal-overlay, .seg-btn, button, a, label")) return;
      dismissKeyboard();
    }, true);

    let _kbTouchY = null;
    let _kbTouchOnField = false;
    document.addEventListener("touchstart", function (e) {
      _kbTouchY = e.touches && e.touches[0] ? e.touches[0].clientY : null;
      var t = e.target;
      _kbTouchOnField = !!(t && t.closest && t.closest("input, textarea, select, .addr-suggest, .modal-overlay"));
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!isEditableFocus() || _kbTouchY == null || _kbTouchOnField) return;
      var y = e.touches && e.touches[0] ? e.touches[0].clientY : _kbTouchY;
      if ((y - _kbTouchY) > 80) dismissKeyboard();
    }, { passive: true });
    var SCREEN_HELP = {
      orderScreen:
        "Заказ\n" +
        "• Тип: ПП — цена с листа ФАКТ СТОИМОСТЬ; БП = 0 + опросник; Розница — авто; Партнёр — свой прайс.\n" +
        "• Дата: бронь; в «Прием заказов» — утром предыдущего дня.\n" +
        "• 2 собаки: один хозяин → Собака 1/2 составы → один клиент (в сборке два состава).\n" +
        "• Адрес: выбери из списка. Подъезд — для курьера (короткий адрес).\n" +
        "• Чеклист: непонятная фракция / голый «кубик» — спросит (не в примечание). 2 собаки — блоки с кличками или пустая строка.",
      clientsScreen:
        "Просмотр\n" +
        "• Вкладки Месяц / Неделя — переключение без обновления.\n" +
        "• Дата текущей недели → только колонка недели.\n" +
        "• Дальние даты → только календарь.\n" +
        "• 🔄 — перенос на другую дату.\n" +
        "• «Обновить» на обзоре/дне — только по кнопке.",
      cuttingScreen: "Нарезка\n• Выбери день и отмечай нарезанное.",
      courierScreen:
        "Курьер\n" +
        "• Точка выезда: склад или свой адрес.\n" +
        "• Сборка: long-press. Форматы пакетов можно выключить — «Итого» уменьшится.",
      warehouseScreen: "Склад\n• Остаток на сегодня; «неделя» = F+B.",
      subsScreen: "Подписки\n• Пароль; Отмена → Заказ.\n• Карточка: мета + состав (ручной ввод) → Сохранить.\n• ПП: «Сообщение клиенту» — копировать текст и открыть Instagram.\n• ПП↔АФК / удалить.",
      subDetailScreen: "Карточка подписки\n• Правишь поля и состав → Сохранить.\n• ПП/АФК: «Сообщение клиенту» — текст как в Расчёте, копируй в Direct.",
      statsScreen: "Статистика\n• Месяц, воронка БП, CAC, аудит, экспорт.",
      priceScreen: "Расчёт\n• ПП и розница — отдельные составы.\n• Чеклист: 1–2 собаки; неясная фракция — спросит.\n• 2 собаки: кличка + состав; примечание и цены общие.",
      deferredScreen: "Задачи (☰)\n• Незакрытые дела справа.\n• Сейчас: отложенные расчёты ПП.",
      templatesScreen: "Шаблоны\n• Тексты — сообщения, опросники и вход в «Карточка лакомств».\n• Подбор ИИ — скоро.",
      peopleScreen: "Доступы\n• Завершить неделю / подтянуть из месяца — сверху.\n• Роли и часовой пояс — только владельцы.\n• Опросники: с 9:00 каждые 30 мин по TZ сотрудника.",
      partnerHubScreen: "Партнёры (мини-апп varka)\n• Люди — доступы к точкам.\n• Точки / Сети — справочник.\n• Пуши — кому слать заявки.\n• Не путать с партнёрами БП в Доступах."
    };

    window._templatesSub = "texts";
    window._templatesList = [];
    window._templatesListLoaded = false;
    window._productCardsCat = "";
    window._productCardsName = "";

    function setTemplatesSub_(sub) {
      if (sub !== "ai" && sub !== "cards") sub = "texts";
      window._templatesSub = sub;
      var tabT = document.getElementById("tplTabTexts");
      var tabA = document.getElementById("tplTabAi");
      var paneT = document.getElementById("templatesPaneTexts");
      var paneC = document.getElementById("templatesPaneCards");
      var paneA = document.getElementById("templatesPaneAi");

      if (tabT) tabT.classList.toggle("active", sub === "texts" || sub === "cards");
      if (tabA) tabA.classList.toggle("active", sub === "ai");
      if (paneT) paneT.style.display = sub === "texts" ? "" : "none";
      if (paneC) paneC.style.display = sub === "cards" ? "" : "none";
      if (paneA) paneA.style.display = sub === "ai" ? "" : "none";
      if (sub === "texts") {
        try { loadTemplatesList_({ soft: true }); } catch (eL) {}
      }
      if (sub === "cards") {
        try { renderProductCardsHome_(); } catch (eC) {}
      }
    }
    window.setTemplatesSub_ = setTemplatesSub_;

    function tplKindLabel_(kind, id) {
      var k = String(kind || "").toLowerCase();
      var i = String(id || "").toLowerCase();
      if (k === "survey" || i.indexOf("survey_") === 0) return "Опросник";
      if (k === "product" || i.indexOf("prod_") === 0) return "Карточка позиции";
      if (k === "text" || k === "msg" || k === "reply") return "Текст";
      return kind || "текст";
    }

    function isProductTemplateRow_(it) {
      var k = String((it && it.kind) || "").toLowerCase();
      var i = String((it && it.id) || "").toLowerCase();
      return k === "product" || i.indexOf("prod_") === 0;
    }

    function renderTemplatesList_() {
      var box = document.getElementById("templatesList");
      if (!box) return;
      var items = (window._templatesList || []).filter(function (it) {
        return !isProductTemplateRow_(it);
      });
      var html =
        '<div class="card" style="margin:0 0 12px;padding:12px;border:1px solid rgba(255,122,0,0.45);cursor:pointer;" onclick="openProductCardsFromTemplates_()">' +
        '<div style="font-weight:600;font-size:15px;color:var(--accent-color);">Карточка лакомств</div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px;">Все позиции ассортимента → краткое описание, копировать клиенту</div>' +
        "</div>";
      if (!items.length) {
        html += '<p class="muted">Текстовых шаблонов пока нет — нажми «＋ Шаблон».</p>';
        box.innerHTML = html;
        return;
      }
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var realIdx = (window._templatesList || []).indexOf(it);
        if (realIdx < 0) realIdx = i;
        var title = String(it.title || it.id || "Без названия");
        var body = String(it.body || "");
        var preview = body.length > 140 ? body.slice(0, 140) + "…" : body;
        var kindL = tplKindLabel_(it.kind, it.id);
        html +=
          '<div class="card" style="margin:0 0 10px;padding:12px;" data-tpl-i="' + realIdx + '">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
          '<div style="min-width:0;flex:1;">' +
          '<div style="font-weight:600;font-size:15px;">' + escapeHtml(title) + "</div>" +
          '<div class="muted" style="font-size:11px;margin-top:2px;">' + escapeHtml(kindL) +
          (it.id ? " · " + escapeHtml(String(it.id)) : "") + "</div>" +
          "</div></div>" +
          (preview
            ? '<div style="font-size:13px;margin-top:8px;white-space:pre-wrap;color:#ddd;line-height:1.35;">' +
              escapeHtml(preview) + "</div>"
            : "") +
          '<div class="batch-bar-row" style="margin:10px 0 0;gap:6px;flex-wrap:wrap;">' +
          '<button type="button" class="crm-mini-btn" style="width:auto;padding:0 10px;height:32px;" onclick="copyTemplateBody_(' + realIdx + ')">Копировать</button>' +
          '<button type="button" class="crm-mini-btn" style="width:auto;padding:0 10px;height:32px;" onclick="openTplEditForm_(' + realIdx + ')">Изменить</button>' +
          '<button type="button" class="crm-mini-btn" style="width:auto;padding:0 10px;height:32px;color:#ff453a;" onclick="deleteTemplateUi_(' + realIdx + ')">Удалить</button>' +
          "</div></div>";
      }
      box.innerHTML = html;
    }

    function openProductCardsFromTemplates_() {
      setTemplatesSub_("cards");
    }
    window.openProductCardsFromTemplates_ = openProductCardsFromTemplates_;

    async function loadTemplatesList_(opts) {
      opts = opts || {};
      var box = document.getElementById("templatesList");
      if (!opts.force && opts.soft && window._templatesListLoaded) {
        renderTemplatesList_();
        return;
      }
      if (box && !opts.soft) box.innerHTML = '<p class="muted">Загрузка…</p>';
      else if (box && opts.soft && !window._templatesListLoaded) box.innerHTML = '<p class="muted">Загрузка…</p>';
      try {
        var params = { action: "listTemplates" };
        if (opts.force) params._ = String(Date.now());
        var res = await apiGet(
          params,
          { timeoutMs: opts.soft ? 18000 : 25000, retries: opts.soft ? 0 : 1, cacheTtlMs: opts.force ? 0 : undefined }
        );
        var items = (res && (res.templates || res.items)) || [];
        window._templatesList = items;
        window._templatesListLoaded = true;
        window._surveyTemplates = items.filter(function (t) {
          return String(t.kind || "").toLowerCase() === "survey" ||
            String(t.id || "").toLowerCase().indexOf("survey_") === 0;
        });
        renderTemplatesList_();
      } catch (e) {
        if (box && !opts.soft) box.innerHTML = '<p class="muted">Не загрузилось — проверь Deploy Code.gs (listTemplates).</p>';
      }
    }
    window.loadTemplatesList_ = loadTemplatesList_;

    function closeTplAddForm_() {
      var card = document.getElementById("tplAddCard");
      if (card) { card.style.display = "none"; card.innerHTML = ""; }
    }
    window.closeTplAddForm_ = closeTplAddForm_;

    function openTplAddForm_(edit) {
      edit = edit || null;
      var card = document.getElementById("tplAddCard");
      if (!card) return;
      var isEdit = !!(edit && edit.id);
      var kind = String((edit && edit.kind) || "text");
      var editId = String((edit && edit.id) || "");
      if (/^survey_/i.test(editId)) kind = "survey";
      if (kind !== "survey" && kind !== "text") kind = "text";
      card.innerHTML =
        '<div class="section-title" style="margin-top:0;">' + (isEdit ? "Изменить шаблон" : "Новый шаблон") + "</div>" +
        '<input type="hidden" id="tplEditId" value="' + escapeHtml(isEdit ? String(edit.id) : "") + '">' +
        '<div class="form-group"><label>Название</label>' +
        '<input type="text" id="tplTitleInput" placeholder="Например: Ответ после жалобы" value="' +
        escapeHtml(String((edit && edit.title) || "")) + '"></div>' +
        '<div class="form-group"><label>Тип</label><select id="tplKindSelect">' +
        '<option value="text"' + (kind === "text" ? " selected" : "") + ">Текст клиенту</option>" +
        '<option value="survey"' + (kind === "survey" ? " selected" : "") + ">Опросник</option>" +
        "</select></div>" +
        '<div class="form-group"><label>Текст</label>' +
        '<textarea id="tplBodyInput" rows="8" placeholder="Текст шаблона. В опросниках можно писать «Здравствуйте, !» — подставится ник.">' +
        escapeHtml(String((edit && edit.body) || "")) + "</textarea></div>" +
        '<button type="button" class="btn-action btn-blue" onclick="submitTemplateForm_()">Сохранить</button>' +
        '<button type="button" class="btn-action" style="margin-top:8px;background:#3a3a3c;" onclick="closeTplAddForm_()">Отмена</button>';
      card.style.display = "block";
      try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (eS) {}
    }
    window.openTplAddForm_ = openTplAddForm_;

    function openTplEditForm_(index) {
      var it = (window._templatesList || [])[index];
      if (!it) return;
      openTplAddForm_(it);
    }
    window.openTplEditForm_ = openTplEditForm_;

    async function submitTemplateForm_() {
      var idEl = document.getElementById("tplEditId");
      var titleEl = document.getElementById("tplTitleInput");
      var kindEl = document.getElementById("tplKindSelect");
      var bodyEl = document.getElementById("tplBodyInput");
      var id = idEl ? String(idEl.value || "").trim() : "";
      var title = titleEl ? String(titleEl.value || "").trim() : "";
      var kind = kindEl ? String(kindEl.value || "text") : "text";
      var body = bodyEl ? String(bodyEl.value || "").trim() : "";
      if (!title && !body) { showToast("Укажи название или текст"); return; }
      if (!title) title = "Без названия";
      var tid = "";
      try { tid = String(typeof ensureTelegramId === "function" ? ensureTelegramId() : (myTelegramId || "")); } catch (eT) {
        tid = String(myTelegramId || "");
      }
      if (!tid || tid === "undefined" || tid === "null") tid = String(myTelegramId || "") || "";
      if (tid === "undefined" || tid === "null") tid = "";

      function utf8ToB64_(s) {
        try {
          return btoa(unescape(encodeURIComponent(String(s || ""))));
        } catch (e) {
          return "";
        }
      }

      var titleB64 = utf8ToB64_(title);
      var bodyB64 = utf8ToB64_(body);
      var payload = {
        action: "saveTemplate",
        id: id,
        kind: kind,
        titleB64: titleB64,
        bodyB64: bodyB64,
        telegramId: tid,
        _: String(Date.now())
      };

      if (!titleB64) payload.title = title;
      if (!bodyB64) payload.body = body;

      showToast("Сохраняю…");
      try {
        var qApprox = Object.keys(payload).reduce(function (n, k) {
          return n + encodeURIComponent(String(payload[k] == null ? "" : payload[k])).length + 2;
        }, 0);
        var res = null;
        if (qApprox < 7000) {
          res = await apiGet(payload, { timeoutMs: 45000, cacheTtlMs: 0 });
        } else {

          await apiPost({
            action: "saveTemplate",
            id: id,
            kind: kind,
            title: title,
            body: body,
            titleB64: titleB64,
            bodyB64: bodyB64,
            telegramId: tid
          });
          await new Promise(function (r) { setTimeout(r, 900); });
          var list = await apiGet(
            { action: "listTemplates", _: String(Date.now()) },
            { timeoutMs: 30000, cacheTtlMs: 0 }
          );
          var items = (list && (list.templates || list.items)) || [];
          var found = null;
          if (id) {
            found = items.filter(function (t) {
              return String(t.id || "").toLowerCase() === id.toLowerCase();
            })[0];
          }
          if (!found) {
            found = items.filter(function (t) {
              return String(t.title || "") === title && String(t.body || "") === body;
            })[0];
          }
          res = found
            ? { status: "success", id: found.id, title: found.title, body: found.body, kind: found.kind }
            : { status: "error", message: "not_confirmed" };
        }
        if (!res || res.status !== "success") {
          var why = (res && res.message) || "ошибка";
          if (why === "owner_only" || why === "forbidden") why = "нет доступа — Deploy Code.gs v7.11.93";
          if (why === "unknown_action") why = "нужен Deploy Code.gs (saveTemplate)";
          if (why === "not_confirmed") why = "сервер не подтвердил запись — Deploy Code.gs";
          showToast("Не сохранилось: " + why);
          return;
        }

        try {
          var saved = {
            id: res.id || id,
            kind: res.kind || kind,
            title: res.title != null ? res.title : title,
            body: res.body != null ? res.body : body
          };
          var cur = window._templatesList || [];
          var ix = -1;
          for (var i = 0; i < cur.length; i++) {
            if (String(cur[i].id || "").toLowerCase() === String(saved.id || "").toLowerCase()) { ix = i; break; }
          }
          if (ix >= 0) cur[ix] = saved;
          else cur = [saved].concat(cur);
          window._templatesList = cur;
          window._templatesListLoaded = true;
          renderTemplatesList_();
        } catch (eOpt) {}
        closeTplAddForm_();
        showToast("Сохранено");
        try { apiCacheBustMem_("listTemplates"); } catch (eB) {}
        window._templatesListLoaded = false;
        await loadTemplatesList_({ force: true });
      } catch (e) {
        var msg = String((e && e.message) || e || "");
        if (/таймаут/i.test(msg)) showToast("Таймаут — Deploy Code.gs или короче текст");
        else showToast("Ошибка сохранения — Deploy Code.gs v7.11.93");
      }
    }
    window.submitTemplateForm_ = submitTemplateForm_;

    async function deleteTemplateUi_(index) {
      var it = (window._templatesList || [])[index];
      if (!it || !it.id) return;
      var ok = await uiConfirmAsync("Удалить шаблон «" + (it.title || it.id) + "»?");
      if (!ok) return;
      var tid = "";
      try { tid = String(typeof ensureTelegramId === "function" ? ensureTelegramId() : (myTelegramId || "")); } catch (eT) {
        tid = String(myTelegramId || "");
      }
      if (!tid || tid === "undefined" || tid === "null") tid = "";
      showToast("Удаляю…");
      try {
        var res = await apiGet({
          action: "deleteTemplate",
          id: String(it.id),
          telegramId: tid,
          _: String(Date.now())
        }, { timeoutMs: 35000, cacheTtlMs: 0 });

        if (res && res.status !== "success" && (res.message === "forbidden" || res.message === "owner_only") && tid) {
          res = await apiGet({
            action: "deleteTemplate",
            id: String(it.id),
            _: String(Date.now())
          }, { timeoutMs: 35000, cacheTtlMs: 0 });
        }
        if (!res || res.status !== "success") {
          var why = (res && res.message) || "ошибка";
          if (why === "canonical_owner_only") why = "канон опросника — только владелец";
          if (why === "forbidden" || why === "owner_only") why = "нет доступа — Deploy Code.gs v7.11.94";
          if (why === "unknown_action") why = "нужен Deploy Code.gs (deleteTemplate)";
          if (why === "not_found") why = "не найден на листе — обнови список";
          showToast("Не удалилось: " + why);
          return;
        }

        try {
          window._templatesList = (window._templatesList || []).filter(function (x, i) {
            return i !== index && String(x.id || "") !== String(it.id);
          });
          renderTemplatesList_();
        } catch (eOpt) {}
        showToast("Удалено");
        try { apiCacheBustMem_("listTemplates"); } catch (eB) {}
        window._templatesListLoaded = false;
        await loadTemplatesList_({ force: true });
      } catch (e) {
        var msg = String((e && e.message) || e || "");
        if (/таймаут/i.test(msg)) showToast("Таймаут удаления — Deploy Code.gs");
        else showToast("Ошибка удаления — Deploy Code.gs v7.11.94");
      }
    }
    window.deleteTemplateUi_ = deleteTemplateUi_;

    async function copyTemplateBody_(index) {
      var it = (window._templatesList || [])[index];
      if (!it) return;
      var text = String(it.body || it.title || "");
      if (!text) { showToast("Пусто"); return; }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showToast("Скопировано");
          return;
        }
      } catch (e1) {}
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast("Скопировано");
      } catch (e2) {
        showToast("Не скопировалось — открой «Изменить»");
      }
    }
    window.copyTemplateBody_ = copyTemplateBody_;

    async function openScreenHelp() {
      var scr = document.querySelector(".screen.active");
      var id = scr && scr.id ? scr.id : "orderScreen";
      var text = SCREEN_HELP[id] || "Справка для этого экрана пока пустая.";
      var html =
        '<div class="modal-title">Справка</div>' +
        '<div class="modal-text" style="white-space:pre-line;text-align:left;">' +
        escapeHtml(String(text)) +
        "</div>" +
        '<div class="modal-actions"><button class="btn-action btn-blue" type="button" id="modalOk">ОК</button></div>';
      var p = openModal(html);
      setTimeout(function () {
        var btn = document.getElementById("modalOk");
        if (btn) btn.onclick = function () { closeModal(true); };
      }, 0);
      await p;
      recoverUiFocus();
    }
    window.openScreenHelp = openScreenHelp;

    function showToast(msg) {
      const el = document.getElementById("appToast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(showToast._t);
      showToast._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
    }

    /** People write: accepted → poll → «Точно …». D1-primary: success при d1Verified; Sheets — зеркало в фоне. */
    async function confirmPeopleWriteSheets_(res, opts) {
      opts = opts || {};
      var d1Canon = !!(res && (res.peopleCanon === "d1-primary" || res.verified || res.message === "d1_saved"));
      var doneMsg = opts.doneMsg || (d1Canon ? "Сохранено" : "Точно внесено");
      var pendingMsg = opts.pendingMsg || (d1Canon ? "Записываю…" : "Вношу в таблицу…");
      var failMsg = opts.failMsg || (d1Canon ? "Не удалось записать" : "Не закрепилось в Google-таблице");
      var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : (d1Canon ? 12000 : 48000);
      var block = !!opts.block;

      if (!res) return { ok: false, res: res };
      if (res.status === "error" && !res.pendingSheets && !res.pendingSheetsMirror) {
        return { ok: false, res: res, message: res.message || "error" };
      }
      if ((res.verified && res.d1Verified) || (res.sheetsVerified && (res.status === "success" || res.status === "accepted"))) {
        try { showToast(doneMsg); } catch (eT0) {}
        return {
          ok: true,
          res: Object.assign({}, res, {
            status: "success",
            d1Verified: true,
            sheetsVerified: !!res.sheetsVerified
          })
        };
      }

      var writeId = String(res.writeId || "").trim();
      if (!(res.pendingSheets || res.pendingSheetsMirror || res.status === "accepted") || !writeId) {
        if (res.status === "success" && (res.sheetsVerified || res.d1Verified || res.verified)) {
          try { showToast(doneMsg); } catch (eT1) {}
          return { ok: true, res: res };
        }
        return { ok: false, res: res, message: res.message || "no_writeId" };
      }

      try { showToast(pendingMsg); } catch (ePend) {}

      async function pollOnce_() {
        try {
          return await apiGet({
            action: "pollPeopleWrite",
            writeId: writeId,
            _: String(Date.now())
          }, { timeoutMs: 35000, cacheTtlMs: 0, bypassInflight: true });
        } catch (eP) {
          return null;
        }
      }

      async function runPoll_() {
        var deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          await new Promise(function (r) { setTimeout(r, d1Canon ? 600 : 1100); });
          var p = await pollOnce_();
          if (p && ((p.verified && p.d1Verified) || p.sheetsVerified) && (p.status === "success" || p.status === "accepted")) {
            var merged = Object.assign({}, res, p, {
              status: "success",
              d1Verified: !!p.d1Verified,
              verified: !!p.verified || !!p.d1Verified,
              pendingSheets: false,
              pendingSheetsMirror: false
            });
            try { showToast(doneMsg); } catch (eT2) {}
            if (p.sheetsMirrorFailed && d1Canon) {
              try { showToast("Лист Google догонит в фоне"); } catch (eMir) {}
            }
            return { ok: true, res: merged };
          }
          if (p && p.status === "error" && !p.d1Verified && !p.pendingSheets && !p.pendingSheetsMirror) {
            try { showToast(failMsg + (p.message ? (": " + p.message) : "")); } catch (eTf) {}
            return { ok: false, res: p, message: p.message || failMsg };
          }
        }
        if (d1Canon && res.d1Verified) {
          try { showToast(doneMsg); } catch (eSoft) {}
          return { ok: true, softTimeout: true, res: Object.assign({}, res, { verified: true, d1Verified: true }) };
        }
        try {
          showToast(d1Canon ? "D1 записано · лист может отставать" : "Ещё пишется в Google… проверь через минуту");
        } catch (eTo) {}
        return {
          ok: false,
          softTimeout: true,
          res: Object.assign({}, res, { pendingSheets: true, softTimeout: true }),
          message: d1Canon ? "d1_confirm_timeout" : "sheets_confirm_timeout"
        };
      }

      if (block) return await runPoll_();
      runPoll_().catch(function () {});
      return { ok: true, pending: true, res: res };
    }
    window.confirmPeopleWriteSheets_ = confirmPeopleWriteSheets_;

    /** Единый критерий «запись принята» (fast-confirm + legacy). */
    function isPeopleWriteAccepted_(res) {
      if (!res || typeof res !== "object") return false;
      if (res.status === "error" && !res.pendingSheets && !res.writeId) return false;
      if (res.status === "online" || /жив/i.test(String(res.msg || res.message || ""))) return false;
      return !!(
        res.status === "success" ||
        res.status === "accepted" ||
        res.writeId ||
        res.sheetsVerified ||
        res.pendingSheets ||
        res.sent_opaque ||
        res.d1Verified
      );
    }
    window.isPeopleWriteAccepted_ = isPeopleWriteAccepted_;

    function celebrateSuccess(kind, opts) {
      try { if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success"); } catch (e) {}
      opts = opts || {};

      const old = document.getElementById("fxTyanOverlay");
      if (old) old.remove();
      const wrap = document.createElement("div");
      wrap.className = "fx-burst";
      wrap.innerHTML = '<div class="fx-burst-ring"></div><div class="fx-burst-check">✓</div>';
      document.body.appendChild(wrap);
      setTimeout(function () { wrap.remove(); }, 800);
    }

    function closeModal(result) {
      const overlay = document.getElementById("modalOverlay");
      overlay.classList.remove("open");
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
      document.getElementById("modalSheet").innerHTML = "";
      unlockPageScroll_();
      const resolver = modalResolver;
      modalResolver = null;
      recoverUiFocus();
      if (resolver) resolver(result);
    }

    function onModalOverlayClick(event) {
      if (event.target && event.target.id === "modalOverlay") closeModal(null);
    }

    function openModal(html) {
      return new Promise(function (resolve) {
        if (modalResolver) closeModal(null);
        modalResolver = resolve;
        document.getElementById("modalSheet").innerHTML = html;
        var overlay = document.getElementById("modalOverlay");
        overlay.classList.add("open");
        overlay.style.display = "flex";
        overlay.style.pointerEvents = "auto";
        try {

          document.body.style.overflow = "";
          document.documentElement.style.overflow = "";
        } catch (eLock2) {}
        setTimeout(function () {
          try {
            var sheet = document.getElementById("modalSheet");
            if (sheet) sheet.scrollTop = 0;
          } catch (eSc) {}
        }, 0);
      });
    }

    function uiAlert() { return uiAlertAsync.apply(null, arguments); }

    async function uiAlertAsync(message) {
      const p = openModal(
        '<div class="modal-title">Сообщение</div>' +
        '<div class="modal-text">' + escapeHtml(String(message)) + '</div>' +
        '<div class="modal-actions"><button class="btn-action btn-blue" type="button" id="modalOk">ОК</button></div>'
      );
      setTimeout(function () {
        const btn = document.getElementById("modalOk");
        if (btn) btn.onclick = function () { closeModal(true); };
      }, 0);
      await p;
      recoverUiFocus();
    }

    async function uiConfirmAsync(message) {
      const p = openModal(
        '<div class="modal-title">Подтверждение</div>' +
        '<div class="modal-text">' + escapeHtml(String(message)) + '</div>' +
        '<div class="modal-actions row">' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalOk">Да</button>' +
        '</div>'
      );
      setTimeout(function () {
        const ok = document.getElementById("modalOk");
        const cancel = document.getElementById("modalCancel");
        if (ok) ok.onclick = function () { closeModal(true); };
        if (cancel) cancel.onclick = function () { closeModal(false); };
      }, 0);
      const res = await p;
      recoverUiFocus();
      return !!res;
    }

    async function uiPromptAsync(message, defVal) {
      const p = openModal(
        '<div class="modal-title">Ввод</div>' +
        '<div class="modal-text">' + escapeHtml(String(message)) + '</div>' +
        '<div class="form-group" style="margin-top:10px;"><input type="text" id="modalPromptInput" value="' +
        escapeHtml(String(defVal || "")) + '"></div>' +
        '<div class="modal-actions row">' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalOk">OK</button>' +
        '</div>'
      );
      setTimeout(function () {
        const inp = document.getElementById("modalPromptInput");
        const ok = document.getElementById("modalOk");
        const cancel = document.getElementById("modalCancel");
        if (inp) { try { inp.focus(); inp.select(); } catch (e) {} }
        if (ok) ok.onclick = function () {
          var v = inp ? inp.value : "";
          closeModal(v);
        };
        if (cancel) cancel.onclick = function () { closeModal(null); };
      }, 0);
      const res = await p;
      recoverUiFocus();
      return res;
    }

    async function uiChoiceAsync(title, message, choices) {
      const buttons = (choices || []).map(function (c, i) {
        return '<button class="btn-action ' + (c.cls || "btn-blue") + '" type="button" data-choice="' + i + '">' +
          escapeHtml(c.label) + "</button>";
      }).join("");
      const p = openModal(
        '<div class="modal-title">' + escapeHtml(title || "Выбор") + "</div>" +
        '<div class="modal-text">' + escapeHtml(String(message || "")) + "</div>" +
        '<div class="modal-actions">' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          buttons +
        "</div>"
      );
      setTimeout(function () {
        document.querySelectorAll("[data-choice]").forEach(function (btn) {
          btn.onclick = function () {
            closeModal(choices[Number(btn.getAttribute("data-choice"))].value);
          };
        });
        const cancel = document.getElementById("modalCancel");
        if (cancel) cancel.onclick = function () { closeModal(null); };
      }, 0);
      const res = await p;
      recoverUiFocus();
      return res;
    }

    async function uiPickMoveDate(clientName, defIso) {
      var def = String(defIso || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(def)) {
        try {
          def = (document.getElementById("viewDate") && document.getElementById("viewDate").value) ||
            lastViewDateIso || "";
        } catch (e0) { def = ""; }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(def)) {
        var d0 = new Date();
        d0.setDate(d0.getDate() + 1);
        function p(n) { return (n < 10 ? "0" : "") + n; }
        def = d0.getFullYear() + "-" + p(d0.getMonth() + 1) + "-" + p(d0.getDate());
      }
      var title = clientName ? ("Перенос: " + escapeHtml(clientName)) : "Перенос выбранных";
      var pModal = openModal(
        '<div class="modal-title">' + title + "</div>" +
        '<div class="modal-text">Выберите дату доставки</div>' +
        '<div class="form-group" style="margin-top:10px;">' +
        '<input type="date" id="modalMoveDate" value="' + escapeHtml(def) + '" style="width:100%;">' +
        "</div>" +
        '<div class="modal-actions row">' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalOk">Перенести</button>' +
        "</div>"
      );
      setTimeout(function () {
        var inp = document.getElementById("modalMoveDate");
        var ok = document.getElementById("modalOk");
        var cancel = document.getElementById("modalCancel");
        if (ok) ok.onclick = function () { closeModal(inp ? inp.value : null); };
        if (cancel) cancel.onclick = function () { closeModal(null); };
        try { if (inp) inp.focus(); } catch (eF) {}
      }, 0);
      var res = await pModal;
      recoverUiFocus();
      if (!res || !/^\d{4}-\d{2}-\d{2}$/.test(String(res))) return null;
      return String(res);
    }

    async function uiPickMoveDay(clientName) {
      return uiPickMoveDate(clientName);
    }

    async function resolveMoveTargetFromDate_(isoDate) {
      var iso = String(isoDate || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
      try {
        var res = await apiGet(
          { action: "resolveDayForDate", date: iso },
          { timeoutMs: 12000, cacheTtlMs: 30000 }
        );
        if (res && res.onWeek && res.dayName) {
          return { newDate: iso, newDay: String(res.dayName), onWeek: true, beyondWeek: false, calendarOnly: false };
        }

        return {
          newDate: iso,
          newDay: "",
          onWeek: false,
          beyondWeek: true,
          calendarOnly: true
        };
      } catch (e) {
        return { newDate: iso, newDay: "", onWeek: false, beyondWeek: true, calendarOnly: true };
      }
    }

    function escapeHtml(s) {
      return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const catalog = {
      dressura: {
        title: "Дрессура",
        items: ["ЛЁГКОЕ", "СЕРДЦЕ", "РУБЕЦ Т", "БАРАНЬЕ ЛЁГКОЕ", "ПОЧКИ"],
        fractions: {
          "ЛЁГКОЕ": ["Мелкое", "Среднее", "Большое", "Целое"],
          "СЕРДЦЕ": ["Мелкое", "Целое"],
          "РУБЕЦ Т": ["Мелкое", "Среднее", "Крупное", "Целое"],
          "БАРАНЬЕ ЛЁГКОЕ": ["Мелкое", "Среднее", "Целое"],
          "ПОЧКИ": ["Мелкое", "Целое"]
        }
      },
      chew: {
        title: "Жевалки",
        items: ["БЫЧИЙ КОРЕНЬ", "ТРАХЕЯ", "АОРТА", "УХО Г", "НОСЫ шт.", "СТАНОВАЯ ЖИЛА", "КОЛЕНИ шт.", "КОПЫТО шт.", "ПЕРЕПЁЛКИ шт.", "ЛОП ХРЯЩ шт.", "УТИНЫЕ ШЕИ шт.", "ГУБЫ шт."],
        fractions: {
          "БЫЧИЙ КОРЕНЬ": ["ОЧ МАЛ", "МАЛ", "СРЕД", "БОЛ", "ОГР"],
          "ТРАХЕЯ": ["МАЛ", "ПЛАСТ", "СРЕД", "БОЛ", "ОГР"],
          "СТАНОВАЯ ЖИЛА": ["ПАЛК", "СРЕД", "БОЛ"],
          "УХО Г": ["ПОЛОВИНКА", "Обычное"],
          "АОРТА": ["ПОЛОВИНКА", "Обычная"]
        }
      },
      other: {
        title: "Другое",
        items: ["ПЕЧЕНЬ", "СВЕТЛЫЙ РУБЕЦ", "ИНДЕЙКА", "МЯСНЫЕ ЛОМТИКИ", "КНИЖКА", "ВЫМЯ", "СЕМЕННИКИ", "ПИКАЛЬНОЕ МЯСО"],
        fractions: {}
      },
      powder: {
        title: "Присыпки",
        items: ["КРОШКА ПОЧЕК", "КРОШКА ЛЁГКОГО", "КРОШКА РУБЕЦ"],
        fractions: {}
      },
      veg: {
        title: "Овощи/Фрукты",
        items: ["БАНАНЫ", "ЯБЛОКИ", "ГРУШЫ", "МОРКОВЬ", "ТЫКВА", "БАТАТ"],
        fractions: {}
      }
    };

    let basket = [];
    let currentCategory = "";
    let loadedClientsRawData = [];
    let courierClientsCache = [];

    const DEPOT_LS_KEY = "superboyna_depot";
    const DEPART_LS_KEY = "superboyna_depart";
    const ROAD_FACTOR = 1.4;
    const AVG_SPEED_KMH = 18; // город: светофоры, дворы
    const STOP_MINUTES = 4;

    const TRAFFIC_FACTOR = 1.45;
    const TIME_ITEM_H = 40;
    let departHour = 14;
    let departMinute = 0;

    const LAST_SCREEN_LS = "superboyna_last_screen";

    function applyRoleTabs(opts) {
      opts = opts || {};
      const allowed = ROLE_TABS[APP_ROLE] || ROLE_TABS.all;
      getTabLinkNodes_().forEach(btn => {
        const screen = btn.dataset.screen;
        if (FLYOUT_SCREENS.indexOf(screen) >= 0) {
          btn.style.display = "none";
          return;
        }

        if (APP_ROLE === "manager" && screen !== "orderScreen") {
          btn.style.display = "none";
          return;
        }
        const ok = allowed.indexOf(screen) >= 0 && MAIN_TABS.indexOf(screen) >= 0;
        btn.style.display = ok ? "" : "none";
      });
      document.querySelectorAll("#orderFlyout .order-flyout-btn").forEach(function (b) {
        const scr = b.getAttribute("data-fly");
        const roles = String(b.getAttribute("data-fly-roles") || "owner,all").split(",");
        const roleOk = roles.indexOf(APP_ROLE) >= 0 || APP_ROLE === "all";
        const allowedOk = allowed.indexOf(scr) >= 0;
        b.style.display = (roleOk && allowedOk) ? "" : "none";
      });
      try { updateTasksBadge(); } catch (eTb) {}
      if (opts.skipSwitch) {

        if (!opts.skipNetwork) {
          try { refreshWeekBanners({ soft: true }); } catch (e) {}
          try { refreshOrderDayCounts_({ soft: true }); } catch (e2) {}
        }
        return;
      }
      const first = allowed.filter(function (s) { return MAIN_TABS.indexOf(s) >= 0; })[0] || "orderScreen";
      var active = document.querySelector(".screen.active");
      var cur = active && active.id;

      if (cur && allowed.indexOf(cur) >= 0) {
        getTabLinkNodes_().forEach(function (el) {
          el.classList.toggle("active", el.getAttribute("data-screen") === cur ||
            (FLYOUT_SCREENS.indexOf(cur) >= 0 && el.getAttribute("data-screen") === "orderScreen"));
        });
      } else if (first) {
        switchTab(first);
      }
      if (!opts.skipNetwork) {
        try { refreshWeekBanners({ soft: true }); } catch (e) {}
        try { refreshOrderDayCounts_({ soft: true }); } catch (e2) {}
      }
      try { setTimeout(syncNavTabsPill_, 30); } catch (eP) {}
    }

    function restoreLastScreen() {

      var allowed = ROLE_TABS[APP_ROLE] || ROLE_TABS.all;
      var first = allowed.filter(function (s) { return MAIN_TABS.indexOf(s) >= 0; })[0] || "orderScreen";
      switchTab(first);
    }
    window.restoreLastScreen = restoreLastScreen;

    function toggleOrderFlyout(force) {
      const fly = document.getElementById("orderFlyout");
      if (!fly) return;
      const open = force === true ? true : force === false ? false : !fly.classList.contains("open");
      fly.classList.toggle("open", open);
      if (open) {
        var cf = document.getElementById("courierFlyout");
        if (cf) cf.classList.remove("open");
      }
      try { syncAppTopSpacer(); } catch (e) {}
    }

    let orderFlyoutJustOpened = false;
    let suppressOrderClick = false;

    function toggleCourierFlyout(force) {
      var fly = document.getElementById("courierFlyout");
      if (!fly) return;
      var open = force === true ? true : force === false ? false : !fly.classList.contains("open");
      fly.classList.toggle("open", open);
      if (open) {
        var of = document.getElementById("orderFlyout");
        if (of) of.classList.remove("open");
      }
      try { syncAppTopSpacer(); } catch (e) {}
    }
    let courierFlyoutJustOpened = false;
    let suppressCourierClick = false;
    function bindCourierLongPress() {
      const btn = document.querySelector('.tab-link[data-screen="courierScreen"]');
      if (!btn || btn._cFlyBound) return;
      btn._cFlyBound = true;
      let timer = null;
      function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
      function startPress() {
        clearTimer();
        timer = setTimeout(function () {
          courierFlyoutJustOpened = true;
          suppressCourierClick = true;
          toggleCourierFlyout(true);
          try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium"); } catch (e) {}
        }, 480);
      }
      function endPress(e) {
        clearTimer();
        if (suppressCourierClick && e) { e.preventDefault(); e.stopPropagation(); }
      }
      btn.addEventListener("touchstart", startPress, { passive: true });
      btn.addEventListener("touchend", endPress);
      btn.addEventListener("touchcancel", clearTimer);
      btn.addEventListener("mousedown", startPress);
      btn.addEventListener("mouseup", endPress);
      btn.addEventListener("mouseleave", clearTimer);
      btn.addEventListener("click", function (e) {
        if (suppressCourierClick) {
          e.preventDefault();
          e.stopImmediatePropagation();
          suppressCourierClick = false;
          return;
        }
        var fly = document.getElementById("courierFlyout");
        if (fly && fly.classList.contains("open") && !courierFlyoutJustOpened) {
          toggleCourierFlyout(false);
        }
        courierFlyoutJustOpened = false;
      }, true);
      document.querySelectorAll("#courierFlyout .order-flyout-btn").forEach(function (b) {
        b.onclick = function () {
          const which = b.getAttribute("data-cfly");
          courierFlyoutJustOpened = false;
          toggleCourierFlyout(false);
          if (which) {
            window._courierOpenAssembly = (which === "assembly");
            switchTab("courierScreen");
            setCourierSub(which);
          }
        };
      });
    }

    function bindOrderLongPress() {
      const btn = document.querySelector('.tab-link[data-screen="orderScreen"]');
      if (!btn) return;
      let timer = null;
      function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
      function startPress() {
        clearTimer();
        timer = setTimeout(function () {
          if (APP_ROLE === "manager" || APP_ROLE === "owner" || APP_ROLE === "all") {
            orderFlyoutJustOpened = true;
            suppressOrderClick = true;
            toggleOrderFlyout(true);
            try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium"); } catch (e) {}
          }
        }, 480);
      }
      function endPress(e) {
        clearTimer();

        if (suppressOrderClick && e) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      btn.addEventListener("touchstart", startPress, { passive: true });
      btn.addEventListener("touchend", endPress);
      btn.addEventListener("touchcancel", clearTimer);
      btn.addEventListener("mousedown", startPress);
      btn.addEventListener("mouseup", endPress);
      btn.addEventListener("mouseleave", clearTimer);
      btn.addEventListener("click", function (e) {
        if (suppressOrderClick) {
          e.preventDefault();
          e.stopImmediatePropagation();
          suppressOrderClick = false;
          return;
        }

        var fly = document.getElementById("orderFlyout");
        if (fly && fly.classList.contains("open") && !orderFlyoutJustOpened) {
          toggleOrderFlyout(false);
        }
        orderFlyoutJustOpened = false;
      }, true);
      document.querySelectorAll("#orderFlyout .order-flyout-btn").forEach(function (b) {
        b.onclick = function () {
          const id = b.getAttribute("data-fly");
          const focus = b.getAttribute("data-fly-focus") || "";
          orderFlyoutJustOpened = false;
          toggleOrderFlyout(false);
          if (id) switchTab(id, { focus: focus });
        };
      });
    }

    var RETAIL_PRICE = {

      "ЛЁГКОЕ|Мелкое": { per100: 12 },
      "ЛЁГКОЕ|Среднее": { per100: 10 },
      "ЛЁГКОЕ|Большое": { per100: 9 },
      "ЛЁГКОЕ|Целое": { per100: 8 },
      "ЛЁГКОЕ": { per100: 10 },
      "СЕРДЦЕ|Мелкое": { per100: 13 },
      "СЕРДЦЕ|Среднее": { per100: 12 },
      "СЕРДЦЕ|Большое": { per100: 11 },
      "СЕРДЦЕ|Целое": { per100: 10 },
      "СЕРДЦЕ": { per100: 12 },
      "РУБЕЦ Т|Мелкое": { per100: 13 },
      "РУБЕЦ Т|Среднее": { per100: 12 },
      "РУБЕЦ Т|Крупное": { per100: 11 },
      "РУБЕЦ Т|Целое": { per100: 10 },
      "РУБЕЦ Т": { per100: 12 },
      "ПОЧКИ|Мелкое": { per100: 11 },
      "ПОЧКИ|Целое": { per100: 10 },
      "ПОЧКИ": { per100: 10 },
      "БАРАНЬЕ ЛЁГКОЕ|Мелкое": { per100: 15 },
      "БАРАНЬЕ ЛЁГКОЕ|Среднее": { per100: 14 },
      "БАРАНЬЕ ЛЁГКОЕ|Целое": { per100: 12 },
      "БАРАНЬЕ ЛЁГКОЕ": { per100: 14 },

      "ПЕЧЕНЬ": { per100: 9 },
      "СВЕТЛЫЙ РУБЕЦ": { per100: 9 },
      "КНИЖКА": { per100: 9 },
      "ВЫМЯ": { per100: 9 },
      "СЕМЕННИКИ": { per100: 12 },
      "МЯСНЫЕ ЛОМТИКИ": { per100: 13 },
      "ПИКАЛЬНОЕ МЯСО": { per100: 10 },
      "ИНДЕЙКА|Мелкое": { per100: 17 },
      "ИНДЕЙКА|Среднее": { per100: 16 },
      "ИНДЕЙКА|Целое": { per100: 15 },
      "ИНДЕЙКА": { per100: 16 },
      "БАРАНЬЯ ПЕЧЕНЬ|Мелкое": { per100: 18 },
      "БАРАНЬЯ ПЕЧЕНЬ|Среднее": { per100: 17 },
      "БАРАНЬЯ ПЕЧЕНЬ|Целое": { per100: 16 },
      "БАРАНЬЯ ПЕЧЕНЬ": { per100: 17 },

      "КРОШКА ЛЁГКОГО": { packs: { 20: 5, 50: 7, 100: 10 }, per100: 10 },
      "КРОШКА ПОЧЕК": { packs: { 20: 5, 50: 7, 100: 10 }, per100: 10 },
      "КРОШКА СЕРДЦА": { packs: { 20: 7, 50: 9, 100: 12 }, per100: 12 },
      "КРОШКА РУБЕЦ": { packs: { 20: 7, 50: 9, 100: 12 }, per100: 12 },
      "КРОШКА МИКС": { packs: { 20: 6, 50: 8, 100: 11 }, per100: 11 },

      "БАНАНЫ": { per100: 10 },
      "ЯБЛОКИ": { per100: 9 },
      "ГРУШИ": { per100: 10 },
      "КЛУБНИКА": { per100: 10 },
      "МОРКОВЬ": { per100: 10 },
      "ТЫКВА": { per100: 12 },
      "БАТАТ": { per100: 11 },
      "КАБАЧОК": { per100: 12 },
      "СВЕКЛА": { per100: 10 },

      "КОПЫТО шт.": { perPiece: 9 },
      "КОЛЕНИ шт.": { perPiece: 6 },
      "НОСЫ шт.": { perPiece: 7 },
      "ЛОП ХРЯЩ шт.": { perPiece: 4 },
      "УТИНЫЕ ШЕИ шт.": { perPiece: 3 },
      "ПЕРЕПЁЛКИ шт.": { perPiece: 4 },
      "ГУБЫ шт.": { perPiece: 4 },
      "ТРАХЕЯ|МАЛ": { perPiece: 4 },
      "ТРАХЕЯ|СРЕД": { perPiece: 7 },
      "ТРАХЕЯ|БОЛ": { perPiece: 12 },
      "ТРАХЕЯ|ПЛАСТ": { perPiece: 7 },
      "ТРАХЕЯ|ОГР": { perPiece: 12 },
      "ТРАХЕЯ": { perPiece: 7 },
      "БЫЧИЙ КОРЕНЬ|ОЧ МАЛ": { perPiece: 6 },
      "БЫЧИЙ КОРЕНЬ|МАЛ": { perPiece: 6 },
      "БЫЧИЙ КОРЕНЬ|СРЕД": { perPiece: 11 },
      "БЫЧИЙ КОРЕНЬ|БОЛ": { perPiece: 21 },
      "БЫЧИЙ КОРЕНЬ|ОГР": { perPiece: 25 },
      "БЫЧИЙ КОРЕНЬ": { perPiece: 11 },
      "УХО Г|ПОЛОВИНКА": { perPiece: 4 },
      "УХО Г|Обычное": { perPiece: 6 },
      "УХО Г": { perPiece: 6 },
      "АОРТА|ПОЛОВИНКА": { perPiece: 2 },
      "АОРТА|Обычная": { perPiece: 4 },
      "АОРТА": { perPiece: 4 },
      "СТАНОВАЯ ЖИЛА|ПАЛК": { perPiece: 1 },
      "СТАНОВАЯ ЖИЛА|СРЕД": { perPiece: 4 },
      "СТАНОВАЯ ЖИЛА|БОЛ": { perPiece: 6 },
      "СТАНОВАЯ ЖИЛА": { perPiece: 4 }
    };

    function retailLookupKey_(name, sub) {
      var n = String(name || "").toUpperCase().trim().replace(/Ё/g, "Е").replace(/\s+/g, " ");
      var mapN = {
        "ЛЕГКОЕ": "ЛЁГКОЕ",
        "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "КРОШКА ЛЕГКОГО": "КРОШКА ЛЁГКОГО",
        "ПЕРЕПЕЛКИ ШТ.": "ПЕРЕПЁЛКИ шт.",
        "ПЕРЕПЕЛКИ ШТ": "ПЕРЕПЁЛКИ шт.",
        "КАБАЧКИ": "КАБАЧОК",
        "ГРУШЫ": "ГРУШИ",
        "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ",
        "УТИНЫЕ ШЕИ": "УТИНЫЕ ШЕИ шт.",
        "УТИНЫЕ ШЕИ ШТ.": "УТИНЫЕ ШЕИ шт.",
        "УТИНЫЕ ШЕИ ШТ": "УТИНЫЕ ШЕИ шт."
      };
      if (mapN[n]) n = mapN[n];
      ["КОПЫТО шт.", "КОЛЕНИ шт.", "НОСЫ шт.", "ЛОП ХРЯЩ шт.", "УТИНЫЕ ШЕИ шт.", "ПЕРЕПЁЛКИ шт.", "ГУБЫ шт."].forEach(function (k) {
        if (n === k.toUpperCase().replace(/Ё/g, "Е") || n === k.toUpperCase().replace(/Ё/g, "Е").replace(/\s*ШТ\.?$/, "")) n = k;
      });
      if (n === "КРОШКА РУБЕЦ" || n.indexOf("КРОШКА РУБ") === 0) n = "КРОШКА РУБЕЦ";
      var s = String(sub || "").trim();
      var su = s.toUpperCase().replace(/Ё/g, "Е");
      if (/БЫЧИЙ КОРЕН|ТРАХЕ|СТАНОВ/.test(n)) {
        if (/ОЧЕНЬ\s*МАЛ|ОЧ\s*МАЛ/.test(su)) s = "ОЧ МАЛ";
        else if (/ОГРОМ|РОГАЛ|ОГР/.test(su)) s = "ОГР";
        else if (/БОЛЬШ|БОЛ/.test(su)) s = "БОЛ";
        else if (/ПАЛОЧ|ПАЛК/.test(su)) s = "ПАЛК";
        else if (/ПЛАСТ/.test(su)) s = "ПЛАСТ";
        else if (/СРЕД/.test(su)) s = "СРЕД";
        else if (/МАЛ/.test(su)) s = "МАЛ";
      } else if (/УХО|УШК/.test(n)) {
        s = /ПОЛОВИН/.test(su) ? "ПОЛОВИНКА" : (s ? "Обычное" : "");
      } else if (/АОРТ/.test(n)) {
        s = /ПОЛОВИН/.test(su) ? "ПОЛОВИНКА" : (s ? "Обычная" : "");
      } else if (s) {
        if (/МЕЛК/.test(su)) s = "Мелкое";
        else if (/КРУПН/.test(su)) s = "Крупное";
        else if (/БОЛЬШ|ПОЛОСК/.test(su)) s = "Большое";
        else if (/ЦЕЛ|ЛОМТ/.test(su)) s = "Целое";
        else if (/СРЕД|КУСОЧ|КУБИК/.test(su)) s = "Среднее";
      }
      return { name: n, sub: s, key: n + (s ? "|" + s : "") };
    }

    function retailLineCost(name, sub, val, cat) {
      var meta = retailLookupKey_(name, sub);
      var info = RETAIL_PRICE[meta.key] || RETAIL_PRICE[meta.name];
      var v = Number(val) || 0;
      if (!info || v <= 0) return { cost: 0, per: 0, found: !!info };
      if (info.packs) {
        var g = Math.round(v);
        if (info.packs[g] != null) return { cost: info.packs[g], per: info.packs[g], found: true, pack: g };
        var p100 = info.packs[100] != null ? info.packs[100] : info.per100;
        var c = (p100 || 0) * (v / 100);
        return { cost: Math.round(c * 100) / 100, per: p100 || 0, found: true };
      }
      if (info.perPiece != null || cat === "chew" || /шт/i.test(meta.name)) {
        var pp = info.perPiece != null ? info.perPiece : 0;
        return { cost: Math.round(pp * v * 100) / 100, per: pp, found: true };
      }
      var p = info.per100 || 0;
      var cost = (v / 100) * p;
      return { cost: Math.round(cost * 100) / 100, per: p, found: true };
    }

    var PRODUCT_CARD_INFO = {
      "ЛЁГКОЕ":
        "Сушёное говяжье лёгкое — лёгкое по калорийности лакомство с выраженным запахом и хрустом.\n" +
        "Идеально для дрессуры и поощрения: собака быстро съедает и возвращается к работе.\n" +
        "Мало жира, хорошо заходит щенкам и взрослым. Резы: мелкое (карман/кликер), среднее, большое, целое (перекус).",
      "СЕРДЦЕ":
        "Сушёное сердце — плотный белок, насыщенный мясной вкус.\n" +
        "Удобно как «валюта» на тренировке: мелкое — в карман и на кликер; целое — как самостоятельный кусочек.\n" +
        "Часто нравится даже привередливым. Не жирное, хорошо комбинируется с другими позициями в коробке.",
      "ПОЧКИ":
        "Сушёные почки — очень ароматные, часто становятся любимчиком с первой коробки.\n" +
        "Мелкое — для дрессуры и коротких повторов; целое — порционный перекус.\n" +
        "Сильный запах: отлично работает как reinforcer, но дозируем в составе, чтобы не перебить остальные позиции.",
      "РУБЕЦ Т":
        "Тёмный рубец — жевательная дрессура: дольше держит интерес, чем мягкое мясо.\n" +
        "Текстура волокнистая, собака грызёт и «работает» челюстью.\n" +
        "Резы от мелкого до крупного и целое — под размер пасти и задачу (быстрый кусочек vs подольше занять).",
      "БАРАНЬЕ ЛЁГКОЕ":
        "Баранье лёгкое — мягче и часто «нежнее» по вкусу, чем говяжье.\n" +
        "Хороший вариант, если говядина заходит слабо или нужна ротация белков.\n" +
        "Мелкое/среднее — дрессура; целое — перекус. Лёгкое по ощущению, мало жира.",
      "ПЕЧЕНЬ":
        "Сушёная печень — самый «яркий» мясной вкус и запах в линейке.\n" +
        "Мощный reinforcer: хорошо для сложных упражнений и собак, которых сложно замотивировать.\n" +
        "Отпускаем на вес (г). В составе дозируем — иначе перебивает более нейтральные позиции.",
      "СВЕТЛЫЙ РУБЕЦ":
        "Светлый рубец — мягче и спокойнее тёмного по вкусу и «жёсткости».\n" +
        "Хорош как средний интерес в коробке: не самый сильный reinforcer, но приятная жевательная текстура.\n" +
        "На вес. Удобно балансировать состав между лёгкой дрессурой и жёсткими жевалками.",
      "ИНДЕЙКА":
        "Сушёная индейка — постное мясо, часто выбирают при чувствительности к говядине/аллергиях.\n" +
        "Мягкий мясной вкус без «тяжёлого» запаха печени/почек.\n" +
        "На вес. Хорошо как база мясного блока в коробке для спокойных желудков.",
      "МЯСНЫЕ ЛОМТИКИ":
        "Мясные ломтики — готовые кусочки удобного размера для поощрения и разнообразия.\n" +
        "Быстро отдаются на тренировке, не крошатся как крошка.\n" +
        "На вес. Удобно класть в коробку как «повседневный» мясной блок рядом с дрессурой.",
      "КНИЖКА":
        "Книжка (рубец-книжка) — слоистая жевательная текстура, дольше занимает, чем мягкое мясо.\n" +
        "Собака раздирает слои — это и enrichment, и работа челюсти.\n" +
        "На вес. Хороший «средний» интерес между дрессурой и твёрдыми жевалками.",
      "ВЫМЯ":
        "Вымя — мягкое, чуть жирнее обычного постного мяса, многие собаки очень любят.\n" +
        "Даёт сытость и «вкусный» бонус в коробке.\n" +
        "На вес. Дозируем: не перегружаем жирные позиции в одном наборе.",
      "СЕМЕННИКИ":
        "Семенники — насыщенный органный вкус, часто «вау»-эффект у собак.\n" +
        "Обычно небольшими порциями: как акцент, а не весь мясной блок.\n" +
        "На вес. Хорошо для разнообразия и собак, которым скучны нейтральные позиции.",
      "ПИКАЛЬНОЕ МЯСО":
        "Пикальное мясо — мясные кусочки для дрессуры и ротации вкусов.\n" +
        "Удобный формат: не крошка и не огромная жевалка.\n" +
        "На вес. Подходит и в коробку, и как карманное поощрение на занятии.",
      "КРОШКА ПОЧЕК":
        "Крошка почек — мелкая фракция с сильным запахом: посыпка на корм, в игру или на коврик.\n" +
        "Отлично «включает» интерес, когда обычные кусочки уже приелись.\n" +
        "Фасовки 20 / 50 / 100 г. Не путать с целыми почками — это именно топпинг/крошка.",
      "КРОШКА ЛЁГКОГО":
        "Крошка лёгкого — лёгкая ароматная посыпка без тяжёлого жира.\n" +
        "На корм, в поисковые игры, для щенков и чувствительных.\n" +
        "Фасовки 20 / 50 / 100 г. Хороший мягкий топпинг рядом с более «громкими» крошками.",
      "КРОШКА РУБЕЦ":
        "Крошка рубца — ароматный топпинг с «рубцовым» запахом.\n" +
        "Сильнее крошки лёгкого, хорошо будит аппетит.\n" +
        "Фасовки 20 / 50 / 100 г. Удобно чередовать с крошкой почек/лёгкого.",
      "БЫЧИЙ КОРЕНЬ":
        "Бычий корень — долгая плотная жевалка «на время».\n" +
        "Размеры ОЧ МАЛ → МАЛ → СРЕД → БОЛ → ОГР: подбираем под челюсть, силу грызни и сколько нужно занять собаку.\n" +
        "Не для проглотить целиком — это работа челюсти. Следим, чтобы остаток не становился опасным мелким куском.",
      "ТРАХЕЯ":
        "Говяжья трахея — хрящевая жевалка: чистит зубы, даёт хруст и долгую занятость.\n" +
        "Размеры: МАЛ / ПЛАСТ / СРЕД / БОЛ / ОГР — под пасть и интенсивность грызни.\n" +
        "Отпускаем целыми кусками/пластинами подходящего размера, не «колечками».",
      "АОРТА":
        "Аорта — относительно мягкая жевалка из сосуда, приятна многим собакам.\n" +
        "Есть половинка и целая — удобно для средних и крупных.\n" +
        "Меньше «бетона», чем корень/копыто; хороший старт в жевалки, если собака не любит очень жёсткое.",
      "УХО Г":
        "Говяжье ухо — классическая погрызушка: хрящ + кожа, долго занимает.\n" +
        "Половинка — для помельче/покороче; целое («обычное») — полноценная сессия грызни.\n" +
        "Следим за остатком: когда ухо стало маленьким, лучше забрать.",
      "НОСЫ шт.":
        "Носы — жевалка поштучно, дольше держит интерес у мелких и средних.\n" +
        "Хороший «трофей» в коробке без огромного размера.\n" +
        "1 шт. Подбираем под силу челюсти; не оставляем микроскопический остаток без присмотра.",
      "СТАНОВАЯ ЖИЛА":
        "Становая жила — плотная жилистая жевалка.\n" +
        "Форматы: палочка / средняя / большая — от короткой занятости до серьёзной грызни.\n" +
        "Для собак, которым нужны «долгоиграющие» позиции, не мягкое мясо.",
      "КОЛЕНИ шт.":
        "Колени (сустав) — жевалка 1 шт. с хрящом и связками.\n" +
        "Даёт долгую работу челюсти и enrichment.\n" +
        "Под размер собаки; при сильной грызне — присмотр, чтобы не отколоть и не проглотить крупный кусок.",
      "КОПЫТО шт.":
        "Копыто — одна из самых долгих жевалок в ассортименте.\n" +
        "Для усидчивых и тех, кому нужны часы занятости.\n" +
        "1 шт. Не для всех мелких: слишком крупно/жёстко — лучше корень поменьше или ухо.",
      "ПЕРЕПЁЛКИ шт.":
        "Перепёлка — цельный «трофей»: интересная форма, запах птицы, отличие от говяжьих жевалок.\n" +
        "1 шт. Хорошо разбавляет коробку и даёт novelty.\n" +
        "Под размер: мелким — с присмотром; крупным — как быстрый enrichment.",
      "ЛОП ХРЯЩ шт.":
        "Лопаточный хрящ — жевалка 1 шт. среднего интереса.\n" +
        "Мягче копыта/корня, но дольше мягкого мяса.\n" +
        "Удобный «серединный» вариант, если жёсткие жевалки собака игнорирует.",
      "УТИНЫЕ ШЕИ шт.":
        "Утиные шеи — птичья жевалка 1 шт., другой вкус/запах относительно говядины.\n" +
        "Дают занятость и разнообразие в коробке.\n" +
        "Важно: из‑за особенностей термообработки этой позиции — только для очень крупных пород (см. примечание).",
      "ГУБЫ шт.":
        "Губы — мягкая жевалка 1 шт., без «бетона».\n" +
        "Хороши, если собака не любит жёсткий хрящ/кость-подобные позиции.\n" +
        "Быстрее съедаются, чем корень или копыто — учитываем при подборе «на время».",
      "БАНАНЫ":
        "Сушёный банан — сладкий фруктовый бонус в составе.\n" +
        "Не замена мясу: это разнообразие и приятный кусочек «для настроения».\n" +
        "На вес. Маленькими долями в коробке рядом с мясным блоком.",
      "ЯБЛОКИ":
        "Сушёные яблоки — лёгкий фруктовый кусочек, мягкая сладость.\n" +
        "Разнообразие текстур в коробке, без тяжёлого жира.\n" +
        "На вес. Дозируем как бонус, не как основу рациона лакомств.",
      "ГРУШЫ":
        "Сушёные груши — мягкий сладкий бонус.\n" +
        "Хорошо для ротации фруктовых позиций (яблоко/банан/груша).\n" +
        "На вес. Небольшой объём в составе достаточно.",
      "МОРКОВЬ":
        "Сушёная морковь — хруст и лёгкая сладость, клетчатка.\n" +
        "Овощной акцент рядом с мясом и жевалками.\n" +
        "На вес. Удобно «разбавить» очень мясную коробку.",
      "ТЫКВА":
        "Сушёная тыква — мягкий овощной кусочек.\n" +
        "Часто используют в составах, где важен спокойный ЖКТ-профиль и разнообразие.\n" +
        "На вес. Небольшой бонус, не основной объём.",
      "БАТАТ":
        "Сушёный батат — сладкий корнеплод, плотная текстура.\n" +
        "Даёт другой вкус и жевание, чем фрукты.\n" +
        "На вес. Хороший овощной акцент в индивидуальной коробке."
    };

    var PRODUCT_CARD_NOTES = {
      "ТРАХЕЯ":
        "Трахею колечками мы не делаем, так как это очень травмоопасно: питомец может проглотить колечко целиком и оно застрянет у него в горле 😢",
      "УТИНЫЕ ШЕИ шт.":
        "Утиные шеи мы продаём только очень большим породам собак: при термообработке (именно этой позиции) происходит кальцинация, и в дальнейшем это может вызвать перфорацию желудка у небольших и маленьких пород 🐶"
    };

    function productCardNote_(name) {
      var key = String(name || "").trim();
      if (PRODUCT_CARD_NOTES[key]) return PRODUCT_CARD_NOTES[key];
      var alt = key.replace(/Ё/g, "Е");
      for (var k in PRODUCT_CARD_NOTES) {
        if (!Object.prototype.hasOwnProperty.call(PRODUCT_CARD_NOTES, k)) continue;
        if (String(k).replace(/Ё/g, "Е") === alt) return PRODUCT_CARD_NOTES[k];
      }

      if (/УТИН.*ШЕ/i.test(key)) return PRODUCT_CARD_NOTES["УТИНЫЕ ШЕИ шт."] || "";
      if (/ТРАХЕ/i.test(key)) return PRODUCT_CARD_NOTES["ТРАХЕЯ"] || "";
      return "";
    }

    function productCardSlug_(name) {
      return "prod_" + String(name || "")
        .toUpperCase()
        .replace(/Ё/g, "Е")
        .replace(/[^A-ZА-Я0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    }

    function productCardOverride_(name) {
      var want = String(name || "").trim().toUpperCase().replace(/Ё/g, "Е");
      var slug = productCardSlug_(name).toLowerCase();
      var items = window._templatesList || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!isProductTemplateRow_(it)) continue;
        var title = String(it.title || "").trim().toUpperCase().replace(/Ё/g, "Е");
        var id = String(it.id || "").toLowerCase();
        if (title === want || id === slug || id.indexOf(slug) === 0) return it;
      }
      return null;
    }

    function productCardBlurb_(name) {
      var ov = productCardOverride_(name);
      if (ov && String(ov.body || "").trim()) return String(ov.body).trim();
      var key = String(name || "").trim();
      if (PRODUCT_CARD_INFO[key]) return PRODUCT_CARD_INFO[key];
      var alt = key.replace(/Ё/g, "Е");
      for (var k in PRODUCT_CARD_INFO) {
        if (!Object.prototype.hasOwnProperty.call(PRODUCT_CARD_INFO, k)) continue;
        if (String(k).replace(/Ё/g, "Е") === alt) return PRODUCT_CARD_INFO[k];
      }
      return "Натуральное сушёное лакомство из ассортимента Бойни. Уточни фракцию/размер под собаку.";
    }

    function formatProductCardText_(name, catKey, catTitle, fractions) {
      var blurb = productCardBlurb_(name);
      var fr = (fractions || []).length ? ("Фракции/размеры: " + fractions.join(", ")) : "";
      return (
        name + "\n" +
        (catTitle ? ("Категория: " + catTitle + "\n") : "") +
        (fr ? fr + "\n" : "") +
        "\n" + blurb
      );
    }

    function renderProductCardsHome_() {
      window._productCardsCat = "";
      window._productCardsName = "";
      var root = document.getElementById("productCardsRoot");
      if (!root) return;
      if (!window._templatesListLoaded) {
        loadTemplatesList_({ soft: false }).then(function () { renderProductCardsHome_(); }).catch(function () {
          renderProductCardsCats_();
        });
        return;
      }
      renderProductCardsCats_();
    }
    window.renderProductCardsHome_ = renderProductCardsHome_;

    function renderProductCardsCats_() {
      var root = document.getElementById("productCardsRoot");
      if (!root) return;
      var html =
        '<button type="button" class="btn-action" style="margin:0 0 10px;background:#3a3a3c;" onclick="setTemplatesSub_(\'texts\')">← К шаблонам</button>' +
        '<div class="muted" style="font-size:12px;margin-bottom:10px;">Выбери категорию, затем позицию — откроется краткая карточка.</div>';
      Object.keys(catalog).forEach(function (catKey) {
        var cat = catalog[catKey];
        if (!cat) return;
        var n = (cat.items || []).length;
        html +=
          '<button type="button" class="btn-action" style="width:100%;margin:0 0 8px;text-align:left;background:#1c1c1e;border:1px solid var(--border-color);"' +
          ' onclick="openProductCardsCategory_(\'' + catKey + '\')">' +
          '<b>' + escapeHtml(cat.title || catKey) + "</b>" +
          '<span class="muted" style="float:right;font-size:12px;">' + n + " поз.</span>" +
          "</button>";
      });
      root.innerHTML = html;
    }

    function openProductCardsCategory_(catKey) {
      window._productCardsCat = catKey;
      window._productCardsName = "";
      var root = document.getElementById("productCardsRoot");
      var cat = catalog[catKey];
      if (!root || !cat) return;
      var html =
        '<button type="button" class="btn-action" style="margin:0 0 10px;background:#3a3a3c;" onclick="renderProductCardsHome_()">← Категории</button>' +
        '<div class="section-title" style="margin-top:0;">' + escapeHtml(cat.title || catKey) + "</div>";
      (cat.items || []).forEach(function (name) {
        var fr = (cat.fractions && cat.fractions[name]) || [];
        var ov = productCardOverride_(name);
        html +=
          '<button type="button" class="btn-action" style="width:100%;margin:0 0 8px;text-align:left;background:#1c1c1e;border:1px solid var(--border-color);"' +
          " onclick='openProductCardDetail_(" + JSON.stringify(catKey) + "," + JSON.stringify(name) + ")'>" +
          "<b>" + escapeHtml(name) + "</b>" +
          (ov ? ' <span class="muted" style="font-size:11px;">· свой текст</span>' : "") +
          (fr.length ? '<div class="muted" style="font-size:11px;margin-top:4px;">' + escapeHtml(fr.join(" · ")) + "</div>" : "") +
          "</button>";
      });
      root.innerHTML = html;
    }
    window.openProductCardsCategory_ = openProductCardsCategory_;

    function openProductCardDetail_(catKey, name) {
      window._productCardsCat = catKey;
      window._productCardsName = name;
      var root = document.getElementById("productCardsRoot");
      var cat = catalog[catKey] || {};
      var fr = (cat.fractions && cat.fractions[name]) || [];
      var text = formatProductCardText_(name, catKey, cat.title || "", fr);
      var note = productCardNote_(name);
      if (!root) return;
      var html =
        '<button type="button" class="btn-action" style="margin:0 0 10px;background:#3a3a3c;" onclick="openProductCardsCategory_(\'' + catKey + '\')">← ' +
        escapeHtml(cat.title || "Назад") + "</button>" +
        '<div class="card" style="margin:0;padding:12px;">' +
        '<div class="section-title" style="margin-top:0;">' + escapeHtml(name) + "</div>" +
        '<div class="muted" style="font-size:12px;margin-bottom:8px;">' + escapeHtml(cat.title || "") +
        (fr.length ? " · " + escapeHtml(fr.join(", ")) : "") + "</div>" +
        '<div style="font-size:14px;line-height:1.45;white-space:pre-wrap;margin-bottom:12px;">' +
        escapeHtml(productCardBlurb_(name)) + "</div>" +
        '<div class="batch-bar-row" style="margin:0;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="btn-action btn-blue" style="flex:1.2;margin:0;" onclick="copyProductCardText_()">Копировать</button>' +
        '<button type="button" class="btn-action" style="flex:1;margin:0;background:#3a3a3c;" onclick="editProductCardBlurb_()">Текст</button>' +
        (note
          ? '<button type="button" class="btn-action btn-orange" style="flex:1.2;margin:0;" onclick="copyProductCardNote_()">Примечание</button>'
          : "") +
        "</div>" +
        (note
          ? '<div class="muted" style="font-size:11px;margin-top:8px;">«Примечание» копирует отдельный текст для клиента (не входит в основное описание).</div>'
          : "") +
        "</div>" +
        '<textarea id="productCardCopyBuf" style="position:absolute;left:-9999px;height:1px;width:1px;" readonly>' +
        escapeHtml(text) + "</textarea>";
      root.innerHTML = html;
    }
    window.openProductCardDetail_ = openProductCardDetail_;

    async function copyTextToClipboard_(text, okToast) {
      text = String(text || "");
      if (!text) { showToast("Пусто"); return; }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showToast(okToast || "Скопировано");
          return;
        }
      } catch (e1) {}
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast(okToast || "Скопировано");
      } catch (e2) {
        showToast("Не скопировалось");
      }
    }

    async function copyProductCardText_() {
      var catKey = window._productCardsCat;
      var name = window._productCardsName;
      var cat = catalog[catKey] || {};
      var fr = (cat.fractions && cat.fractions[name]) || [];
      var text = formatProductCardText_(name, catKey, cat.title || "", fr);
      await copyTextToClipboard_(text, "Описание скопировано");
    }
    window.copyProductCardText_ = copyProductCardText_;

    async function copyProductCardNote_() {
      var name = window._productCardsName;
      var note = productCardNote_(name);
      if (!note) { showToast("Нет примечания"); return; }
      await copyTextToClipboard_(note, "Примечание скопировано");
    }
    window.copyProductCardNote_ = copyProductCardNote_;

    async function editProductCardBlurb_() {
      var name = window._productCardsName;
      var catKey = window._productCardsCat;
      if (!name) return;
      var cur = productCardBlurb_(name);
      var next = await uiPromptAsync("Текст карточки «" + name + "»", cur);
      if (next == null) return;
      next = String(next).trim();
      if (!next) { showToast("Пусто — не сохраняю"); return; }
      var tid = "";
      try { tid = String(typeof ensureTelegramId === "function" ? ensureTelegramId() : (myTelegramId || "")); } catch (eT) {
        tid = String(myTelegramId || "");
      }
      if (tid === "undefined" || tid === "null") tid = "";
      var id = productCardSlug_(name);
      function utf8ToB64_(s) {
        try { return btoa(unescape(encodeURIComponent(String(s || "")))); } catch (e) { return ""; }
      }
      showToast("Сохраняю текст…");
      try {
        var payload = {
          action: "saveTemplate",
          id: id,
          kind: "product",
          title: name,
          titleB64: utf8ToB64_(name),
          bodyB64: utf8ToB64_(next),
          telegramId: tid,
          _: String(Date.now())
        };
        var res = await apiGet(payload, { timeoutMs: 45000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast("Не сохранилось — Deploy Code.gs");
          return;
        }

        var list = window._templatesList || [];
        var found = false;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].id || "").toLowerCase() === id.toLowerCase()) {
            list[i] = { id: id, kind: "product", title: name, body: next };
            found = true;
            break;
          }
        }
        if (!found) list = [{ id: id, kind: "product", title: name, body: next }].concat(list);
        window._templatesList = list;
        window._templatesListLoaded = true;
        showToast("Текст карточки сохранён");
        openProductCardDetail_(catKey, name);
      } catch (e) {
        showToast("Ошибка сохранения текста");
      }
    }
    window.editProductCardBlurb_ = editProductCardBlurb_;

    var PRICE_RETAIL_DELIVERY_BYN = 5;
    var PRICE_RETAIL_FREE_FROM = 50;

    function calcRetailBasketTotal(list, opts) {
      opts = opts || {};
      var lines = [];
      var goods = 0;
      (list || []).forEach(function (it) {
        var name = it.name || it.main || "";
        var sub = it.sub || "";
        var val = it.val != null ? it.val : it.value;
        var r = retailLineCost(name, sub, val, it.cat);
        goods += r.cost;
        lines.push({ name: name, sub: sub, val: Number(val) || 0, per100: r.per, cost: r.cost, found: r.found });
      });
      goods = Math.round(goods * 100) / 100;
      var deliveriesN = Math.max(1, Number(opts.deliveriesN) || 1);
      var applyDelivery = opts.applyDelivery !== false;
      var perDelivery = goods / deliveriesN;
      var deliveryTimes = 0;

      if (applyDelivery && goods > 0) {
        for (var di = 0; di < deliveriesN; di++) {
          if (perDelivery < PRICE_RETAIL_FREE_FROM) deliveryTimes++;
        }
      }
      var delivery = Math.round(deliveryTimes * PRICE_RETAIL_DELIVERY_BYN * 100) / 100;
      var total = Math.round((goods + delivery) * 100) / 100;
      return {
        total: total,
        goods: goods,
        delivery: delivery,
        deliveryTimes: deliveryTimes,
        perDelivery: Math.round(perDelivery * 100) / 100,
        deliveriesN: deliveriesN,
        freeFrom: PRICE_RETAIL_FREE_FROM,
        deliveryFee: PRICE_RETAIL_DELIVERY_BYN,
        lines: lines,
        markup: 1,
        sheet: "витрина IG"
      };
    }
    window.calcRetailBasketTotal = calcRetailBasketTotal;

    function formatRetailDeliveryHint_(retail) {
      if (!retail || !(retail.delivery > 0)) return "";
      if (retail.deliveryTimes > 1) {
        return " · доставка " + retail.deliveryTimes + "×" + (retail.deliveryFee || 5) +
          " (доля " + retail.perDelivery + " < " + (retail.freeFrom || 50) + ")";
      }
      return " · доставка +" + retail.delivery +
        " (заказ < " + (retail.freeFrom || 50) + ")";
    }

    let orderType = "pp"; // pp | bp | retail | partner
    let secondDogMode = false; // legacy flag
    let ownerContactSnapshot = null;
    let retailPriceManual = false; // true = менеджер ввёл свою цену розницы
    let retailPaidDelivery = false; // тумблер «платная доставка» +5 BYN
    let ppDeliverySlotManual = null; // 1 | 2 | null — ручной выбор при N=2
    let ppNeedManualSlot = false;
    let ppDeliveriesN = 0;

    function setPpDeliverySlot(slot) {
      slot = Number(slot) || 0;
      if (slot !== 1 && slot !== 2) return;
      ppDeliverySlotManual = slot;
      var b1 = document.getElementById("ppSlot1Btn");
      var b2 = document.getElementById("ppSlot2Btn");
      if (b1) b1.classList.toggle("active", slot === 1);
      if (b2) b2.classList.toggle("active", slot === 2);
      var hint = document.getElementById("ppSlotHint");
      if (hint && ppDeliveriesN >= 2) {
        hint.textContent = "Доставок в месяц: N=" + ppDeliveriesN + " · выбрано ПП " + slot;
        hint.style.display = "block";
      }
    }
    window.setPpDeliverySlot = setPpDeliverySlot;

    function updatePpSlotPickUi_(opts) {
      opts = opts || {};
      var group = document.getElementById("ppSlotPickGroup");
      var pickHint = document.getElementById("ppSlotPickHint");
      if (!group) return;
      var show = orderType === "pp" && (opts.needManualSlot || ppNeedManualSlot) && (opts.deliveriesN || ppDeliveriesN) >= 2;
      group.style.display = show ? "" : "none";
      if (!show) {
        if (opts.reset) {
          ppDeliverySlotManual = null;
          ppNeedManualSlot = false;
          var b1 = document.getElementById("ppSlot1Btn");
          var b2 = document.getElementById("ppSlot2Btn");
          if (b1) b1.classList.remove("active");
          if (b2) b2.classList.remove("active");
        }
        return;
      }
      ppNeedManualSlot = true;
      var suggested = Number(opts.suggestedSlot) || ppDeliverySlotManual || 1;
      if (!(ppDeliverySlotManual === 1 || ppDeliverySlotManual === 2)) {
        setPpDeliverySlot(suggested);
      } else {
        setPpDeliverySlot(ppDeliverySlotManual);
      }
      if (pickHint) {
        var why = "один раз на клиента — дальше считаем от ответа";
        pickHint.textContent = "Какая сейчас доставка? ПП " + suggested +
          " (подсказка) — выбери ПП 1 или ПП 2 (" + why + ")";
      }
    }

    function currentPpSlotPayload_() {
      if (orderType !== "pp") return { deliverySlot: "", ppSlot: "" };
      var slot = ppDeliverySlotManual;
      if (!(slot >= 1) && ppDeliveriesN >= 2 && !ppNeedManualSlot) slot = 1;
      if (!(slot >= 1)) return { deliverySlot: "", ppSlot: "" };
      var n = ppDeliveriesN >= 2 ? ppDeliveriesN : 2;
      return {
        deliverySlot: slot,
        ppSlot: slot + "/" + n
      };
    }

    function setOrderType(t) {
      orderType = t;
      ["pp", "bp", "retail", "partner"].forEach(function (k) {
        var map = { pp: "otPp", bp: "otBp", retail: "otRet", partner: "otPart" };
        var el = document.getElementById(map[k]);
        if (el) el.classList.toggle("active", k === t);
      });
      var pg = document.getElementById("orderPriceGroup");
      var inp = document.getElementById("orderPriceInput");
      var lab = document.getElementById("orderPriceLabel");
      var live = document.getElementById("orderPriceLive");
      var totalCard = document.getElementById("orderTotalCard");
      var btnAuto = document.getElementById("btnRetailPriceAuto");
      var btnPp = document.getElementById("btnPpSuggest");
      var hintPp = document.getElementById("ppSlotHint");
      if (btnAuto) btnAuto.style.display = t === "retail" ? "" : "none";
      var rdg = document.getElementById("retailPaidDeliveryGroup");
      if (rdg) rdg.style.display = t === "retail" ? "" : "none";
      if (t !== "retail") {
        try { setRetailPaidDelivery(false); } catch (eRd) {}
      }
      if (btnPp) btnPp.style.display = t === "pp" ? "" : "none";
      if (hintPp && t !== "pp") { hintPp.style.display = "none"; hintPp.textContent = ""; }
      if (t !== "pp") updatePpSlotPickUi_({ reset: true, needManualSlot: false, deliveriesN: 0 });
      var ppg = document.getElementById("ppPartnerGroup");
      if (ppg) ppg.style.display = t === "bp" ? "" : "none";
      if (t === "bp") {
        try {
          var nickBp = String((document.getElementById("client") || {}).value || "").trim();
          var memP = "";
          if (nickBp) {
            var mk = nickBp.toUpperCase();
            memP = String((clientMemory[mk] && clientMemory[mk].ppPartner) || "").trim();
          }
          ensurePpPartnerOptions_(memP || undefined);
        } catch (ePart) {}
      } else {
        var selClr = document.getElementById("ppPartnerSelect");
        if (selClr && t !== "bp") { /* keep value only for bp */ }
      }
      var cg = document.getElementById("partnerCouponsGroup");
      if (cg) cg.style.display = t === "partner" ? "" : "none";
      if (t !== "partner") {
        try { setPartnerCouponsEnabled(false); } catch (eCoup) {}
      } else {
        try { refreshPartnerCouponsLive(); } catch (eCoup2) {}
      }
      if (t === "partner") {
        retailPriceManual = false;
        if (pg) pg.style.display = "";
        if (inp) { inp.readOnly = false; inp.placeholder = "свой прайс"; }
        if (lab) lab.textContent = "Цена партнёра (BYN)";
        if (live) live.style.display = "none";
        if (totalCard) totalCard.style.display = "none";
      } else if (t === "bp") {
        retailPriceManual = false;
        if (pg) pg.style.display = "none";
        if (inp) { inp.readOnly = true; inp.value = "0"; }
        if (lab) lab.textContent = "Цена (BYN)";
        if (live) live.style.display = "none";
        if (totalCard) totalCard.style.display = "none";
      } else if (t === "pp") {
        retailPriceManual = false;
        if (pg) pg.style.display = "";
        if (inp) { inp.readOnly = false; inp.placeholder = "ФАКТ СТОИМОСТЬ"; }
        if (lab) lab.textContent = "Цена ПП (BYN)";
        if (live) live.style.display = "none";
        if (totalCard) totalCard.style.display = "none";
        try { refreshPpFactPrice(); } catch (e) {}
      } else {
        retailPriceManual = false;
        if (pg) pg.style.display = "";
        if (inp) { inp.readOnly = false; inp.placeholder = "авто или своя"; }
        if (lab) lab.textContent = "Цена розница (BYN)";
        if (live) live.style.display = "";
        if (totalCard) totalCard.style.display = "";
        try { refreshRetailOrderPrice(); } catch (e2) {}
      }
    }
    window.setOrderType = setOrderType;

    function setRetailPaidDelivery(on) {
      retailPaidDelivery = !!on;
      var yes = document.getElementById("retailDelivYesBtn");
      var no = document.getElementById("retailDelivNoBtn");
      if (yes) yes.classList.toggle("active", retailPaidDelivery);
      if (no) no.classList.toggle("active", !retailPaidDelivery);
      if (orderType === "retail" && !retailPriceManual) {
        try { refreshRetailOrderPrice(); } catch (e) {}
      } else if (orderType === "retail" && retailPriceManual) {

        try { refreshRetailOrderPrice(); } catch (e2) {}
      }
    }
    window.setRetailPaidDelivery = setRetailPaidDelivery;

    var partnerCouponsEnabled = false;
    function setPartnerCouponsEnabled(on) {
      partnerCouponsEnabled = !!on;
      var yes = document.getElementById("couponsYesBtn");
      var no = document.getElementById("couponsNoBtn");
      if (yes) yes.classList.toggle("active", partnerCouponsEnabled);
      if (no) no.classList.toggle("active", !partnerCouponsEnabled);
      var fields = document.getElementById("partnerCouponsFields");
      if (fields) fields.style.display = partnerCouponsEnabled ? "" : "none";
      if (!partnerCouponsEnabled) {
        var q = document.getElementById("couponsQtyInput");
        var p = document.getElementById("couponPriceInput");
        if (q) q.value = "";
        if (p) p.value = "";
      }
      refreshPartnerCouponsLive();
    }
    function refreshPartnerCouponsLive() {
      var live = document.getElementById("couponsCostLive");
      if (!live) return;
      if (!partnerCouponsEnabled) {
        live.textContent = "Купоны не добавляются";
        return;
      }
      var qty = Number((document.getElementById("couponsQtyInput") || {}).value) || 0;
      var pack = Number((document.getElementById("couponPriceInput") || {}).value) || 0;
      pack = Math.round(pack * 100) / 100;
      live.textContent = "Затраты на пачку: " + pack + " BYN" +
        (qty > 0 ? (" · " + qty + " шт") : "");
    }
    function readPartnerCouponsPayload_() {
      if (orderType !== "partner" || !partnerCouponsEnabled) {
        return { couponsQty: 0, couponPrice: 0, couponsCost: 0 };
      }
      var qty = Number((document.getElementById("couponsQtyInput") || {}).value) || 0;
      var pack = Number((document.getElementById("couponPriceInput") || {}).value) || 0;
      if (qty < 0) qty = 0;
      if (pack < 0) pack = 0;
      qty = Math.floor(qty);
      pack = Math.round(pack * 100) / 100;
      return {
        couponsQty: qty,
        couponPrice: pack,
        couponsCost: pack
      };
    }
    function applyPartnerCouponsFromClient_(client) {
      var qty = Number(client && client.couponsQty) || 0;
      var price = Number(client && client.couponPrice) || 0;
      if (qty > 0 || price > 0) {
        setPartnerCouponsEnabled(true);
        var q = document.getElementById("couponsQtyInput");
        var p = document.getElementById("couponPriceInput");
        if (q) q.value = String(qty || "");
        if (p) p.value = String(price || "");
        refreshPartnerCouponsLive();
      } else {
        setPartnerCouponsEnabled(false);
      }
    }
    window.setPartnerCouponsEnabled = setPartnerCouponsEnabled;
    window.refreshPartnerCouponsLive = refreshPartnerCouponsLive;

    function refreshRetailOrderPrice() {
      if (orderType !== "retail") return { total: 0, lines: [] };

      var local = calcRetailBasketTotal(basket, { deliveriesN: 1, applyDelivery: false });
      if (retailPaidDelivery && local.goods > 0) {
        local.delivery = PRICE_RETAIL_DELIVERY_BYN;
        local.deliveryTimes = 1;
        local.total = Math.round((local.goods + local.delivery) * 100) / 100;
        local.paidDeliveryForced = true;
      }
      var inp = document.getElementById("orderPriceInput");
      if (inp && !retailPriceManual) inp.value = String(local.total);
      var live = document.getElementById("orderPriceLive");
      if (live) {
        var miss = (local.lines || []).filter(function (L) { return !L.found && L.val > 0; }).length;
        var delHint = retailPaidDelivery
          ? (" · платная доставка +" + PRICE_RETAIL_DELIVERY_BYN)
          : "";
        if (retailPriceManual) {
          live.textContent = "Своя цена · по прайсу было " + local.total + " BYN" + delHint;
        } else if (!basket.length) {
          live.textContent = "Добавь позиции или введи цену";
        } else if (miss) {
          live.textContent = "По прайсу · без цены: " + miss + " поз." + delHint + " · можно править";
        } else {
          live.textContent = "По прайсу · товар " + local.goods +
            (local.delivery ? (" + дост. " + local.delivery) : "") +
            " = " + local.total + " BYN";
        }
      }
      var t = document.getElementById("orderRetailTotalText");
      if (t) {
        var shown = inp && inp.value !== "" ? Number(inp.value) : local.total;
        if (!isFinite(shown)) shown = local.total;
        t.textContent = shown + " BYN";
      }
      return local;
    }
    window.refreshRetailOrderPrice = refreshRetailOrderPrice;

    function onOrderPriceInput() {
      if (orderType !== "retail") return;
      retailPriceManual = true;
      try { refreshRetailOrderPrice(); } catch (e) {}
    }
    window.onOrderPriceInput = onOrderPriceInput;

    function resetRetailPriceToAuto() {
      retailPriceManual = false;
      try { refreshRetailOrderPrice(); } catch (e) {}
      showToast("Цена по прайсу");
    }
    window.resetRetailPriceToAuto = resetRetailPriceToAuto;

    async function refreshPpFactPrice() {
      if (orderType !== "pp") return;
      var nick = (document.getElementById("client") && document.getElementById("client").value || "").trim();
      var hint = document.getElementById("ppSlotHint");
      var day = (document.getElementById("day") && document.getElementById("day").value) || "";
      var date = (document.getElementById("deliveryDate") && document.getElementById("deliveryDate").value) || "";
      if (nick.length < 2) {
        if (hint) { hint.style.display = "none"; hint.textContent = ""; }
        updatePpSlotPickUi_({ reset: true, needManualSlot: false, deliveriesN: 0 });
        return;
      }
      try {
        var res = await apiGet(
          { action: "getPpFactCost", nick: nick, day: day, date: date },
          { timeoutMs: 12000, cacheTtlMs: 15000 }
        );
        if (res && res.status === "success") {
          var inp = document.getElementById("orderPriceInput");
          if (inp && res.factCost != null) inp.value = String(res.factCost);
          ppDeliveriesN = Number(res.deliveries) || 0;
          if (inp) inp.placeholder = "N=" + (ppDeliveriesN || "?");
          ppNeedManualSlot = !!(res.needManualSlot && ppDeliveriesN >= 2);
          var suggested = Number(res.suggestedSlot || res.deliverySlot) || 1;
          if (ppNeedManualSlot) {
            ppDeliverySlotManual = suggested;
          }
          if (hint) {
            if (ppNeedManualSlot) {
              hint.textContent = "N=" + ppDeliveriesN + " · какая сейчас доставка? (один раз)";
            } else if (ppDeliveriesN) {
              hint.textContent = "Доставок в месяц: N=" + ppDeliveriesN +
                (res.deliverySlot ? (" · слот " + res.deliverySlot) : "");
            } else {
              hint.textContent = "";
            }
            hint.style.display = hint.textContent ? "block" : "none";
          }
          updatePpSlotPickUi_({
            needManualSlot: ppNeedManualSlot,
            deliveriesN: ppDeliveriesN,
            suggestedSlot: suggested,
            everSeenInApp: res.everSeenInApp,
            daysSinceLastDelivery: res.daysSinceLastDelivery
          });
          if (!ppNeedManualSlot && res.deliverySlot >= 1 && ppDeliveriesN >= 2) {
            ppDeliverySlotManual = Number(res.deliverySlot) || 1;
          }
        }
      } catch (e) {}
    }

    function mapApiBasketToLocal(list) {
      return (list || []).map(function (x) {
        var main = String(x.main || x.name || "").trim();
        var mainUp = main.toUpperCase().replace(/Ё/g, "Е");
        var cat = x.cat || "dressura";
        if (/^ПОЧКИ$/.test(mainUp)) cat = "dressura";
        if (/^ГРУШ/.test(mainUp)) {
          main = "ГРУШЫ";
          cat = "veg";
        }
        return {
          id: Date.now() + Math.random(),
          cat: cat,
          main: main,
          name: x.name || x.main || main,
          sub: x.sub || "",
          value: x.val != null ? x.val : x.value,
          val: x.val != null ? x.val : x.value
        };
      }).filter(function (x) { return x.main && Number(x.value) > 0; });
    }

    async function suggestPpBasketFromSheet(opts) {
      opts = opts || {};
      if (orderType !== "pp") {
        showToast("Сначала тип заказа: ПП");
        return false;
      }
      var nick = (document.getElementById("client") && document.getElementById("client").value || "").trim();
      if (nick.length < 2) {
        showToast("Укажи ник клиента ПП");
        return false;
      }
      if (ppNeedManualSlot && !(ppDeliverySlotManual === 1 || ppDeliverySlotManual === 2)) {
        showToast("Сначала выбери ПП 1 или ПП 2");
        return false;
      }
      var day = (document.getElementById("day") && document.getElementById("day").value) || "";
      var date = (document.getElementById("deliveryDate") && document.getElementById("deliveryDate").value) || "";
      var slotPayload = currentPpSlotPayload_();
      try {
        var req = { action: "getPpOrderSuggest", nick: nick, day: day, date: date };
        if (slotPayload.deliverySlot) {
          req.deliverySlot = slotPayload.deliverySlot;
          req.ppSlot = slotPayload.ppSlot;
        }
        var res = await apiGet(req);
        if (!res || res.status !== "success") {
          showToast("Не удалось прочитать лист ПП");
          return false;
        }
        ppDeliveriesN = Number(res.deliveriesN) || ppDeliveriesN;
        if (res.needManualSlot && !(ppDeliverySlotManual >= 1)) {
          ppNeedManualSlot = true;
          updatePpSlotPickUi_({ needManualSlot: true, deliveriesN: ppDeliveriesN });
          showToast("Выбери ПП 1 или ПП 2");
          return false;
        }
        if (res.address && !String(document.getElementById("addressInput").value || "").trim()) {
          fillAddressFieldsFromStored_(res.address);
        }
        if (res.phone && !String(document.getElementById("phoneInput").value || "").trim()) {
          document.getElementById("phoneInput").value = res.phone;
        }
        var proposed = mapApiBasketToLocal(res.proposedBasket || []);
        if (!proposed.length) {
          proposed = mapApiBasketToLocal(res.monthlyBasket || res.remainingBasket || []);
        }
        if (!proposed.length) {
          showToast("В листе ПП пустой состав");
          return false;
        }
        var msg = (res.hint || "Состав с листа ПП") + "\nВставить " + proposed.length + " поз.?";
        if (res.deliveriesN >= 2 && res.deliverySlot >= 2) {
          msg += "\n(остаток после 1-й доставки)";
        }
        var ask = opts.force ? true : await uiConfirmAsync(msg);
        if (!ask) return false;
        basket = proposed;
        renderBasket();
        if (res.deliverySlot >= 1) setPpDeliverySlot(res.deliverySlot);
        try { refreshPpFactPrice(); } catch (e0) {}
        showToast(res.hint || ("Состав ПП · " + proposed.length + " поз."));
        return true;
      } catch (e) {
        showToast("Ошибка состава ПП");
        return false;
      }
    }
    window.suggestPpBasketFromSheet = suggestPpBasketFromSheet;

    function shortAddressForCourier(full, entrance) {
      var parsed = parseDeliveryAddress(full);
      var street = parsed.street || formatStreetHouse(full);
      var ent = String(entrance || parsed.entrance || "").trim();
      if (ent) street = street + (street ? ", " : "") + ( /^\d/.test(ent) ? ("п." + ent) : ent );
      return street;
    }

    function parseDeliveryAddress(raw) {
      var s = String(raw || "").trim();
      var entrance = "";
      var floor = "";
      var flat = "";
      if (!s) return { street: "", entrance: "", floor: "", flat: "" };

      function take(re) {
        var m = s.match(re);
        if (!m) return "";
        var val = String(m[1] || "").trim();
        s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s*[·|;,]\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
        s = s.replace(/^[·|;,\s]+|[·|;,\s]+$/g, "").trim();
        return val;
      }

      entrance = take(/(?:^|[·|;,\s])(?:подъезд|под\.)\s*([0-9]+[а-яa-z]?)\b/i);
      if (!entrance) {

        entrance = take(/(?:^|[·|;,\s])п\.\s*([0-9]+[а-яa-z]?)\b/i);
      }
      if (!entrance) {

        entrance = take(/(?:^|[·|;,\s])п\s+([0-9]+[а-яa-z]?)\b/i);
      }
      floor = take(/(?:^|[·|;,\s])(?:этаж|эт\.)\s*([0-9]+[а-яa-z]?)\b/i);
      if (!floor) floor = take(/(?:^|[·|;,\s])эт\s+([0-9]+[а-яa-z]?)\b/i);
      if (!floor) floor = take(/(?:^|[·|;,\s])эт\.?\s*([0-9]+[а-яa-z]?)\b/i);

      flat = take(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*([0-9]+[а-яa-z\-\/]*)\b/i);
      if (!flat) flat = take(/(?:^|[·|;,\s])кв\s+([0-9]+[а-яa-z\-\/]*)\b/i);
      if (!flat) flat = take(/(?:^|[·|;,\s])([0-9]+[а-яa-z\-\/]*)\s*кв\.?\b/i);

      var dm = s.match(/(?:^|[·|;,\s])домофон\s*([^\s·|;,]{1,24})/i);
      if (dm) {
        var dval = String(dm[1] || "").trim();
        s = (s.slice(0, dm.index) + " " + s.slice(dm.index + dm[0].length)).replace(/\s{2,}/g, " ").trim();
        if (dval) entrance = entrance ? (entrance + ", домофон " + dval) : ("домофон " + dval);
      }

      var street = formatStreetHouse(s) || s.replace(/\s*[·|]\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
      return { street: street, entrance: entrance, floor: floor, flat: flat };
    }
    window.parseDeliveryAddress = parseDeliveryAddress;

    function composeDeliveryAddress(street, entrance, floor, flat) {
      var st = formatStreetHouse(street) || String(street || "").trim();
      var parts = [];
      if (st) parts.push(st);
      var ent = String(entrance || "").trim();
      var fl = String(floor || "").trim();
      var ft = String(flat || "").trim();
      if (ent) {
        if (/^(подъезд|п\.|домофон)/i.test(ent)) parts.push(ent);
        else parts.push("п." + ent);
      }
      if (fl) {
        if (/^(этаж|эт\.)/i.test(fl)) parts.push(fl);
        else parts.push("эт." + fl);
      }
      if (ft) {
        ft = ft.replace(/^(квартира|кв\.?)\s*/i, "").trim();
        if (/^(квартира|кв\.)/i.test(ft)) parts.push(ft);
        else parts.push("кв." + ft);
      }
      return parts.join(" · ");
    }
    window.composeDeliveryAddress = composeDeliveryAddress;

    function autofillAddressDetailFields_(opts) {
      opts = opts || {};
      var force = !!opts.force;
      var addrEl = document.getElementById("addressInput");
      var entEl = document.getElementById("entranceInput");
      var flEl = document.getElementById("floorInput");
      var ftEl = document.getElementById("flatInput");
      if (!addrEl) return;
      var parsed = parseDeliveryAddress(addrEl.value);
      if (parsed.street && (force || String(addrEl.value || "").trim() !== parsed.street)) {

        if (parsed.entrance || parsed.floor || parsed.flat) addrEl.value = parsed.street;
      }
      if (entEl && parsed.entrance && (force || !String(entEl.value || "").trim())) entEl.value = parsed.entrance;
      if (flEl && parsed.floor && (force || !String(flEl.value || "").trim())) flEl.value = parsed.floor;
      if (ftEl && parsed.flat && (force || !String(ftEl.value || "").trim())) ftEl.value = parsed.flat;
    }
    window.autofillAddressDetailFields_ = autofillAddressDetailFields_;

    function fillAddressFieldsFromStored_(raw) {
      var parsed = parseDeliveryAddress(raw);
      var addrEl = document.getElementById("addressInput");
      var entEl = document.getElementById("entranceInput");
      var flEl = document.getElementById("floorInput");
      var ftEl = document.getElementById("flatInput");
      var street = parsed.street || formatStreetHouse(raw) || String(raw || "");
      if (addrEl) addrEl.value = street;
      if (entEl) entEl.value = parsed.entrance || "";
      if (flEl) flEl.value = parsed.floor || "";
      if (ftEl) ftEl.value = parsed.flat || "";

      selectedAddressGeo = null;
      try { setAddressPickedHint(false); } catch (eHint) {}
      pauseAddressSuggest_();
    }
    window.fillAddressFieldsFromStored_ = fillAddressFieldsFromStored_;

    function courierPublicAddress_(raw) {
      var p = parseDeliveryAddress(raw);
      var street = p.street || formatStreetHouse(raw) || String(raw || "").trim();
      if (p.entrance) street = street + (street ? ", " : "") + (/^(п\.|подъезд|домофон)/i.test(p.entrance) ? p.entrance : ("п." + p.entrance));
      return street;
    }

    function courierPrivateAddressHtml_(raw) {
      var p = parseDeliveryAddress(raw);
      var bits = [];
      if (p.floor) bits.push("этаж <b>" + escapeHtml(p.floor) + "</b>");
      if (p.flat) bits.push("кв. <b>" + escapeHtml(p.flat) + "</b>");
      if (!bits.length) return '<span class="muted">Этаж / квартира не указаны</span>';
      return bits.join(" · ");
    }

    function formatStreetHouse(full) {
      var s = String(full || "").trim();
      if (!s) return "";

      if (typeof parseLatLonFromText_ === "function" && parseLatLonFromText_(s)) {
        return s.replace(/\s+/g, " ");
      }

      s = s.replace(/^\d{5,6}\s*,?\s*/g, "");

      s = s.replace(/(^|[^0-9.,])(\d{5,6})\s*$/g, "$1").trim();
      s = s.replace(/[,\s]+$/g, "").trim();
      var parts = s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      function dropPart(p) {
        if (/^(беларусь|belarus|by|минск|minsk)$/i.test(p)) return true;
        if (/^\d{5,6}$/.test(p)) return true;
        if (/область|region|район|district|республик|сельсовет|микрорайон|^мкр\.?$/i.test(p)) return true;
        if (/^минская\b/i.test(p) || /^minsk\s+region/i.test(p)) return true;
        return false;
      }
      var keep = parts.filter(function (p) { return !dropPart(p); });
      if (!keep.length) keep = parts.slice(0, 2);
      var out = [];
      for (var i = 0; i < keep.length; i++) {
        out.push(keep[i]);

        if (out.length >= 2) break;
        if (out.length === 1 && /\d/.test(keep[i]) && /[а-яa-z]/i.test(keep[i])) break; // "ул. X 12"
      }
      var joined = out.join(", ") || s;

      joined = joined
        .replace(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*[0-9]+[а-яa-z\-\/]*/gi, " ")
        .replace(/(?:^|[·|;,\s])[0-9]+[а-яa-z\-\/]*\s*кв\.?\b/gi, " ")
        .replace(/(?:^|[·|;,\s])(?:этаж|эт\.?)\s*[0-9]+[а-яa-z]?/gi, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^[·|;,\s]+|[·|;,\s]+$/g, "")
        .trim();
      return joined || s;
    }
    window.formatStreetHouse = formatStreetHouse;

    function updateNotesSummary() {
      var el = document.getElementById("notesSummary");
      if (!el) return;
      var n = (orderNotes || []).filter(function (x) { return String(x.text || "").trim(); }).length;
      el.textContent = n ? ("Примечаний: " + n) : "Нет";
    }

    async function openNotesModal() {
      if (!orderNotes.length) orderNotes = [defaultOrderNote()];
      renderOrderNotes();
      var html = '<div class="modal-title">Примечания</div>' +
        '<div id="notesModalBody"></div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn-action btn-orange" id="notesAddMore">Добавить ещё</button>' +
        '<button type="button" class="btn-action btn-green" id="notesDone">Готово</button>' +
        '</div>';
      openModal(html);
      setTimeout(function () {
        var body = document.getElementById("notesModalBody");
        var list = document.getElementById("notesList");
        if (body && list) {
          body.appendChild(list);
          list.style.display = "";
        }
        var add = document.getElementById("notesAddMore");
        if (add) add.onclick = function () { addOrderNote(); };
        var done = document.getElementById("notesDone");
        if (done) done.onclick = function () {
          var hidden = document.querySelector(".card #notesListHost") || document.getElementById("btnOpenNotes");

          var host = document.getElementById("notesList");
          if (host && host.parentElement && host.parentElement.id === "notesModalBody") {
            var wrap = document.getElementById("btnOpenNotes");
            if (wrap && wrap.parentElement) {
              wrap.parentElement.appendChild(host);
              host.style.display = "none";
            }
          }
          updateNotesSummary();
          closeModal(true);
        };
      }, 0);
    }
    window.openNotesModal = openNotesModal;

    let orderDogCount = 1;
    let orderActiveDog = 1;
    let orderBaskets = { 1: [], 2: [] };

    function syncOrderBasketFromActive_() {
      orderBaskets[orderActiveDog] = (basket || []).slice();
    }
    function loadOrderBasketToActive_() {
      if (!orderBaskets[orderActiveDog]) orderBaskets[orderActiveDog] = [];
      basket = orderBaskets[orderActiveDog];
    }
    function setOrderActiveDog(n) {
      n = Number(n) === 2 ? 2 : 1;
      syncOrderBasketFromActive_();
      orderActiveDog = n;
      var t1 = document.getElementById("orderDogTab1");
      var t2 = document.getElementById("orderDogTab2");
      if (t1) t1.classList.toggle("active", n === 1);
      if (t2) t2.classList.toggle("active", n === 2);
      loadOrderBasketToActive_();
      try { renderBasket(); } catch (e) {}
    }
    window.setOrderActiveDog = setOrderActiveDog;

    function setOrderDogCount(n) {
      n = Number(n) === 2 ? 2 : 1;
      syncOrderBasketFromActive_();
      orderDogCount = n;
      var sw = document.getElementById("orderDogSwitch");
      if (sw) sw.style.display = n >= 2 ? "" : "none";
      if (n < 2) {
        orderBaskets[2] = [];
        orderActiveDog = 1;
      } else if (!orderBaskets[2]) {
        orderBaskets[2] = [];
      }
      setOrderActiveDog(orderActiveDog);
    }
    window.setOrderDogCount = setOrderDogCount;

    function orderSaveUsesTwoDogs_() {
      var b1 = orderBaskets[1] || [];
      var b2 = orderBaskets[2] || [];
      return orderDogCount >= 2 && b1.length > 0 && b2.length > 0;
    }

    function buildOrderSaveBasket_() {
      syncOrderBasketFromActive_();
      var out = [];
      var twoDogs = orderSaveUsesTwoDogs_();
      if (!twoDogs) {
        var b1 = orderBaskets[1] || [];
        var b2 = orderBaskets[2] || [];
        var src = b1.length ? 1 : (b2.length ? 2 : (orderActiveDog || 1));
        (orderBaskets[src] || []).forEach(function (x) {
          var main = canonicalProductMain_(x.main || x.name);
          out.push({
            cat: x.cat,
            main: main,
            name: main,
            sub: x.sub || "",
            value: x.value != null ? x.value : x.val,
            val: x.value != null ? x.value : x.val
          });
        });
        return out;
      }
      for (var d = 1; d <= 2; d++) {
        (orderBaskets[d] || []).forEach(function (x) {
          var main = canonicalProductMain_(x.main || x.name);
          out.push({
            cat: x.cat,
            main: main,
            name: main,
            sub: x.sub || "",
            value: x.value != null ? x.value : x.val,
            val: x.value != null ? x.value : x.val,
            dog: d
          });
        });
      }
      return out;
    }

    function prepareSecondDog() {
      const el = document.getElementById("client");
      let name = (el.value || "").trim();
      if (!name) {
        showToast("Сначала укажи имя / ник владельца");
        return;
      }
      name = name.replace(/\s*[·•#]\s*2\s*$/i, "").trim();
      el.value = name;
      ownerContactSnapshot = {
        client: name,
        address: (document.getElementById("addressInput") && document.getElementById("addressInput").value) || "",
        entrance: (document.getElementById("entranceInput") && document.getElementById("entranceInput").value) || "",
        floor: (document.getElementById("floorInput") && document.getElementById("floorInput").value) || "",
        flat: (document.getElementById("flatInput") && document.getElementById("flatInput").value) || "",
        phone: (document.getElementById("phoneInput") && document.getElementById("phoneInput").value) || "",
        geo: selectedAddressGeo
      };
      syncOrderBasketFromActive_();
      if (!(orderBaskets[1] && orderBaskets[1].length) && basket && basket.length) {
        orderBaskets[1] = basket.slice();
      }
      setOrderDogCount(2);
      setOrderActiveDog(1);
      var btn2 = document.getElementById("btnSecondDogOrder");
      if (btn2) btn2.style.display = "none";
      showToast("Хозяин один · переключай Собака 1 / 2 и сохрани один раз");
    }
    window.prepareSecondDog = prepareSecondDog;

    function startSecondDogOrder() {

      prepareSecondDog();
      setOrderActiveDog(2);
    }
    window.startSecondDogOrder = startSecondDogOrder;

    const CLIENT_MEMORY_KEY = "superboyna_client_memory_v1";
    let clientMemory = {}; // nickUpper -> {nick,address,phone,note,basket,orderType,updatedAt}
    let clientSuggestList = [];
    let clientSuggestHideTimer = null;

    function loadClientMemory() {
      try {
        clientMemory = JSON.parse(localStorage.getItem(CLIENT_MEMORY_KEY) || "{}") || {};
      } catch (e) { clientMemory = {}; }
    }
    function persistClientMemory() {
      try { localStorage.setItem(CLIENT_MEMORY_KEY, JSON.stringify(clientMemory)); } catch (e) {}
    }
    function rememberClientProfile(p) {
      if (!p || !p.nick) return;
      var key = String(p.nick).trim().toUpperCase();
      if (!key) return;
      var prev = clientMemory[key] || {};
      var basket = Array.isArray(p.basket) ? p.basket : (prev.basket || []);
      clientMemory[key] = {
        nick: String(p.nick).trim(),
        address: p.address != null ? String(p.address) : (prev.address || ""),
        phone: p.phone != null ? String(p.phone) : (prev.phone || ""),
        note: p.note != null ? String(p.note) : (prev.note || ""),
        basket: basket,
        orderType: p.orderType || prev.orderType || "",
        ppPartner: p.ppPartner != null ? String(p.ppPartner) : (prev.ppPartner || ""),
        updatedAt: Date.now()
      };

      if (!clientMemory[key].address && prev.address) clientMemory[key].address = prev.address;
      if (!clientMemory[key].phone && prev.phone) clientMemory[key].phone = prev.phone;
      if (!clientMemory[key].ppPartner && prev.ppPartner) clientMemory[key].ppPartner = prev.ppPartner;
      if (!basket.length && prev.basket && prev.basket.length) clientMemory[key].basket = prev.basket;
      persistClientMemory();
    }
    function scoreClientNick(nick, q) {
      var n = String(nick || "").toUpperCase().replace(/\s+/g, " ").trim();
      var qu = String(q || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (!n || !qu) return 0;
      if (n === qu) return 100;

      var nCore = n.replace(/\bВАРКА\b/g, "").replace(/\s+/g, " ").trim();
      var qCore = qu.replace(/\bВАРКА\b/g, "").replace(/\s+/g, " ").trim();
      if (/\bВАРКА\b/.test(n) || /\bВАРКА\b/.test(qu)) {
        if (!qCore) {

          if (n.indexOf(qu) === 0) return 60;
          return n === qu ? 100 : 0;
        }
        if (nCore === qCore) return 98;
        if (nCore.indexOf(qCore) === 0) return 90;
        if (nCore.indexOf(qCore) >= 0) return 80;
        if (qCore.indexOf(nCore) >= 0 && nCore.length >= 3) return 75;
        return 0;
      }
      if (n.indexOf(qu) === 0) return 92;
      if (n.indexOf(qu) >= 0) return 78;
      var words = n.split(/[\s._\-@]+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) {
        if (words[i].indexOf(qu) === 0) return 85;
        if (words[i].indexOf(qu) >= 0) return 70;
      }
      var n2 = n.replace(/[\s._\-@]/g, "");
      var q2 = qu.replace(/[\s._\-@]/g, "");
      if (n2.indexOf(q2) === 0) return 88;
      if (n2.indexOf(q2) >= 0) return 72;
      return 0;
    }
    function searchClientMemory(q) {
      var qu = String(q || "").trim();
      if (qu.length < 1) return [];
      var out = [];
      Object.keys(clientMemory).forEach(function (k) {
        var p = clientMemory[k];
        if (!p || !p.nick) return;
        var sc = scoreClientNick(p.nick, qu);
        if (sc > 0) out.push({ score: sc, profile: p });
      });
      out.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (b.profile.updatedAt || 0) - (a.profile.updatedAt || 0);
      });
      return out.slice(0, 8).map(function (x) {
        var p = x.profile;
        return {
          nick: p.nick,
          address: p.address || "",
          phone: p.phone || "",
          note: p.note || "",
          basket: p.basket || [],
          orderType: p.orderType || "",
          ppPartner: p.ppPartner || "",
          score: x.score
        };
      });
    }
    function hideClientSuggest() {
      var box = document.getElementById("clientSuggest");
      if (box) { box.classList.remove("open"); box.innerHTML = ""; }
      clientSuggestList = [];
    }
    function renderClientSuggest(list) {
      var box = document.getElementById("clientSuggest");
      if (!box) return;
      clientSuggestList = list || [];
      if (!clientSuggestList.length) { hideClientSuggest(); return; }
      box.innerHTML = clientSuggestList.map(function (m, i) {
        var bags = (m.basket && m.basket.length) ? (m.basket.length + " поз.") : "без состава";
        var sub = [m.address, bags].filter(Boolean).join(" · ");
        return '<button type="button" class="addr-suggest-item" data-idx="' + i + '">' +
          escapeHtml(m.nick) +
          (sub ? '<span class="addr-suggest-sub">' + escapeHtml(sub) + "</span>" : "") +
          "</button>";
      }).join("");
      box.classList.add("open");
      box.querySelectorAll(".addr-suggest-item").forEach(function (btn) {
        btn.onclick = function () {
          var idx = Number(btn.getAttribute("data-idx"));
          var m = clientSuggestList[idx];
          if (m) applyClientMatch(m);
        };
      });
    }
    function onClientNameInput() {
      var q = (document.getElementById("client").value || "").trim();
      if (orderType === "pp" && q.length >= 2) {
        clearTimeout(onClientNameInput._ppT);
        onClientNameInput._ppT = setTimeout(refreshPpFactPrice, 900);
      }
      if (q.length < 1) { hideClientSuggest(); return; }

      renderClientSuggest(searchClientMemory(q));
    }
    function onClientBlurDelayed() {
      clearTimeout(clientSuggestHideTimer);
      clientSuggestHideTimer = setTimeout(hideClientSuggest, 220);
    }
    async function applyClientMatch(m) {
      if (!m) return;
      hideClientSuggest();
      if (m.nick) document.getElementById("client").value = m.nick;
      if (m.address) {
        fillAddressFieldsFromStored_(m.address);
      }
      if (m.phone) document.getElementById("phoneInput").value = m.phone;
      if (m.note) {
        var hasAny = (orderNotes || []).some(function (n) { return String(n.text || "").trim(); });
        if (!hasAny) loadOrderNotesFromRaw(m.note);
      }

      if (m.ppPartner) {
        try {
          if (orderType !== "bp" && (m.orderType === "bp" || String(m.ppPartner).trim())) {

          }
          if (orderType === "bp") {
            await ensurePpPartnerOptions_(m.ppPartner);
          }
        } catch (ePar) {}
      }
      try { if (orderType === "pp") refreshPpFactPrice(); } catch (e0) {}

      if (orderType === "pp") {
        var inserted = await suggestPpBasketFromSheet({});
        if (!inserted) showToast("Контакты подставлены");
        return;
      }
      var bask = Array.isArray(m.basket) ? m.basket : [];
      if (bask.length) {
        var ask = await uiConfirmAsync(
          "Клиент: " + m.nick + "\nВставить последний состав (" + bask.length + " поз.)?"
        );
        if (ask) {
          basket = mapApiBasketToLocal(bask);
          var hasDog1m = basket.some(function (x) { return Number(x.dog) === 1; });
          var hasDog2m = basket.some(function (x) { return Number(x.dog) === 2; });
          var hasDogSplit = hasDog1m && hasDog2m;
          if (hasDogSplit) {
            orderBaskets = { 1: [], 2: [] };
            basket.forEach(function (x) {
              var d = Number(x.dog) === 2 ? 2 : 1;
              orderBaskets[d].push(x);
            });
            if (!orderBaskets[1].length && basket.length) {
              orderBaskets[1] = basket.filter(function (x) { return Number(x.dog) !== 2; });
            }
            orderDogCount = 2;
            orderActiveDog = 1;
            basket = orderBaskets[1];
            try { setOrderDogCount(2); } catch (eDogEdit) {}
          } else {
            orderDogCount = 1;
            orderActiveDog = 1;
            orderBaskets = { 1: basket.slice(), 2: [] };
            try { setOrderDogCount(1); } catch (eDogM1) {}
          }
          renderBasket();
          showToast("Состав вставлен (" + basket.length + " поз.)");
        } else {
          showToast("Контакты подставлены");
        }
      } else {
        showToast("Контакты подставлены");
      }
    }
    async function syncClientProfilesFromServer() {
      try {
        var res = await apiGet({ action: "listClientProfiles" });
        if (!res || res.status !== "success" || !res.clients) return;
        (res.clients || []).forEach(function (c) {
          var bask = c.basket;
          if (typeof bask === "string") {
            try { bask = JSON.parse(bask || "[]"); } catch (e) { bask = []; }
          }
          rememberClientProfile({
            nick: c.nick,
            address: c.address,
            phone: c.phone,
            note: c.note,
            basket: Array.isArray(bask) ? bask : [],
            orderType: c.source || ""
          });
        });
      } catch (e) {}
    }
    window.onClientNameInput = onClientNameInput;
    window.onClientBlurDelayed = onClientBlurDelayed;
    window.applyClientMatch = applyClientMatch;
    loadClientMemory();
    setTimeout(syncClientProfilesFromServer, 2500);

    function formatWhNum(n) {
      var x = Number(n);
      if (!isFinite(x)) return "0";
      return (Math.round(x * 100) / 100).toString();
    }

    function hideSaveLoading() {
      window._saveInFlight = false;
      window._saveLoadGen = (window._saveLoadGen || 0) + 1;
      try { if (window._saveLoadTimer) { clearTimeout(window._saveLoadTimer); window._saveLoadTimer = null; } } catch (eT) {}
      try { if (window._saveLoadTapTimer) { clearTimeout(window._saveLoadTapTimer); window._saveLoadTapTimer = null; } } catch (eT2) {}
      const ov = document.getElementById("saveLoadOverlay");
      if (ov) {
        ov.classList.remove("open");
        ov.classList.remove("can-dismiss");
        ov.style.display = "none";
        ov.style.pointerEvents = "none";
        ov.onclick = null;
        try { ov.removeAttribute("data-opened-at"); } catch (eAt) {}
      }
    }
    function showSaveLoading(label, timeoutMs) {
      window._saveInFlight = true;
      window._saveLoadGen = (window._saveLoadGen || 0) + 1;
      var gen = window._saveLoadGen;
      const ov = document.getElementById("saveLoadOverlay");
      const lb = document.getElementById("saveLoadLabel");
      if (lb) lb.textContent = label || "Сохраняю заказ…";
      if (ov) {
        ov.style.display = "flex";
        ov.style.pointerEvents = "auto";
        ov.classList.add("open");
        ov.classList.remove("can-dismiss");
        ov.setAttribute("data-opened-at", String(Date.now()));
        ov.onclick = null;
      }

      var ms = Number(timeoutMs);
      if (!(ms > 0)) ms = 45000;
      if (ms > 90000) ms = 90000;
      try {
        if (window._saveLoadTimer) clearTimeout(window._saveLoadTimer);
        window._saveLoadTimer = setTimeout(function () {
          if (gen !== window._saveLoadGen) return;
          var still = !!window._saveInFlight;
          hideSaveLoading();
          if (still) {
            try { showToast("Пишу в таблицу в фоне — список обновится сам"); } catch (e0) {}
          }
        }, ms);
      } catch (e1) {}
      try {
        if (window._saveLoadTapTimer) clearTimeout(window._saveLoadTapTimer);
        window._saveLoadTapTimer = setTimeout(function () {
          if (gen !== window._saveLoadGen) return;
          var o2 = document.getElementById("saveLoadOverlay");
          if (!o2 || !o2.classList.contains("open")) return;
          var lb2 = document.getElementById("saveLoadLabel");
          if (lb2 && window._saveInFlight) {
            lb2.textContent = (lb2.textContent || "Сохраняю") + " · можно закрыть";
          }
          o2.classList.add("can-dismiss");
          o2.onclick = function () {
            if (gen !== window._saveLoadGen) return;
            var ovEl = document.getElementById("saveLoadOverlay");
            if (ovEl) {
              ovEl.classList.remove("open");
              ovEl.style.display = "none";
              ovEl.style.pointerEvents = "none";
              ovEl.onclick = null;
            }
            try { showToast("Сохраняю в фоне"); } catch (eTap) {}
          };
        }, 4000);
      } catch (eTapArm) {}
    }
    function bumpSaveLoading(label) {
      var lb = document.getElementById("saveLoadLabel");
      if (lb && label) lb.textContent = label;
      var ov = document.getElementById("saveLoadOverlay");
      if (ov && ov.classList.contains("open") && window._saveInFlight) {
        try {
          var gen = window._saveLoadGen || 0;
          if (window._saveLoadTimer) clearTimeout(window._saveLoadTimer);
          window._saveLoadTimer = setTimeout(function () {
            if (gen !== window._saveLoadGen) return;
            var still = !!window._saveInFlight;
            hideSaveLoading();
            if (still) {
              try { showToast("Пишу в таблицу в фоне — список обновится сам"); } catch (e0) {}
            }
          }, 45000);
        } catch (eB) {}
      }
    }

    function clearBlockingOverlays() {
      try {
        hideSaveLoading();
        var modal = document.getElementById("modalOverlay");
        var yr = document.getElementById("yandexRouteOverlay");
        var tyan = document.getElementById("fxTyanOverlay");
        var tov = document.getElementById("tasksDrawerOverlay");
        if (yr) yr.remove();
        if (tyan) tyan.remove();
        document.querySelectorAll(".fx-burst").forEach(function (el) { el.remove(); });
        if (modal) {
          modal.classList.remove("open");
          modal.style.display = "none";
          modal.style.pointerEvents = "none";
          try {
            if (modalResolver) {
              var r = modalResolver;
              modalResolver = null;
              try { r(null); } catch (eR) {}
            }
          } catch (eMod) {}
        }
        document.querySelectorAll(".addr-suggest.open").forEach(function (el) {
          el.classList.remove("open");
        });

        try { closeTasksDrawer(); } catch (eDr) {
          var tdr = document.getElementById("tasksDrawer");
          if (tov) {
            tov.classList.remove("open");
            tov.style.display = "none";
            tov.style.pointerEvents = "none";
          }
          if (tdr) {
            tdr.classList.remove("open");
            tdr.setAttribute("aria-hidden", "true");
          }
        }
        // accessGate: не держим чёрный экран, если роль уже рабочая
        try {
          var gate = document.getElementById("accessGate");
          if (gate && gate.classList.contains("open")) {
            var roleOk = APP_ROLE === "owner" || APP_ROLE === "manager" || APP_ROLE === "all" ||
              APP_ROLE === "courier" || APP_ROLE === "cutter";
            if (roleOk) {
              gate.classList.remove("open");
              gate.style.display = "none";
              gate.style.pointerEvents = "none";
            }
          }
        } catch (eGate) {}
      } catch (e) {}
      try {
        document.body.style.pointerEvents = "auto";
        document.documentElement.style.pointerEvents = "auto";
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        var app = document.querySelector(".app");
        if (app) app.style.pointerEvents = "auto";
        try { document.body.classList.remove("tasks-open"); } catch (eBody) {}
      } catch (e2) {}
    }

    var _screenNodesCache = null;
    var _tabLinkNodesCache = null;
    function getScreenNodes_() {
      if (!_screenNodesCache || !_screenNodesCache.length) {
        _screenNodesCache = document.querySelectorAll(".screen");
      }
      return _screenNodesCache;
    }
    function getTabLinkNodes_() {
      if (!_tabLinkNodesCache || !_tabLinkNodesCache.length) {
        _tabLinkNodesCache = document.querySelectorAll(".tab-link");
      }
      return _tabLinkNodesCache;
    }

    function switchTab(screenId, opts) {
      opts = opts || {};

      if (screenId === "subDetailScreen") {
        try {
          if (typeof isSubsUnlocked === "function" && !isSubsUnlocked()) screenId = "subsScreen";
        } catch (eSub) { screenId = "subsScreen"; }
      }

      clearBlockingOverlays();
      var fly = document.getElementById("orderFlyout");
      var flyOpen = fly && fly.classList.contains("open");

      if (FLYOUT_SCREENS.indexOf(screenId) >= 0) {
        toggleOrderFlyout(false);
        orderFlyoutJustOpened = false;
      } else if (screenId !== "orderScreen") {
        toggleOrderFlyout(false);
        orderFlyoutJustOpened = false;
      } else if (flyOpen && orderFlyoutJustOpened) {

        orderFlyoutJustOpened = false;
      }
      try {
        var cfly = document.getElementById("courierFlyout");
        if (cfly && screenId !== "courierScreen") {
          cfly.classList.remove("open");
          courierFlyoutJustOpened = false;
        }
      } catch (eCfly) {}
      getScreenNodes_().forEach(function (el) { el.classList.remove("active"); });
      getTabLinkNodes_().forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-screen") === screenId);
      });

      if (FLYOUT_SCREENS.indexOf(screenId) >= 0) {
        var orderBtn = document.querySelector('.tab-link[data-screen="orderScreen"]');
        if (orderBtn) orderBtn.classList.add("active");
      }
      try { syncNavTabsPill_(); } catch (ePill) {}
      var screen = document.getElementById(screenId);
      if (screen) screen.classList.add("active");
      if (opts.focus === "partners") {
        try {
          setTimeout(function () {
            var card = document.getElementById("partnersManageCard");
            if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        } catch (eF) {}
      }
      try {
        if (screenId === "orderScreen" && document.getElementById("isEditMode").value === "false") {
          document.getElementById("appHeaderTitle").innerText = "Бойня-Конвейер " + APP_VERSION;
          document.getElementById("btnMainSave").innerText = "Сохранить заказ";
        }
        if (screenId === "clientsScreen") {
          document.getElementById("appHeaderTitle").innerText = "Просмотр · " + APP_VERSION;
        }
        if (screenId === "templatesScreen") {
          document.getElementById("appHeaderTitle").innerText = "Шаблоны · " + APP_VERSION;
          try { setTemplatesSub_(window._templatesSub || "texts"); } catch (eTpl) {}
        }
        if (screenId === "subsScreen") {
          document.getElementById("appHeaderTitle").innerText = "Подписки · " + APP_VERSION;
        }
        if (screenId === "subDetailScreen") {
          document.getElementById("appHeaderTitle").innerText = "Карточка · " + APP_VERSION;
        }
        if (screenId === "partnerHubScreen") {
          document.getElementById("appHeaderTitle").innerText = "Партнёры · " + APP_VERSION;
        }
      } catch (e) {}

      var sid = screenId;
      var runLoads = function () {
        try {
          if (sid === "clientsScreen") {
            try { enterViewScreen_(); } catch (eV) {}
          }
          if (sid === "templatesScreen") {
            try { loadTemplatesList_({ soft: true }); } catch (eTpl2) {}
          }
          if (sid === "cuttingScreen") {
            ensureCuttingDaySelected({ forceSmart: true });
            try { loadCutting({ soft: true }); } catch (eCut) {}
          } else {
            stopCuttingPoll();
          }
          if (sid === "warehouseScreen") {
            loadWarehouse({ soft: true });
            try { loadWarehousePreview({ soft: true }); } catch (eWhP) {}
          }
          if (sid === "subsScreen") enterSubsScreen();
          if (sid === "statsScreen") loadStats({ soft: true });
          if (sid === "deferredScreen") openTasksDrawer();
          if (sid === "priceScreen") try { syncPriceEnrollUi(); } catch (eEn) {}
          if (sid === "orderScreen") {
            try { refreshWeekBanners({ soft: true }); } catch (eO) {}
            try { refreshOrderDayCounts_({ soft: true }); } catch (eC) {}
          }
          if (sid === "peopleScreen") {
            loadPeople({ soft: true });
            try { loadPartnersUi_({ soft: true }); } catch (ePar) {}
            try { refreshWeekBanners({ soft: true }); } catch (eFw) {}
          }
          if (sid === "partnerHubScreen") {
            try { loadPartnerHubUi_({ soft: true }); } catch (eHub) {}
          }
          if (sid === "courierScreen") {
            try {
              if (!window._timeWheelsBuilt) {
                buildTimeWheels();
                window._timeWheelsBuilt = true;
              }
            } catch (eTw) {}
            ensureOpsDaySelected({ forceSmart: true });
            if (!window._courierOpenAssembly) setCourierSub("route");
            window._courierOpenAssembly = false;
          }
        } catch (e3) {}
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () { setTimeout(runLoads, 0); });
      } else {
        setTimeout(runLoads, 0);
      }
    }

    window.switchTab = switchTab;
    window.clearBlockingOverlays = clearBlockingOverlays;

    document.querySelectorAll(".tab-link").forEach(function (btn) {
      btn.onclick = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        var id = btn.getAttribute("data-screen");
        if (id) switchTab(id);
        return false;
      };
    });

    function syncNavTabsPill_() {
      var tabs = document.getElementById("navTabs");
      var pill = document.getElementById("navTabsPill");
      if (!tabs || !pill) return;
      var active = tabs.querySelector(".tab-link.active");
      if (!active) {
        pill.style.opacity = "0";
        return;
      }

      var left = active.offsetLeft;
      var width = active.offsetWidth;
      if (!(width > 0)) return;
      pill.style.width = Math.round(width) + "px";
      pill.style.left = Math.round(left) + "px";
      pill.style.transform = "none";
      pill.style.opacity = "1";
    }
    window.syncNavTabsPill_ = syncNavTabsPill_;
    try {
      window.addEventListener("resize", function () {
        try { syncNavTabsPill_(); } catch (eR) {}
      });
      var navEl = document.getElementById("navTabs");
      if (navEl) navEl.addEventListener("scroll", function () {
        try { syncNavTabsPill_(); } catch (eS) {}
      }, { passive: true });
      setTimeout(syncNavTabsPill_, 40);
      setTimeout(syncNavTabsPill_, 280);
    } catch (eNav) {}

    clearBlockingOverlays();

    (function bindHeaderUnstick() {
      var hdr = document.getElementById("appHeaderTitle");
      if (!hdr) return;
      var t0 = 0;
      function arm() { t0 = Date.now(); }
      function maybeUnlock() {
        if (t0 && (Date.now() - t0) >= 650) {
          clearBlockingOverlays();
          try { showToast("UI разблокирован"); } catch (e) {}
        }
        t0 = 0;
      }
      hdr.addEventListener("touchstart", arm, { passive: true });
      hdr.addEventListener("mousedown", arm);
      hdr.addEventListener("touchend", maybeUnlock);
      hdr.addEventListener("mouseup", maybeUnlock);
    })();

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        try { hideSaveLoading(); closeTasksDrawer(); } catch (eV) {}
        try {
          document.body.style.pointerEvents = "auto";
          document.documentElement.style.pointerEvents = "auto";
        } catch (eP) {}
        try { clearBlockingOverlays(); } catch (eC) {}
      }
    });
    window.addEventListener("pageshow", function () {
      try { clearBlockingOverlays(); } catch (ePs) {}
    });
    // Авто-разблок: если лоадер/модал залип — UI оживёт сам
    (function armUiWatchdog_() {
      function tick() {
        try {
          var slo = document.getElementById("saveLoadOverlay");
          var sloOpen = slo && slo.classList.contains("open");
          var modal = document.getElementById("modalOverlay");
          var modalOpen = modal && modal.classList.contains("open");
          var gate = document.getElementById("accessGate");
          var gateOpen = gate && gate.classList.contains("open");
          var roleOk = APP_ROLE === "owner" || APP_ROLE === "manager" || APP_ROLE === "all" ||
            APP_ROLE === "courier" || APP_ROLE === "cutter";
          if (sloOpen) {
            var openedAt = Number(slo.getAttribute("data-opened-at") || 0);
            if (!openedAt) {
              slo.setAttribute("data-opened-at", String(Date.now()));
            } else if ((Date.now() - openedAt) > 22000) {
              hideSaveLoading();
              try { showToast("UI разблокирован"); } catch (e0) {}
            }
          } else if (slo) {
            slo.removeAttribute("data-opened-at");
          }
          if (gateOpen && roleOk) {
            gate.classList.remove("open");
            gate.style.display = "none";
            gate.style.pointerEvents = "none";
          }
          document.body.style.pointerEvents = "auto";
          document.documentElement.style.pointerEvents = "auto";
        } catch (eW) {}
      }
      setTimeout(tick, 2500);
      setTimeout(tick, 8000);
      setInterval(tick, 15000);
    })();

    function isPieceSkuName(name) {
      var n = String(name || "");
      if (!n) return false;
      if (/шт/i.test(n)) return true;
      if (/ХРЯЩ|ЛОПАТ|ЛОП\s*ХРЯЩ/i.test(n)) return true;
      if (/КОЛЕН|КОПЫТ|НОСЫ|НОС\b|УХО|УШК|ШЕИ|ШЕЯ|ГУБЫ|ПЕРЕП[ЕЁ]?Л|АОРТ|ТРАХЕ|СТАНОВ|УТИН/i.test(n)) return true;
      if (/БЫЧ.*КОРЕН|КОРЕНЬ/i.test(n)) return true;
      return false;
    }

    function unitForItem(cat, main) {
      if (cat === "chew" || cat === "chews") return "шт";
      if (isPieceSkuName(main)) return "шт";
      return "гр";
    }

    function openProductSelector(catKey) {
      currentCategory = catKey;
      const cat = catalog[catKey];
      document.getElementById("selectorTitle").innerText = cat.title;
      document.getElementById("selectorCard").style.display = "block";
      let html = '<option value="">-- Выбрать --</option>';
      cat.items.forEach(n => { html += `<option value="${n}">${n}</option>`; });
      document.getElementById("mainSelect").innerHTML = html;
      document.getElementById("fractionGroup").style.display = "none";
      document.getElementById("volumeInput").value = "";
      document.getElementById("valueLabel").innerText = catKey === "chew" ? "Количество (шт)" : "Вес (гр)";
    }

    function onProductChange() {
      const mainVal = document.getElementById("mainSelect").value;
      const cat = catalog[currentCategory];
      document.getElementById("valueLabel").innerText =
        unitForItem(currentCategory, mainVal) === "шт" ? "Количество (шт)" : "Вес (гр)";
      if (cat.fractions && cat.fractions[mainVal]) {
        document.getElementById("fractionGroup").style.display = "block";
        document.getElementById("fractionSelect").innerHTML =
          cat.fractions[mainVal].map(f => `<option value="${f}">${f}</option>`).join("");
      } else {
        document.getElementById("fractionGroup").style.display = "none";
        document.getElementById("fractionSelect").innerHTML = "";
      }
    }

    async function addItemToBasket() {
      const mainVal = document.getElementById("mainSelect").value;
      const fracVal = document.getElementById("fractionSelect").value || "";
      const inputVal = Number(document.getElementById("volumeInput").value) || 0;
      if (!mainVal) { await uiAlertAsync("Выберите наименование"); return; }
      if (inputVal <= 0) { await uiAlertAsync("Укажите количество больше нуля"); return; }
      const cat = catalog[currentCategory];
      const needFrac = cat && cat.fractions && cat.fractions[mainVal] && cat.fractions[mainVal].length;
      if (needFrac && !fracVal) {
        await uiAlertAsync("Выберите фракцию / тип");
        return;
      }
      if (needFrac && cat.fractions[mainVal].indexOf(fracVal) < 0) {
        await uiAlertAsync("Такой фракции нет для «" + mainVal + "»");
        return;
      }
      basket.push({
        id: Date.now() + Math.random(),
        cat: currentCategory,
        main: mainVal,
        name: mainVal,
        sub: fracVal,
        value: inputVal,
        val: inputVal
      });
      renderBasket();
      document.getElementById("selectorCard").style.display = "none";
    }

    function renderBasket() {
      const box = document.getElementById("basketContainer");
      if (!basket.length) {
        box.innerHTML = '<p class="muted">Корзина пуста</p>';
        try { if (orderType === "retail") refreshRetailOrderPrice(); } catch (e0) {}
        try { syncEditBasketToViewPreview_(); } catch (eSync0) {}
        try { refreshNotesItemSelectsIfOpen_(); } catch (eN0) {}
        return;
      }
      const showRetail = orderType === "retail";
      box.innerHTML = basket.map(item => {
        const unit = unitForItem(item.cat, item.main);
        const sub = item.sub ? ("Фракция: " + item.sub) : ("Категория: " + item.cat);
        let priceHtml = "";
        if (showRetail) {
          const r = retailLineCost(item.main || item.name, item.sub || "", item.value != null ? item.value : item.val, item.cat);
          priceHtml = r.found
            ? ('<div class="basket-sub" style="color:#30d158;">' + r.cost + " BYN</div>")
            : '<div class="basket-sub" style="color:#ff9f0a;">нет в прайсе</div>';
        }
        return `<div class="basket-card ${item.cat}">
          <button class="btn-inline-del" onclick="deleteBasketItem(${item.id})">Удалить</button>
          <div class="basket-info">${item.main} → ${item.value} ${unit}</div>
          <div class="basket-sub">${sub}</div>
          ${priceHtml}
        </div>`;
      }).join("");
      try { if (showRetail) refreshRetailOrderPrice(); } catch (e1) {}
      try { syncEditBasketToViewPreview_(); } catch (eSync1) {}
      try { refreshNotesItemSelectsIfOpen_(); } catch (eN1) {}
    }

    function refreshNotesItemSelectsIfOpen_() {
      if (!(orderNotes || []).some(function (n) { return n.roles && n.roles.cut; })) return;
      var nl = document.getElementById("notesList");
      if (!nl) return;
      if (nl.style.display === "none" && !(nl.parentElement && nl.parentElement.id === "notesModalBody")) return;
      renderOrderNotes();
    }

    function syncEditBasketToViewPreview_() {
      var mapped = (basket || []).map(function (g) {
        return {
          cat: g.cat,
          name: g.name || g.main,
          main: g.main || g.name,
          sub: g.sub || "",
          val: g.val != null ? g.val : g.value
        };
      });
      var draftIdx = window._viewDraftEditIndex;
      if (draftIdx != null && viewTransferDraft[draftIdx]) {
        viewTransferDraft[draftIdx].basket = mapped;
        viewTransferDraft[draftIdx].basketCount = mapped.length;
        viewTransferDraft[draftIdx].orderCount = mapped.length;
        viewTransferDraft[draftIdx].gaps = clientGaps(viewTransferDraft[draftIdx]);
        var scr0 = document.querySelector(".screen.active");
        if (scr0 && scr0.id === "clientsScreen" && typeof renderViewLists === "function") renderViewLists();
        return;
      }
      if (document.getElementById("isEditMode").value !== "true") return;
      var name = (document.getElementById("client") && document.getElementById("client").value || "").trim();
      if (!name) return;
      var nameU = name.toUpperCase();
      var hit = false;
      for (var i = 0; i < (loadedClientsRawData || []).length; i++) {
        var n = String(loadedClientsRawData[i].name || "").trim();
        if (!n) continue;
        if (n.toUpperCase() === nameU || nicksMatchClient_(n, name)) {
          loadedClientsRawData[i].basket = mapped;
          loadedClientsRawData[i].basketCount = mapped.length;
          loadedClientsRawData[i].orderCount = mapped.length;
          loadedClientsRawData[i].gaps = clientGaps(loadedClientsRawData[i]);
          hit = true;
          break;
        }
      }
      var scr = document.querySelector(".screen.active");
      if (hit && scr && scr.id === "clientsScreen" && typeof renderViewLists === "function") renderViewLists();
    }

    function nicksMatchClient_(a, b) {
      try {
        if (typeof viewClientKey === "function") {
          var ka = viewClientKey(a);
          var kb = viewClientKey(b);
          return !!(ka && kb && ka === kb);
        }
      } catch (e) {}
      return String(a || "").toUpperCase() === String(b || "").toUpperCase();
    }

    /** Клиент есть в D1 на day и/или date? null = сеть не ответила. */
    async function clientVisibleOnView_(clientName, day, dateStr) {
      day = String(day || "").trim();
      dateStr = String(dateStr || "").trim();
      // day не должен быть ISO-датой (calendar move to=YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        if (!dateStr) dateStr = day;
        day = "";
      }
      if (!clientName || (!day && !dateStr)) return null;
      async function listHas_(list) {
        return (list || []).some(function (c) {
          return nicksMatchClient_(c && (c.name || c.client), clientName);
        });
      }
      try {
        // только getClients (force) — getViewCompare.month из snap давал ложный «ещё в списке»
        if (day) {
          var gcDay = await apiGet({
            action: "getClients",
            day: day,
            force: "1",
            _: String(Date.now())
          }, { timeoutMs: 16000, cacheTtlMs: 0, __boinyaNoSnap: true });
          if (await listHas_((gcDay && gcDay.clients) || [])) return true;
        }
        if (dateStr) {
          var gcDate = await apiGet({
            action: "getClients",
            date: dateStr,
            force: "1",
            _: String(Date.now())
          }, { timeoutMs: 16000, cacheTtlMs: 0, __boinyaNoSnap: true });
          if (await listHas_((gcDate && gcDate.clients) || [])) return true;
        }
        return false;
      } catch (eGc) {
        return null;
      }
    }

    function deleteBasketItem(id) {
      basket = basket.filter(x => x.id !== id);
      renderBasket();
    }

    async function clearBasket() {
      if (!basket.length) { showToast("Корзина уже пуста"); return; }
      var ok = await uiConfirmAsync("Очистить корзину (" + basket.length + " поз.)?");
      if (!ok) return;
      basket = [];
      renderBasket();
      try { if (orderType === "retail") refreshRetailOrderPrice(); } catch (e) {}
      showToast("Корзина очищена");
    }
    window.clearBasket = clearBasket;

    function clearIgChecklist() {
      var el = document.getElementById("igChecklistPaste");
      if (el) el.value = "";
      showToast("Чеклист очищен");
    }
    window.clearIgChecklist = clearIgChecklist;

    function clearIgPriceChecklist() {
      var el = document.getElementById("igPriceChecklistPaste");
      if (el) el.value = "";
      showToast("Чеклист очищен");
    }
    window.clearIgPriceChecklist = clearIgPriceChecklist;

    var _apiGetMem = Object.create(null);
    var _apiGetInflight = Object.create(null);
    var _API_SS_KEY = "boinya_api_swr_v1";
    var _API_READ_TTL = {
      getClients: 45000,
      getCutting: 8000,
      getCourier: 45000,
      getAssembly: 30000,
      getWarehouse: 60000,
      warehousePreview: 45000,
      getStats: 60000,
      listSubscriptions: 60000,
      getSubscription: 30000,
      listClientProfiles: 120000,
      listBookings: 30000,
      listAccess: 60000,
      getMyAccess: 120000,
      listReminderPeople: 120000,
      listDeferred: 30000,
      listTemplates: 180000,
      listSurvey: 45000,
      crmInventory: 90000,
      getCouriers: 60000,
      telegramStatus: 180000,
      getWeekBannerState: 90000,
      weekPullStatus: 45000,
      getWeekDayCounts: 45000,
      getMonthOverview: 60000,
      getViewCompare: 20000,
      calcPrice: 30000,
      calcPpFact: 0,
      findClientMatch: 30000,
      getPpFactCost: 30000,
      getPpOrderSuggest: 25000,
      resolveDayForDate: 120000,
      suggestAddress: 45000,
      listPartners: 120000,
      partnerListNetworks: 120000,
      partnerListPoints: 90000
    };

    function apiSsLoad_() {
      try {
        var raw = sessionStorage.getItem(_API_SS_KEY);
        if (!raw) return;
        var obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return;
        var now = Date.now();
        Object.keys(obj).forEach(function (k) {
          if (k.indexOf("action=getCutting") >= 0 || k.indexOf("action=getViewCompare") >= 0 || k.indexOf("action=getClients") >= 0) return;
          var hit = obj[k];
          if (hit && hit.exp > now && hit.res) _apiGetMem[k] = hit;
        });
      } catch (eSs) {}
    }
    function apiSsSaveKey_(cacheKey, hit) {
      try {
        if (cacheKey && /action=(getCutting|getViewCompare|getClients)/.test(String(cacheKey))) return;
        var raw = sessionStorage.getItem(_API_SS_KEY);
        var obj = raw ? JSON.parse(raw) : {};
        if (!obj || typeof obj !== "object") obj = {};
        obj[cacheKey] = hit;

        var keys = Object.keys(obj);
        if (keys.length > 80) {
          keys.sort(function (a, b) {
            return (obj[a].exp || 0) - (obj[b].exp || 0);
          });
          keys.slice(0, keys.length - 60).forEach(function (k) { delete obj[k]; });
        }
        var s = JSON.stringify(obj);
        if (s.length < 4500000) sessionStorage.setItem(_API_SS_KEY, s);
      } catch (eSs2) {}
    }
    try { apiSsLoad_(); } catch (eBootSs) {}

    var _API_DEFAULT_TIMEOUT = {
      getClients: 35000,
      getViewCompare: 18000,
      getMonthOverview: 35000,
      getCutting: 35000,
      getCourier: 30000,
      getAssembly: 30000,
      getWarehouse: 35000,
      getStats: 45000,
      listSubscriptions: 35000,
      listClientProfiles: 35000,
      materializeWeek: 55000,
      weekPullStatus: 35000,
      crmInventory: 40000
    };
    function apiCacheBustMem_(action) {

      if (!action) {
        apiCacheBustOrderViews_();
        apiCacheBustDeferred_();
        try { apiCacheBustMem_("listSubscriptions"); } catch (e0) {}
        return;
      }
      if (action === "*") {
        _apiGetMem = Object.create(null);
        try { sessionStorage.removeItem(_API_SS_KEY); } catch (eSsC) {}
        return;
      }
      try {
        var prefix = "action=" + action;
        Object.keys(_apiGetMem).forEach(function (k) {
          if (k.indexOf(prefix) === 0 || k.indexOf("&" + prefix) >= 0 || k === prefix || k.indexOf(prefix + "&") === 0)
            delete _apiGetMem[k];
        });

        try {
          var raw = sessionStorage.getItem(_API_SS_KEY);
          if (raw) {
            var obj = JSON.parse(raw);
            Object.keys(obj || {}).forEach(function (k) {
              if (k.indexOf(prefix) === 0 || k.indexOf("&" + prefix) >= 0 || k === prefix || k.indexOf(prefix + "&") === 0)
                delete obj[k];
            });
            sessionStorage.setItem(_API_SS_KEY, JSON.stringify(obj));
          }
        } catch (eSsB) {}
      } catch (eB) {}
    }

    function apiCacheBustOrderViews_() {
      ["getClients", "getViewCompare", "getWeekDayCounts", "getMonthOverview", "listBookings", "getAssembly", "getCourier", "getCutting", "getWarehouse"].forEach(function (a) {
        try { apiCacheBustMem_(a); } catch (e) {}
      });
    }
    function apiCacheBustDeferred_() {
      try { apiCacheBustMem_("listDeferred"); } catch (e) {}
    }
    function apiGet(params, opts) {
      opts = opts || {};
      params = params || {};
      // Cutover LIVE: без cutover=1 Worker в sandbox — D1 пишет, Sheets нет
      if (window.__BOINYA_C_CUTOVER__ && params.cutover == null && params.mode !== "live") {
        params = Object.assign({}, params, { cutover: "1" });
      }
      var actionEarly = String((params && params.action) || "");
      // delete/move/save — НИКОГДА не через bridge localDelete_/snap (иначе «успех» без Worker)
      if (/^(deleteClient|removeCalendarClient|moveClient|saveOrder|saveBooking)$/i.test(actionEarly)) {
        opts = Object.assign({}, opts, { __boinyaNoSnap: true });
      }
      if (!opts.__boinyaNoSnap && typeof window.__boinyaCTrySnap === "function") {
        var _cHit = window.__boinyaCTrySnap(params, opts);
        if (_cHit) return _cHit;
      }
      var action = String((params && params.action) || "");

      var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : (_API_DEFAULT_TIMEOUT[action] || 28000);
      var cacheTtlMs = (opts.cacheTtlMs != null) ? opts.cacheTtlMs : (_API_READ_TTL[action] || 0);

      if (params && (params._ || params.nocache)) cacheTtlMs = 0;
      var cacheKey = "";
      try {
        cacheKey = Object.keys(params || {}).filter(function (k) {
          return k !== "_" && k !== "nocache";
        }).sort().map(function (k) {
          return k + "=" + params[k];
        }).join("&");
      } catch (eC) { cacheKey = ""; }
      if (!opts.bypassMem && cacheTtlMs > 0 && cacheKey) {
        try {
          var hit = _apiGetMem[cacheKey];
          var skipStaleCut = action === "getCutting" || action === "getViewCompare" || action === "getClients" || window._cuttingNeedRefresh;
          if (hit && hit.exp > Date.now()) return Promise.resolve(hit.res);

          if (!skipStaleCut && hit && hit.res && hit.exp > Date.now() - Math.max(cacheTtlMs * 4, 120000)) {
            var stale = hit.res;
            setTimeout(function () {
              try {
                apiGet(params, {
                  timeoutMs: timeoutMs,
                  cacheTtlMs: cacheTtlMs,
                  retries: 0,
                  bypassMem: true
                }).catch(function () {});
              } catch (eSwr) {}
            }, 30);
            return Promise.resolve(stale);
          }
        } catch (eHit) {}
      }

      // delete/move/save: не coalesce inflight — иначе JSONP-retry ждёт сам себя и UI «молчит»
      var noInflight =
        !!opts.bypassInflight ||
        /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(action);
      if (cacheKey && !noInflight && _apiGetInflight[cacheKey]) return _apiGetInflight[cacheKey];

      var retries = opts.retries;
      if (retries == null) {
        retries = /^(save|delete|move|update|finish|cancel|enroll|set|close|pull|materialize|start|stop|ensure|scrub)/i.test(action)
          ? 0
          : 1;
      }
      function once_() {
        var writeCutover =
          window.__BOINYA_C_CUTOVER__ &&
          !opts.directGas &&
          !opts.forceJsonpGet &&
          /^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient|saveSubscription|pullClientsFromMonth|notifyMissedDelivery|placeTransferTask)$/i.test(action);
        if (writeCutover) {
          return new Promise(function (resolve, reject) {
            var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
            var timer = setTimeout(function () {
              try { if (ctrl) ctrl.abort(); } catch (eAb) {}
              reject(new Error("Таймаут ответа сервера"));
            }, timeoutMs);
            // TG WebView иногда глотает POST body → короткий identity-query.
            // НЕ дублировать basket/address/phone/note в URL: длинный query режется →
            // «сохранено», а контакт/состав пустые (календарь дальше Будущей).
            var qWrite = "";
            try {
              var qSkip = {
                basket: 1, note: 1, permanentNote: 1, address: 1, phone: 1,
                geo: 1, survey: 1, addressFull: 1
              };
              qWrite = Object.keys(params).filter(function (k) {
                if (qSkip[k]) return false;
                var v = params[k];
                return v != null && v !== "";
              }).map(function (k) {
                return k + "=" + encodeURIComponent(params[k]);
              }).join("&");
            } catch (eQ) { qWrite = ""; }
            var postUrl = GOOGLE_WEBHOOK_URL + (qWrite ? ("?" + qWrite) : "");
            fetch(postUrl, {
              method: "POST",
              redirect: "follow",
              headers: {
                "Content-Type": "text/plain;charset=utf-8",
                "Cache-Control": "no-cache"
              },
              body: JSON.stringify(params),
              signal: ctrl ? ctrl.signal : undefined
            })
              .then(function (r) {
                return r.text().then(function (text) {
                  var raw = String(text || "").trim();
                  try {
                    var j = JSON.parse(raw);
                    if (j && typeof j === "object") return j;
                  } catch (eJ) {}
                  var m = raw.match(/^[a-zA-Z_$][\w$]*\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
                  if (m) {
                    try {
                      var j2 = JSON.parse(m[1]);
                      if (j2 && typeof j2 === "object") return j2;
                    } catch (eJ2) {}
                  }
                  // CF/GAS HTML вместо JSON: запись уже ушла в Worker (D1+фон GAS)
                  return { status: "success", sent_opaque: true, cutover: true };
                });
              })
              .then(function (res) {
                clearTimeout(timer);
                if (cacheKey && cacheTtlMs > 0) {
                  var packed = { exp: Date.now() + cacheTtlMs, res: res };
                  _apiGetMem[cacheKey] = packed;
                  try { apiSsSaveKey_(cacheKey, packed); } catch (eSs3) {}
                }
                resolve(res);
              })
              .catch(function (err) {
                clearTimeout(timer);
                if (err && err.name === "AbortError") {
                  // PEOPLE CANON: таймаут ≠ успех. Sheets-first — без подтверждения не врать «сохранено».
                  if (/^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(action)) {
                    resolve({
                      status: "error",
                      message: "timeout_waiting_sheets",
                      sheetsVerified: false,
                      optimistic: false,
                      timedOut: true,
                      cutover: true
                    });
                    return;
                  }
                  reject(new Error("Таймаут ответа сервера"));
                  return;
                }
                if (/^(saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient)$/i.test(action)) {
                  resolve({
                    status: "error",
                    message: "network_waiting_sheets",
                    sheetsVerified: false,
                    optimistic: false,
                    networkFallback: true,
                    cutover: true
                  });
                  return;
                }
                reject(new Error("Ошибка сети"));
              });
          }).then(function (res) {
            var isPeopleMut =
              /^(deleteClient|removeCalendarClient|moveClient)$/i.test(action);
            var weak = !res ||
              res.sent_opaque ||
              res.networkFallback ||
              res.timedOut ||
              res.status === "online" ||
              /жив/i.test(String(res.msg || res.message || "")) ||
              (isPeopleMut &&
                res.status === "success" &&
                !res.sheetsVerified &&
                res.d1Verified == null &&
                res.wrote == null &&
                !res.alreadyGone &&
                !res.alreadyMoved);
            // JSONP GET retry. ВАЖНО: bypassInflight — иначе ждём сами себя (hang).
            if (weak && isPeopleMut && !opts._retriedJsonp) {
              return apiGet(
                Object.assign({}, params, { _: String(Date.now()) + "_j" }),
                Object.assign({}, opts, {
                  forceJsonpGet: true,
                  _retriedJsonp: true,
                  bypassMem: true,
                  bypassInflight: true,
                  cacheTtlMs: 0,
                  __boinyaNoSnap: true
                })
              );
            }
            return res;
          });
        }
        return new Promise(function (resolve, reject) {
          var cb = "cb_" + Math.round(Math.random() * 1e9);
          var timer = setTimeout(function () {
            cleanup();
            reject(new Error("Таймаут ответа сервера"));
          }, timeoutMs);
          function cleanup() {
            clearTimeout(timer);
            try { delete window[cb]; } catch (e1) {}
            var s = document.getElementById(cb);
            if (s && s.parentNode) s.parentNode.removeChild(s);
          }
          window[cb] = function (res) {
            cleanup();
            if (cacheKey && cacheTtlMs > 0) {
              var packed = { exp: Date.now() + cacheTtlMs, res: res };
              _apiGetMem[cacheKey] = packed;
              try { apiSsSaveKey_(cacheKey, packed); } catch (eSs3) {}
            }
            resolve(res);
          };
          var q = Object.keys(params).filter(function (k) {
            var v = params[k];
            return v != null && v !== "" && v !== undefined;
          }).map(function (k) {
            return k + "=" + encodeURIComponent(params[k]);
          }).join("&");
          // finishFullWeek и т.п.: напрямую в GAS — Worker CF рвёт долгие запросы (~30с)
          var baseUrl = GOOGLE_WEBHOOK_URL;
          if (opts.directGas || action === "finishFullWeek" || action === "materializeWeek") {
            baseUrl = GOOGLE_WEBHOOK_ORIGIN;
          }
          var script = document.createElement("script");
          script.id = cb;
          script.async = true;
          script.src = baseUrl + "?" + q + "&callback=" + cb;
          script.onerror = function () {
            cleanup();
            reject(new Error("Ошибка сети"));
          };
          (document.head || document.body).appendChild(script);
        });
      }
      function run_(left) {
        return once_().catch(function (err) {
          var msg = String((err && err.message) || err || "");
          var retryable = /таймаут|сеть|network|timeout/i.test(msg);
          if (left > 0 && retryable) {
            return new Promise(function (r) { setTimeout(r, 700); }).then(function () {
              return run_(left - 1);
            });
          }
          return Promise.reject(err);
        });
      }
      var p = run_(retries);
      if (cacheKey && !noInflight) {
        _apiGetInflight[cacheKey] = p.then(function (res) {
          delete _apiGetInflight[cacheKey];
          return res;
        }, function (err) {
          delete _apiGetInflight[cacheKey];
          throw err;
        });
        return _apiGetInflight[cacheKey];
      }
      return p;
    }

    function apiPost(payload) {
      try {
        if (typeof window.__boinyaCGuardWrite === "function") {
          var _bw = window.__boinyaCGuardWrite(payload || {});
          if (_bw) return _bw;
        }
      } catch (eBw) {}
      payload = payload || {};
      if (window.__BOINYA_C_CUTOVER__ && payload.cutover == null && payload.mode !== "live") {
        payload = Object.assign({}, payload, { cutover: "1" });
      }
      return fetch(GOOGLE_WEBHOOK_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.text().then(function (text) {
          try {
            var j = JSON.parse(text);
            if (j && typeof j === "object") return j;
          } catch (eJ) {}
          if (/^\s*\{/.test(String(text || ""))) {
            try {
              var j2 = JSON.parse(String(text).trim());
              if (j2 && typeof j2 === "object") return j2;
            } catch (eJ2) {}
          }
          return { status: "sent_opaque", raw: text };
        });
      }).catch(function (err) {
        return Promise.reject(err);
      });
    }

    function onDeliveryDateChange() {
      const el = document.getElementById("deliveryDate");
      if (!el || !el.value) return;
      const d = new Date(el.value + "T12:00:00");
      if (isNaN(d.getTime())) return;
      const daySel = document.getElementById("day");
      if (!daySel) return;
      var wantDate = el.value;
      var seq = ++_deliveryDateResolveSeq;
      apiGet({ action: "resolveDayForDate", date: wantDate }, { timeoutMs: 12000, cacheTtlMs: 30000 })
        .then(function (res) {
          if (seq !== _deliveryDateResolveSeq) return;
          if (!el.value || el.value !== wantDate) return;
          var name = (res && res.onWeek && res.dayName) ? res.dayName : "";
          if (!name) {
            // дата дальше «Будущей» / вне листа — не оставлять залипший Пн/Вт
            daySel.selectedIndex = 0;
            daySel.value = "";
            try { onOrderDaySelectChange_(); } catch (eClr) {}
            return;
          }
          for (let i = 0; i < daySel.options.length; i++) {
            if (daySel.options[i].text === name || daySel.options[i].value === name) {
              daySel.selectedIndex = i;
              break;
            }
          }
          try { onOrderDaySelectChange_(); } catch (eOd) {}
        })
        .catch(function () {
          if (seq !== _deliveryDateResolveSeq) return;
          if (!el.value || el.value !== wantDate) return;
          // без resolve не угадываем день недели — иначе сентябрь → «Вторник» и конфликт с календарём
          daySel.selectedIndex = 0;
          daySel.value = "";
          try { onOrderDaySelectChange_(); } catch (eOd2) {}
        });
      try { if (orderType === "pp") refreshPpFactPrice(); } catch (e) {}
    }
    window.onDeliveryDateChange = onDeliveryDateChange;

    function resetOrderScreen(opts) {
      opts = opts || {};
      var keepSecondDogOffer = !!opts.keepSecondDogOffer;

      document.getElementById("isEditMode").value = "false";
      editOriginalClient = "";
      editOriginalDay = "";
      var clientEl = document.getElementById("client");
      if (clientEl) {
        clientEl.readOnly = false;
        clientEl.value = "";
      }
      var addr = document.getElementById("addressInput");
      if (addr) addr.value = "";
      var entrance = document.getElementById("entranceInput");
      if (entrance) entrance.value = "";
      var floorEl = document.getElementById("floorInput");
      if (floorEl) floorEl.value = "";
      var flatEl = document.getElementById("flatInput");
      if (flatEl) flatEl.value = "";
      var phoneEl = document.getElementById("phoneInput");
      if (phoneEl) phoneEl.value = "";
      var delivDate = document.getElementById("deliveryDate");
      if (delivDate) delivDate.value = "";
      var afterEl = document.getElementById("deliveryAfterInput");
      if (afterEl) afterEl.value = "";
      var beforeEl = document.getElementById("deliveryBeforeInput");
      if (beforeEl) beforeEl.value = "";
      var daySel = document.getElementById("day");
      if (daySel) daySel.selectedIndex = 0;
      var po = document.getElementById("postOfficeInput");
      if (po) po.value = "";
      var priceInp = document.getElementById("orderPriceInput");
      if (priceInp) priceInp.value = "";
      var ig = document.getElementById("igChecklistPaste");
      if (ig) ig.value = "";

      selectedAddressGeo = null;
      selectedPostOfficeGeo = null;
      selectedDeliveryMethod = null;
      retailPriceManual = false;
      try { setRetailPaidDelivery(false); } catch (eRd0) { retailPaidDelivery = false; }
      setAddressPickedHint(false);
      try { hideClientSuggest(); } catch (e0) {}
      document.querySelectorAll("#orderScreen .addr-suggest").forEach(function (el) {
        el.classList.remove("open");
        el.innerHTML = "";
      });

      var dmg = document.getElementById("deliveryMethodGroup");
      if (dmg) dmg.style.display = "none";
      var pog = document.getElementById("postOfficeGroup");
      if (pog) pog.style.display = "none";
      ["delivEuro", "delivBel", "delivCourier"].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.classList.remove("active");
      });

      clearOrderNotes();
      try { setNoteRoles({ mgr: false, cut: false, cour: true }); } catch (e2) {}
      try { updateNotesSummary(); } catch (e2b) {}

      basket = [];
      renderBasket();

      var panel = document.getElementById("manualEntryPanel");
      if (panel) panel.style.display = "none";
      var sel = document.getElementById("selectorCard");
      if (sel) sel.style.display = "none";
      var btnMan = document.getElementById("btnManualEntry");
      if (btnMan) btnMan.textContent = "＋ Позиция";
      var vol = document.getElementById("volumeInput");
      if (vol) vol.value = "";
      try { setOrderFoldOpen_("details", false); setOrderFoldOpen_("more", false); } catch (eFold) {}

      secondDogMode = false;
      if (!keepSecondDogOffer) {
        ownerContactSnapshot = null;
        orderDogCount = 1;
        orderActiveDog = 1;
        orderBaskets = { 1: [], 2: [] };
        try { setOrderDogCount(1); } catch (eDog) {}
        var b2 = document.getElementById("btnSecondDogOrder");
        if (b2) b2.style.display = "none";
      } else if (ownerContactSnapshot) {
        orderBaskets = { 1: [], 2: [] };
        orderDogCount = 2;
        orderActiveDog = 2;
        try { setOrderDogCount(2); setOrderActiveDog(2); } catch (eDog2) {}
        var snap = ownerContactSnapshot;
        if (snap.client && document.getElementById("client")) document.getElementById("client").value = snap.client;
        if (snap.address && document.getElementById("addressInput")) {
          fillAddressFieldsFromStored_(snap.address);
        }
        if (snap.phone && document.getElementById("phoneInput")) document.getElementById("phoneInput").value = snap.phone;
        if (snap.geo) selectedAddressGeo = snap.geo;
        var b2ok = document.getElementById("btnSecondDogOrder");
        if (b2ok) b2ok.style.display = "none";
      }

      try { setOrderType("pp"); } catch (e3) {}
      var saveBtn = document.getElementById("btnMainSave");
      if (saveBtn) saveBtn.innerText = "Сохранить заказ";
      document.getElementById("appHeaderTitle").innerText = "Бойня-Конвейер " + APP_VERSION;

      var orderScreen = document.getElementById("orderScreen");
      if (orderScreen) {
        try { orderScreen.scrollTop = 0; } catch (e4) {}
      }
      try { window.scrollTo(0, 0); } catch (e5) {}
    }
    window.resetOrderScreen = resetOrderScreen;

    function setOrderFoldOpen_(which, open) {
      var paneId = which === "more" ? "orderFoldMore" : "orderFoldDetails";
      var btnId = which === "more" ? "btnOrderFoldMore" : "btnOrderFoldDetails";
      var labels = which === "more"
        ? { open: "Ещё ▴", closed: "Ещё ▾" }
        : { open: "Подъезд и детали ▴", closed: "Подъезд и детали ▾" };
      var pane = document.getElementById(paneId);
      var btn = document.getElementById(btnId);
      if (pane) pane.style.display = open ? "block" : "none";
      if (btn) btn.textContent = open ? labels.open : labels.closed;
    }
    function toggleOrderFold_(which) {
      var paneId = which === "more" ? "orderFoldMore" : "orderFoldDetails";
      var pane = document.getElementById(paneId);
      var open = !(pane && pane.style.display === "block");
      setOrderFoldOpen_(which, open);
    }
    window.toggleOrderFold_ = toggleOrderFold_;
    window.setOrderFoldOpen_ = setOrderFoldOpen_;

    async function sendEntireOrder() {
      if (window._viewDraftEditIndex != null && typeof applyOrderBasketToViewDraft === "function") {
        if (applyOrderBasketToViewDraft()) return;
      }
      const clientName = document.getElementById("client").value.trim();
      try { autofillAddressDetailFields_(); } catch (eAf) {}
      let clientAddressFull = document.getElementById("addressInput").value.trim();
      clientAddressFull = formatStreetHouse(clientAddressFull) || clientAddressFull;
      if (document.getElementById("addressInput")) document.getElementById("addressInput").value = clientAddressFull;

      if (!selectedAddressGeo && typeof parseLatLonFromText_ === "function") {
        var manualCoords = parseLatLonFromText_(clientAddressFull);
        if (manualCoords) {
          selectedAddressGeo = {
            lat: manualCoords.lat,
            lon: manualCoords.lon,
            address: clientAddressFull,
            yandexUrl: "https://yandex.ru/maps/?pt=" + manualCoords.lon + "," + manualCoords.lat + "&z=17&l=map"
          };
          setAddressPickedHint(true);
        }
      }
      const entrance = (document.getElementById("entranceInput") && document.getElementById("entranceInput").value || "").trim();
      const floor = (document.getElementById("floorInput") && document.getElementById("floorInput").value || "").trim();
      const flat = (document.getElementById("flatInput") && document.getElementById("flatInput").value || "").trim();
      let clientAddress = composeDeliveryAddress(clientAddressFull, entrance, floor, flat);
      let clientNote = serializeOrderNotes(orderNotes).trim();
      const day = document.getElementById("day").value;
      const deliveryDate = (document.getElementById("deliveryDate") && document.getElementById("deliveryDate").value) || "";
      const deliveryAfter = (document.getElementById("deliveryAfterInput") && document.getElementById("deliveryAfterInput").value) || "";
      const deliveryBefore = (document.getElementById("deliveryBeforeInput") && document.getElementById("deliveryBeforeInput").value) || "";
      if (deliveryAfter && deliveryBefore && deliveryAfter >= deliveryBefore) {
        await uiAlertAsync("«Не раньше» должно быть меньше «Не позже»");
        return;
      }
      const isEdit = document.getElementById("isEditMode").value === "true";
      if (!clientName) { await uiAlertAsync("Введите имя клиента"); return; }
      if (!deliveryDate) { await uiAlertAsync("Укажите дату доставки"); return; }
      syncOrderBasketFromActive_();
      var saveBasketCheck = buildOrderSaveBasket_();
      if (!saveBasketCheck.length) { await uiAlertAsync("Корзина пуста"); return; }
      var orderPrice = null;
      if (orderType === "bp") orderPrice = 0;
      else if (orderType === "retail") {
        var localRet = refreshRetailOrderPrice();
        var pvR = document.getElementById("orderPriceInput") && document.getElementById("orderPriceInput").value;
        if (pvR !== "" && pvR != null && !isNaN(Number(pvR))) orderPrice = Number(pvR);
        else orderPrice = localRet && localRet.total != null ? localRet.total : 0;
      } else if (orderType === "partner" || orderType === "pp") {
        var pv = document.getElementById("orderPriceInput") && document.getElementById("orderPriceInput").value;
        orderPrice = pv === "" || pv == null ? null : Number(pv);
        if (orderType === "partner" && !(orderPrice >= 0)) {
          await uiAlertAsync("Укажите цену партнёра (BYN)");
          return;
        }
      }
      var couponsPayload = readPartnerCouponsPayload_();
      if (orderType === "partner" && partnerCouponsEnabled) {
        if (!(couponsPayload.couponsQty > 0)) {
          await uiAlertAsync("Укажите количество купонов (или выберите «Нет»)");
          return;
        }
        if (!(couponsPayload.couponPrice > 0)) {
          await uiAlertAsync("Укажите цену всей пачки купонов (BYN)");
          return;
        }
      }
      if (orderType === "pp" && ppNeedManualSlot && !(ppDeliverySlotManual === 1 || ppDeliverySlotManual === 2)) {
        await uiAlertAsync("Укажи какая сейчас доставка: ПП 1 или ПП 2 (один раз на клиента)");
        return;
      }
      var ppPartnerVal = "";
      if (orderType === "bp") {
        var bpKnownStage = "";
        try {
          var bpPeek = await apiGet({
            action: "getSubscription",
            nick: clientName,
            segment: "БП",
            sheet: "БП",
            _: String(Date.now())
          }, { timeoutMs: 12000, cacheTtlMs: 0 });
          if (bpPeek && bpPeek.status === "success" && (bpPeek.nick || bpPeek.rowIndex)) {
            bpKnownStage = normalizeBpStage_(bpPeek.ppStatus || bpPeek.status || bpPeek.stage || "");
          }
        } catch (eBpPeek) {}
        var bpSecondOrLater = bpKnownStage === "БП2" || bpKnownStage === "ФИНАЛ";

        ppPartnerVal = String((document.getElementById("ppPartnerSelect") || {}).value || "").trim();

        if (!ppPartnerVal) {
          var nickKey = String(clientName || "").trim().toUpperCase();
          ppPartnerVal = String((clientMemory[nickKey] && clientMemory[nickKey].ppPartner) || "").trim();
          if (ppPartnerVal) {
            try { await ensurePpPartnerOptions_(ppPartnerVal); } catch (eMemP) {}
          }
        }
        if (!ppPartnerVal) {
          try {
            var lp = await apiGet({
              action: "lookupBpPartner",
              nick: clientName,
              _: String(Date.now())
            }, { timeoutMs: 10000, cacheTtlMs: 0 });
            if (lp && lp.status === "success" && lp.ppPartner) {
              ppPartnerVal = String(lp.ppPartner).trim();
              try { await ensurePpPartnerOptions_(ppPartnerVal); } catch (eLp) {}
            }
          } catch (eLookP) {}
        }
        if (!ppPartnerVal && !bpSecondOrLater) {
          await uiAlertAsync("Для БП обязательно укажите партнёра (кто привёл). Или выберите «Другое».");
          return;
        }
      }
      var ppSlotPayload = currentPpSlotPayload_();
      var surveyMeta = null;
      if (orderType === "bp" && !secondDogMode) {
        surveyMeta = await resolveBpOrderChain_(clientName, deliveryDate || "");
        if (surveyMeta === false) return; // abort (нет ответственного и т.п.)

      }
      {
        var hasText = (orderNotes || []).some(function (n) { return String(n.text || "").trim(); });
        if (hasText) {
          var bad = (orderNotes || []).some(function (n) {
            if (!String(n.text || "").trim()) return false;
            var r = n.roles || {};
            return !(r.mgr || r.cut || r.cour);
          });
          if (bad) {
            await uiAlertAsync("У каждого примечания выберите роли (менеджер / нарезчик / курьер).");
            return;
          }
        }
      }

      const outside = await isOutsideMinskDelivery(clientAddress);
      if (outside) {
        document.getElementById("deliveryMethodGroup").style.display = "block";
        try { setOrderFoldOpen_("details", true); } catch (eFoldOut) {}
        if (!selectedDeliveryMethod) {
          const picked = await uiChoiceAsync(
            "Доставка за Минском",
            "Адрес вне Минска или дальше 20 км. Как доставляем? Курьером физически не возим — обычно Европочта или Белпочта.",
            [
              { label: "Европочта", value: "euro", cls: "btn-green" },
              { label: "Белпочта", value: "bel", cls: "btn-blue" },
              { label: "Всё же курьер", value: "courier", cls: "" }
            ]
          );
          if (!picked) return;
          setDeliveryMethod(picked);
        }
        if (selectedDeliveryMethod === "euro" || selectedDeliveryMethod === "bel") {
          const officeAddr = (document.getElementById("postOfficeInput").value || "").trim();
          if (!officeAddr) {
            document.getElementById("postOfficeGroup").style.display = "block";
            await uiAlertAsync("Укажите адрес отделения почты — куда повезут заказ.");
            return;
          }
          clientNote = applyDeliveryTag(clientNote, selectedDeliveryMethod);
          clientNote = applyOfficeTag(clientNote, officeAddr);
        } else {
          clientNote = applyDeliveryTag(clientNote, selectedDeliveryMethod);
          clientNote = stripOfficeTag(clientNote);
        }
      } else {
        clientNote = stripDeliveryTags(clientNote);
        clientNote = stripOfficeTag(clientNote);
        selectedDeliveryMethod = null;
        document.getElementById("deliveryMethodGroup").style.display = "none";
        document.getElementById("postOfficeGroup").style.display = "none";
      }

      clientNote = stripGeoTags(clientNote);
      clientNote = String(clientNote || "").replace(/\[TEL:[^\]]+\]/gi, "").trim();
      const phone = (document.getElementById("phoneInput") && document.getElementById("phoneInput").value || "").trim();

      var noteBody = serializeOrderNotes(orderNotes);

      var tagBits = [];
      String(clientNote || "").replace(/\[(ЕВРОПОЧТА|БЕЛПОЧТА|КУРЬЕР|ОТДЕЛЕНИЕ:[^\]]*|НЕ РЕЗАТЬ|РЕЗАТЬ)\]/gi, function (x) { tagBits.push(x); return ""; });
      clientNote = (tagBits.join(" ") + (tagBits.length && noteBody ? " " : "") + noteBody).trim();
      clientNote = String(clientNote || "")
        .replace(/\[SEG:[^\]]*\]/gi, "")
        .replace(/\[ЦЕНА:[^\]]*\]/gi, "")
        .replace(/\[SUB:[^\]]*\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      var permanentNote = collectPermanentNotesText();

      var confirmMsg = isEdit ? ("Обновить заказ " + clientName + "?") : ("Сохранить заказ " + clientName + "?");
      if (orderType !== "bp" && orderPrice != null && !isNaN(Number(orderPrice))) {
        confirmMsg += "\nЦена: " + Number(orderPrice) + " BYN";
      }
      if (orderType === "partner" && couponsPayload && couponsPayload.couponsQty > 0) {
        confirmMsg += "\nКупоны: " + couponsPayload.couponsQty + " шт, пачка " +
          couponsPayload.couponPrice + " BYN";
      }
      const okConfirm = await uiConfirmAsync(confirmMsg);
      if (!okConfirm) return;

      const btn = document.getElementById("btnMainSave");
      var editClientSnap = isEdit ? String(editOriginalClient || "") : "";
      var editDaySnap = isEdit ? String(editOriginalDay || "") : "";
      var editKeySnap = isEdit ? String(editOriginalMatchKey || "") : "";
      var orderTypeSnap = orderType;
      var basketSnap = [];
      try { basketSnap = (basket || []).slice(); } catch (eBs) { basketSnap = []; }
      var geoSnap = selectedAddressGeo
        ? { lat: selectedAddressGeo.lat, lon: selectedAddressGeo.lon, yandexUrl: selectedAddressGeo.yandexUrl || "" }
        : null;
      var keep2Snap = !secondDogMode && !!ownerContactSnapshot;
      var deferSnap = String(window._orderDeferredId || "").trim();

      const payload = {
        action: "saveOrder",
        day: day,
        client: clientName,
        editClient: editClientSnap,
        originalClient: editClientSnap,
        matchKey: editKeySnap,
        address: clientAddress,
        phone: phone,
        note: clientNote,
        permanentNote: permanentNote,
        orderType: orderTypeSnap,
        segment: orderTypeToSegment_(orderTypeSnap) || "",
        source: orderTypeSnap === "bp" ? "bp" : (orderTypeSnap === "pp" ? "pp" : (orderTypeSnap === "partner" ? "partner" : "retail")),
        orderPrice: orderPrice,
        deliverySlot: ppSlotPayload.deliverySlot || "",
        ppSlot: ppSlotPayload.ppSlot || "",
        deliveryAfter: deliveryAfter,
        deliveryBefore: deliveryBefore,
        ppPartner: ppPartnerVal || "",
        couponsQty: couponsPayload.couponsQty || 0,
        couponPrice: couponsPayload.couponPrice || 0,
        addressFull: clientAddressFull,
        entrance: entrance,
        floor: floor,
        flat: flat,
        survey: surveyMeta,
        geo: geoSnap,
        basket: buildOrderSaveBasket_()
      };

      const bookingPayload = {
        action: "saveBooking",
        date: deliveryDate,
        day: day || editDaySnap || "",
        alsoSaveOrder: false,
        client: clientName,
        editClient: editClientSnap,
        originalClient: editClientSnap,
        matchKey: editKeySnap,
        address: clientAddress,
        phone: phone,
        note: clientNote,
        orderType: orderTypeSnap,
        segment: orderTypeToSegment_(orderTypeSnap) || "",
        orderPrice: orderPrice,
        deliverySlot: ppSlotPayload.deliverySlot || "",
        ppSlot: ppSlotPayload.ppSlot || "",
        deliveryAfter: deliveryAfter,
        deliveryBefore: deliveryBefore,
        ppPartner: ppPartnerVal || "",
        couponsQty: couponsPayload.couponsQty || 0,
        couponPrice: couponsPayload.couponPrice || 0,
        source: orderTypeSnap === "bp" ? "bp" : (orderTypeSnap === "pp" ? "pp" : (orderTypeSnap === "partner" ? "partner" : "retail")),
        basket: payload.basket,
        geo: payload.geo
      };

      try { hideSaveLoading(); } catch (eH0) {}
      try { resetOrderScreen({ keepSecondDogOffer: keep2Snap }); } catch (eRst) {}
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Сохранить заказ";
      }
      try { recoverUiFocus(); } catch (eFoc) {}
      showToast("Сохраняю " + clientName + "…");

      try {

        var dateOnWeek = false;
        var resolvedDayName = "";
        try {
          var resolved = await apiGet(
            { action: "resolveDayForDate", date: deliveryDate },
            { timeoutMs: 12000, cacheTtlMs: 60000 }
          );
          resolvedDayName = (resolved && resolved.dayName) || "";
          dateOnWeek = !!(resolved && resolved.onWeek && resolvedDayName);

        } catch (eRes) {}
        var weekDayToSave = "";

        if (isEdit && dateOnWeek && resolvedDayName) {
          weekDayToSave = resolvedDayName;
          if (editDaySnap && String(editDaySnap) !== String(resolvedDayName)) {
            try {
              await apiGet(deleteClientParams(editClientSnap || clientName, editDaySnap, editKeySnap), { timeoutMs: 30000, cacheTtlMs: 0 });
            } catch (eDelDay) {}
          }
        } else if (dateOnWeek && resolvedDayName) {
          weekDayToSave = resolvedDayName;
        } else if (isEdit && editDaySnap && dateOnWeek) {
          // edit только если дата всё ещё в неделе — иначе уходим в календарь
          weekDayToSave = editDaySnap;
          dateOnWeek = true;
        }
        // дата вне незакрытой недели: НЕ подставлять day из селекта (иначе внос в старый Вт/Пн)

        if (isEdit && editClientSnap) {
          var nickChanged = String(editClientSnap).trim().toUpperCase() !== clientName.toUpperCase();
          var dayChanged = String(editDaySnap || "") !== String(weekDayToSave || day || "");
          if (nickChanged || (dayChanged && editDaySnap)) {
            try {
              await apiGet(deleteClientParams(editClientSnap, editDaySnap || day, editKeySnap), { timeoutMs: 30000, cacheTtlMs: 0 });
            } catch (eDelOld) {}
          }
        }

        var basketJson = JSON.stringify(payload.basket || []);
        var geoJson = payload.geo ? JSON.stringify(payload.geo) : "";
        var useJsonpSave = basketJson.length < 1400;
        var bookParams = {
          action: "saveBooking",
          date: deliveryDate,
          day: weekDayToSave || "",
          alsoSaveOrder: weekDayToSave ? "1" : "0",
          calendarOnly: weekDayToSave ? "0" : "1",
          client: clientName,
          editClient: editClientSnap,
          originalClient: editClientSnap,
          matchKey: editKeySnap,
          address: clientAddress,
          phone: phone || "",
          note: clientNote || "",
          permanentNote: permanentNote || "",
          orderType: orderTypeSnap || "",
          segment: orderTypeToSegment_(orderTypeSnap) || "",
          orderPrice: orderPrice != null ? String(orderPrice) : "",
          deliverySlot: ppSlotPayload.deliverySlot ? String(ppSlotPayload.deliverySlot) : "",
          ppSlot: ppSlotPayload.ppSlot || "",
          deliveryAfter: deliveryAfter || "",
          deliveryBefore: deliveryBefore || "",
          ppPartner: ppPartnerVal || "",
          couponsQty: String(couponsPayload.couponsQty || 0),
          couponPrice: String(couponsPayload.couponPrice || 0),
          source: orderTypeSnap === "bp" ? "bp" : (orderTypeSnap === "pp" ? "pp" : (orderTypeSnap === "partner" ? "partner" : "retail")),
          basket: basketJson
        };
        if (geoJson) bookParams.geo = geoJson;
        if (surveyMeta) {
          try { bookParams.survey = JSON.stringify(surveyMeta); } catch (eSv) {}
        }

        var bookRes = null;
        var saveRes = null;

        function weekBasketSig_(arr) {
          try {
            return (arr || [])
              .map(function (it) {
                var name = String((it && (it.name || it.main)) || "").trim().toUpperCase();
                var sub = String((it && it.sub) || "").trim().toUpperCase();
                var val = Number(it && (it.val != null ? it.val : it.value)) || 0;
                return name + "|" + sub + "|" + val;
              })
              .filter(Boolean)
              .sort()
              .join(";");
          } catch (eSig) {
            return "";
          }
        }

        async function verifyWeekBasket_() {
          if (!weekDayToSave) return { found: false, len: 0, match: false };
          var wantSig = weekBasketSig_(basketSnap);
          try {
            var chk = await apiGet({
              action: "getClients",
              day: weekDayToSave,
              force: "1",
              _: String(Date.now())
            }, { timeoutMs: 18000, cacheTtlMs: 0 });
            var list = (chk && chk.clients) || [];
            var want = String(clientName || "").trim().toUpperCase();
            for (var i = 0; i < list.length; i++) {
              var nm = String(list[i].name || list[i].client || "").trim().toUpperCase();
              if (!nm) continue;
              if (nm === want || nm.indexOf(want) >= 0 || want.indexOf(nm) >= 0) {
                var gotBasket = list[i].basket || [];
                var gotSig = weekBasketSig_(gotBasket);
                return {
                  found: true,
                  len: gotBasket.length,
                  match: !!(wantSig && gotSig && wantSig === gotSig) ||
                    (!wantSig && gotBasket.length === 0),
                  address: String(list[i].address || ""),
                  phone: String(list[i].phone || "")
                };
              }
            }
            return { found: false, len: 0, match: false };
          } catch (eV) {
            return { found: false, len: -1, match: false };
          }
        }

        async function verifyCalendarSave_() {
          if (weekDayToSave || !deliveryDate) return { found: false, ok: false };
          var wantSig = weekBasketSig_(basketSnap);
          var wantAddr = String(clientAddress || "").trim();
          var wantPhone = String(phone || "").trim();
          try {
            var chk = await apiGet({
              action: "getClients",
              date: deliveryDate,
              date_iso: deliveryDate,
              _: String(Date.now())
            }, { timeoutMs: 18000, cacheTtlMs: 0 });
            var list = (chk && chk.clients) || [];
            var want = String(clientName || "").trim().toUpperCase();
            for (var i = 0; i < list.length; i++) {
              var nm = String(list[i].name || list[i].client || "").trim().toUpperCase();
              if (!nm) continue;
              if (!(nm === want || nm.indexOf(want) >= 0 || want.indexOf(nm) >= 0)) continue;
              var gotBasket = list[i].basket || [];
              var gotSig = weekBasketSig_(gotBasket);
              var gotAddr = String(list[i].address || "").trim();
              var gotPhone = String(list[i].phone || "").trim();
              var basketOk = !!(wantSig && gotSig && wantSig === gotSig) ||
                (!wantSig && gotBasket.length === 0) ||
                (basketSnap.length > 0 && gotBasket.length >= basketSnap.length);
              var addrOk = !wantAddr || gotAddr.indexOf(wantAddr.slice(0, Math.min(12, wantAddr.length))) >= 0 ||
                wantAddr.indexOf(gotAddr.slice(0, Math.min(12, gotAddr.length || 1))) >= 0;
              var phoneOk = !wantPhone || gotPhone.replace(/\D/g, "").slice(-9) === wantPhone.replace(/\D/g, "").slice(-9);
              return {
                found: true,
                ok: !!(basketOk && addrOk && phoneOk),
                len: gotBasket.length,
                address: gotAddr,
                phone: gotPhone,
                basketOk: basketOk,
                addrOk: addrOk,
                phoneOk: phoneOk
              };
            }
            return { found: false, ok: false, len: 0 };
          } catch (eVc) {
            return { found: false, ok: false, len: -1 };
          }
        }

        async function ensureWeekWriteStuck_() {
          if (!weekDayToSave || !basketSnap.length) return saveRes;
          var chk = await verifyWeekBasket_();
          if (chk && (chk.match || (chk.found && chk.len > 0))) {
            return {
              status: "success",
              wrote: chk.len,
              basketLen: basketSnap.length,
              verified: true,
              partial: !!(chk.found && !chk.match)
            };
          }
          if (chk && chk.found && basketSnap.length === 0) {
            return {
              status: "success",
              wrote: 0,
              basketLen: 0,
              verified: true
            };
          }
          var retryParams = {
            action: "saveOrder",
            day: weekDayToSave,
            date: deliveryDate,
            client: clientName,
            editClient: editClientSnap,
            originalClient: editClientSnap,
            matchKey: editKeySnap,
            address: clientAddress,
            phone: phone || "",
            note: clientNote || "",
            permanentNote: permanentNote || "",
            orderType: orderTypeSnap || "",
            segment: orderTypeToSegment_(orderTypeSnap) || "",
            orderPrice: orderPrice != null ? String(orderPrice) : "",
            deliverySlot: ppSlotPayload.deliverySlot ? String(ppSlotPayload.deliverySlot) : "",
            ppSlot: ppSlotPayload.ppSlot || "",
            deliveryAfter: deliveryAfter || "",
            deliveryBefore: deliveryBefore || "",
            ppPartner: ppPartnerVal || "",
            couponsQty: String(couponsPayload.couponsQty || 0),
            couponPrice: String(couponsPayload.couponPrice || 0),
            basket: basketJson,
            force: "1",
            _: String(Date.now())
          };
          if (geoJson) retryParams.geo = geoJson;
          try {
            payload.day = weekDayToSave;
            payload.date = deliveryDate;
            await apiPost(payload);
          } catch (eP1) {}
          try {
            await apiGet(retryParams, {
              timeoutMs: window.__BOINYA_C_CUTOVER__ ? 22000 : 60000,
              cacheTtlMs: 0
            });
          } catch (eG1) {}
          await new Promise(function (r) { setTimeout(r, 1200); });
          chk = await verifyWeekBasket_();
          if (chk && (chk.match || (chk.found && chk.len > 0))) {
            return {
              status: "success",
              wrote: chk.len,
              basketLen: basketSnap.length,
              verified: true,
              retried: true,
              partial: !!(chk.found && !chk.match)
            };
          }
          if (chk && chk.found && basketSnap.length === 0) {
            return {
              status: "success",
              wrote: 0,
              basketLen: 0,
              verified: true,
              retried: true
            };
          }
          return {
            status: "error",
            wrote: Math.max(0, chk && chk.len > 0 ? chk.len : 0),
            message: chk && chk.found
              ? "состав не закрепился — сохрани ещё раз"
              : "не вижу человека после сохранения — сохрани ещё раз"
          };
        }

        // календарь-only: сразу полный JSON POST (адрес/телефон/корзина).
        // JSONP/query-путь режет длинный basket → «ок», контакт не пишется.
        var calendarOnlySavePath = !weekDayToSave;
        if (useJsonpSave && !calendarOnlySavePath) {
          try {
            bookRes = await apiGet(bookParams, { timeoutMs: window.__BOINYA_C_CUTOVER__ ? 12000 : 90000, cacheTtlMs: 0 });
          } catch (eBook) {
            bookRes = { status: "error", message: eBook.message || String(eBook) };
          }

          if (weekDayToSave && bookRes && (bookRes.status === "success" || bookRes.status === "accepted") && (bookRes.weekWritten || bookRes.d1Verified || bookRes.pendingSheets || bookRes.sheetsVerified || bookRes.writeId)) {
            saveRes = {
              status: bookRes.status === "accepted" ? "accepted" : "success",
              wrote: bookRes.wrote != null ? Number(bookRes.wrote) : basketSnap.length,
              basketLen: basketSnap.length,
              missed: bookRes.missed || [],
              sheetsVerified: !!bookRes.sheetsVerified,
              pendingSheets: !!bookRes.pendingSheets,
              writeId: bookRes.writeId || "",
              d1Verified: !!bookRes.d1Verified
            };
          } else if (weekDayToSave) {
            var orderParams = {
              action: "saveOrder",
              day: weekDayToSave,
              date: deliveryDate,
              client: clientName,
              editClient: editClientSnap,
              originalClient: editClientSnap,
              matchKey: editKeySnap,
              address: clientAddress,
              phone: phone || "",
              note: clientNote || "",
              permanentNote: permanentNote || "",
              orderType: orderTypeSnap || "",
              segment: orderTypeToSegment_(orderTypeSnap) || "",
              source: orderTypeSnap === "bp" ? "bp" : (orderTypeSnap === "pp" ? "pp" : (orderTypeSnap === "partner" ? "partner" : "retail")),
              orderPrice: orderPrice != null ? String(orderPrice) : "",
              deliverySlot: ppSlotPayload.deliverySlot ? String(ppSlotPayload.deliverySlot) : "",
              ppSlot: ppSlotPayload.ppSlot || "",
              deliveryAfter: deliveryAfter || "",
              deliveryBefore: deliveryBefore || "",
              ppPartner: ppPartnerVal || "",
              couponsQty: String(couponsPayload.couponsQty || 0),
              couponPrice: String(couponsPayload.couponPrice || 0),
              basket: basketJson
            };
            if (geoJson) orderParams.geo = geoJson;
            if (surveyMeta) orderParams.survey = JSON.stringify(surveyMeta);
            try {
              saveRes = await apiGet(orderParams, { timeoutMs: window.__BOINYA_C_CUTOVER__ ? 14000 : 90000, cacheTtlMs: 0 });
            } catch (eWeek) {
              saveRes = { status: "error", message: eWeek.message || String(eWeek) };
            }
          }
        }

        var needPost = calendarOnlySavePath || !useJsonpSave ||
          (weekDayToSave && basketSnap.length && (!saveRes || (saveRes.status !== "success" && saveRes.status !== "accepted") || (Number(saveRes.wrote || 0) === 0 && !saveRes.pendingSheets && !saveRes.d1Verified && !saveRes.sheetsVerified)));
        if (needPost) {
          bookingPayload.day = weekDayToSave || "";
          bookingPayload.alsoSaveOrder = !!weekDayToSave;
          bookingPayload.calendarOnly = weekDayToSave ? false : true;
          bookingPayload.permanentNote = permanentNote || "";
          bookingPayload.orderType = orderTypeSnap || "";
          if (surveyMeta) bookingPayload.survey = surveyMeta;
          try {
            var postBook = await apiPost(bookingPayload);
            if (postBook && (postBook.writeId || postBook.status === "accepted" || postBook.status === "success")) {
              bookRes = postBook;
            }
          } catch (ePostB) {}
          if (weekDayToSave) {
            payload.day = weekDayToSave;
            payload.date = deliveryDate;
            try {
              var postOrd = await apiPost(payload);
              if (postOrd && (postOrd.writeId || postOrd.status === "accepted" || postOrd.status === "success")) {
                saveRes = Object.assign({}, saveRes || {}, postOrd);
              }
            } catch (ePost) {}
          } else {
            // календарь: apiPost уже выше; fallback — writeCutover apiGet БЕЗ basket в query
            if (!bookRes || (bookRes.status !== "success" && bookRes.status !== "accepted" && !bookRes.writeId)) {
              try {
                var calGet = await apiGet(Object.assign({}, bookParams, {
                  day: "",
                  alsoSaveOrder: "0",
                  calendarOnly: "1",
                  _: String(Date.now())
                }), { timeoutMs: 20000, cacheTtlMs: 0, bypassInflight: true });
                if (calGet && (calGet.writeId || calGet.status === "accepted" || calGet.status === "success")) {
                  bookRes = calGet;
                }
              } catch (eCalGet) {}
            }
            if (!bookRes || (bookRes.status !== "success" && bookRes.status !== "accepted" && !bookRes.writeId)) {
              try {
                var postBook2 = await apiPost(Object.assign({}, bookingPayload, {
                  day: "",
                  alsoSaveOrder: false,
                  calendarOnly: true,
                  date: deliveryDate
                }));
                if (postBook2 && (postBook2.writeId || postBook2.status === "accepted" || postBook2.status === "success")) {
                  bookRes = postBook2;
                }
              } catch (ePostCal) {}
            }
            if (!bookRes || (bookRes.status !== "success" && bookRes.status !== "accepted" && !bookRes.writeId)) {
              bookRes = { status: "sent_opaque" };
            }
          }
        }

        // cutover: при pendingSheets не гоняем тяжёлый ensure (D1 уже принял)
        if (weekDayToSave && basketSnap.length && !(saveRes && (saveRes.pendingSheets || saveRes.sheetsVerified || saveRes.writeId))) {
          try {
            saveRes = await ensureWeekWriteStuck_();
          } catch (eEns) {
            if (!saveRes || (saveRes.status !== "success" && saveRes.status !== "accepted")) {
              saveRes = { status: "error", message: (eEns && eEns.message) || "verify_failed" };
            }
          }
        }

        if (weekDayToSave && saveRes && (saveRes.status === "success" || saveRes.status === "accepted") &&
            Number(saveRes.wrote || 0) === 0 && basketSnap.length > 0 &&
            !saveRes.verified && !saveRes.sheetsVerified && !saveRes.d1Verified && !saveRes.pendingSheets && !saveRes.partial) {
          await uiAlertAsync(
            "Человек на листе есть, но состав не записался (" + basketSnap.length + " поз.).\n" +
            "Попробуй ещё раз или проверь названия продуктов.\n" +
            ((saveRes.missed && saveRes.missed.length) ? saveRes.missed.join(", ") : "")
          );
        } else if (weekDayToSave && saveRes && saveRes.status &&
            saveRes.status !== "success" && saveRes.status !== "accepted" && saveRes.status !== "sent" && saveRes.status !== "sent_opaque") {
          if (saveRes.partial || saveRes.verified) {
            showToast("Сохранено с предупреждением — лист Google может догнать через минуту");
          } else {
            await uiAlertAsync("Не удалось сохранить «" + clientName + "»: " + (saveRes.message || saveRes.status));
            return;
          }
        } else if (weekDayToSave && saveRes && saveRes.partial) {
          showToast("Состав в приложении ок · лист Google может отставать");
        }

        // Prefer writeId из bookRes если saveRes без него
        if (bookRes && bookRes.writeId && (!saveRes || !saveRes.writeId)) {
          saveRes = Object.assign({}, saveRes || {}, {
            writeId: bookRes.writeId,
            pendingSheets: bookRes.pendingSheets,
            sheetsVerified: bookRes.sheetsVerified,
            status: saveRes && saveRes.status ? saveRes.status : bookRes.status,
            d1Verified: !!(saveRes && saveRes.d1Verified) || !!bookRes.d1Verified
          });
        } else if (bookRes && !weekDayToSave) {
          saveRes = saveRes || bookRes;
        }

        // календарь: дожать контакт/состав если D1 ещё пустой после POST
        if (!weekDayToSave && basketSnap.length) {
          try {
            await new Promise(function (r) { setTimeout(r, 900); });
            var calChk = await verifyCalendarSave_();
            if (!calChk || !calChk.ok) {
              try {
                var retryCal = await apiPost(Object.assign({}, bookingPayload, {
                  day: "",
                  alsoSaveOrder: false,
                  calendarOnly: true,
                  date: deliveryDate,
                  force: "1",
                  _: String(Date.now())
                }));
                if (retryCal && (retryCal.writeId || retryCal.status === "accepted" || retryCal.status === "success")) {
                  bookRes = retryCal;
                  saveRes = Object.assign({}, saveRes || {}, retryCal);
                }
              } catch (eRetryCal) {}
              await new Promise(function (r) { setTimeout(r, 1100); });
              calChk = await verifyCalendarSave_();
            }
            if (calChk && calChk.found && !calChk.ok) {
              await uiAlertAsync(
                "В календаре вижу «" + clientName + "», но не всё закрепилось" +
                (!calChk.addrOk ? " (адрес)" : "") +
                (!calChk.phoneOk ? " (телефон)" : "") +
                (!calChk.basketOk ? " (состав)" : "") +
                ".\nСохрани ещё раз."
              );
            } else if (calChk && !calChk.found) {
              await uiAlertAsync("Не вижу «" + clientName + "» в календаре после сохранения — сохрани ещё раз.");
            }
          } catch (eCalV) {}
        }

        try { apiCacheBustMem_(); } catch (eClr) {}
        try { invalidateOpsDayCaches_(weekDayToSave); } catch (eInv) {}
        try { refreshOrderDayCounts_({ force: true }); } catch (eCnt) {}
        const inWeek = !!(weekDayToSave && basketSnap.length);
        const savedItems = (saveRes && saveRes.wrote != null) ? Number(saveRes.wrote) : basketSnap.length;
        try {
          rememberClientProfile({
            nick: clientName,
            address: clientAddress,
            phone: phone,
            note: permanentNote || "",
            basket: basketSnap.map(function (x) {
              return { cat: x.cat, main: x.main, name: x.main, sub: x.sub || "", value: x.value, val: x.value };
            }),
            orderType: orderTypeSnap,
            ppPartner: ppPartnerVal || ""
          });
        } catch (eMem) {}

        if (orderTypeSnap === "bp" && surveyMeta && surveyMeta.createCard) {
          try {
            var bpBasketMapped = basketSnap.map(function(g){
              return { cat:g.cat, main:g.main||g.name, name:g.name||g.main, sub:g.sub||"", val:g.val!=null?g.val:g.value, value:g.val!=null?g.val:g.value };
            });
            var bpStatus = normalizeBpStage_(surveyMeta.status || "БП1");
            var bpKind = surveyMeta.surveyKind || (bpStatus === "ФИНАЛ" ? "final" : "bp2");
            var bpDue = surveyMeta.surveyDate || ymdPlusDaysLocal_(deliveryDate || "", 4);

            var bpOk = false;
            try {
              var bpRes = await apiGet({
                action: "ensureBpFromOrder",
                nick: clientName,
                createCard: "1",
                needSurvey: surveyMeta.needSurvey ? "1" : "0",
                status: bpStatus,
                surveyDate: bpDue,
                surveyKind: bpKind,
                compositionDate: deliveryDate || "",
                subId: surveyMeta.subId || "",
                ownerTelegramId: surveyMeta.ownerTelegramId || "",
                ownerName: surveyMeta.ownerName || "",
                wishes: clientNote || "",
                basket: JSON.stringify(bpBasketMapped)
              }, { timeoutMs: 60000, cacheTtlMs: 0 });
              bpOk = !!(bpRes && bpRes.status === "success");
            } catch (eBpGet) { bpOk = false; }
            if (!bpOk) {
              try {
                await apiPost({
                  action: "ensureBpFromOrder",
                  nick: clientName,
                  createCard: true,
                  needSurvey: !!surveyMeta.needSurvey,
                  status: bpStatus,
                  surveyDate: bpDue,
                  surveyKind: bpKind,
                  compositionDate: deliveryDate || "",
                  subId: surveyMeta.subId || "",
                  ownerTelegramId: surveyMeta.ownerTelegramId || "",
                  ownerName: surveyMeta.ownerName || "",
                  wishes: clientNote || "",
                  basket: bpBasketMapped
                });
              } catch (ePostBp) {}
            }
            surveyMeta._bpToast = bpStatus === "ФИНАЛ"
              ? ("Финал · опрос через 4 дня (" + bpDue + ")")
              : ("БП · " + bpStatus + " · опрос через 4 дня (" + bpDue + ")");
            if (surveyMeta.advance === "to_final") surveyMeta._bpToast = "2-я доставка → Финал · опрос " + bpDue;
          } catch (eBp) { surveyMeta._bpToast = ""; surveyMeta._bpWarn = true; }
        }

        hideSaveLoading();

        // календарь-only: сбросить день недели в форме (не оставлять Пн)
        if (!weekDayToSave) {
          try {
            var dayClr = document.getElementById("day");
            if (dayClr) { dayClr.selectedIndex = 0; dayClr.value = ""; }
          } catch (eDayClr) {}
        }

        var confirmSrc = (saveRes && (saveRes.writeId || saveRes.sheetsVerified || saveRes.pendingSheets))
          ? saveRes
          : (bookRes && (bookRes.writeId || bookRes.sheetsVerified || bookRes.pendingSheets) ? bookRes : saveRes || bookRes);
        var calendarOnlySave = !weekDayToSave;
        var doneLabel = !calendarOnlySave && dateOnWeek && inWeek
          ? ("Точно внесено · " + clientName + (savedItems ? (" · " + savedItems + " поз.") : ""))
          : ("Точно в календаре · " + deliveryDate + (savedItems ? (" · " + savedItems + " поз.") : ""));
        if (confirmSrc && (confirmSrc.writeId || confirmSrc.pendingSheets || confirmSrc.sheetsVerified)) {
          await confirmPeopleWriteSheets_(confirmSrc, {
            doneMsg: doneLabel,
            pendingMsg: calendarOnlySave
              ? ("Пишу в календарь «" + clientName + "»…")
              : ("Вношу «" + clientName + "» в таблицу…"),
            failMsg: "Не закрепилось в таблице",
            // календарь: дождаться «Точно», чтобы не путать с ошибкой
            block: !!calendarOnlySave
          });
        } else if (!calendarOnlySave && dateOnWeek && inWeek) {
          showToast((isEdit ? "Обновлён" : "Сохранён") + " " + clientName +
            " (" + savedItems + " поз.)" +
            (orderPrice != null ? (" · " + orderPrice + " BYN") : ""));
        } else {
          showToast("В календаре · " + deliveryDate + " · " + clientName +
            (savedItems ? (" · " + savedItems + " поз.") : "") +
            " · ок (не на листе Пн–Вс)");
        }
        try {
          if (weekDayToSave && dateOnWeek && inWeek) {
            setTimeout(function () {
              runWarehouseCheckAfterSave_({
                client: clientName,
                day: weekDayToSave,
                date: deliveryDate || "",
                basket: basketSnap
              });
            }, 400);
          }
        } catch (eWh) {}
        if (orderTypeSnap === "bp" && surveyMeta && surveyMeta.createCard) {
          if (surveyMeta._bpWarn) showToast("Заказ ок, БП-карточку проверь вручную");
          else if (surveyMeta._bpToast) showToast(surveyMeta._bpToast);
        }

        try { logLearnEvent("saveOrder", { client: clientName, day: day, items: savedItems, orderType: orderTypeSnap }); } catch (eL) {}

        if (deferSnap) {
          window._orderDeferredId = "";
          try { await cancelDeferredSilent_(deferSnap); } catch (eDef) {}
        }

        try {
          if (calendarOnlySave && deliveryDate) {
            // НЕ кидать в Просмотр — путаница «куда закинуло / люди пропали».
            // Остаёмся на Заказе; в фоне обновляем кэш месяца этой даты.
            try {
              var mmSave = String(deliveryDate).slice(0, 7);
              if (/^\d{4}-\d{2}$/.test(mmSave)) {
                try { delete viewMonthOverviewByMonth[mmSave]; } catch (eDelM) {}
                if (viewMonthOverviewCache && String(viewMonthOverviewCache.month || "").slice(0, 7) === mmSave) {
                  viewMonthOverviewCache = null;
                }
                var pickSave = document.getElementById("viewMonthPick");
                if (pickSave) pickSave.value = mmSave;
              }
            } catch (eMm) {}
            try {
              lastViewDateIso = deliveryDate;
            } catch (eVd) {}
            try {
              ensureMonthOverviewLoaded_({ soft: true, refresh: true }).catch(function () {});
            } catch (eMo) {}
          } else {
            refreshDayViews(weekDayToSave || day).catch(function () {});
          }
        } catch (eRef) {}
      } catch (err) {
        hideSaveLoading();
        await uiAlertAsync("Не сохранилось «" + clientName + "»: " + (err.message || err));
      } finally {
        hideSaveLoading();
      }
    }
    window.sendEntireOrder = sendEntireOrder;

    function loadingDanceHtml(label) {
      return simpleLoadingHtml(label);
    }
    function simpleLoadingHtml(label) {
      return '<div class="load-simple" aria-busy="true">' +
        '<div class="load-spinner" aria-hidden="true"></div>' +
        '<div class="load-simple-label">' + escapeHtml(label || "Загружаю…") + "</div></div>";
    }

    function renderCutNoteHint(item) {
      const info = item && item.noteInfo;
      if (!info || !info.noted || !info.groups || !info.groups.length) return "";
      const unit = item.unit === "шт" ? "шт" : "гр";
      const total = Number(item.dry) || 0;
      const noted = Math.min(Number(info.noted) || 0, total);
      const plain = Math.max(0, total - noted);
      let html = '<div class="cut-note-hint">';
      if (plain > 0 && noted > 0) {
        html += "Обычных: <b>" + plain + " " + unit + "</b> · с примечанием: <b>" + noted + " " + unit + "</b>";
      } else if (noted > 0) {
        html += "Все с примечанием: <b>" + noted + " " + unit + "</b>";
      }
      html += info.groups.map(function (g) {
        const who = (g.clients || []).slice(0, 3).join(", ") + ((g.clients || []).length > 3 ? "…" : "");
        return '<div class="muted" style="margin-top:4px;">' +
          escapeHtml(String(g.qty)) + " " + unit + " — «" + escapeHtml(g.text || "") + "»" +
          (who ? (" · " + escapeHtml(who)) : "") +
          "</div>";
      }).join("");
      html += "</div>";
      return html;
    }

    function toggleManualEntry() {
      const panel = document.getElementById("manualEntryPanel");
      const btn = document.getElementById("btnManualEntry");
      if (!panel) return;
      const open = panel.style.display === "block";
      panel.style.display = open ? "none" : "block";
      if (open) {
        const sel = document.getElementById("selectorCard");
        if (sel) sel.style.display = "none";
      }
      if (btn) btn.textContent = open ? "Ручной ввод" : "Скрыть ручной ввод";
    }
    window.toggleManualEntry = toggleManualEntry;

    function ensureViewDaySelected() {
      var daySel = document.getElementById("viewDaySelect");
      var dateEl = document.getElementById("viewDate");
      if (!daySel) return;
      if (daySel.value || (dateEl && dateEl.value)) return;
      // после вс без закрытия недели сегодняшний пн = слот «Будущая неделя» (не Пн листа 17–23)
      var todayIso = (typeof viewTodayIsoLocal_ === "function") ? viewTodayIsoLocal_() : "";
      var week = viewWeekOverviewCache;
      var futureDay = "";
      try {
        var items = (week && week.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (!items[i] || items[i].day !== "Будущая неделя") continue;
          var m = String(items[i].date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
          if (!m) continue;
          var iso = m[3] + "-" + pad2Month_(Number(m[2])) + "-" + pad2Month_(Number(m[1]));
          if (todayIso && iso === todayIso) futureDay = "Будущая неделя";
        }
      } catch (eFut) {}
      var day = futureDay || ((typeof opsWeekdayNameNow === "function") ? opsWeekdayNameNow() : "");
      if (day) setSelectDayValue(daySel, day);
    }

    function onViewDateChange() {
      const el = document.getElementById("viewDate");
      if (!el || !el.value) return;
      const daySel = document.getElementById("viewDaySelect");
      if (daySel) daySel.selectedIndex = 0;
      loadClientsForDay();
    }
    window.onViewDateChange = onViewDateChange;

    function onViewDayChange() {
      const dateEl = document.getElementById("viewDate");
      if (dateEl) dateEl.value = "";
      loadClientsForDay();
    }
    window.onViewDayChange = onViewDayChange;

    let monthClientsCache = [];
    let viewTransferDraft = []; // черновик переноса: визуально слева, в таблицу после «Сохранить»
    let viewDateOnlyMonth = false; // дата вне текущей недели — только колонка месяца
    let viewFutureWrongDate = false; // «Будущая неделя» сейчас на другой дате
    let viewResolvedDayName = ""; // фактический день из getViewCompare (может ≠ select)
    let lastViewDateIso = ""; // последняя дата Просмотра (для edit → Заказ)
    let viewSub = "month"; // month | week
    let viewMonthOverviewCache = null; // { month, days, total }
    let viewMonthOverviewByMonth = Object.create(null); // yyyy-mm → cache
    let viewWeekOverviewCache = null; // { items, total }
    let viewMonthDayOpen = false;
    let viewWeekDayOpen = false;
    let viewScreenVisited = false;

    function mountViewDayEditor_() {
      var host = document.getElementById("viewDayEditorHost");
      if (!host) return;
      var monthPanel = document.getElementById("viewMonthDayPanel");
      var weekPanel = document.getElementById("viewWeekDayPanel");
      if (viewSub === "month" && monthPanel) {
        if (host.parentElement !== monthPanel) monthPanel.appendChild(host);
        host.style.display = viewMonthDayOpen ? "" : "none";
      } else if (weekPanel) {
        if (host.parentElement !== weekPanel) weekPanel.appendChild(host);
        host.style.display = viewWeekDayOpen ? "" : "none";
      }
    }

    function setViewSub(which) {
      viewSub = which === "week" ? "week" : "month";
      var mBtn = document.getElementById("viewSubMonth");
      var wBtn = document.getElementById("viewSubWeek");
      if (mBtn) mBtn.classList.toggle("active", viewSub === "month");
      if (wBtn) wBtn.classList.toggle("active", viewSub === "week");
      var mPane = document.getElementById("viewMonthPane");
      var wPane = document.getElementById("viewWeekPane");
      if (mPane) mPane.style.display = viewSub === "month" ? "" : "none";
      if (wPane) wPane.style.display = viewSub === "week" ? "" : "none";
      var mOv = document.getElementById("viewMonthOverviewCard");
      var wOv = document.getElementById("viewWeekOverviewCard");
      if (mOv) mOv.style.display = (viewSub === "month" && !viewMonthDayOpen) ? "" : "none";
      if (wOv) wOv.style.display = (viewSub === "week" && !viewWeekDayOpen) ? "" : "none";
      var mDay = document.getElementById("viewMonthDayPanel");
      var wDay = document.getElementById("viewWeekDayPanel");
      if (mDay) mDay.style.display = (viewSub === "month" && viewMonthDayOpen) ? "" : "none";
      if (wDay) wDay.style.display = (viewSub === "week" && viewWeekDayOpen) ? "" : "none";
      mountViewDayEditor_();

      if (viewSub === "month") {
        if (viewMonthOverviewCache) renderMonthOverviewList_(viewMonthOverviewCache);
        else if (!viewMonthDayOpen) ensureMonthOverviewLoaded_({ soft: true });
      } else {
        if (viewWeekOverviewCache) renderWeekOverviewList_(viewWeekOverviewCache);
        else if (!viewWeekDayOpen) ensureWeekOverviewLoaded_({ soft: true });
      }
    }
    window.setViewSub = setViewSub;

    function enterViewScreen_() {
      if (!viewScreenVisited) {
        viewScreenVisited = true;
        var pick = document.getElementById("viewMonthPick");
        if (pick && !pick.value) {
          var now = new Date();
          pick.value = now.getFullYear() + "-" + pad2Month_(now.getMonth() + 1);
        }
        setViewSub(viewSub || "month");
        return;
      }

      setViewSub(viewSub || "month");
    }

    function formatViewSegMix_(seg) {
      seg = seg || {};
      var bits = [];
      if (seg["ПП"]) bits.push('<span class="view-ov-seg">ПП ' + seg["ПП"] + "</span>");
      if (seg["БП"]) bits.push('<span class="view-ov-seg">БП ' + seg["БП"] + "</span>");
      if (seg["Р"]) bits.push('<span class="view-ov-seg">Р ' + seg["Р"] + "</span>");
      if (seg["ПАРТНЁР"]) bits.push('<span class="view-ov-seg">Парт ' + seg["ПАРТНЁР"] + "</span>");
      if (seg.other) bits.push('<span class="view-ov-seg">др. ' + seg.other + "</span>");
      return bits.join("") || '<span class="view-ov-seg muted">без типа</span>';
    }

    function weekdayLabelFromIso_(iso) {
      try {
        var names = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
        var dt = new Date(String(iso) + "T12:00:00");
        if (isNaN(dt.getTime())) return "";
        return names[dt.getDay()];
      } catch (e) { return ""; }
    }

    function pad2Month_(n) {
      n = Number(n) || 0;
      return (n < 10 ? "0" : "") + n;
    }

    function monthTitleRu_(ym) {
      var parts = String(ym || "").split("-");
      var y = Number(parts[0]) || new Date().getFullYear();
      var m = Number(parts[1]) || (new Date().getMonth() + 1);
      var names = [
        "январь", "февраль", "март", "апрель", "май", "июнь",
        "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
      ];
      return (names[m - 1] || "") + " " + y;
    }

    function shiftViewMonth_(delta) {
      var pick = document.getElementById("viewMonthPick");
      var cur = (pick && pick.value) || "";
      if (!/^\d{4}-\d{2}$/.test(cur)) {
        var now = new Date();
        cur = now.getFullYear() + "-" + pad2Month_(now.getMonth() + 1);
      }
      var y = Number(cur.slice(0, 4));
      var m = Number(cur.slice(5, 7));
      m += Number(delta) || 0;
      while (m < 1) { m += 12; y -= 1; }
      while (m > 12) { m -= 12; y += 1; }
      if (pick) pick.value = y + "-" + pad2Month_(m);
      onViewMonthPickChange();
    }
    window.shiftViewMonth_ = shiftViewMonth_;

    function iosCalDotsHtml_(seg, count) {
      seg = seg || {};
      var dots = [];
      if (seg["ПП"]) dots.push('<span class="ios-cal-dot pp"></span>');
      if (seg["БП"]) dots.push('<span class="ios-cal-dot bp"></span>');
      if (seg["Р"]) dots.push('<span class="ios-cal-dot r"></span>');
      if (seg["ПАРТНЁР"]) dots.push('<span class="ios-cal-dot partner"></span>');
      if (seg.other) dots.push('<span class="ios-cal-dot other"></span>');
      if (!dots.length && count > 0) dots.push('<span class="ios-cal-dot"></span>');
      return '<div class="ios-cal-dots">' + dots.slice(0, 4).join("") + "</div>";
    }

    function viewTodayIsoLocal_() {
      var d = new Date();
      return d.getFullYear() + "-" + pad2Month_(d.getMonth() + 1) + "-" + pad2Month_(d.getDate());
    }

    function weekCountsMondayIso_(week) {
      var items = (week && week.items) || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it) continue;
        if (it.day === "Понедельник" || it.short === "Пн") {
          var m = String(it.date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
          if (m) {
            return m[3] + "-" + pad2Month_(Number(m[2])) + "-" + pad2Month_(Number(m[1]));
          }
        }
      }
      return "";
    }

    function isWeekCountsFresh_(week) {
      if (!week || !Array.isArray(week.items) || !week.items.length) return false;
      var wMon = weekCountsMondayIso_(week);
      var cMon = mondayIsoFromIsoDate_(viewTodayIsoLocal_());
      if (!wMon || !cMon) return true;
      return wMon === cMon;
    }

    function overlayWeekCountsOnMonthData_(data) {
      if (!data || typeof data !== "object") return data;
      // Worker уже отдал бейджи (D1 + лист недели) — не затирать seed/кэшем
      if (data.weekOverlay && Array.isArray(data.days) && data.days.length) return data;
      var week = viewWeekOverviewCache;
      if (!week || !Array.isArray(week.items) || !week.items.length) return data;
      if (!isWeekCountsFresh_(week)) return data;
      var month = String(data.month || "").slice(0, 7);
      var byIso = {};
      ((data.days || []) || []).forEach(function (d) {
        if (!d || !d.dateIso) return;
        byIso[d.dateIso] = {
          dateIso: d.dateIso,
          count: Number(d.count) || 0,
          segments: d.segments || {},
          fromWeekSheet: !!d.fromWeekSheet,
          fromView: !!d.fromView
        };
      });
      week.items.forEach(function (it) {
        if (!it) return;
        var m = String(it.date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!m) return;
        var iso = m[3] + "-" + pad2Month_(Number(m[2])) + "-" + pad2Month_(Number(m[1]));
        if (month && iso.slice(0, 7) !== month) return;
        var c = Number(it.count) || 0;
        var prev = byIso[iso];
        if (prev && prev.fromView) {
          prev.fromWeekSheet = true;
          return;
        }
        if (!prev) {
          byIso[iso] = { dateIso: iso, count: c, segments: {}, fromWeekSheet: true };
        } else {
          prev.count = c;
          prev.fromWeekSheet = true;
        }
      });
      var days = Object.keys(byIso).sort().map(function (k) { return byIso[k]; });
      var total = 0;
      for (var i = 0; i < days.length; i++) total += Number(days[i].count) || 0;
      return Object.assign({}, data, { days: days, total: total, weekOverlay: true, clientOverlay: true });
    }

    function renderMonthOverviewList_(data, opts) {
      opts = opts || {};
      var box = document.getElementById("viewMonthOverviewList");
      if (!box) return;
      // не затирать сетку пустотой после move/delete (кэш сбросили, GAS ещё не пришёл)
      if (!data || !Array.isArray(data.days)) return;
      var pickEl = document.getElementById("viewMonthPick");
      var pickMonth = (pickEl && pickEl.value) || "";
      var dataMonth = String((data && data.month) || "").slice(0, 7);
      // приоритет: явный want → выбранный пикер → data.month (не откатывать пикер чужим месяцем)
      var month = String(opts.wantMonth || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month) && /^\d{4}-\d{2}$/.test(pickMonth)) month = pickMonth;
      if (!/^\d{4}-\d{2}$/.test(month)) month = dataMonth;
      if (!/^\d{4}-\d{2}$/.test(month)) {
        var now0 = new Date();
        month = now0.getFullYear() + "-" + pad2Month_(now0.getMonth() + 1);
      }
      // если ответ про другой месяц — не трогаем пикер и не рисуем чужую сетку
      if (dataMonth && dataMonth !== month) return;
      if (pickEl && pickEl.value !== month) pickEl.value = month;

      var byIso = {};
      ((data && data.days) || []).forEach(function (d) {
        if (d && d.dateIso) byIso[d.dateIso] = d;
      });

      var y = Number(month.slice(0, 4));
      var m = Number(month.slice(5, 7)); // 1-12
      var first = new Date(y, m - 1, 1);
      var daysInMonth = new Date(y, m, 0).getDate();

      var startWeekday = (first.getDay() + 6) % 7; // 0=пн … 6=вс
      var today = new Date();
      var todayIso = today.getFullYear() + "-" + pad2Month_(today.getMonth() + 1) + "-" + pad2Month_(today.getDate());
      var selectedIso = lastViewDateIso || "";
      var total = Number((data && data.total) || 0);
      var daysWith = ((data && data.days) || []).length;

      var html = '<div class="ios-cal">';
      html += '<div class="ios-cal-nav">' +
        '<button type="button" class="ios-cal-nav-btn" onclick="shiftViewMonth_(-1)" aria-label="Предыдущий">‹</button>' +
        '<div class="ios-cal-title">' + escapeHtml(monthTitleRu_(month)) + "</div>" +
        '<button type="button" class="ios-cal-nav-btn" onclick="shiftViewMonth_(1)" aria-label="Следующий">›</button>' +
        "</div>";
      html += '<div class="ios-cal-weekdays">' +
        ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(function (w) {
          return '<div class="ios-cal-wd">' + w + "</div>";
        }).join("") +
        "</div>";
      html += '<div class="ios-cal-grid">';

      var cells = [];
      var i;
      for (i = 0; i < startWeekday; i++) {
        cells.push({ out: true, day: "" });
      }
      for (var d = 1; d <= daysInMonth; d++) {
        var iso = month + "-" + pad2Month_(d);
        cells.push({ out: false, day: d, iso: iso, info: byIso[iso] || null });
      }
      while (cells.length % 7 !== 0) {
        cells.push({ out: true, day: "" });
      }

      while (cells.length < 35) cells.push({ out: true, day: "" });

      cells.forEach(function (cell) {
        if (cell.out) {
          html += '<div class="ios-cal-cell is-out"><div class="ios-cal-num"></div></div>';
          return;
        }
        var info = cell.info;
        var count = info ? (Number(info.count) || 0) : 0;
        var cls = "ios-cal-cell";
        if (cell.iso === todayIso) cls += " is-today";
        if (selectedIso && cell.iso === selectedIso) cls += " is-selected";
        if (count > 0) cls += " has-events";
        html += '<button type="button" class="' + cls + '" data-iso="' + escapeHtml(cell.iso) + '"' +
          ' onclick="openViewMonthDay(this.getAttribute(\'data-iso\'))">' +
          '<div class="ios-cal-num">' + cell.day + "</div>" +
          iosCalDotsHtml_(info && info.segments, count) +
          (count > 0 ? ('<div class="ios-cal-badge">' + count + "</div>") : "") +
          "</button>";
      });

      html += "</div>";
      html += '<div class="ios-cal-foot">' +
        "<span>" + daysWith + " дн. с записями</span>" +
        "<span>всего " + total + " чел.</span>" +
        '<button type="button" class="seg-btn" style="padding:4px 10px;font-size:11px;margin-left:auto;" onclick="refreshViewMonthOverview()">Обновить</button>' +
        "</div>";
      html += '<div class="ios-cal-legend">' +
        '<span><i style="background:#30d158"></i>ПП</span>' +
        '<span><i style="background:#64d2ff"></i>БП</span>' +
        '<span><i style="background:#ffd60a"></i>Р</span>' +
        '<span><i style="background:#bf5af2"></i>Парт</span>' +
        "</div>";
      html += "</div>";
      box.innerHTML = html;
    }

    function refreshViewMonthOverview() {
      viewMonthOverviewCache = null;
      ensureMonthOverviewLoaded_({ force: true });
    }
    window.refreshViewMonthOverview = refreshViewMonthOverview;

    async function ensureMonthOverviewLoaded_(opts) {
      opts = opts || {};
      var pick = document.getElementById("viewMonthPick");
      var month = (pick && pick.value) || "";
      if (!month) {
        var now = new Date();
        month = now.getFullYear() + "-" + pad2Month_(now.getMonth() + 1);
        if (pick) pick.value = month;
      }
      var wantMonth = month;
      var seq = ++_monthOverviewLoadSeq;
      if (
        opts.soft &&
        viewMonthOverviewCache &&
        viewMonthOverviewCache.month === wantMonth &&
        Array.isArray(viewMonthOverviewCache.days)
      ) {
        renderMonthOverviewList_(viewMonthOverviewCache, { wantMonth: wantMonth });
        if (opts.refresh) {
          // фон: D1 snap (без force GAS) — сетка не ждёт 6–7с
          apiGet(
            { action: "getMonthOverview", month: wantMonth, _: String(Date.now()) },
            { timeoutMs: 22000, retries: 0, cacheTtlMs: 0 }
          ).then(function (res) {
            if (seq !== _monthOverviewLoadSeq) return;
            if (!(res && res.status === "success")) return;
            var got = String(res.month || "").slice(0, 7);
            if (got && got !== wantMonth) return;
            var body = Object.assign({}, res, { month: wantMonth });
            viewMonthOverviewCache = overlayWeekCountsOnMonthData_(body);
            viewMonthOverviewByMonth[wantMonth] = viewMonthOverviewCache;
            renderMonthOverviewList_(viewMonthOverviewCache, { wantMonth: wantMonth });
          }).catch(function () {});
        }
        return;
      }
      var box = document.getElementById("viewMonthOverviewList");
      if (box && !opts.soft) box.innerHTML = viewLoadingSkeletonHtml();
      try {
        // неделю не блокируем: overlay поверх snap; force недели только при явной кнопке «Обновить»
        try {
          if (opts.force) {
            await ensureWeekOverviewLoaded_({ force: true });
          } else if (!viewWeekOverviewCache || !isWeekCountsFresh_(viewWeekOverviewCache)) {
            ensureWeekOverviewLoaded_({ soft: true }).catch(function () {});
          }
        } catch (eWov) {}
        if (seq !== _monthOverviewLoadSeq) return;
        var params = { action: "getMonthOverview", month: wantMonth };
        // force только по кнопке «Обновить» — иначе ‹› ждёт GAS ~6с
        if (opts.force) {
          params.force = "1";
          params._ = String(Date.now());
        }
        var res = await apiGet(
          params,
          { timeoutMs: opts.soft ? 22000 : 45000, retries: opts.soft ? 0 : 1, cacheTtlMs: opts.force ? 0 : undefined }
        );
        if (seq !== _monthOverviewLoadSeq) return;
        if (res && res.status === "success") {
          var gotM = String(res.month || "").slice(0, 7);
          if (gotM && gotM !== wantMonth) {
            // сначала без GAS force — Worker уже умеет monthOverview:yyyy-mm
            try {
              res = await apiGet(
                { action: "getMonthOverview", month: wantMonth, _: String(Date.now()) },
                { timeoutMs: 22000, retries: 0, cacheTtlMs: 0 }
              );
            } catch (eRetry) {
              res = null;
            }
            if (seq !== _monthOverviewLoadSeq) return;
            gotM = res ? String(res.month || "").slice(0, 7) : "";
            if (gotM && gotM !== wantMonth) {
              try {
                res = await apiGet(
                  { action: "getMonthOverview", month: wantMonth, force: "1", _: String(Date.now()) },
                  { timeoutMs: 45000, retries: 0, cacheTtlMs: 0 }
                );
              } catch (eForce) {
                res = null;
              }
              if (seq !== _monthOverviewLoadSeq) return;
              gotM = res ? String(res.month || "").slice(0, 7) : "";
              if (gotM && gotM !== wantMonth) {
                if (box) box.innerHTML = '<div class="view-idle">Не удалось открыть ' + escapeHtml(wantMonth) + "</div>";
                return;
              }
            }
          }
          var bodyOk = Object.assign({}, res, { month: wantMonth });
          viewMonthOverviewCache = overlayWeekCountsOnMonthData_(bodyOk);
          viewMonthOverviewByMonth[wantMonth] = viewMonthOverviewCache;
          renderMonthOverviewList_(viewMonthOverviewCache, { wantMonth: wantMonth });
        } else {
          if (box) {
            box.innerHTML = '<div class="view-idle">Не удалось загрузить месяц' +
              (res && res.message === "Unknown action" ? " — нужен Deploy Code.gs" : "") +
              "</div>";
          }
        }
      } catch (e) {
        if (seq !== _monthOverviewLoadSeq) return;
        if (box) box.innerHTML = '<div class="view-idle">Ошибка: ' + escapeHtml(e.message || String(e)) + "</div>";
      }
    }

    function onViewMonthPickChange() {
      var pick = document.getElementById("viewMonthPick");
      var month = (pick && pick.value) || "";
      var cached = month ? viewMonthOverviewByMonth[month] : null;
      if (cached && cached.month === month && Array.isArray(cached.days)) {
        viewMonthOverviewCache = cached;
        renderMonthOverviewList_(cached, { wantMonth: month });
        ensureMonthOverviewLoaded_({ soft: true, refresh: true });
        return;
      }
      viewMonthOverviewCache = null;
      // D1 snap нужного месяца — без force GAS (‹› мгновенно / ~1–3с)
      ensureMonthOverviewLoaded_({ soft: false, needMonth: true });
    }
    window.onViewMonthPickChange = onViewMonthPickChange;

    async function openViewMonthDay(iso) {
      iso = String(iso || "").trim();
      if (!iso) return;
      viewMonthDayOpen = true;
      var title = document.getElementById("viewMonthDayTitle");
      if (title) title.textContent = iso;
      var pickDate = document.getElementById("viewDate");
      if (pickDate) pickDate.value = iso;
      var daySel = document.getElementById("viewDaySelect");
      if (daySel) daySel.selectedIndex = 0;
      setViewSub("month");
      await loadClientsForDay();
    }
    window.openViewMonthDay = openViewMonthDay;

    function closeViewMonthDay() {
      viewMonthDayOpen = false;
      setViewSub("month");
    }
    window.closeViewMonthDay = closeViewMonthDay;

    function refreshViewMonthDay() {
      loadClientsForDay();
    }
    window.refreshViewMonthDay = refreshViewMonthDay;

    function renderWeekOverviewList_(data) {
      var box = document.getElementById("viewWeekOverviewList");
      var tot = document.getElementById("viewWeekOverviewTotal");
      if (tot) tot.textContent = data && data.total != null ? ("(" + data.total + ")") : "";
      if (!box) return;
      var items = (data && data.items) || [];
      if (!items.length) {
        box.innerHTML = '<div class="view-idle">Нет данных по неделе</div>';
        return;
      }
      box.innerHTML = items.map(function (it) {
        var day = it.day || "";
        var dateBit = it.date ? (" · " + escapeHtml(String(it.date))) : "";
        return '<div class="view-ov-row" data-day="' + escapeHtml(day) + '" data-date="' + escapeHtml(String(it.date || "")) + '" onclick="openViewWeekDay(this.getAttribute(\'data-day\'), this.getAttribute(\'data-date\'))">' +
          '<div class="view-ov-left">' +
            '<div class="view-ov-date">' + escapeHtml(it.short || day) + " · " + escapeHtml(day) + "</div>" +
            '<div class="view-ov-meta">' + dateBit + "</div>" +
          "</div>" +
          '<div class="view-ov-count">' + (Number(it.count) || 0) + "</div>" +
        "</div>";
      }).join("");
    }

    async function ensureWeekOverviewLoaded_(opts) {
      opts = opts || {};
      if (opts.soft && viewWeekOverviewCache && isWeekCountsFresh_(viewWeekOverviewCache)) {
        renderWeekOverviewList_(viewWeekOverviewCache);
        return;
      }
      var box = document.getElementById("viewWeekOverviewList");
      if (box && !opts.soft) box.innerHTML = viewLoadingSkeletonHtml();
      try {
        var params = {
          action: "getWeekDayCounts",
          force: opts.force ? "1" : ""
        };
        if (opts.force) params._ = String(Date.now());
        var res = await apiGet(
          params,
          { timeoutMs: opts.soft ? 15000 : 25000, retries: opts.soft ? 0 : 1, cacheTtlMs: opts.force ? 0 : undefined }
        );
        if (res && res.status === "success") {
          if (!isWeekCountsFresh_(res) && !opts.force) {
            return ensureWeekOverviewLoaded_({ force: true });
          }
          viewWeekOverviewCache = res;
          renderWeekOverviewList_(res);
        } else if (box) {
          box.innerHTML = '<div class="view-idle">Не удалось загрузить неделю</div>';
        }
      } catch (e) {
        if (box) box.innerHTML = '<div class="view-idle">Ошибка: ' + escapeHtml(e.message || String(e)) + "</div>";
      }
    }

    function refreshViewWeekOverview() {
      viewWeekOverviewCache = null;
      ensureWeekOverviewLoaded_({ force: true });
    }
    window.refreshViewWeekOverview = refreshViewWeekOverview;

    async function openViewWeekDay(dayName, dateHint) {
      dayName = String(dayName || "").trim();
      if (!dayName) return;
      viewWeekDayOpen = true;
      var title = document.getElementById("viewWeekDayTitle");
      if (title) title.textContent = dayName;
      var daySel = document.getElementById("viewDaySelect");
      if (daySel) {
        for (var i = 0; i < daySel.options.length; i++) {
          if (daySel.options[i].value === dayName || daySel.options[i].text === dayName) {
            daySel.selectedIndex = i;
            break;
          }
        }
      }
      // дата слота из счётчиков / data-date (Будущая = 24.08) — иначе delete без date путает Пн
      var pickDate = document.getElementById("viewDate");
      var slotIso = "";
      function dmyToIsoLocal_(dmy) {
        dmy = String(dmy || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dmy)) return dmy;
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dmy)) {
          var p = dmy.split(".");
          return p[2] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2);
        }
        return "";
      }
      slotIso = dmyToIsoLocal_(dateHint);
      if (!slotIso) {
        try {
          var items = (viewWeekOverviewCache && viewWeekOverviewCache.items) || [];
          for (var wi = 0; wi < items.length; wi++) {
            if (items[wi] && String(items[wi].day) === dayName) {
              slotIso = dmyToIsoLocal_(items[wi].date);
              break;
            }
          }
        } catch (eIso) {}
      }
      if (pickDate) pickDate.value = slotIso || "";
      try { window._peopleListForceFresh = true; } catch (eF) {}
      setViewSub("week");
      await loadClientsForDay();
    }
    window.openViewWeekDay = openViewWeekDay;

    function closeViewWeekDay() {
      viewWeekDayOpen = false;
      setViewSub("week");
    }
    window.closeViewWeekDay = closeViewWeekDay;

    function refreshViewWeekDay() {
      loadClientsForDay();
    }
    window.refreshViewWeekDay = refreshViewWeekDay;

    function viewLoadingSkeletonHtml() {
      var card = function () {
        return '<div class="client-item-card view-month-card view-skel">' +
          '<div class="view-skel-line w70"></div>' +
          '<div class="view-skel-line w90"></div>' +
          '<div class="view-skel-line w40"></div>' +
          '</div>';
      };
      return card() + card() + card();
    }

    function resetViewIdleIfEmpty() {
      var day = document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value;
      var dateStr = document.getElementById("viewDate") && document.getElementById("viewDate").value;
      if (day || dateStr) return;
      var idle = '<div class="view-idle">Выберите день или дату</div>';
      var box = document.getElementById("clientsContainer");
      var monthBox = document.getElementById("monthClientsContainer");
      if (box) box.innerHTML = idle;
      if (monthBox) monthBox.innerHTML = idle;
      var summary = document.getElementById("totalDaySummaryContainer");
      if (summary) summary.innerHTML = "";
      var weekCountEl = document.getElementById("viewWeekCount");
      var monthCountEl = document.getElementById("viewMonthCount");
      if (weekCountEl) weekCountEl.textContent = "";
      if (monthCountEl) monthCountEl.textContent = "";
      var weekCol = document.getElementById("viewWeekCol");
      if (weekCol) weekCol.classList.remove("is-dimmed");
      var split = document.querySelector(".view-split");
      if (split) {
        split.classList.remove("is-month-only");
        split.classList.remove("is-week-only");
      }
      if (weekCol) weekCol.style.display = "";
      var monthCol = document.getElementById("viewMonthCol");
      if (monthCol) monthCol.style.display = "";
      viewDateOnlyMonth = false;
      loadedClientsRawData = [];
      monthClientsCache = [];
      updateViewDraftBar();
      updateBatchBar();
    }
    window.resetViewIdleIfEmpty = resetViewIdleIfEmpty;

    function viewClientKey(raw) {
      var s = String(raw || "").replace(/\s+/g, " ").trim();
      if (!s) return "";
      var at = s.match(/@([A-Za-z0-9._]{2,})/);
      var handle = "";
      if (at) handle = at[1];
      else {
        s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\b(АФК|ПП|БП|Р)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
        var parts = s.split(/\s+/);
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i].replace(/^[.,;:]+|[.,;:]+$/g, "");
          if (/^[A-Za-z0-9._]{3,}$/.test(p) && /[A-Za-z]/.test(p)) { handle = p; break; }
        }
      }
      if (handle) return handle.toUpperCase().replace(/[._]/g, "");
      return s.toUpperCase().replace(/Ё/g, "Е");
    }

    function segmentToOrderType_(seg) {
      var s = String(seg || "").trim().toUpperCase();
      if (!s) return "";
      if (s === "БП" || s === "BP") return "bp";
      if (s === "ПП" || s === "PP" || s === "АФК" || s === "AFK" || s === "SUBSCRIPTION") return "pp";
      if (s === "Р" || s === "R" || s === "RETAIL" || s === "РОЗНИЦА") return "retail";
      if (s.indexOf("ПАРТ") === 0 || s === "PARTNER" || s === "ВАРКА") return "partner";
      return "";
    }

    function orderTypeToSegment_(ot) {
      if (ot === "bp") return "БП";
      if (ot === "pp") return "ПП";
      if (ot === "retail") return "Р";
      if (ot === "partner") return "ПАРТНЁР";
      return "";
    }

    function resolveClientOrderType_(client) {
      client = client || {};
      var fromSeg = segmentToOrderType_(client.segment);
      if (fromSeg) return fromSeg;
      var note = String(client.note || "");
      var segTag = note.match(/\[SEG:([^\]]+)\]/i);
      if (segTag) {
        var t0 = segmentToOrderType_(segTag[1]);
        if (t0) return t0;
      }
      var src = String(client.source || client.orderType || "").toLowerCase();
      if (src === "bp" || src === "бп") return "bp";
      if (src === "pp" || src === "пп" || src === "subscription" || src === "afk") return "pp";
      if (src === "partner" || src === "партнёр" || src === "партнер") return "partner";
      if (src === "retail" || src === "розница") return "retail";

      if (/\[лист\s*БП\]/i.test(note) || /\bБП\s*[12]\b/i.test(note) || /\bБП1\b|\bБП2\b/i.test(note)) return "bp";
      if (/\[лист\s*ПП\]/i.test(note) || /ПП\s*N\s*=/i.test(note) || /доставка\s*\d\/\d/i.test(note)) return "pp";
      if (/\[лист\s*АФК\]/i.test(note)) return "pp";
      if (/\bВАРКА\b/i.test(client.name || "") || /\bВАРКА\b/i.test(note)) return "partner";
      return "";
    }

    async function guessOrderTypeFromCrm_(nick) {
      nick = String(nick || "").trim();
      if (!nick) return "";
      try {
        var bp = await apiGet(
          { action: "getSubscription", nick: nick, segment: "БП", _: String(Date.now()) },
          { timeoutMs: 10000, cacheTtlMs: 20000 }
        );
        if (bp && bp.status === "success" && String(bp.sheet || "").toUpperCase() === "БП") return "bp";
      } catch (eBp) {}
      try {
        var pp = await apiGet(
          { action: "getSubscription", nick: nick, segment: "ПП", _: String(Date.now()) },
          { timeoutMs: 10000, cacheTtlMs: 20000 }
        );
        if (pp && pp.status === "success") {
          var sh = String(pp.sheet || "").toUpperCase();
          if (sh === "ПП" || sh === "АФК") return "pp";
        }
      } catch (ePp) {}
      return "";
    }

    function clientGaps(client) {
      var gaps = [];
      if (!resolveClientOrderType_(client) && !String(client.segment || "").trim()) gaps.push("type");
      if (!String(client.address || "").trim()) gaps.push("address");
      if (!String(client.phone || "").trim() && !extractPhone(client.note || "")) gaps.push("phone");
      var basketLen = (client.basket && client.basket.length) || Number(client.basketCount) || Number(client.orderCount) || 0;
      if (!basketLen) gaps.push("basket");
      var ot = resolveClientOrderType_(client);
      var segU = String(client.segment || "").toUpperCase();
      var isBp = ot === "bp" || segU === "БП" || segU === "BP";
      if (isBp && !String(client.ppPartner || "").trim()) gaps.push("partner");
      return gaps;
    }

    function gapLabels(gaps) {
      return (gaps || []).map(function (g) {
        if (g === "type") return "тип";
        if (g === "address") return "адрес";
        if (g === "phone") return "тел";
        if (g === "basket") return "состав";
        if (g === "partner") return "партнёр";
        return g;
      });
    }

    function basketLineItemHtml_(g) {
      var unit = g.unit || unitForItem(g.cat, g.name || g.main);
      var nm = g.name || g.main || "";
      var frac = g.sub ? String(g.sub) : "";

      if (!frac) {
        var nu = String(nm).toUpperCase().replace(/Ё/g, "Е");
        if (/УХО|УШК/.test(nu)) frac = "Обычное";
        else if (/АОРТ/.test(nu)) frac = "Обычная";
      }
      var fracBit = frac ? " (" + frac + ")" : "";
      return '<div class="order-detail-line"><span>• ' + escapeHtml(nm) + escapeHtml(fracBit) +
        '</span><span class="order-detail-volume">' + (g.val != null ? g.val : g.value) + " " + unit + "</span></div>";
    }

    function basketLinesHtml(basket) {
      var items = basket || [];
      var d1 = [], d2 = [], rest = [];
      items.forEach(function (g) {
        var d = Number(g.dog) || 0;
        if (d === 2) d2.push(g);
        else if (d === 1) d1.push(g);
        else rest.push(g);
      });
      function block(arr) {
        return (arr || []).map(basketLineItemHtml_).join("");
      }

      if (d1.length && d2.length) {
        return '<div class="muted" style="font-size:11px;margin:4px 0 2px;">Собака 1</div>' +
          (block(d1.concat(rest)) || '<p class="muted">Нет позиций</p>') +
          '<div class="muted" style="font-size:11px;margin:8px 0 2px;">Собака 2</div>' +
          (block(d2) || '<p class="muted">Нет позиций</p>');
      }
      return block(items) || '<p class="muted">Нет позиций</p>';
    }

    function updateViewDraftBar() {
      var bar = document.getElementById("viewSaveBar");
      var cnt = document.getElementById("viewDraftCount");
      if (cnt) cnt.textContent = "Черн. " + viewTransferDraft.length;
      if (bar) bar.classList.toggle("open", viewTransferDraft.length > 0);
    }

    function renderViewLists() {
      const box = document.getElementById("clientsContainer");
      const monthBox = document.getElementById("monthClientsContainer");
      const weekCountEl = document.getElementById("viewWeekCount");
      const monthCountEl = document.getElementById("viewMonthCount");
      const draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var split = document.querySelector(".view-split");

      var weekOnly = !viewDateOnlyMonth;
      if ((viewMonthDayOpen || viewWeekDayOpen) && !viewDateOnlyMonth) weekOnly = true;
      if (split) {
        split.classList.toggle("is-month-only", !!viewDateOnlyMonth);
        split.classList.toggle("is-week-only", !!weekOnly);
      }
      var weekCol = document.getElementById("viewWeekCol");
      if (weekCol) {
        weekCol.classList.toggle("is-dimmed", false);
        weekCol.style.display = viewDateOnlyMonth ? "none" : "";
      }
      var monthCol = document.getElementById("viewMonthCol");
      if (monthCol) {
        monthCol.style.display = weekOnly ? "none" : "";
      }
      var monthHead = document.querySelector("#viewMonthCol .view-col-head b");
      if (monthHead) {
        monthHead.innerHTML = viewDateOnlyMonth
          ? ('Календарь <span class="muted" id="viewMonthCount"></span>')
          : ('Месяц <span class="muted" id="viewMonthCount"></span>');
      }

      var monthCountEl2 = document.getElementById("viewMonthCount");

      if (viewDateOnlyMonth) {

        var aloneHtml = (loadedClientsRawData || []).map(function (c, i) {
          return renderWeekClientCard(c, i, false);
        }).join("");
        if (monthBox) {
          monthBox.innerHTML = aloneHtml || '<div class="view-idle">В календаре на эту дату пусто</div>';
        }
        if (box) box.innerHTML = "";
        if (weekCountEl) weekCountEl.textContent = "";
        if (monthCountEl2) monthCountEl2.textContent = "(" + (loadedClientsRawData || []).length + ")";
        var stageAllBtn0 = document.getElementById("viewStageAllBtn");
        if (stageAllBtn0) {
          stageAllBtn0.style.display = "none";
        }
        updateViewDraftBar();
        updateBatchBar();
        return;
      }

      var stageAllBtnShow = document.getElementById("viewStageAllBtn");
      if (stageAllBtnShow) stageAllBtnShow.style.display = weekOnly ? "none" : "";

      var weekHtml = (loadedClientsRawData || []).map(function (c, i) {
        return renderWeekClientCard(c, i, false);
      }).join("");
      var draftHtml = weekOnly ? "" : viewTransferDraft.map(function (c, i) {
        return renderWeekClientCard(c, i, true);
      }).join("");
      if (box) {
        if (viewFutureWrongDate && !weekOnly) {
          box.innerHTML = draftHtml
            ? ('<div class="view-idle">Слот «Будущая» на <b>другой дате</b>. Черновик ниже — «Сохранить» переключит.</div>' + draftHtml)
            : '<div class="view-idle">На «Будущей неделе» сейчас <b>другая дата</b> (Пн).<br>Справа — люди на выбранный день. «→» + «Сохранить» переключит слот.</div>';
        } else if (viewFutureWrongDate && weekOnly) {
          box.innerHTML = '<div class="view-idle">На «Будущей неделе» сейчас <b>другая дата</b>.</div>';
        } else {
          box.innerHTML = (weekHtml || draftHtml)
            ? (weekHtml + draftHtml)
            : (weekOnly
              ? '<div class="view-idle">На этом дне недели пусто</div>'
              : '<div class="view-idle">На неделе пусто — бери справа →</div>');
        }
      }
      if (weekCountEl) {
        var draftN = weekOnly ? 0 : viewTransferDraft.length;
        weekCountEl.textContent = "(" + ((loadedClientsRawData.length + draftN)) +
          (draftN ? (" · +" + draftN + " черн.") : "") + ")";
      }

      if (weekOnly) {
        if (monthBox) monthBox.innerHTML = "";
        if (monthCountEl2) monthCountEl2.textContent = "";
        updateViewDraftBar();
        updateBatchBar();
        return;
      }

      var visibleMonth = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      if (monthBox) {
        monthBox.innerHTML = visibleMonth.length
          ? visibleMonth.map(function (c, i) { return renderMonthClientCard(c, i); }).join("")
          : '<div class="view-idle">Все из месяца уже на неделе / в черновике.</div>';
      }
      if (monthCountEl2) monthCountEl2.textContent = "(" + visibleMonth.length + ")";
      var stageAllBtn = document.getElementById("viewStageAllBtn");
      if (stageAllBtn) {
        stageAllBtn.disabled = false;
        stageAllBtn.style.opacity = "";
        stageAllBtn.title = "";
      }
      updateViewDraftBar();
      updateBatchBar();
    }

    function renderWeekClientCard(client, index, isDraft) {
      const nick = String(client.name || client.nick || "").trim() || ("#" + (index + 1));
      const gaps = clientGaps(client);
      const gapClass = gaps.length ? " is-gap" : "";
      const draftClass = isDraft ? " is-draft" : "";
      const lines = basketLinesHtml(client.basket);
      const addr = client.address ? `<div class="delivery-line addr-line">📍 ${escapeHtml(client.address)}</div>` : "";
      const priceHtml = formatOrderPriceHtml(client);
      const human = humanVisibleNote(client.note || "", "mgr");
      const noteClean = human.text;
      const office = parseOfficeAddress(client.note || "");
      const dm = parseDeliveryMethod(client.note || "");
      const note = noteClean ? `<div class="delivery-line time-alert">Примечание: ${escapeHtml(noteClean)}</div>` : "";
      const roleHint = (human.fromBlocks && noteClean && human.roles && human.roles.length)
        ? `<div class="delivery-line muted" style="font-size:11px;opacity:0.75;">для: ${escapeHtml(formatNoteRoles(human.roles))}</div>`
        : "";
      const deliv = (dm === "euro" || dm === "bel")
        ? `<div class="delivery-line">${dm === "euro" ? "Европочта" : "Белпочта"}${office ? ": " + escapeHtml(office) : ""}</div>`
        : "";
      const tel = formatTelHtml(client.phone || extractPhone(client.note || ""));
      const priceBadge = clientTechBadgesHtml_(client);
      const gapBadge = gaps.length
        ? ('<span class="gap-badge">нет: ' + escapeHtml(gapLabels(gaps).join(", ")) + "</span>")
        : "";
      const preview = [addr, tel].filter(Boolean).join("") ||
        '<div class="muted" style="font-size:11px;margin-top:4px;">адрес/тел не указаны</div>';
      const idPrefix = isDraft ? "draft" : "client";
      const detailId = isDraft ? ("draftDetails_" + index) : ("details_" + index);
      const toggleFn = isDraft ? ("toggleDraftDetail(" + index + ", event)") : ("toggleOrderDetail(" + index + ", event)");
      var actions = "";
      if (isDraft) {
        actions =
          '<div class="client-right-block" onclick="event.stopPropagation()">' +
          '<button class="crm-mini-btn crm-edit" title="Дополнить" onclick="editDraftClient(' + index + ', event)">✏️</button>' +
          '<button class="crm-mini-btn crm-move" title="Вернуть в месяц" onclick="unstageDraftClient(' + index + ', event)">←</button>' +
          "</div>";
      } else {
        // вне недели карточки тоже week-layout, но правим через calendar edit (без day слота)
        var editOnclick = viewDateOnlyMonth
          ? ("crmEditMonthClient(" + index + ", event)")
          : ("crmEditClient(" + index + ", event)");
        actions =
          '<div class="client-right-block" onclick="event.stopPropagation()">' +
          '<button class="crm-mini-btn crm-edit" title="Редактировать заказ" onclick="' + editOnclick + '">✏️</button>' +
          '<button class="crm-mini-btn crm-move" title="Перенести на дату" onclick="crmMoveClient(' + index + ', event)">🔄</button>' +
          '<button class="crm-mini-btn crm-delete" onclick="crmDeleteClient(' + index + ', event)">🗑️</button>' +
          "</div>";
      }
      return `<div class="client-item-card${gapClass}${draftClass}" id="${idPrefix}Card_${index}">
        <div class="client-main-row" onclick="${toggleFn}">
          <div class="client-title-wrap">
            ${isDraft ? "" : `<input type="checkbox" class="client-check" data-index="${index}"
              onclick="event.stopPropagation()" onchange="onClientCheckChange(${index})"
              aria-label="Выбрать ${escapeHtml(nick)}">`}
            <span class="client-title">${isDraft ? "＋ " : (index + 1) + ". "}${escapeHtml(nick)}</span>
          </div>
          ${actions}
        </div>
        <div class="client-meta-row">
          ${isDraft ? '<span class="client-badge">черновик</span>' : ""}
          ${priceBadge}
          <span class="client-badge">${client.orderCount || (client.basket || []).length || client.basketCount || 0} поз.</span>
          ${gapBadge}
          <span class="view-tap-hint">тап — состав</span>
        </div>
        <div class="delivery-info-box">${priceHtml}${note}${roleHint}${deliv}${preview}</div>
        <div class="client-order-details" id="${detailId}">${isDraft && !(client.basket && client.basket.length) ? '<p class="muted">Состав подтянется при сохранении (или дополни ✏️)</p>' : lines}</div>
      </div>`;
    }

    function renderMonthClientCard(client, index) {
      var nick = String(client.name || client.nick || client.client || "").trim() || ("#" + (index + 1));
      var gaps = clientGaps(client);
      var gapClass = gaps.length ? " is-gap" : "";
      var segLabel = client.segment || orderTypeToSegment_(resolveClientOrderType_(client)) || "";
      var seg = segLabel
        ? ('<span class="client-badge">' + escapeHtml(segLabel) + "</span>")
        : '<span class="client-badge" style="opacity:0.7;">тип?</span>';
      var gapBadge = gaps.length
        ? ('<span class="gap-badge">нет: ' + escapeHtml(gapLabels(gaps).join(", ")) + "</span>")
        : "";
      var addr = String(client.address || "").trim();
      var phone = String(client.phone || "").trim();
      var addrHtml = addr
        ? ('<div class="view-field" title="' + escapeHtml(addr) + '">📍 ' + escapeHtml(addr) + "</div>")
        : '<div class="view-field is-empty">📍 —</div>';
      var phoneHtml = phone
        ? ('<div class="view-field">' + escapeHtml(phone) + "</div>")
        : '<div class="view-field is-empty">тел —</div>';
      var stageBtn = viewDateOnlyMonth
        ? '<button type="button" class="view-card-act" disabled title="Дата вне недели" style="opacity:0.4">→</button>'
        : '<button type="button" class="view-card-act view-card-act-go" onclick="stageMonthClient(' + index + ')">→</button>';
      var remBtn = '<button type="button" class="view-card-act" title="Убрать из календаря" onclick="removeMonthClient(' + index + ',event)">✕</button>';
      var moveBtn = '<button type="button" class="view-card-act" title="Перенести на другую дату" onclick="crmMoveMonthClient(' + index + ',event)">🔄</button>';
      var editBtn = '<button type="button" class="view-card-act" title="Редактировать заказ" onclick="crmEditMonthClient(' + index + ',event)">✏️</button>';
      return '<div class="client-item-card view-month-card' + gapClass + '" id="monthCard_' + index + '">' +
        '<div class="client-main-row" onclick="toggleMonthDetail(' + index + ', event)">' +
        '<div class="client-title-wrap"><span class="client-title">' + escapeHtml(nick) + "</span></div>" +
        '<div class="client-right-block" onclick="event.stopPropagation()">' +
        editBtn + moveBtn + remBtn + stageBtn + "</div>" +
        "</div>" +
        addrHtml +
        phoneHtml +
        '<div class="client-meta-row">' + seg + gapBadge + ' <span class="view-tap-hint">тап</span></div>' +
        '<div class="client-order-details" id="monthDetails_' + index + '"><p class="muted">Загрузка состава…</p></div>' +
        "</div>";
    }

    async function removeMonthClient(index, event) {
      if (event) event.stopPropagation();
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var client = visible[index];
      if (!client) return;
      var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      var ok = await uiConfirmAsync("Убрать «" + client.name + "» из Календарь_Дат на эту дату?\nС недели / Прием заказов не трогаем.");
      if (!ok) return;
      try {
        var res = await apiGet({
          action: "removeCalendarClient",
          date: dateStr,
          client: client.name,
          matchKey: client.matchKey || "",
          _: String(Date.now())
        }, { timeoutMs: 30000, cacheTtlMs: 0, bypassInflight: true });
        if (!res || (res.status !== "success" && res.status !== "accepted" && !res.writeId && !res.sheetsVerified && !res.d1Verified)) {
          showToast("Не вышло: " + ((res && res.message) || res.status || "Deploy?"));
          return;
        }
        if (res.writeId || res.pendingSheets || res.sheetsVerified) {
          await confirmPeopleWriteSheets_(res, {
            doneMsg: "Точно убрано из календаря",
            pendingMsg: "Убираю из календаря…",
            failMsg: "Не убралось из таблицы",
            block: !!(res.writeId || res.pendingSheets) && !res.sheetsVerified
          });
        } else {
          showToast("Убрано из календаря");
        }
        try { apiCacheBustMem_(); } catch (eMem) {}
        await loadClientsForDay();
      } catch (e) {
        showToast(e.message || "Ошибка");
      }
    }
    window.removeMonthClient = removeMonthClient;

    async function stageMonthClient(index) {
      if (viewDateOnlyMonth) {
        showToast("Дата вне недели — сначала выбери Пн–Пт");
        return;
      }

      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var client = visible[index];
      if (!client) return;
      var key = client.matchKey || viewClientKey(client.name);
      if (key && draftKeys[key]) {
        showToast("Уже в черновике");
        return;
      }
      var staged = {
        name: client.name,
        matchKey: key,
        address: client.address || "",
        phone: client.phone || "",
        note: client.note || "",
        segment: client.segment || "",
        source: client.source || "",
        orderType: client.orderType || "",
        ppPartner: client.ppPartner || "",
        ppSlot: client.ppSlot || "",
        deliverySlot: client.deliverySlot || "",
        basket: client.basket || [],
        basketCount: client.basketCount || 0,
        gaps: [],
        _draft: true
      };
      staged.gaps = clientGaps(staged);
      viewTransferDraft.push(staged);
      renderViewLists();
      showToast("В черновик: " + client.name);

      if (!resolveClientOrderType_(staged)) {
        try { editDraftClient(viewTransferDraft.length - 1); } catch (eEd) {}
      } else if (resolveClientOrderType_(staged) === "bp" && !String(staged.ppPartner || "").trim()) {
        staged.ppPartner = "Другое";
        staged.gaps = clientGaps(staged);
      } else if (resolveClientOrderType_(staged) === "pp") {
        try { await ensureDraftClientPpSlot_(staged); } catch (ePp) {}
      }
    }
    window.stageMonthClient = stageMonthClient;

    async function ensureDraftClientPpSlot_(client) {
      if (!client) return true;
      if (resolveClientOrderType_(client) !== "pp") return true;
      if (String(client.ppSlot || "").trim() || Number(client.deliverySlot) >= 1) return true;
      var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      var day = (document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value) || "";
      var res = null;
      try {
        res = await apiGet(
          { action: "getPpFactCost", nick: client.name, day: day, date: dateStr },
          { timeoutMs: 12000, cacheTtlMs: 0 }
        );
      } catch (e) { res = null; }
      if (!res || res.status !== "success") return true;
      var n = Number(res.deliveries) || 0;
      if (!(n >= 2) || !res.needManualSlot) {
        if (res.deliverySlot >= 1 && n >= 2) {
          client.deliverySlot = Number(res.deliverySlot);
          client.ppSlot = res.ppSlot || (client.deliverySlot + "/" + n);
        }
        return true;
      }
      var suggested = Number(res.suggestedSlot || res.deliverySlot) || 1;
      var picked = await uiChoiceAsync(
        "ПП · " + (client.name || ""),
        "У клиента 2 доставки в месяц. Какая сейчас доставка?\n(один раз — дальше считаем от ответа)",
        [
          { label: suggested === 1 ? "ПП 1 ✓" : "ПП 1", value: "1", cls: suggested === 1 ? "btn-green" : "" },
          { label: suggested === 2 ? "ПП 2 ✓" : "ПП 2", value: "2", cls: suggested === 2 ? "btn-green" : "" }
        ]
      );
      if (!picked) return false;
      var slot = Number(picked) || 1;
      client.deliverySlot = slot;
      client.ppSlot = slot + "/" + n;
      return true;
    }

    async function ensureAllDraftPpSlots_() {
      for (var i = 0; i < viewTransferDraft.length; i++) {
        var c = viewTransferDraft[i];
        if (resolveClientOrderType_(c) !== "pp") continue;
        var ok = await ensureDraftClientPpSlot_(c);
        if (!ok) return false;
      }
      return true;
    }

    function stageAllFromMonth() {
      if (viewDateOnlyMonth) {
        showToast("Дата вне недели — сначала выбери Пн–Пт");
        return;
      }
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var n = 0;
      (monthClientsCache || []).forEach(function (client) {
        var key = client.matchKey || viewClientKey(client.name);
        if (key && draftKeys[key]) return;
        viewTransferDraft.push({
          name: client.name,
          matchKey: key,
          address: client.address || "",
          phone: client.phone || "",
          note: client.note || "",
          segment: client.segment || "",
          ppSlot: client.ppSlot || "",
          deliverySlot: client.deliverySlot || "",
          basket: client.basket || [],
          basketCount: client.basketCount || 0,
          gaps: clientGaps(client),
          _draft: true
        });
        if (key) draftKeys[key] = true;
        n++;
      });
      renderViewLists();
      showToast(n ? ("В черновик: " + n) : "Некого добавлять");
    }
    window.stageAllFromMonth = stageAllFromMonth;

    function unstageDraftClient(index, event) {
      if (event) event.stopPropagation();
      viewTransferDraft.splice(index, 1);
      renderViewLists();
    }
    window.unstageDraftClient = unstageDraftClient;

    function clearViewTransferDraft() {
      viewTransferDraft = [];
      renderViewLists();
      showToast("Черновик очищен");
    }
    window.clearViewTransferDraft = clearViewTransferDraft;

    function toggleDraftDetail(index, event) {
      if (event && event.target.closest("button")) return;
      var el = document.getElementById("draftDetails_" + index);
      if (!el) return;
      el.classList.toggle("open");
      el.style.display = el.classList.contains("open") ? "block" : "none";
    }
    window.toggleDraftDetail = toggleDraftDetail;

    async function editDraftClient(index, event) {
      if (event) event.stopPropagation();
      var client = viewTransferDraft[index];
      if (!client) return;
      var curOt = resolveClientOrderType_(client) || "";
      var partners = [];
      try { partners = await fetchPartnersList_(false); } catch (eP) { partners = []; }
      var activePartners = (partners || []).filter(function (p) { return p.active !== false; });
      var curPart = String(client.ppPartner || "").trim();
      var partnerOpts = '<option value="">— выберите партнёра —</option>' +
        activePartners.map(function (p) {
          var sel = (p.name === curPart) ? " selected" : "";
          return '<option value="' + escapeHtml(p.name) + '"' + sel + ">" + escapeHtml(p.name) + "</option>";
        }).join("") +
        '<option value="Другое"' + (curPart === "Другое" ? " selected" : "") + ">Другое</option>";
      var html =
        '<div class="modal-title">Дополнить: ' + escapeHtml(client.name) + "</div>" +
        '<div class="form-group"><label>Тип заказа</label>' +
        '<div class="seg-row" id="draftOrderTypeRow" style="margin-top:6px;">' +
        '<button type="button" class="seg-btn' + (curOt === "pp" ? " active" : "") + '" data-ot="pp">ПП</button>' +
        '<button type="button" class="seg-btn' + (curOt === "bp" ? " active" : "") + '" data-ot="bp">БП</button>' +
        '<button type="button" class="seg-btn' + (curOt === "retail" ? " active" : "") + '" data-ot="retail">Розница</button>' +
        '<button type="button" class="seg-btn' + (curOt === "partner" ? " active" : "") + '" data-ot="partner">Партнёр</button>' +
        "</div>" +
        (curOt ? "" : '<div class="muted" style="font-size:12px;margin-top:4px;color:#ff9f0a;">Тип не указан — выбери перед сохранением</div>') +
        "</div>" +
        '<div class="form-group" id="draftPpPartnerGroup" style="display:' + (curOt === "bp" ? "block" : "none") + ';">' +
        '<label>Партнёр (кто привёл в БП) *</label>' +
        '<select id="draftPpPartnerSelect" style="width:100%;height:42px;border-radius:10px;background:#111;color:#fff;border:1px solid var(--border-color);">' +
        partnerOpts + "</select>" +
        '<div class="muted" style="font-size:11px;margin-top:4px;">Список — в меню «Партнёры»</div></div>' +
        '<div class="form-group"><label>Адрес</label><input type="text" id="draftEditAddr" value="' +
        escapeHtml(client.address || "") + '"></div>' +
        '<div class="form-group"><label>Телефон</label><input type="text" id="draftEditPhone" value="' +
        escapeHtml(client.phone || "") + '" inputmode="tel"></div>' +
        '<div class="form-group"><label>Примечание</label><input type="text" id="draftEditNote" value="' +
        escapeHtml(humanVisibleNote(client.note || "", "mgr").text) + '"></div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:8px;">ПП/АФК/БП — состав с листа при сохранении (если тип известен). Розница/партнёр — набери состав вручную.</div>' +
        '<button type="button" class="btn-action btn-blue" id="draftEditSave">Ок</button>' +
        '<button type="button" class="btn-action btn-orange" id="draftEditOrder" style="margin-top:8px;">Набрать состав в Заказе</button>';
      openModal(html);
      var draftOt = curOt;
      var row = document.getElementById("draftOrderTypeRow");
      if (row) {
        row.querySelectorAll("[data-ot]").forEach(function (btn) {
          btn.onclick = function () {
            draftOt = btn.getAttribute("data-ot") || "";
            row.querySelectorAll("[data-ot]").forEach(function (b) {
              b.classList.toggle("active", b === btn);
            });
            var pg = document.getElementById("draftPpPartnerGroup");
            if (pg) pg.style.display = draftOt === "bp" ? "block" : "none";
          };
        });
      }
      function applyDraftFields_() {
        client.address = (document.getElementById("draftEditAddr").value || "").trim();
        client.phone = (document.getElementById("draftEditPhone").value || "").trim();
        client.note = (document.getElementById("draftEditNote").value || "").trim();
        if (draftOt) {
          var prevSeg = String(client.segment || '').toUpperCase();

          if (!(draftOt === 'pp' && prevSeg === 'АФК')) {
            client.segment = orderTypeToSegment_(draftOt);
          }
          client.orderType = draftOt;
          client.source = draftOt;
        }
        if (draftOt === "bp") {
          var ps = document.getElementById("draftPpPartnerSelect");
          client.ppPartner = ps ? String(ps.value || "").trim() : "";
        }
        client.gaps = clientGaps(client);
      }
      document.getElementById("draftEditSave").onclick = function () {
        applyDraftFields_();
        if (!resolveClientOrderType_(client)) {
          showToast("Выбери тип заказа");
          return;
        }
        if (draftOt === "bp" && !String(client.ppPartner || "").trim()) {
          client.ppPartner = "Другое";
        }
        closeModal();
        renderViewLists();
        showToast("Данные в черновике");
      };
      document.getElementById("draftEditOrder").onclick = async function () {
        applyDraftFields_();
        if (!resolveClientOrderType_(client)) {
          showToast("Сначала выбери тип заказа");
          return;
        }
        if (draftOt === "bp" && !String(client.ppPartner || "").trim()) {
          client.ppPartner = "Другое";
        }
        closeModal();
        var day = document.getElementById("viewDaySelect").value;
        var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
        document.getElementById("isEditMode").value = "false";
        editOriginalClient = "";
        editOriginalDay = "";
        document.getElementById("appHeaderTitle").innerText = "Черновик: " + client.name;
        document.getElementById("btnMainSave").innerText = "В черновик (не в таблицу)";
        if (day) document.getElementById("day").value = day;
        if (dateStr && document.getElementById("deliveryDate")) document.getElementById("deliveryDate").value = dateStr;
        document.getElementById("client").value = client.name;
        fillAddressFieldsFromStored_(client.address || "");
        var phoneEl = document.getElementById("phoneInput");
        if (phoneEl) phoneEl.value = client.phone || "";
        loadOrderNotesFromRaw(client.note || "");
        try { setOrderType(resolveClientOrderType_(client) || "retail"); } catch (eOt) {}
        if (draftOt === "bp") {
          try { await ensurePpPartnerOptions_(client.ppPartner || ""); } catch (ePar2) {}
        }
        basket = (client.basket || []).map(function (g) {
          return {
            id: Date.now() + Math.random(),
            cat: g.cat || "other",
            main: g.name || g.main,
            name: g.name || g.main,
            sub: g.sub || "",
            value: g.val != null ? g.val : g.value,
            val: g.val != null ? g.val : g.value
          };
        });
        window._viewDraftEditIndex = index;
        renderBasket();
        switchTab("orderScreen");
        recoverUiFocus();
        showToast("Состав вернётся в черновик кнопкой «В черновик»");
      };
    }
    window.editDraftClient = editDraftClient;

    function applyOrderBasketToViewDraft() {
      var idx = window._viewDraftEditIndex;
      if (idx == null || !viewTransferDraft[idx]) return false;
      var client = viewTransferDraft[idx];
      client.address = (document.getElementById("addressInput") && document.getElementById("addressInput").value) || client.address;
      var phoneEl = document.getElementById("phoneInput");
      if (phoneEl) client.phone = phoneEl.value || client.phone;
      client.basket = (basket || []).map(function (g) {
        return { cat: g.cat, name: g.name || g.main, main: g.main || g.name, sub: g.sub || "", val: g.val != null ? g.val : g.value };
      });
      client.basketCount = client.basket.length;
      if (orderType) {
        client.orderType = orderType;
        client.source = orderType;
        client.segment = orderTypeToSegment_(orderType) || client.segment || "";
      }
      if (orderType === "bp") {
        var ps = document.getElementById("ppPartnerSelect");
        client.ppPartner = ps ? String(ps.value || "").trim() : (client.ppPartner || "");
      }
      client.gaps = clientGaps(client);
      window._viewDraftEditIndex = null;
      document.getElementById("btnMainSave").innerText = "Сохранить заказ";
      document.getElementById("appHeaderTitle").innerText = "Бойня-Конвейер " + APP_VERSION;
      switchTab("clientsScreen");
      renderViewLists();
      showToast("Состав в черновике — нажми «Сохранить переносы»");
      return true;
    }
    window.applyOrderBasketToViewDraft = applyOrderBasketToViewDraft;

    async function saveViewTransferDraft() {
      if (!viewTransferDraft.length) {
        showToast("Черновик пуст");
        return;
      }
      var day = document.getElementById("viewDaySelect").value;
      var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      if (!day && !dateStr) {
        await uiAlertAsync("Сначала выбери день");
        return;
      }
      var noType = viewTransferDraft.filter(function (c) { return !resolveClientOrderType_(c); });
      if (noType.length) {
        await uiAlertAsync(
          "У " + noType.length + " чел. не указан тип заказа (ПП / БП / Розница / Партнёр).\n" +
          "Открой красную карточку (✏️) и выбери тип."
        );
        try { editDraftClient(viewTransferDraft.indexOf(noType[0])); } catch (eT) {}
        return;
      }
      var noPartner = viewTransferDraft.filter(function (c) {
        var ot = resolveClientOrderType_(c);
        return ot === "bp" && !String(c.ppPartner || "").trim();
      });
      if (noPartner.length) {
        noPartner.forEach(function (c) {
          c.ppPartner = "Другое";
          c.gaps = clientGaps(c);
        });
        showToast("БП без партнёра → «Другое» (" + noPartner.length + ")");
      }
      var red = viewTransferDraft.filter(function (c) { return clientGaps(c).length; });
      if (red.length) {
        var okGaps = await uiConfirmAsync(
          "У " + red.length + " чел. нет адреса/телефона/состава (красные).\nВсё равно сохранить? Состав для ПП/АФК/БП подтянется с листа, если тип известен."
        );
        if (!okGaps) return;
      }
      var slotsOk = await ensureAllDraftPpSlots_();
      if (!slotsOk) {
        showToast("Нужно выбрать ПП 1 или ПП 2");
        return;
      }
      var ok = await uiConfirmAsync("Записать в таблицу " + viewTransferDraft.length + " чел. на «" + (day || dateStr) + "»?");
      if (!ok) return;
      try {
        var draftSnap = viewTransferDraft.slice();
        viewTransferDraft = [];
        try { renderViewLists(); } catch (eRnd) {}
        showToast("Сохраняю " + draftSnap.length + " чел.…");
        var payload = {
          action: "pullClientsFromMonth",
          clients: JSON.stringify(draftSnap.map(function (c) {
            return {
              client: c.name,
              address: c.address || "",
              phone: c.phone || "",
              note: c.note || "",
              segment: c.segment || "",
              ppPartner: c.ppPartner || "",
              ppSlot: c.ppSlot || "",
              deliverySlot: c.deliverySlot || "",
              basket: c.basket && c.basket.length ? c.basket : null
            };
          }))
        };
        if (day) payload.day = day;
        else payload.date = dateStr;
        try { apiCacheBustMem_(); } catch (eClr) {}
        var res = await apiGet(payload, { timeoutMs: 60000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          viewTransferDraft = draftSnap;
          try { renderViewLists(); } catch (eR2) {}
          var msg = (res && res.message) || (res && res.result && res.result.message) || "ошибка";
          if (msg === "date_not_in_week") {
            await uiAlertAsync("Не удалось привязать дату к «Будущей неделе». Нужен Deploy Code.gs v7.10.85.");
            return;
          }
          if (msg === "unknown_action") {
            await uiAlertAsync("Нужен Deploy Code.gs (pullClientsFromMonth).\nПока можно жать → и «Сохранить» не сработает пачкой.");
            return;
          }
          await uiAlertAsync("Не удалось: " + msg);
          return;
        }
        var r = res.result || {};
        var lines = [];
        (r.items || []).forEach(function (it) {
          lines.push((it.client || "") + ": " + (it.outcome || ""));
        });
        showToast("Добавлено: " + (r.added || 0) + (r.already ? (", уже были: " + r.already) : "") + (r.failed ? (", ошибок: " + r.failed) : ""));
        if (lines.length && lines.length <= 12) {
          try { await uiAlertAsync(lines.join("\n")); } catch (eA) {}
        }
        await loadClientsForDay();
      } catch (e) {
        if (typeof draftSnap !== "undefined" && draftSnap && draftSnap.length && !viewTransferDraft.length) {
          viewTransferDraft = draftSnap;
          try { renderViewLists(); } catch (eR3) {}
        }
        await uiAlertAsync(e.message || "Ошибка сети / Deploy");
      }
    }
    window.saveViewTransferDraft = saveViewTransferDraft;

    async function loadClientsForDay() {
      const day = document.getElementById("viewDaySelect").value;
      const dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      const box = document.getElementById("clientsContainer");
      const monthBox = document.getElementById("monthClientsContainer");
      const summary = document.getElementById("totalDaySummaryContainer");
      const deployHint = document.getElementById("viewDeployHint");
      var loadSeq = ++_viewClientsLoadSeq;
      var requestedDay = String(day || "");
      var requestedDate = String(dateStr || "");
      viewDateOnlyMonth = false;
      viewFutureWrongDate = false;
      if (!day && !dateStr) {
        resetViewIdleIfEmpty();
        return;
      }
      if (summary) summary.innerHTML = "";
      if (deployHint) { deployHint.style.display = "none"; deployHint.textContent = ""; }
      // после move/delete не затираем список скелетоном — иначе «все пропали на 20с»
      var keepPeopleDom = !!window._peopleListKeepDom;
      if (keepPeopleDom) {
        try { window._peopleListKeepDom = false; } catch (eKeep) {}
      } else {
        var skel = viewLoadingSkeletonHtml();
        box.innerHTML = skel;
        if (monthBox) monthBox.innerHTML = skel;
      }
      try {
        // cutover: не сбрасываем кэш на каждый клик — D1 отвечает быстро; после save и так bust
        if (!window.__BOINYA_C_CUTOVER__) {
          try { apiCacheBustMem_("getViewCompare"); apiCacheBustMem_("getClients"); } catch (eClr) {}
        }

        var compareParams = { action: "getViewCompare" };
        if (dateStr) compareParams.date = dateStr;
        else compareParams.day = day;
        var forcePeopleList = !!window._peopleListForceFresh;
        // calendar-only дата: НЕ force — live Worker force отдаёт пустой month при живом D1/GAS
        // (заказы «как будто не внеслись» дальше недели). Неделя — force как раньше.
        var calendarDateLoad = !!(dateStr && !day);
        if (!calendarDateLoad && (forcePeopleList || window.__BOINYA_C_CUTOVER__)) {
          compareParams.force = "1";
          compareParams._ = String(Date.now());
        } else if (calendarDateLoad) {
          compareParams._ = String(Date.now());
        }

        var compareRes = null;
        try {
          compareRes = await apiGet(compareParams, {
            timeoutMs: window.__BOINYA_C_CUTOVER__ ? 18000 : 45000,
            cacheTtlMs: 0
          });
          if (forcePeopleList) window._peopleListForceFresh = false;
        } catch (eC) {
          compareRes = null;
        }
        if (loadSeq !== _viewClientsLoadSeq) return;
        var dayNow = document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value;
        var dateNow = document.getElementById("viewDate") && document.getElementById("viewDate").value;
        if (String(dayNow || "") !== requestedDay || String(dateNow || "") !== requestedDate) return;

        var needDeploy = !compareRes || compareRes.status !== "success" || !Array.isArray(compareRes.month);
        var dateNotInWeek = !!(compareRes && compareRes.dateNotInWeek);
        var futureSlot = !!(compareRes && (compareRes.futureSlot || compareRes.day === "Будущая неделя"));
        var futureDateMatches = !(compareRes && compareRes.futureDateMatches === false);

        var futureWrongDate = !!(futureSlot && compareRes && compareRes.futureDateMatches === false);
        viewFutureWrongDate = futureWrongDate;

        var linkedToWeek = !!(compareRes && compareRes.day) && !futureWrongDate;
        // «Будущая» / явный resolved day — не уводить в calendar-only
        // (иначе delete → removeCalendarClient и человек остаётся на листе недели).
        if (!futureWrongDate) {
          if (futureSlot || day === "Будущая неделя" || (compareRes && compareRes.day)) {
            linkedToWeek = true;
          }
        }

        viewDateOnlyMonth = !!(dateStr && !linkedToWeek);
        if (!dateStr && day) viewDateOnlyMonth = false;
        if (!futureWrongDate && (futureSlot || day === "Будущая неделя" || (compareRes && compareRes.day))) {
          viewDateOnlyMonth = false;
        }

        var week = [];
        var weekRes = null;
        if (!viewDateOnlyMonth && !futureWrongDate) {

          if (compareRes && compareRes.status === "success" && Array.isArray(compareRes.week) && compareRes.week.length) {
            week = compareRes.week;
            weekRes = { status: "success", day: compareRes.day || day, clients: week };
          } else {
            // пустой week[] из SWR/snap — НЕ считать ответом; добираем getClients (force)
            var weekParams = { action: "getClients" };
            if (dateStr && compareRes && compareRes.day) weekParams.day = compareRes.day;
            else if (day) weekParams.day = day;
            else if (compareRes && compareRes.day) weekParams.day = compareRes.day;
            else if (dateStr) weekParams.date = dateStr;
            if (weekParams.day || weekParams.date) {
              weekParams.force = "1";
              weekParams._ = String(Date.now());
              try {
                weekRes = await apiGet(weekParams, { timeoutMs: 22000, cacheTtlMs: 0 });
              } catch (eW) {
                weekRes = { status: "error", message: eW.message || String(eW), clients: [] };
              }
              if (loadSeq !== _viewClientsLoadSeq) return;
            }
            week = (weekRes && weekRes.status === "success" && Array.isArray(weekRes.clients))
              ? weekRes.clients
              : [];
          }
        } else if (futureWrongDate && compareRes && Array.isArray(compareRes.week)) {
          week = []; // явно пусто — дата не совпала с A1 «Будущей недели»
        }

        var month = (!needDeploy && compareRes && Array.isArray(compareRes.month)) ? compareRes.month : [];

        // дальше недели / calendar-only: всегда добрать D1 getClients (force viewCompare часто пустой)
        if (dateStr && (viewDateOnlyMonth || dateNotInWeek || calendarDateLoad || !(month && month.length))) {
          try {
            var calClients = await apiGet(
              { action: "getClients", date: dateStr, force: "1", _: String(Date.now()) },
              { timeoutMs: 18000, cacheTtlMs: 0 }
            );
            if (loadSeq !== _viewClientsLoadSeq) return;
            if (calClients && calClients.status === "success" && Array.isArray(calClients.clients)) {
              if (calClients.clients.length) {
                var seenCal = Object.create(null);
                (month || []).forEach(function (c) {
                  var k = viewClientKey(c && (c.name || c.client));
                  if (k) seenCal[k] = true;
                });
                calClients.clients.forEach(function (c) {
                  var k = viewClientKey(c && (c.name || c.client));
                  if (k && seenCal[k]) return;
                  if (k) seenCal[k] = true;
                  month = (month || []).concat([c]);
                });
              }
            }
          } catch (eCalCli) {}
        }

        const daySel = document.getElementById("viewDaySelect");
        var resolvedDay = (compareRes && compareRes.day) || (weekRes && weekRes.day) || (!dateStr ? day : "") || "";
        viewResolvedDayName = resolvedDay || "";

        if (futureWrongDate) resolvedDay = "";

        if (viewDateOnlyMonth && daySel) {
          daySel.selectedIndex = 0;
        } else if (dateStr && resolvedDay && daySel) {
          for (let i = 0; i < daySel.options.length; i++) {
            if (daySel.options[i].value === resolvedDay || daySel.options[i].text === resolvedDay) {
              daySel.selectedIndex = i;
              break;
            }
          }
        } else if (futureWrongDate && daySel) {
          daySel.selectedIndex = 0;
        }
        if (loadSeq !== _viewClientsLoadSeq) return;

        loadedClientsRawData = week.map(function (c) {
          var otW = resolveClientOrderType_(c);
          if (!c.segment) {
            var sm = String(c.note || "").match(/\[SEG:([^\]]+)\]/i);
            if (sm) c.segment = String(sm[1] || "").trim();
          }
          if (!c.segment && otW) c.segment = orderTypeToSegment_(otW);
          if (!c.source && otW) c.source = otW;
          c.gaps = clientGaps(c);
          return c;
        });
        monthClientsCache = month.map(function (c) {
          var otM = resolveClientOrderType_(c);
          if (!c.segment) {
            var smM = String(c.note || "").match(/\[SEG:([^\]]+)\]/i);
            if (smM) c.segment = String(smM[1] || "").trim();
          }
          if (!c.segment && otM) c.segment = orderTypeToSegment_(otM);
          if (!c.source && otM) c.source = otM;
          if (!c.orderCount && c.basket) c.orderCount = c.basket.length;
          c.gaps = clientGaps(c);
          return c;
        });

        if (viewDateOnlyMonth) {
          loadedClientsRawData = monthClientsCache.slice();
        }

        var weekKeys = {};
        loadedClientsRawData.forEach(function (c) {
          var k = viewClientKey(c.name);
          if (k) weekKeys[k] = true;
        });
        viewTransferDraft = viewTransferDraft.filter(function (d) {
          var k = d.matchKey || viewClientKey(d.name);
          return !(k && weekKeys[k]);
        });
        if (viewDateOnlyMonth) viewTransferDraft = [];

        const dayLabel = resolvedDay && !viewDateOnlyMonth ? (" · " + resolvedDay) : "";
        var dateShow = "";
        if (compareRes && compareRes.dateIso) dateShow = compareRes.dateIso;
        else if (compareRes && compareRes.date) dateShow = compareRes.date;
        else if (dateStr) dateShow = dateStr;
        const dateLabel = dateShow ? (" · " + dateShow) : "";

        try {
          var viewDateEl = document.getElementById("viewDate");
          if (viewDateEl && compareRes && compareRes.dateIso && !dateStr) {
            viewDateEl.value = compareRes.dateIso;
          } else if (viewDateEl && compareRes && compareRes.dateIso && dateStr && dateStr !== compareRes.dateIso) {

          }
          if (compareRes && compareRes.dateIso) lastViewDateIso = compareRes.dateIso;
          else if (dateStr) lastViewDateIso = dateStr;
        } catch (eSyncD) {}
        if (summary) {
          var sheetHint = (compareRes && compareRes.monthSheet) ? (" · " + compareRes.monthSheet) : "";
          var wd = "";
          try {
            if (dateShow) {
              var iso = String(dateShow).indexOf("-") > 0 ? dateShow : "";
              if (!iso && compareRes && compareRes.dateIso) iso = compareRes.dateIso;
              if (iso) {
                var wdNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
                var dt = new Date(iso + "T12:00:00");
                if (!isNaN(dt.getTime())) wd = " · " + wdNames[dt.getDay()];
              }
            }
          } catch (eWd) {}
          var futHint = "";
          if (futureWrongDate) futHint = " · слот «Будущая» занят другой датой";
          else if (futureSlot) futHint = " · → Будущая неделя";
          summary.innerHTML = '<div class="total-summary-badge">' +
            (viewDateOnlyMonth
              ? ("Календарь (вне недели): " + month.length + dateLabel + wd + sheetHint + " · правка без листа недели")
              : ("Неделя: " + week.length + dayLabel + dateLabel + wd + futHint)) +
            "</div>";
        }
        if (deployHint && needDeploy) {
          deployHint.style.display = "block";
          deployHint.textContent = "Календарь: нужен Deploy Code.gs (getViewCompare + Календарь_Дат).";
        }

        renderViewLists();
        try {
          syncMonthBadgeFromLoadedView_(
            (compareRes && compareRes.dateIso) || dateStr || "",
            week,
            month
          );
        } catch (eBadge) {}
        if (needDeploy && monthBox) {
          monthBox.innerHTML = '<div class="view-idle">Нужен Deploy Code.gs — Календарь_Дат не читается.</div>';
        }
      } catch (err) {
        var errIdle = '<div class="view-idle">Ошибка: ' + escapeHtml(err.message || String(err)) + "</div>";
        box.innerHTML = errIdle;
        if (monthBox) monthBox.innerHTML = errIdle;
        updateBatchBar();
      }
    }

    function syncMonthBadgeFromLoadedView_(iso, weekList, monthList) {
      iso = String(iso || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      var seen = Object.create(null);
      var segments = { "ПП": 0, "БП": 0, "Р": 0, "ПАРТНЁР": 0, other: 0 };
      var n = 0;
      [].concat(weekList || [], monthList || []).forEach(function (c) {
        if (!c) return;
        var mk = viewClientKey(c.name || c.client || c.nick || "");
        if (!mk || seen[mk]) return;
        seen[mk] = true;
        n++;
        var seg = orderTypeToSegment_(resolveClientOrderType_(c)) ||
          String(c.segment || "").trim().toUpperCase();
        if (seg === "ПП" || seg === "PP" || seg === "АФК" || seg === "AFK") segments["ПП"]++;
        else if (seg === "БП" || seg === "BP") segments["БП"]++;
        else if (seg === "Р" || seg === "R" || seg === "RETAIL" || seg === "РОЗНИЦА") segments["Р"]++;
        else if (seg.indexOf("ПАРТ") === 0 || seg === "PARTNER") segments["ПАРТНЁР"]++;
        else segments.other++;
      });
      if (!viewMonthOverviewCache || !Array.isArray(viewMonthOverviewCache.days)) {
        viewMonthOverviewCache = {
          status: "success",
          month: iso.slice(0, 7),
          days: [],
          total: 0
        };
      }
      var found = false;
      viewMonthOverviewCache.days = (viewMonthOverviewCache.days || []).map(function (d) {
        if (!d || d.dateIso !== iso) return d;
        found = true;
        // список Просмотра = факт (в т.ч. для fromWeekSheet: иначе бейдж 9, в дне 6)
        return Object.assign({}, d, {
          count: n,
          segments: segments,
          fromView: true,
          fromWeekSheet: !!d.fromWeekSheet
        });
      });
      if (!found) {
        viewMonthOverviewCache.days.push({
          dateIso: iso,
          count: n,
          segments: segments,
          fromView: true
        });
      }
      var tot = 0;
      viewMonthOverviewCache.days.forEach(function (d) {
        tot += Number(d.count) || 0;
      });
      viewMonthOverviewCache.total = tot;
      viewMonthOverviewCache.month = viewMonthOverviewCache.month || iso.slice(0, 7);
      if (viewSub === "month" && !viewMonthDayOpen) {
        try { renderMonthOverviewList_(viewMonthOverviewCache); } catch (eR) {}
      }
    }

    window.loadClientsForDay = loadClientsForDay;

    function toggleOrderDetail(index, event) {
      if (event && (event.target.closest(".crm-mini-btn") || event.target.closest(".client-check") || event.target.closest("button"))) return;
      const el = document.getElementById("details_" + index);
      if (!el) return;
      el.classList.toggle("open");
      if (el.classList.contains("open")) el.style.display = "block";
      else el.style.display = "none";
    }

    async function toggleMonthDetail(index, event) {
      if (event && event.target.closest("button")) return;
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var el = document.getElementById("monthDetails_" + index);
      if (!el) return;
      var opening = !el.classList.contains("open");
      el.classList.toggle("open", opening);
      el.style.display = opening ? "block" : "none";
      if (!opening) return;
      var client = visible[index];
      if (!client) { el.innerHTML = '<p class="muted">Нет данных</p>'; return; }
      if (client._detailHtml) { el.innerHTML = client._detailHtml; return; }
      el.innerHTML = '<p class="muted">Состав…</p>';
      var html = "";
      if (client.address) html += '<div class="delivery-line">Адрес: ' + escapeHtml(client.address) + "</div>";
      if (client.phone) html += '<div class="delivery-line">' + formatTelHtml(client.phone) + "</div>";
      var hn = humanVisibleNote(client.note || "", "mgr").text;
      if (hn) html += '<div class="delivery-line">Примечание: ' + escapeHtml(hn) + "</div>";
      if (client.segment) html += '<div class="delivery-line">Сегмент: ' + escapeHtml(client.segment) + "</div>";
      if (client.ppHint || client.ppSlot) {
        html += '<div class="delivery-line">Слот: ' + escapeHtml(client.ppHint || ("ПП " + client.ppSlot)) + "</div>";
      }
      if (client.ppPartner) {
        html += '<div class="delivery-line">Партнёр: ' + escapeHtml(client.ppPartner) + "</div>";
      }
      if (resolveClientOrderPrice(client) != null) {
        html += formatOrderPriceHtml(client);
      }
      try {
        var otM = resolveClientOrderType_(client);
        if (otM === "pp" || String(client.segment || "").toUpperCase() === "АФК") {
          var day = document.getElementById("viewDaySelect").value;
          var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
          var sug = await apiGet({
            action: "getPpOrderSuggest",
            nick: client.name,
            day: day || "",
            date: dateStr || ""
          }, { timeoutMs: 15000, cacheTtlMs: 20000 });
          var basket = (sug && (sug.proposedBasket || sug.monthlyBasket)) || [];
          client.basket = basket;
          client.basketCount = basket.length;
          client.gaps = clientGaps(client);
          html += '<div style="margin-top:8px;"><b>Состав</b></div>' + basketLinesHtml(basket);
          if (sug && sug.hint) html += '<div class="muted" style="font-size:11px;margin-top:6px;">' + escapeHtml(sug.hint) + "</div>";
        } else if (otM === "bp") {
          html += '<div class="muted" style="margin-top:8px;">Тип БП — состав наберёшь при переносе / в Заказе</div>';
        } else if (otM === "retail" || otM === "partner") {
          html += '<div class="muted" style="margin-top:8px;">Тип ' + (otM === "partner" ? "партнёр" : "розница") + " — состав вручную</div>";
        } else {
          html += '<div class="muted" style="margin-top:8px;color:#ff9f0a;">Тип не указан — при переносе спросим ПП/БП/Розница/Партнёр</div>';
        }
      } catch (e) {
        html += '<div class="muted" style="margin-top:8px;">Состав с листа не подтянулся</div>';
      }
      html += '<button type="button" class="btn-action btn-purple" style="margin-top:10px;" onclick="stageMonthClient(' +
        index + ')">В черновик →</button>';
      html += '<button type="button" class="btn-action btn-blue" style="margin-top:8px;" onclick="editMonthClientGaps(' +
        index + ')">Дополнить данные</button>';
      client._detailHtml = html;
      el.innerHTML = html;
      renderViewLists();
    }
    window.toggleMonthDetail = toggleMonthDetail;

    async function editMonthClientGaps(index) {
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var client = visible[index];
      if (!client) return;

      // вне недели — сразу в заказ (calendar-only), без stage на Пн–Пт
      if (viewDateOnlyMonth) {
        await crmEditMonthClient(index);
        return;
      }
      stageMonthClient(index);
      var di = viewTransferDraft.length - 1;
      if (di >= 0) editDraftClient(di);
    }
    window.editMonthClientGaps = editMonthClientGaps;

    async function crmEditMonthClient(index, event) {
      if (event) event.stopPropagation();
      try { window._viewDraftEditIndex = null; } catch (eDraft) {}
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var client = visible[index];
      if (!client) return;
      var dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || lastViewDateIso || "";
      // подтянуть состав, если в карточке месяца его ещё нет
      if (!(client.basket && client.basket.length) && client._detailHtml) {
        try {
          await toggleMonthDetail(index, { preventDefault: function () {}, stopPropagation: function () {} });
          client = visible[index] || client;
        } catch (eDet) {}
      }
      if (!(client.basket && client.basket.length)) {
        try {
          var packed = await apiGet({
            action: "getClients",
            date: dateStr,
            date_iso: dateStr,
            _: String(Date.now())
          }, { timeoutMs: 25000, cacheTtlMs: 0 });
          var list = (packed && packed.clients) || [];
          for (var li = 0; li < list.length; li++) {
            if (viewClientKey(list[li].name) === viewClientKey(client.name) || list[li].name === client.name) {
              if (list[li].basket && list[li].basket.length) client.basket = list[li].basket;
              if (!client.address && list[li].address) client.address = list[li].address;
              if (!client.phone && list[li].phone) client.phone = list[li].phone;
              if (!client.note && list[li].note) client.note = list[li].note;
              if (!client.segment && list[li].segment) client.segment = list[li].segment;
              if (!client.source && list[li].source) client.source = list[li].source;
              break;
            }
          }
        } catch (ePack) {}
      }
      // день слота только если дата на текущей неделе
      var dayForEdit = "";
      if (!viewDateOnlyMonth) {
        try {
          var resolved = await resolveMoveTargetFromDate_(dateStr);
          if (resolved && resolved.onWeek && resolved.newDay) dayForEdit = String(resolved.newDay);
        } catch (eRes) {}
      }
      document.getElementById("isEditMode").value = "true";
      editOriginalClient = client.name || "";
      editOriginalDay = dayForEdit || "";
      editOriginalMatchKey = client.matchKey || (typeof viewClientKey === "function" ? viewClientKey(client.name) : "") || "";
      document.getElementById("appHeaderTitle").innerText = "Изменение: " + client.name;
      document.getElementById("btnMainSave").innerText = "Обновить заказ";
      // пустой day обязателен для calendar-only — иначе saveBooking утащит в старый день недели
      if (document.getElementById("day")) document.getElementById("day").value = dayForEdit || "";
      var daySelEdit = document.getElementById("viewDaySelect");
      if (!dayForEdit && daySelEdit) daySelEdit.selectedIndex = 0;
      if (dateStr && document.getElementById("deliveryDate")) {
        document.getElementById("deliveryDate").value = dateStr;
      }
      var afterInp = document.getElementById("deliveryAfterInput");
      if (afterInp) afterInp.value = client.deliveryAfter || "";
      var beforeInp = document.getElementById("deliveryBeforeInput");
      if (beforeInp) beforeInp.value = client.deliveryBefore || "";
      document.getElementById("client").value = client.name;
      document.getElementById("client").readOnly = false;
      fillAddressFieldsFromStored_(client.address || "");
      const rawNote = client.note || "";
      const phoneEl = document.getElementById("phoneInput");
      if (phoneEl) phoneEl.value = client.phone || extractPhone(rawNote) || "";
      hideClientSuggest();
      const geoFromNote = parseGeoFromNote(rawNote);
      const geo = client.geo || geoFromNote;
      selectedAddressGeo = geo ? {
        lat: geo.lat,
        lon: geo.lon,
        address: client.address || "",
        yandexUrl: geo.yandexUrl || parseYandexUrlFromNote(rawNote) || ("https://yandex.ru/maps/?pt=" + geo.lon + "," + geo.lat + "&z=17&l=map")
      } : null;
      setAddressPickedHint(!!selectedAddressGeo);
      loadOrderNotesFromRaw(rawNote);
      const dm = parseDeliveryMethod(rawNote);
      selectedDeliveryMethod = dm;
      const office = parseOfficeAddress(rawNote);
      const poInput = document.getElementById("postOfficeInput");
      if (poInput) poInput.value = office || "";
      selectedPostOfficeGeo = null;
      if (dm) {
        document.getElementById("deliveryMethodGroup").style.display = "block";
        try { setOrderFoldOpen_("details", true); } catch (eFoldDm) {}
        setDeliveryMethod(dm);
      } else {
        document.getElementById("deliveryMethodGroup").style.display = "none";
        document.getElementById("postOfficeGroup").style.display = "none";
      }
      var ot = resolveClientOrderType_(client);
      if (!ot) {
        try { ot = await guessOrderTypeFromCrm_(client.name); } catch (eG) { ot = ""; }
      }
      if (ot) {
        try { setOrderType(ot); } catch (eOt) {}
      } else {
        showToast("Тип заказа не найден — выбери ПП / БП / Розница / Партнёр");
      }
      if (ot === "bp") {
        try { await ensurePpPartnerOptions_(client.ppPartner || ""); } catch (ePar) {}
      }
      if (ot === "partner") {
        try { applyPartnerCouponsFromClient_(client); } catch (eCoup) {}
      }
      var priceVal = resolveClientOrderPrice(client);
      var priceInp = document.getElementById("orderPriceInput");
      if (priceInp && priceVal != null && ot !== "bp") {
        priceInp.value = String(priceVal);
        if (ot === "retail") retailPriceManual = true;
      }
      if (ot === "pp") {
        var slotFromClient = 0;
        if (client.deliverySlot) slotFromClient = Number(client.deliverySlot) || 0;
        if (!slotFromClient && client.ppSlot) {
          var mSlot = String(client.ppSlot).match(/(\d+)/);
          if (mSlot) slotFromClient = Number(mSlot[1]) || 0;
        }
        if (slotFromClient === 1 || slotFromClient === 2) setPpDeliverySlot(slotFromClient);
        try { await refreshPpFactPrice(); } catch (ePpRef) {}
      }
      basket = (client.basket || []).map(function (g) {
        return {
          id: Date.now() + Math.random(),
          cat: g.cat || "other",
          main: g.name || g.main,
          name: g.name || g.main,
          sub: g.sub || "",
          value: g.val != null ? g.val : g.value,
          val: g.val != null ? g.val : g.value,
          dog: g.dog ? Number(g.dog) : 0
        };
      });
      orderDogCount = 1;
      orderActiveDog = 1;
      orderBaskets = { 1: basket.slice(), 2: [] };
      try { setOrderDogCount(1); } catch (eDog1) {}
      try { renderBasket(); } catch (eBasket) {}
      try { switchTab("orderScreen"); } catch (eTab) {}
      try {
        var os = document.getElementById("orderScreen");
        if (os && !os.classList.contains("active")) {
          getScreenNodes_().forEach(function (el) { el.classList.remove("active"); });
          os.classList.add("active");
        }
      } catch (eAct) {}
      recoverUiFocus();
      if (viewDateOnlyMonth) {
        showToast("Правка в календаре · " + dateStr);
      }
    }
    window.crmEditMonthClient = crmEditMonthClient;

    async function pullOneFromMonth(clientName) {

      var name = String(clientName || "").trim();
      if (!name) return;
      var idx = -1;
      for (var i = 0; i < monthClientsCache.length; i++) {
        if (viewClientKey(monthClientsCache[i].name) === viewClientKey(name) || monthClientsCache[i].name === name) {
          idx = i; break;
        }
      }
      if (idx < 0) {
        viewTransferDraft.push({
          name: name, matchKey: viewClientKey(name), address: "", phone: "", note: "",
          segment: "", basket: [], basketCount: 0, gaps: ["address", "phone", "basket"], _draft: true
        });
        renderViewLists();
        return;
      }

      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = monthClientsCache.filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var vIdx = visible.findIndex(function (c) {
        return viewClientKey(c.name) === viewClientKey(name) || c.name === name;
      });
      if (vIdx >= 0) stageMonthClient(vIdx);
    }
    window.pullOneFromMonth = pullOneFromMonth;

    async function refreshDayViews(dayHint, opts) {
      opts = opts || {};
      const viewDay = document.getElementById("viewDaySelect").value;
      const cutDay = document.getElementById("cuttingDaySelect").value;
      const courDay = document.getElementById("courierDaySelect").value;
      var jobs = [];
      if (dayHint && viewDay === dayHint) jobs.push(loadClientsForDay());
      else if (viewDay) jobs.push(loadClientsForDay());
      if (cutDay && (!dayHint || cutDay === dayHint)) jobs.push(loadCutting({ force: !!opts.force }));
      if (courDay && (!dayHint || courDay === dayHint)) jobs.push(loadCourier(true));
      if (jobs.length) await Promise.all(jobs);
    }

    function afterPeopleMutationDays_(days) {
      window._peopleListForceFresh = true;
      window._cuttingNeedRefresh = true;
      try { apiCacheBustMem_("getCutting"); } catch (e0) {}
      try { apiCacheBustMem_("getCourier"); } catch (e1) {}
      try { apiCacheBustMem_("getAssembly"); } catch (e2) {}
      try { apiCacheBustMem_("getClients"); } catch (e3) {}
      try { apiCacheBustMem_("getViewCompare"); } catch (e4) {}
      try { apiCacheBustMem_("getMonthOverview"); } catch (e5) {}
      try { apiCacheBustMem_("getWeekDayCounts"); } catch (e6) {}
      (days || []).forEach(function (d) {
        if (!d) return;
        try { invalidateOpsDayCaches_(d); } catch (eInv) {}
      });
    }

    function getSelectedClientIndexes() {
      return Array.from(document.querySelectorAll("#clientsContainer .client-check:checked"))
        .map(function (el) { return Number(el.getAttribute("data-index")); })
        .filter(function (i) { return !isNaN(i) && loadedClientsRawData[i]; });
    }

    function onClientCheckChange(index) {
      const card = document.getElementById("clientCard_" + index);
      const cb = document.querySelector('#clientsContainer .client-check[data-index="' + index + '"]');
      if (card && cb) card.classList.toggle("selected", !!cb.checked);
      updateBatchBar();
    }
    window.onClientCheckChange = onClientCheckChange;

    function updateBatchBar() {
      const idxs = getSelectedClientIndexes();
      const bar = document.getElementById("batchBar");
      const countEl = document.getElementById("batchCount");
      if (countEl) countEl.textContent = "Выбрано: " + idxs.length;
      if (bar) bar.classList.toggle("open", idxs.length > 0);
    }
    window.updateBatchBar = updateBatchBar;

    function selectAllViewClients(on) {
      document.querySelectorAll("#clientsContainer .client-check").forEach(function (cb) {
        cb.checked = !!on;
        const idx = Number(cb.getAttribute("data-index"));
        const card = document.getElementById("clientCard_" + idx);
        if (card) card.classList.toggle("selected", !!on);
      });
      updateBatchBar();
    }
    window.selectAllViewClients = selectAllViewClients;

    async function pickBatchCutRaw(count, newDay) {
      const cutP = openModal(
        '<div class="modal-title">Нарезка при переносе</div>' +
        '<div class="modal-text">Перенос <b>' + count + '</b> клиент(ов) → <b>' + escapeHtml(newDay) + '</b>.<br><br>' +
        'Нарезать сырьё на них в новом дне вместе со всеми?</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-action btn-orange" type="button" id="modalCutYes">Да, резать</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalCutNo">Нет — только перенос</button>' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
        '</div>'
      );
      setTimeout(function () {
        const y = document.getElementById("modalCutYes");
        const n = document.getElementById("modalCutNo");
        const c = document.getElementById("modalCancel");
        if (y) y.onclick = function () { closeModal("yes"); };
        if (n) n.onclick = function () { closeModal("no"); };
        if (c) c.onclick = function () { closeModal(null); };
      }, 0);
      return cutP;
    }

    async function crmBatchMove() {
      const idxs = getSelectedClientIndexes();
      if (!idxs.length) { showToast("Никого не выбрано"); return; }
      const oldDay = viewResolvedDayName || (document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value) || "";
      const oldDate = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      if (!oldDate && !oldDay) {
        await uiAlertAsync("Сначала открой дату или день в Просмотре.");
        return;
      }
      const names = idxs.map(function (i) { return loadedClientsRawData[i].name; });
      const pickedDate = await uiPickMoveDate(names.length + " чел.", oldDate);
      if (!pickedDate) return;
      const target = await resolveMoveTargetFromDate_(pickedDate);
      if (!target || !target.newDate) {
        await uiAlertAsync("Не удалось определить дату");
        return;
      }
      if (oldDate && target.newDate === oldDate) {
        await uiAlertAsync("Выберите другую дату");
        return;
      }

      const calendarOnly = (function () {
        if (viewDateOnlyMonth && !oldDay) return true;
        if (oldDay && target.onWeek && target.newDay) return false;
        if (!oldDay || target.calendarOnly) return true;
        return false;
      })();
      const newDay = calendarOnly ? "" : (target.newDay || "");
      const dateOnly = !!(!calendarOnly && newDay && oldDay && newDay === oldDay);
      const cutLabel = calendarOnly
        ? (target.newDate + " · календарь")
        : (target.newDate + (newDay ? (" · " + newDay) : ""));
      let cutRaw = "yes";

      if (!dateOnly) {
        cutRaw = await pickBatchCutRaw(names.length, cutLabel);
        if (!cutRaw) return;
      }
      const cutFlag = cutRaw === "yes" ? "1" : "0";
      let ok = 0;
      let fail = [];
      let surveys = 0;
      showToast("Переношу " + names.length + "…");
      for (let i = 0; i < names.length; i++) {
        try {
          var srcCl = loadedClientsRawData[idxs[i]] || {};
          var batchOt = resolveClientOrderType_(srcCl) || "";
          var batchSeg = String(srcCl.segment || "").trim() || orderTypeToSegment_(batchOt) || "";
          var batchParams = {
            action: "moveClient",
            client: names[i],
            oldDay: oldDay || "",
            newDay: newDay,
            oldDate: oldDate || "",
            newDate: target.newDate,
            dateOnly: dateOnly ? "1" : "0",
            calendarOnly: calendarOnly ? "1" : "0",
            cutRaw: cutFlag,
            matchKey: srcCl.matchKey || "",
            _: String(Date.now())
          };
          if (batchSeg) batchParams.segment = batchSeg;
          if (batchOt) {
            batchParams.orderType = batchOt;
            batchParams.source = batchOt;
          }
          const res = await apiGet(batchParams, { timeoutMs: 45000, cacheTtlMs: 0, bypassInflight: true });
          if (isPeopleWriteAccepted_(res)) {
            ok++;
            surveys += Number(res.surveysMoved || (res.dateSync && res.dateSync.surveys) || 0) || 0;
            if (res.writeId || res.pendingSheets) {
              try {
                confirmPeopleWriteSheets_(res, {
                  doneMsg: "Точно перенесено · " + names[i],
                  pendingMsg: "Переношу «" + names[i] + "»…",
                  failMsg: "Перенос не закрепился",
                  block: false
                });
              } catch (eConf) {}
            }
          } else fail.push(names[i] + " (" + ((res && (res.message || res.status)) || "?") + ")");
        } catch (e) {
          fail.push(names[i] + " (" + ((e && e.message) || "сеть") + ")");
        }
      }
      showToast(
        "Перенесено: " + ok +
        (surveys ? (", опросников: " + surveys) : "") +
        (fail.length ? ", ошибок: " + fail.length : "")
      );
      if (fail.length) await uiAlertAsync("Не удалось:\n" + fail.join("\n"));
      try { refreshDeferredBadge(true); } catch (eBd) {}
      try {
        apiCacheBustMem_("getViewCompare");
        apiCacheBustMem_("getClients");
        apiCacheBustMem_("getMonthOverview");
        apiCacheBustMem_("listSurvey");
        afterPeopleMutationDays_([oldDay, newDay]);
      } catch (eClr) {}
      await loadClientsForDay();
      try { await refreshDayViews(oldDay, { force: true }); } catch (eOld) {}
      if (!calendarOnly && newDay && oldDay && newDay !== oldDay) {
        try { await refreshDayViews(newDay, { force: true }); } catch (eNew) {}
      }
      try { await ensureMonthOverviewLoaded_({ force: true }); } catch (eOv) {}
      recoverUiFocus();
    }
    window.crmBatchMove = crmBatchMove;

    function deleteClientParams(clientName, day, matchKey) {
      // всегда resolved-слот (сегодняшний пн = «Будущая неделя»), не сырой select «Понедельник»
      const resolved = viewResolvedDayName || "";
      const params = {
        action: "deleteClient",
        client: clientName,
        day: day || resolved || "",
        _explicitDelete: "1",
        _userDelete: "1"
      };
      // дата только из поля Просмотра — НЕ lastViewDateIso (залипает с другого дня → снос не того слота)
      const dateStr =
        (document.getElementById("viewDate") && document.getElementById("viewDate").value) ||
        "";
      if (dateStr) params.date = dateStr;
      // если дата есть, а day похож на «чужой» weekday — подставить resolved
      if (resolved && params.day && params.day !== resolved && dateStr) {
        params.day = resolved;
      }
      if (matchKey) params.matchKey = matchKey;
      params._ = String(Date.now());
      return params;
    }

    async function crmBatchDelete() {
      const idxs = getSelectedClientIndexes();
      if (!idxs.length) { showToast("Никого не выбрано"); return; }
      const day = viewResolvedDayName || document.getElementById("viewDaySelect").value;
      const dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) ||
        (viewDateOnlyMonth ? (lastViewDateIso || "") : "");
      if (viewDateOnlyMonth) {
        if (!dateStr) {
          await uiAlertAsync("Нет даты для удаления из календаря.");
          return;
        }
        const namesM = idxs.map(function (i) { return loadedClientsRawData[i].name; });
        const keysM = idxs.map(function (i) {
          return loadedClientsRawData[i].matchKey || viewClientKey(loadedClientsRawData[i].name) || "";
        });
        const okConfirmM = await uiConfirmAsync(
          "Убрать из календаря " + namesM.length + " чел. на " + dateStr + "?\n\n" +
          namesM.slice(0, 8).join(", ") + (namesM.length > 8 ? "…" : "")
        );
        if (!okConfirmM) return;
        let okM = 0;
        let failM = [];
        showToast("Убираю " + namesM.length + "…");
        try { apiCacheBustMem_(); } catch (eMem) {}
        for (let i = 0; i < namesM.length; i++) {
          try {
            const res = await apiGet({
              action: "removeCalendarClient",
              date: dateStr,
              client: namesM[i],
              matchKey: keysM[i],
              _: String(Date.now())
            }, { timeoutMs: 45000, cacheTtlMs: 0, bypassInflight: true });
            if (isPeopleWriteAccepted_(res)) {
              okM++;
              if (res.writeId || res.pendingSheets) {
                try {
                  confirmPeopleWriteSheets_(res, {
                    doneMsg: "Точно убрано · " + namesM[i],
                    pendingMsg: "Убираю «" + namesM[i] + "»…",
                    failMsg: "Не убралось",
                    block: false
                  });
                } catch (eC0) {}
              }
            } else failM.push(namesM[i]);
          } catch (e) {
            failM.push(namesM[i] + " (" + ((e && e.message) || "сеть") + ")");
          }
        }
        showToast("Убрано: " + okM + (failM.length ? ", ошибок: " + failM.length : ""));
        if (failM.length) await uiAlertAsync("Не удалось:\n" + failM.join("\n"));
        await loadClientsForDay();
        recoverUiFocus();
        return;
      }
      if (!day) {
        await uiAlertAsync("Сначала выберите день недели в Просмотре.");
        return;
      }
      const names = idxs.map(function (i) { return loadedClientsRawData[i].name; });
      const keys = idxs.map(function (i) {
        return loadedClientsRawData[i].matchKey || viewClientKey(loadedClientsRawData[i].name) || "";
      });
      const okConfirm = await uiConfirmAsync("Удалить " + names.length + " клиент(ов)?\n\n" + names.slice(0, 8).join(", ") + (names.length > 8 ? "…" : "") +
        "\n\nУйдёт у всех: неделя + Календарь_Дат + бронь на дату.");
      if (!okConfirm) return;
      let ok = 0;
      let fail = [];
      showToast("Удаляю " + names.length + "…");
      try { apiCacheBustMem_(); } catch (eMem) {}
      for (let i = 0; i < names.length; i++) {
        try {
          const res = await apiGet(deleteClientParams(names[i], day, keys[i]), { timeoutMs: 45000, cacheTtlMs: 0, bypassInflight: true });
          if (isPeopleWriteAccepted_(res)) {
            ok++;
            if (res.writeId || res.pendingSheets) {
              try {
                confirmPeopleWriteSheets_(res, {
                  doneMsg: "Точно удалено · " + names[i],
                  pendingMsg: "Удаляю «" + names[i] + "»…",
                  failMsg: "Удаление не закрепилось",
                  block: false
                });
              } catch (eC1) {}
            }
          } else fail.push(names[i] + " (" + ((res && (res.message || res.status)) || "?") + ")");
        } catch (e) {
          fail.push(names[i] + " (" + ((e && e.message) || "сеть") + ")");
        }
      }
      showToast("Удалено: " + ok + (fail.length ? ", ошибок: " + fail.length : ""));
      if (fail.length) await uiAlertAsync("Не удалось:\n" + fail.join("\n"));
      try { afterPeopleMutationDays_([day]); } catch (eMut) {}
      await refreshDayViews(day, { force: true });
      recoverUiFocus();
    }
    window.crmBatchDelete = crmBatchDelete;

    let editOriginalClient = "";
    let editOriginalDay = "";
    let editOriginalMatchKey = "";

    async function crmEditClient(index, event) {
      event.stopPropagation();
      const client = loadedClientsRawData[index];
      if (!client) return;
      // календарь вне недели — тот же путь, что ✏️ на month-карточке
      if (viewDateOnlyMonth) {
        await crmEditMonthClient(index, event);
        return;
      }
      const day = document.getElementById("viewDaySelect").value;
      const dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || lastViewDateIso || "";
      document.getElementById("isEditMode").value = "true";
      editOriginalClient = client.name || "";
      editOriginalDay = day || "";
      editOriginalMatchKey = client.matchKey || (typeof viewClientKey === "function" ? viewClientKey(client.name) : "") || "";
      document.getElementById("appHeaderTitle").innerText = "Изменение: " + client.name;
      document.getElementById("btnMainSave").innerText = "Обновить заказ";
      // всегда выставляем day (в т.ч. пустой) — иначе остаётся вчерашний слот и save уезжает не туда
      if (document.getElementById("day")) document.getElementById("day").value = day || "";
      if (dateStr && document.getElementById("deliveryDate")) {
        document.getElementById("deliveryDate").value = dateStr;
      }
      var afterInp = document.getElementById("deliveryAfterInput");
      if (afterInp) afterInp.value = client.deliveryAfter || "";
      var beforeInp = document.getElementById("deliveryBeforeInput");
      if (beforeInp) beforeInp.value = client.deliveryBefore || "";
      document.getElementById("client").value = client.name;
      document.getElementById("client").readOnly = false;
      fillAddressFieldsFromStored_(client.address || "");
      const rawNote = client.note || "";
      const phoneEl = document.getElementById("phoneInput");
      if (phoneEl) phoneEl.value = client.phone || extractPhone(rawNote) || "";
      hideClientSuggest();
      const geoFromNote = parseGeoFromNote(rawNote);
      const geo = client.geo || geoFromNote;
      selectedAddressGeo = geo ? {
        lat: geo.lat,
        lon: geo.lon,
        address: client.address || "",
        yandexUrl: geo.yandexUrl || parseYandexUrlFromNote(rawNote) || ("https://yandex.ru/maps/?pt=" + geo.lon + "," + geo.lat + "&z=17&l=map")
      } : null;
      setAddressPickedHint(!!selectedAddressGeo);
      loadOrderNotesFromRaw(rawNote);
      const dm = parseDeliveryMethod(rawNote);
      selectedDeliveryMethod = dm;
      const office = parseOfficeAddress(rawNote);
      const poInput = document.getElementById("postOfficeInput");
      if (poInput) poInput.value = office || "";
      selectedPostOfficeGeo = null;
      if (dm) {
        document.getElementById("deliveryMethodGroup").style.display = "block";
        try { setOrderFoldOpen_("details", true); } catch (eFoldDm) {}
        setDeliveryMethod(dm);
      } else {
        document.getElementById("deliveryMethodGroup").style.display = "none";
        document.getElementById("postOfficeGroup").style.display = "none";
      }

      var ot = resolveClientOrderType_(client);
      if (!ot) {
        try { ot = await guessOrderTypeFromCrm_(client.name); } catch (eG) { ot = ""; }
      }
      if (ot) {
        try { setOrderType(ot); } catch (eOt) {}
      } else {
        showToast("Тип заказа не найден — выбери ПП / БП / Розница / Партнёр");
      }
      if (ot === "bp") {
        try {
          await ensurePpPartnerOptions_(client.ppPartner || "");
        } catch (ePar) {}
      }
      if (ot === "partner") {
        try { applyPartnerCouponsFromClient_(client); } catch (eCoup) {}
      }
      var priceVal = resolveClientOrderPrice(client);
      var priceInp = document.getElementById("orderPriceInput");
      if (priceInp && priceVal != null && ot !== "bp") {
        priceInp.value = String(priceVal);
        if (ot === "retail") retailPriceManual = true;
      }

      if (ot === "pp") {
        var slotFromClient = 0;
        if (client.deliverySlot) slotFromClient = Number(client.deliverySlot) || 0;
        if (!slotFromClient && client.ppSlot) {
          var mSlot = String(client.ppSlot).match(/(\d+)/);
          if (mSlot) slotFromClient = Number(mSlot[1]) || 0;
        }
        if (slotFromClient === 1 || slotFromClient === 2) {
          setPpDeliverySlot(slotFromClient);
        }
        try { await refreshPpFactPrice(); } catch (ePpRef) {}
      }
      basket = (client.basket || []).map(g => ({
        id: Date.now() + Math.random(),
        cat: g.cat || "other",
        main: g.name || g.main,
        name: g.name || g.main,
        sub: g.sub || "",
        value: g.val != null ? g.val : g.value,
        val: g.val != null ? g.val : g.value,
        dog: g.dog ? Number(g.dog) : 0
      }));
      var hasDog1 = basket.some(function (x) { return Number(x.dog) === 1; });
      var hasDog2 = basket.some(function (x) { return Number(x.dog) === 2; });
      var hasDogSplit = hasDog1 && hasDog2;
      if (hasDogSplit) {
        orderBaskets = { 1: [], 2: [] };
        basket.forEach(function (x) {
          var d = Number(x.dog) === 2 ? 2 : 1;
          orderBaskets[d].push(x);
        });
        if (!orderBaskets[1].length && basket.length) {
          orderBaskets[1] = basket.filter(function (x) { return Number(x.dog) !== 2; });
        }
        orderDogCount = 2;
        orderActiveDog = 1;
        basket = orderBaskets[1];
        try { setOrderDogCount(2); } catch (eDogEdit) {}
      } else {
        orderDogCount = 1;
        orderActiveDog = 1;
        orderBaskets = { 1: basket.slice(), 2: [] };
        try { setOrderDogCount(1); } catch (eDog1) {}
      }
      try {
        renderBasket();
      } catch (eBasket) {}
      try {
        switchTab("orderScreen");
      } catch (eTab) {}
      try {
        // flyout/async loadClients мог снять .active — добиваем
        var os = document.getElementById("orderScreen");
        if (os && !os.classList.contains("active")) {
          getScreenNodes_().forEach(function (el) { el.classList.remove("active"); });
          os.classList.add("active");
        }
      } catch (eAct) {}
      recoverUiFocus();
    }

    async function performViewClientMove_(opts) {
      opts = opts || {};
      var clientName = String(opts.name || "").trim();
      var matchKey = String(opts.matchKey || "").trim();
      var oldDay = String(opts.oldDay || "").trim();
      var oldDate = String(opts.oldDate || "").trim();
      if (!clientName) return false;
      if (!oldDate && !oldDay) {
        await uiAlertAsync("Нет исходной даты для переноса");
        return false;
      }
      var pickedDate = opts.pickedDate ? String(opts.pickedDate).trim() : "";
      if (!pickedDate) {
        pickedDate = await uiPickMoveDate(clientName, oldDate);
        if (!pickedDate) return false;
      }
      var target = opts.target || null;
      if (!target || !target.newDate) {
        target = await resolveMoveTargetFromDate_(pickedDate);
      }
      if (!target || !target.newDate) {
        await uiAlertAsync("Не удалось определить дату");
        return false;
      }
      if (oldDate && target.newDate === oldDate) {
        await uiAlertAsync("Выберите другую дату");
        return false;
      }
      var calendarOnly = !!(opts.forceCalendarOnly || viewDateOnlyMonth || !oldDay || target.calendarOnly);

      if (oldDay && target.onWeek && target.newDay && !viewDateOnlyMonth && !opts.forceCalendarOnly) {
        calendarOnly = false;
      }
      // есть целевой слот недели — не уводить в calendarOnly из‑за пустого oldDay
      if (!opts.forceCalendarOnly && !viewDateOnlyMonth && target.onWeek && target.newDay) {
        calendarOnly = false;
        if (!oldDay && oldDate) {
          try {
            var fromT = await resolveMoveTargetFromDate_(oldDate);
            if (fromT && fromT.onWeek && fromT.newDay) oldDay = String(fromT.newDay);
          } catch (eFrom) {}
        }
      }
      var newDay = calendarOnly ? "" : (target.newDay || "");
      var dateOnly = !!(!calendarOnly && newDay && oldDay && newDay === oldDay);
      var cutLabel = calendarOnly
        ? (target.newDate + (oldDay ? (" · с «" + oldDay + "»") : "") + " · календарь")
        : (target.newDate + (newDay ? (" · " + newDay) : ""));
      var cutRaw = opts.cutRaw != null ? String(opts.cutRaw) : "";

      if (!cutRaw && !dateOnly) {
        var cutP = openModal(
          '<div class="modal-title">Перенос клиента</div>' +
          '<div class="modal-text">Перенос <b>' + escapeHtml(clientName) + '</b> → <b>' + escapeHtml(cutLabel) + '</b>.<br><br>' +
          'Открытые опросники и даты в карточке БП сдвинутся на тот же срок.<br><br>' +
          'Нарезать сырьё на этого клиента в новом дне вместе со всеми?</div>' +
          '<div class="modal-actions">' +
            '<button class="btn-action btn-orange" type="button" id="modalCutYes">Да, резать</button>' +
            '<button class="btn-action btn-blue" type="button" id="modalCutNo">Нет — только перенос</button>' +
            '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          "</div>"
        );
        setTimeout(function () {
          var y = document.getElementById("modalCutYes");
          var n = document.getElementById("modalCutNo");
          var c = document.getElementById("modalCancel");
          if (y) y.onclick = function () { closeModal("yes"); };
          if (n) n.onclick = function () { closeModal("no"); };
          if (c) c.onclick = function () { closeModal(null); };
        }, 0);
        cutRaw = await cutP;
        if (!cutRaw) return false;
      }
      if (!cutRaw) cutRaw = "yes";
      var moveClientRef = opts.client || null;
      var moveSeg = String(opts.segment || "").trim();
      var moveOt = String(opts.orderType || opts.source || "").trim();
      if (moveClientRef && !moveSeg && !moveOt) {
        moveOt = resolveClientOrderType_(moveClientRef) || "";
        moveSeg =
          String(moveClientRef.segment || "").trim() ||
          orderTypeToSegment_(moveOt) ||
          "";
      }
      try {
        showToast("Переношу…");
        var moveParams = {
          action: "moveClient",
          client: clientName,
          oldDay: oldDay || "",
          newDay: newDay,
          oldDate: oldDate || "",
          newDate: target.newDate,
          dateOnly: dateOnly ? "1" : "0",
          calendarOnly: calendarOnly ? "1" : "0",
          cutRaw: cutRaw === "yes" ? "1" : "0",
          matchKey: matchKey,
          _: String(Date.now())
        };
        if (moveSeg) moveParams.segment = moveSeg;
        if (moveOt) {
          moveParams.orderType = moveOt;
          moveParams.source = moveOt;
        }
        var res = await apiGet(moveParams, { timeoutMs: 16000, cacheTtlMs: 0, bypassInflight: true });
        if (!res || (res.status !== "success" && res.status !== "accepted" && !res.sent_opaque && !res.sheetsVerified && !res.d1Verified && !res.writeId)) {
          await uiAlertAsync("Не удалось: " + ((res && (res.message || res.status)) || "ошибка"));
          return false;
        }

        var svN = Number(res.surveysMoved || (res.dateSync && res.dateSync.surveys) || 0) || 0;
        var bpMetaN = Number((res.dateSync && res.dateSync.bpMeta) || 0) || 0;
        var baseMsg = calendarOnly
          ? ("Точно перенесено на " + target.newDate)
          : (dateOnly
            ? ("Точно дата → " + target.newDate)
            : (cutRaw === "yes" ? "Точно перенесено (резать)" : "Точно перенесено"));
        if (svN || bpMetaN) baseMsg += " · опрос " + svN + (bpMetaN ? (" · meta БП " + bpMetaN) : "");
        else if (res.dateSync && res.dateSync.surveyError) baseMsg += " · опрос не сдвинут";

        var pendingWrite = !!(res.writeId || res.pendingSheets) && !res.sheetsVerified;
        // сразу убрать с текущего экрана — не ждать Sheets
        try {
          loadedClientsRawData = (loadedClientsRawData || []).filter(function (c) {
            return !nicksMatchClient_(c && c.name, clientName);
          });
          monthClientsCache = (monthClientsCache || []).filter(function (c) {
            return !nicksMatchClient_(c && c.name, clientName);
          });
          renderViewLists();
        } catch (eOptMv) {}
        if (pendingWrite) {
          var confirmMv = await confirmPeopleWriteSheets_(res, {
            doneMsg: baseMsg,
            pendingMsg: "Переношу в таблицу…",
            failMsg: "Перенос не закрепился в таблице",
            block: false
          });
          if (!confirmMv.ok && !confirmMv.softTimeout) {
            await uiAlertAsync(
              "Перенос не закрепился: «" + clientName + "».\n" +
              ((confirmMv.message || confirmMv.res && confirmMv.res.message) || "попробуй ещё раз")
            );
            try {
              apiCacheBustMem_("getClients");
              afterPeopleMutationDays_([oldDay, newDay]);
              window._peopleListKeepDom = true;
              await loadClientsForDay();
            } catch (eReloadP) {}
            return false;
          }
          if (confirmMv.res) res = confirmMv.res;
        }

        var moveOk = true;
        var effectiveOldDay = String((res && (res.from || res.oldDay)) || oldDay || "").trim();
        var effectiveNewDay = String((res && (res.newDay || (res.to && !/^\d{4}-\d{2}-\d{2}$/.test(String(res.to)) ? res.to : ""))) || newDay || "").trim();
        var effectiveNewDate = String((res && (res.newDate || (res.to && /^\d{4}-\d{2}-\d{2}$/.test(String(res.to)) ? res.to : ""))) || target.newDate || "").trim();
        var destLabel = effectiveNewDay || effectiveNewDate || "новую дату";
        var wroteOk = !!(res && (res.status === "success" || res.status === "accepted") && (
          Number(res.wrote) > 0 ||
          res.sheetsVerified ||
          res.pendingSheets ||
          res.writeId ||
          res.alreadyMoved ||
          (res.d1Verified && !res.optimistic)
        ) && !res.sent_opaque && res.status !== "online" && !/жив/i.test(String(res.msg || "")));

        if (!pendingWrite && !calendarOnly && !dateOnly && effectiveOldDay && effectiveNewDay && effectiveOldDay !== effectiveNewDay) {
          async function clientOnDay_(dayName) {
            try {
              var chk = await apiGet({
                action: "getClients",
                day: dayName,
                force: "1",
                _: String(Date.now())
              }, { timeoutMs: 12000, cacheTtlMs: 0, __boinyaNoSnap: true });
              var list = (chk && chk.clients) || [];
              for (var ci = 0; ci < list.length; ci++) {
                if (nicksMatchClient_(list[ci].name || list[ci].client, clientName)) return true;
              }
              return false;
            } catch (eChk) {
              return null;
            }
          }
          var onOld = await clientOnDay_(effectiveOldDay);
          var onNew = await clientOnDay_(effectiveNewDay);
          // явный провал: всё ещё на старом и нет на новом
          if (onOld === true && onNew === false) {
            try {
              await apiGet({
                action: "moveClient",
                client: clientName,
                oldDay: effectiveOldDay || "",
                newDay: effectiveNewDay,
                oldDate: oldDate || "",
                newDate: target.newDate,
                dateOnly: "0",
                calendarOnly: "0",
                cutRaw: cutRaw === "yes" ? "1" : "0",
                matchKey: matchKey,
                force: "1",
                _: String(Date.now())
              }, { timeoutMs: 22000, cacheTtlMs: 0 });
              onOld = await clientOnDay_(effectiveOldDay);
              onNew = await clientOnDay_(effectiveNewDay);
            } catch (eRetryM) {}
          }
          if (onOld === true && onNew === false) {
            moveOk = false;
          } else {
            moveOk = true; // wroteOk или сеть — не блокируем ложным fail
          }
        } else if (!pendingWrite && (calendarOnly || dateOnly)) {
          var stillOld = effectiveOldDay
            ? await clientVisibleOnView_(clientName, effectiveOldDay, "")
            : null;
          var onTarget = await clientVisibleOnView_(clientName, effectiveNewDay, effectiveNewDate || target.newDate || "");
          if (stillOld === true && onTarget === false) {
            try {
              await apiGet({
                action: "moveClient",
                client: clientName,
                oldDay: oldDay || "",
                newDay: newDay || "",
                oldDate: oldDate || "",
                newDate: target.newDate,
                dateOnly: dateOnly ? "1" : "0",
                calendarOnly: calendarOnly ? "1" : "0",
                cutRaw: cutRaw === "yes" ? "1" : "0",
                matchKey: matchKey,
                force: "1",
                _: String(Date.now())
              }, { timeoutMs: 22000, cacheTtlMs: 0 });
              stillOld = effectiveOldDay
                ? await clientVisibleOnView_(clientName, effectiveOldDay, "")
                : null;
              onTarget = await clientVisibleOnView_(clientName, effectiveNewDay, effectiveNewDate || target.newDate || "");
            } catch (eCalR) {}
          }
          if (stillOld === true && onTarget === false && !wroteOk) {
            moveOk = false;
          } else {
            moveOk = true;
          }
        }
        if (!moveOk) {
          await uiAlertAsync(
            "Не перенеслось: «" + clientName + "» всё ещё на «" + (effectiveOldDay || oldDate || "?") +
            "» и нет на «" + destLabel + "».\n" +
            "Попробуй ещё раз или обнови список."
          );
          try {
            apiCacheBustMem_("getClients");
            afterPeopleMutationDays_([effectiveOldDay, effectiveNewDay]);
            await loadClientsForDay();
          } catch (eReload) {}
          return false;
        }

        if (!pendingWrite && (res.writeId || res.pendingSheets || res.sheetsVerified)) {
          await confirmPeopleWriteSheets_(res, {
            doneMsg: baseMsg,
            pendingMsg: "Переношу в таблицу…",
            failMsg: "Перенос не закрепился в таблице",
            block: false
          });
        } else if (!pendingWrite) {
          showToast(baseMsg.replace(/^Точно /, ""));
        }
        try {
          setTimeout(function () {
            runWarehouseCheckAfterSave_({
              client: clientName,
              day: (res && res.newDay) || newDay || "",
              date: (target && target.newDate) || (res && res.dayDate) || "",
              basket: null
            });
          }, 400);
        } catch (eWhM) {}
        try {
          apiCacheBustMem_("getViewCompare");
          apiCacheBustMem_("getClients");
          apiCacheBustMem_("getMonthOverview");
          apiCacheBustMem_("listSurvey");
          afterPeopleMutationDays_([oldDay, newDay]);
        } catch (eClr) {}
        try { window._peopleListKeepDom = true; window._peopleListForceFresh = true; } catch (eK) {}
        await loadClientsForDay();
        // один мягкий refresh без второго скелетона
        try {
          window._peopleListKeepDom = true;
          await refreshDayViews(oldDay || newDay, { force: false });
        } catch (eR0) {}
        try { await ensureMonthOverviewLoaded_({ force: true }); } catch (eOv) {}
        return true;
      } catch (err) {
        await uiAlertAsync(err.message || String(err));
        return false;
      } finally {
        recoverUiFocus();
      }
    }

    async function crmMoveClient(index, event) {
      if (event) event.stopPropagation();
      const client = loadedClientsRawData[index];
      if (!client) return;
      const oldDay = viewResolvedDayName || (document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value) || "";
      const oldDate = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      await performViewClientMove_({
        name: client.name,
        matchKey: client.matchKey || "",
        oldDay: oldDay,
        oldDate: oldDate,
        forceCalendarOnly: !!viewDateOnlyMonth && !oldDay,
        client: client
      });
    }
    window.crmMoveClient = crmMoveClient;

    async function crmMoveMonthClient(index, event) {
      if (event) event.stopPropagation();
      var draftKeys = {};
      viewTransferDraft.forEach(function (d) {
        var k = d.matchKey || viewClientKey(d.name);
        if (k) draftKeys[k] = true;
      });
      var visible = (monthClientsCache || []).filter(function (c) {
        var k = c.matchKey || viewClientKey(c.name);
        return !(k && draftKeys[k]);
      });
      var client = visible[index];
      if (!client) return;
      var oldDay = viewResolvedDayName || (document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value) || "";
      var oldDate = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      await performViewClientMove_({
        name: client.name,
        matchKey: client.matchKey || viewClientKey(client.name) || "",
        oldDay: oldDay,
        oldDate: oldDate,
        forceCalendarOnly: !!viewDateOnlyMonth && !oldDay,
        client: client
      });
    }
    window.crmMoveMonthClient = crmMoveMonthClient;

    async function crmDeleteClient(index, event) {
      event.stopPropagation();
      const client = loadedClientsRawData[index];
      if (!client) return;
      const day = viewResolvedDayName || document.getElementById("viewDaySelect").value;
      const dateStr = (document.getElementById("viewDate") && document.getElementById("viewDate").value) || "";
      if (viewDateOnlyMonth) {
        const okM = await uiConfirmAsync(
          "Убрать «" + client.name + "» из календаря на " + (dateStr || "эту дату") + "?\n\nЛист недели не трогаем (даты нет в текущей неделе)."
        );
        if (!okM) return;
        try {
          try { apiCacheBustMem_(); } catch (eMem) {}
          const resM = await apiGet({
            action: "removeCalendarClient",
            date: dateStr,
            client: client.name,
            matchKey: client.matchKey || viewClientKey(client.name) || "",
            _: String(Date.now())
          }, { timeoutMs: 16000, cacheTtlMs: 0 });
          if (!resM || (resM.status !== "success" && resM.status !== "accepted" && !resM.sent_opaque && !resM.sheetsVerified && !resM.d1Verified)) {
            await uiAlertAsync("Не удалось: " + ((resM && resM.message) || resM.status || "ошибка"));
            return;
          }
          if (resM.writeId || resM.pendingSheets || resM.sheetsVerified) {
            await confirmPeopleWriteSheets_(resM, {
              doneMsg: "Точно убрано из календаря",
              pendingMsg: "Убираю из календаря…",
              failMsg: "Не убралось из таблицы",
              block: false
            });
          } else {
            showToast("Убрано из календаря");
          }
          await loadClientsForDay();
        } catch (err) {
          await uiAlertAsync(err.message || String(err));
        } finally {
          recoverUiFocus();
        }
        return;
      }
      if (!day && !dateStr) {
        await uiAlertAsync("Сначала открой день или дату в Просмотре.");
        return;
      }
      const ok = await uiConfirmAsync("Удалить клиента " + client.name + "?\n\nУйдёт у всех: неделя + Календарь_Дат + бронь на дату.");
      if (!ok) return;
      try {
        showToast("Удаляю…");
        try { apiCacheBustMem_(); } catch (eMem) {}
        const mk = client.matchKey || viewClientKey(client.name) || "";
        const delParams = deleteClientParams(client.name, day, mk);
        const res = await apiGet(delParams, { timeoutMs: 16000, cacheTtlMs: 0, bypassInflight: true });
        if (res && res.status === "error" && !res.pendingSheets) {
          await uiAlertAsync("Не удалось: " + (res.message || res.status || "ошибка"));
          return;
        }
        if (res && (res.status === "online" || /жив/i.test(String(res.msg || res.message || "")))) {
          await uiAlertAsync("Не удалось удалить — сервер не принял запрос. Обнови через reset.html и попробуй ещё раз.");
          return;
        }
        var verifyDay = String((res && res.day) || delParams.day || day || "").trim();
        var daysCleared = Array.isArray(res && res.daysCleared) ? res.daysCleared : [];
        var writeSolid = !!(res && (res.status === "success" || res.status === "accepted") && !res.sent_opaque && (
          Number(res.wrote) > 0 ||
          res.sheetsVerified ||
          res.pendingSheets ||
          res.writeId ||
          (res.d1Verified && !res.skippedStaleDelete && !res.optimistic) ||
          res.alreadyGone
        ));
        var delDone = (res.alreadyGone ? "Точно уже удалено" : "Точно удалено") +
          (delParams.day || day ? (" · " + (delParams.day || day)) : "") +
          (dateStr ? (" · " + dateStr) : "");
        var pendingDel = !!(res.writeId || res.pendingSheets) && !res.sheetsVerified;

        // убираем из UI сразу после accept
        try {
          loadedClientsRawData = (loadedClientsRawData || []).filter(function (c) {
            return !nicksMatchClient_(c && c.name, client.name);
          });
          renderViewLists();
        } catch (eOpt0) {}

        if (pendingDel) {
          var confirmDel = await confirmPeopleWriteSheets_(res, {
            doneMsg: delDone,
            pendingMsg: "Удаляю из таблицы…",
            failMsg: "Удаление не закрепилось в таблице",
            block: false
          });
          if (!confirmDel.ok) {
            if (confirmDel.softTimeout) {
              showToast("Удаление ещё пишется… обнови список через минуту");
            } else {
              await uiAlertAsync(
                "Не удалось удалить — запись не закрепилась в таблице.\n" +
                ((confirmDel.message || (confirmDel.res && confirmDel.res.message)) || "попробуй ещё раз")
              );
              try { window._peopleListForceFresh = true; window._peopleListKeepDom = true; } catch (eF0) {}
              try { await loadClientsForDay(); } catch (eL0) {}
              return;
            }
          }
          if (confirmDel.res) res = confirmDel.res;
        }

        async function stillOnPrimaryDay_() {
          // только главный день — date/month snap давал ложные «ещё в списке»
          var slots = [];
          function addSlot_(d) {
            d = String(d || "").trim();
            if (d && slots.indexOf(d) < 0) slots.push(d);
          }
          addSlot_(verifyDay);
          daysCleared.forEach(addSlot_);
          addSlot_(day);
          if (!slots.length) return null;
          for (var si = 0; si < slots.length; si++) {
            var vis = await clientVisibleOnView_(client.name, slots[si], "");
            if (vis === true) return true;
          }
          return false;
        }
        var still = pendingDel ? false : await stillOnPrimaryDay_();
        if (!pendingDel && still === true) {
          try {
            await apiGet(Object.assign({}, delParams, {
              day: verifyDay || delParams.day,
              force: "1",
              _: String(Date.now())
            }), { timeoutMs: 25000, cacheTtlMs: 0 });
          } catch (eR) {}
          still = await stillOnPrimaryDay_();
        }
        // ошибка только если ЯВНО всё ещё на дне после retry
        if (!pendingDel && still === true) {
          await uiAlertAsync("Не удалось удалить — человек всё ещё в списке. Обнови Просмотр и попробуй ещё раз.");
          try { window._peopleListForceFresh = true; } catch (eF0) {}
          try { await loadClientsForDay(); } catch (eL0) {}
          return;
        }
        // сеть неизвестна — если Worker не подтвердил запись, тоже fail
        if (!pendingDel && still === null && !writeSolid && !(res && (res.sheetsVerified || res.d1Verified || Number(res.wrote) > 0 || res.alreadyGone))) {
          await uiAlertAsync("Не удалось удалить — нет подтверждения таблицы. Проверь сеть и попробуй ещё раз.");
          return;
        }
        if (!pendingDel && (res.writeId || res.pendingSheets || res.sheetsVerified)) {
          await confirmPeopleWriteSheets_(res, {
            doneMsg: delDone,
            pendingMsg: "Удаляю из таблицы…",
            failMsg: "Удаление не закрепилось в таблице",
            block: false
          });
        } else if (!pendingDel) {
          showToast(delDone.replace(/^Точно /, ""));
        }
        try {
          if (day) {
            var daySelDel = document.getElementById("viewDaySelect");
            if (daySelDel) setSelectDayValue(daySelDel, day);
          }
        } catch (eSel) {}
        try { afterPeopleMutationDays_([day]); } catch (eMut) {}
        try { window._peopleListForceFresh = true; window._peopleListKeepDom = true; } catch (eForce) {}
        try {
          await refreshDayViews(day, { force: false });
        } catch (eRef) {
          try { window._peopleListKeepDom = true; await loadClientsForDay(); } catch (eL) {}
        }
        // мягкая дочистка, если список ещё показывает
        try {
          var still = (loadedClientsRawData || []).some(function (c) {
            return nicksMatchClient_(c && c.name, client.name);
          });
          if (still) {
            await apiGet(deleteClientParams(client.name, day, mk), { timeoutMs: 20000, cacheTtlMs: 0 });
            afterPeopleMutationDays_([day]);
            loadedClientsRawData = (loadedClientsRawData || []).filter(function (c) {
              return !nicksMatchClient_(c && c.name, client.name);
            });
            try { renderViewLists(); } catch (eR2) {}
            try { window._peopleListForceFresh = true; } catch (eF2) {}
            await loadClientsForDay();
          }
        } catch (eVer) {}
      } catch (err) {
        await uiAlertAsync(err.message || String(err));
      } finally {
        recoverUiFocus();
      }
    }
    window.crmDeleteClient = crmDeleteClient;

    function cutDoneStorageKey(day, dateText) {
      return "cutDone_" + String(day || "") + "_" + String(dateText || "");
    }

    function readCutDoneLocal(day, dateText) {
      try {
        const raw = localStorage.getItem(cutDoneStorageKey(day, dateText));
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function writeCutDoneLocal(day, dateText, completion) {
      try {
        if (!completion) return;
        localStorage.setItem(cutDoneStorageKey(day, dateText), JSON.stringify(completion));
      } catch (e) {}
    }

    async function loadCutting(fromPollOrOpts, maybeOpts) {
      var opts = {};
      var fromPoll = false;
      if (typeof fromPollOrOpts === "object" && fromPollOrOpts) {
        opts = fromPollOrOpts;
        fromPoll = !!opts.fromPoll;
      } else {
        fromPoll = !!fromPollOrOpts;
        opts = maybeOpts || {};
      }
      var soft = !!opts.soft && !fromPoll;
      const day = document.getElementById("cuttingDaySelect").value;
      const box = document.getElementById("cuttingContainer");
      const summary = document.getElementById("cuttingSummary");
      const sessionBox = document.getElementById("cuttingSessionBox");
      const finishBtn = document.getElementById("btnFinishCutting");
      var loadSeq = fromPoll ? _cuttingLoadSeq : (++_cuttingLoadSeq);
      if (!day) {
        box.innerHTML = '<p class="muted">Выберите день...</p>';
        summary.innerHTML = "";
        if (sessionBox) sessionBox.innerHTML = "";
        cuttingItemsCache = [];
        cuttingCompletionCache = null;
        cuttingDetailExpanded_ = false;
        cuttingLocalFlags = Object.create(null);
        applyRemoteCuttingSession({ active: false, day: "", startedAt: 0 });
        if (finishBtn) finishBtn.style.display = "none";
        stopCuttingPoll();
        return;
      }

      if (fromPoll && (cuttingSession.pendingWrites > 0 || Date.now() < cuttingSession.quietUntil)) {
        tickCuttingTimer();
        return;
      }
      var prevItems = (cuttingItemsCache || []).slice();

      var cacheDayOk = String(cuttingItemsCache && cuttingItemsCache._day || "") === String(day);
      var hasCache = cacheDayOk && (
        (cuttingItemsCache && cuttingItemsCache.length) ||
        !!cuttingCompletionCache
      );
      if (opts.keepCompletion && cuttingCompletionCache) hasCache = true;
      if (soft && hasCache && !window._cuttingNeedRefresh) {
        if (cuttingCompletionCache) {
          renderFinishedCuttingDay(cuttingCompletionCache);
          if (finishBtn) finishBtn.style.display = "none";
          stopCuttingPoll();
        } else {
          renderCuttingSummary();
          renderCuttingSessionBox();
          if (finishBtn) finishBtn.style.display = cuttingSession.active ? "block" : "none";
          try {
            if (box && !box.querySelector(".cut-row") && cuttingItemsCache.length) {
              box.innerHTML = cuttingItemsCache.map(renderCutRowHtml).join("");
            }
          } catch (eDom) {}
          startCuttingPoll();
        }
        return;
      }
      if (hasCache && !fromPoll) {
        window._cuttingNeedRefresh = false;
        if (cuttingCompletionCache) {
          renderFinishedCuttingDay(cuttingCompletionCache);
        } else {
          renderCuttingSummary();
          renderCuttingSessionBox();
          try {
            if (box && !box.querySelector(".cut-row") && cuttingItemsCache.length) {
              box.innerHTML = cuttingItemsCache.map(renderCutRowHtml).join("");
            }
          } catch (eDomKeep) {}
          if (finishBtn) finishBtn.style.display = cuttingSession.active ? "block" : "none";
        }
      } else if (!fromPoll) {
        if (!soft && !(opts.keepCompletion && cuttingCompletionCache)) {
          cuttingItemsCache = [];
          cuttingCompletionCache = null;
          cuttingDetailExpanded_ = false;
          cuttingSession.fingerprint = "";
          if (summary) summary.innerHTML = "";
          if (sessionBox) sessionBox.innerHTML = "";
          if (finishBtn) finishBtn.style.display = "none";
        }
        if (!(opts.keepCompletion && cuttingCompletionCache)) {
          box.innerHTML = loadingDanceHtml("Считаю нарезку…");
        }
      }
      try {
        const res = await apiGet({
          action: "getCutting",
          day: day
        }, {
          timeoutMs: hasCache ? 18000 : 28000,
          retries: 0,
          cacheTtlMs: (opts.keepCompletion || opts.force || window._cuttingNeedRefresh) ? 0 : undefined
        });
        if (loadSeq !== _cuttingLoadSeq) return;
        var curDay = document.getElementById("cuttingDaySelect") && document.getElementById("cuttingDaySelect").value;
        if (String(curDay || "") !== String(day)) return;
        if (res && res.fromCalendar && !res.fromGas && !res.fromOrders) {
          if (!fromPoll && !(prevItems && prevItems.length)) {
            box.innerHTML = loadingDanceHtml("Считаю нарезку по таблице…");
          }
          return;
        }
        window._cuttingNeedRefresh = false;
        let completion = (res && res.completion) || null;
        if (res && res.date) {
          try { cuttingItemsCache._date = res.date; } catch (eDt) {}
        }

        if (!completion && cuttingCompletionCache && cacheDayOk) {
          var localDate = String(cuttingCompletionCache.dateText || cuttingCompletionCache.date || "");
          var resDate = String((res && res.date) || "");
          if (!resDate || !localDate || resDate === localDate) {
            completion = cuttingCompletionCache;
          }
        }

        if (completion) {
          cuttingCompletionCache = completion;
          cuttingItemsCache = (res.items && res.items.length ? res.items : (cuttingItemsCache || [])).slice();
          cuttingItemsCache._day = day;
          if (res.date) writeCutDoneLocal(day, res.date, completion);
          applyRemoteCuttingSession({ active: false, day: "", startedAt: 0 });
          if (finishBtn) finishBtn.style.display = "none";
          renderFinishedCuttingDay(completion);
          stopCuttingPoll();
          return;
        }
        if (opts.keepCompletion && cuttingCompletionCache && cacheDayOk) {
          applyRemoteCuttingSession({ active: false, day: "", startedAt: 0 });
          if (finishBtn) finishBtn.style.display = "none";
          renderFinishedCuttingDay(cuttingCompletionCache);
          stopCuttingPoll();
          return;
        }
        cuttingCompletionCache = null;
        if (res.status !== "success" || !res.items || !res.items.length) {
          if (!fromPoll) {
            box.innerHTML = '<p class="muted">На этот день резать нечего</p>';
            summary.innerHTML = "";
            if (sessionBox) sessionBox.innerHTML = "";
          }
          cuttingItemsCache = [];
          cuttingItemsCache._day = day;
          cuttingSession.fingerprint = "";
          applyRemoteCuttingSession(res.session || { active: false });
          if (finishBtn) finishBtn.style.display = "none";
          return;
        }
        var items = (res.items || []).slice();
        items.forEach(normalizeCutFlagsUi_);

        applyLocalCuttingFlags_(items);

        var flagScoreNew = cuttingFlagScore(items);
        var flagScoreOld = cuttingFlagScore(prevItems);
        var guardFlags = Object.keys(cuttingLocalFlags || {}).length > 0 ||
          cuttingSession.pendingWrites > 0 ||
          Date.now() < (cuttingSession.quietUntil || 0) ||
          flagScoreNew < flagScoreOld;
        if (guardFlags && flagScoreNew < flagScoreOld) {
          mergeCuttingFlagsPreferLocal_(items, prevItems);
        }
        const fp = cuttingFingerprint(items, res.session);
        applyRemoteCuttingSession(res.session || { active: false, day: day, startedAt: 0 });
        if (fromPoll && cuttingFlagScore(items) < flagScoreOld) {
          tickCuttingTimer();
          return;
        }
        if (fromPoll && fp === cuttingSession.fingerprint) {
          tickCuttingTimer();
          return;
        }
        if (loadSeq !== _cuttingLoadSeq) return;
        cuttingSession.fingerprint = fp;
        cuttingItemsCache = items;
        cuttingItemsCache._day = day;
        sortCuttingItems();
        renderCuttingSummary();
        renderCuttingSessionBox();
        var transferHtml = renderTransferOnlyHtml(res.transferOnly);
        box.innerHTML = transferHtml + cuttingItemsCache.map(renderCutRowHtml).join("");
        if (finishBtn) finishBtn.style.display = cuttingSession.active ? "block" : "none";
        startCuttingPoll();
      } catch (err) {
        if (loadSeq !== _cuttingLoadSeq) return;
        if (!fromPoll) {

          if (opts.keepCompletion && cuttingCompletionCache && cacheDayOk) {
            renderFinishedCuttingDay(cuttingCompletionCache);
          } else if (prevItems.length) {
            cuttingItemsCache = prevItems;
            try { cuttingItemsCache._day = day; } catch (eDay) {}
            sortCuttingItems();
            renderCuttingSummary();
            box.innerHTML = cuttingItemsCache.map(renderCutRowHtml).join("");
            showToast("Не обновилось — галочки на месте");
          } else if (!(soft && hasCache)) {
            box.innerHTML = '<p class="muted">Ошибка: ' + escapeHtml(err.message || String(err)) + "</p>";
            if (finishBtn) finishBtn.style.display = "none";
          }
        }
      }
    }

    function cutNameKeyUi_(name) {
      return String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
    }

    function cutFuzzyKeyUi_(name) {
      return cutNameKeyUi_(name)
        .replace(/ШТ\.?/g, "")
        .replace(/[^A-ZА-Я0-9]+/g, "");
    }

    function normalizeCutFlagsUi_(it) {
      if (!it || typeof it !== "object") return it;
      it.laid = !!(it.laid === true || it.laid === 1 || it.laid === "1" || String(it.laid).toLowerCase() === "true");
      it.done = !!(it.done === true || it.done === 1 || it.done === "1" || String(it.done).toLowerCase() === "true");
      it.outNext = !!(it.outNext === true || it.outNext === 1 || it.outNext === "1" || String(it.outNext).toLowerCase() === "true");
      return it;
    }

    function findPrevCuttingUi_(prevItems, item) {
      var nk = cutNameKeyUi_(item && item.name);
      var fz = cutFuzzyKeyUi_(item && item.name);
      if (!nk && !fz) return null;
      for (var i = 0; i < (prevItems || []).length; i++) {
        var p = prevItems[i];
        if (!p) continue;
        if (nk && cutNameKeyUi_(p.name) === nk) return p;
        if (fz && cutFuzzyKeyUi_(p.name) === fz) return p;
      }
      return null;
    }

    function mergeCuttingFlagsPreferLocal_(items, prevItems) {
      (items || []).forEach(function (it) {
        var p = findPrevCuttingUi_(prevItems, it);
        if (!p) return;
        var loc =
          cuttingLocalFlags[Number(it.row)] ||
          cuttingLocalFlags["n:" + cutNameKeyUi_(it.name)];
        if (loc) return;
        if (!it.laid && p.laid) it.laid = true;
        if (!it.done && p.done) it.done = true;
        if (!it.outNext && p.outNext) it.outNext = true;
      });
      (items || []).forEach(normalizeCutFlagsUi_);
    }

    function rememberCuttingLocalFlag_(row, patch, name) {
      row = Number(row);
      function apply(key) {
        if (!key && key !== 0) return;
        if (!cuttingLocalFlags[key]) cuttingLocalFlags[key] = { ts: Date.now() };
        var o = cuttingLocalFlags[key];
        o.ts = Date.now();
        if (name) o.name = cutNameKeyUi_(name);
        if (patch.laid !== undefined) o.laid = !!patch.laid;
        if (patch.done !== undefined) o.done = !!patch.done;
        if (patch.outNext !== undefined) o.outNext = !!patch.outNext;
      }
      if (row) apply(row);
      if (name) apply("n:" + cutNameKeyUi_(name));
    }

    function clearCuttingLocalFlagIfMatch_(row, item) {
      row = Number(row);
      function clearIf(key) {
        var o = cuttingLocalFlags[key];
        if (!o || !item) return;
        var same =
          (o.laid === undefined || !!o.laid === !!item.laid) &&
          (o.done === undefined || !!o.done === !!item.done) &&
          (o.outNext === undefined || !!o.outNext === !!item.outNext);
        if (same) delete cuttingLocalFlags[key];
      }
      clearIf(row);
      if (item && item.name) clearIf("n:" + cutNameKeyUi_(item.name));
    }

    function applyLocalCuttingFlags_(items) {
      var now = Date.now();
      (items || []).forEach(function (it) {
        var row = Number(it.row);
        var nk = cutNameKeyUi_(it.name);
        var oRow = cuttingLocalFlags[row];
        var oName = cuttingLocalFlags["n:" + nk];
        // row переиспользован другой позицией — не брать флаг по row
        if (oRow && oRow.name && oRow.name !== nk) oRow = null;
        var o = oRow;
        if (oName && (!o || (oName.ts || 0) >= (o.ts || 0))) o = oName;
        if (!o) return;
        if ((now - (o.ts || 0)) > 1800000) {
          if (oRow) delete cuttingLocalFlags[row];
          if (oName) delete cuttingLocalFlags["n:" + nk];
          return;
        }

        var serverMatches =
          (o.laid === undefined || !!o.laid === !!it.laid) &&
          (o.done === undefined || !!o.done === !!it.done) &&
          (o.outNext === undefined || !!o.outNext === !!it.outNext);
        if (serverMatches) {
          if (oRow) delete cuttingLocalFlags[row];
          if (oName) delete cuttingLocalFlags["n:" + nk];
          return;
        }
        if (o.laid !== undefined) it.laid = !!o.laid;
        if (o.done !== undefined) it.done = !!o.done;
        if (o.outNext !== undefined) it.outNext = !!o.outNext;
        normalizeCutFlagsUi_(it);
      });
    }

    function sleepMs_(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function persistCuttingFlag_(row, patch) {
      var day = document.getElementById("cuttingDaySelect").value;
      if (!day) return false;
      var cached = (cuttingItemsCache || []).find(function (x) { return Number(x.row) === Number(row); });
      var itemName = (cached && cached.name) || "";
      rememberCuttingLocalFlag_(row, patch, itemName);
      markCuttingWriteStart();
      var ok = false;
      var params = {
        action: "updateCutting",
        day: day,
        row: String(row),
        _: String(Date.now())
      };
      if (itemName) params.name = itemName;
      if (patch.laid !== undefined) params.laid = patch.laid ? "true" : "false";
      if (patch.done !== undefined) params.done = patch.done ? "true" : "false";
      if (patch.outNext !== undefined) params.outNext = patch.outNext ? "true" : "false";
      if (patch.surplus !== undefined) params.surplus = String(patch.surplus);
      try {
        for (var attempt = 0; attempt < 4; attempt++) {
          params._ = String(Date.now()) + "_" + attempt;
          try {
            var res = await apiGet(params, { timeoutMs: 22000, cacheTtlMs: 0 });
            if (res && (res.status === "success" || res.optimistic || res.wrote)) {
              ok = true;
              if (cached && Number(res.row) >= 3 && Number(res.row) <= 48) {
                cached.row = Number(res.row);
              }
              break;
            }
            if (res && String(res.message || "") === "busy_retry") {
              await sleepMs_(350 * (attempt + 1));
              continue;
            }
          } catch (eGet) {

            try {
              var body = { action: "updateCutting", day: day, row: Number(row) };
              if (itemName) body.name = itemName;
              if (patch.laid !== undefined) body.laid = !!patch.laid;
              if (patch.done !== undefined) body.done = !!patch.done;
              if (patch.outNext !== undefined) body.outNext = !!patch.outNext;
              if (patch.surplus !== undefined) body.surplus = patch.surplus;
              var postRes = await apiPost(body);
              if (postRes && postRes.status === "error" && !postRes.optimistic) throw new Error(postRes.message || "post");
              ok = true;
              break;
            } catch (ePost) {}
          }
          await sleepMs_(300 * (attempt + 1));
        }
      } finally {
        markCuttingWriteEnd();

        cuttingSession.quietUntil = Math.max(cuttingSession.quietUntil, Date.now() + (ok ? 20000 : 25000));
      }
      if (!ok) {
        showToast("Галочка не сохранилась — нажми ещё раз");
      }
      return ok;
    }

    function renderTransferOnlyHtml(tr) {
      if (!tr || !(tr.lines || []).length) return "";
      var who = (tr.clients || []).join(", ");
      var lines = (tr.lines || []).map(function (l) {
        return '<div class="pack-line">' + escapeHtml(l.label) + ': <b>' + l.val + '</b> (для переноса)</div>';
      }).join("");
      return '<div class="card" style="margin-bottom:10px;border-color:var(--accent-color);">' +
        '<b>Перенос без резки</b>' +
        (who ? '<div class="muted" style="font-size:12px;margin-top:4px;">' + escapeHtml(who) + '</div>' : '') +
        '<div class="muted" style="font-size:12px;margin-top:4px;">Не в общем плане дня — напилено отдельно под перенос</div>' +
        lines + '</div>';
    }

    function renderCutterNotesHtml(notes) {
      if (!notes || !notes.length) return "";
      return '<div class="cut-notes-box"><div class="cut-notes-title">Примечания нарезчику</div>' +
        notes.map(function (n) {
          var item = n.item ? (' <span class="muted">[' + escapeHtml(n.item) + "]</span>") : "";
          return '<div class="cut-note-line"><b>' + escapeHtml(n.client || "") + ":</b>" + item + " " +
            escapeHtml(n.text || "") + "</div>";
        }).join("") + "</div>";
    }

    function renderFinishedCutRowHtml_(item) {
      var dryLabel = item.unit === "шт" ? (item.dry + " шт") : (item.dry + " гр сухого");
      var rawLabel = item.unit === "шт"
        ? (item.raw + " шт")
        : (Number(item.raw).toFixed(2) + " кг сырого");
      var badges = [];
      if (item.laid) badges.push("выложено");
      if (item.done) badges.push("нарезано");
      if (item.outNext) badges.push("нет на след.");
      var badgeHtml = badges.length
        ? '<div class="muted" style="font-size:12px;margin-top:4px;">' + escapeHtml(badges.join(" · ")) + "</div>"
        : "";
      var surplus = Number(item.surplus) || 0;
      return '<div class="' + cutRowClass(item) + '" style="opacity:.95;">' +
        '<div class="cut-title">' + escapeHtml(item.name || "") + "</div>" +
        '<div class="cut-meta">Нужно: <b>' + escapeHtml(String(dryLabel)) + "</b><br>Сырьё: <b>" +
          escapeHtml(String(rawLabel)) + "</b>" +
          (surplus ? (" · излишек: <b>" + surplus + "</b>") : "") +
        "</div>" +
        badgeHtml +
        (typeof renderCutNoteHint === "function" ? renderCutNoteHint(item) : "") +
        "</div>";
    }

    function renderFinishedCuttingDay(completion) {
      const box = document.getElementById("cuttingContainer");
      const summary = document.getElementById("cuttingSummary");
      const sessionBox = document.getElementById("cuttingSessionBox");
      const finishBtn = document.getElementById("btnFinishCutting");
      if (finishBtn) finishBtn.style.display = "none";
      if (sessionBox) sessionBox.innerHTML = "";
      const items = (cuttingItemsCache && cuttingItemsCache.length)
        ? cuttingItemsCache
        : ((completion && completion.items) || []);
      const total = Number(completion && completion.count) || items.length || 0;
      const elapsed = formatCutElapsed(Number(completion && completion.elapsedMs) || 0);
      const dayLabel = completion && completion.day ? escapeHtml(completion.day) : "";
      if (summary) {
        summary.innerHTML =
          '<div class="cut-done-summary">' +
            '<div class="cut-done-title">Нарезка завершена' + (dayLabel ? " · " + dayLabel : "") + '</div>' +
            '<div class="cut-done-meta">Позиций: <b>' + total + '</b><br>Время: <b>' + escapeHtml(elapsed) + '</b></div>' +
          '</div>';
      }
      if (!box) return;
      if (!cuttingDetailExpanded_) {
        box.innerHTML =
          '<div class="card" style="text-align:center;">' +
            '<div class="muted" style="margin-bottom:10px;">День закрыт</div>' +
            '<button type="button" class="btn-action btn-blue" onclick="showCuttingDoneDetails_()">Подробнее</button>' +
          "</div>";
        return;
      }
      var listHtml = items.length
        ? items.map(renderFinishedCutRowHtml_).join("")
        : '<p class="muted">Нет позиций в снимке</p>';
      box.innerHTML =
        '<div class="muted" style="margin-bottom:8px;font-size:12px;">Просмотр (только чтение)</div>' +
        listHtml;
    }

    function showCuttingDoneDetails_() {
      cuttingDetailExpanded_ = true;
      renderFinishedCuttingDay(cuttingCompletionCache || {});
    }
    window.showCuttingDoneDetails_ = showCuttingDoneDetails_;

    function cuttingFlagScore(items) {
      var n = 0;
      (items || []).forEach(function (it) {
        if (it.done) n += 2;
        if (it.laid) n += 1;
        if (it.outNext) n += 1;
      });
      return n;
    }

    function cuttingFingerprint(items, session) {
      const parts = (items || []).map(function (it) {
        return [it.row, !!it.done, !!it.laid, !!it.outNext, Number(it.surplus) || 0].join(":");
      });
      const s = session || {};
      return parts.join("|") + "#" + (!!s.active) + "#" + (s.day || "") + "#" + (s.startedAt || 0);
    }

    function applyRemoteCuttingSession(session) {
      session = session || {};
      const day = document.getElementById("cuttingDaySelect").value;
      const active = !!session.active && (!session.day || String(session.day) === String(day));
      const startedAt = Number(session.startedAt) || 0;
      const wasActive = cuttingSession.active;
      cuttingSession.active = active;
      cuttingSession.startedAt = active ? startedAt : 0;
      cuttingSession.day = active ? (session.day || day) : "";
      if (active && startedAt) {
        if (cuttingSession.timerId) clearInterval(cuttingSession.timerId);
        cuttingSession.timerId = setInterval(tickCuttingTimer, 1000);
        if (!wasActive) renderCuttingSessionBox();
        else tickCuttingTimer();
      } else {
        if (cuttingSession.timerId) {
          clearInterval(cuttingSession.timerId);
          cuttingSession.timerId = null;
        }
        if (wasActive) renderCuttingSessionBox();
      }
      const finishBtn = document.getElementById("btnFinishCutting");
      if (finishBtn) finishBtn.style.display = cuttingSession.active ? "block" : "none";
    }

    function startCuttingPoll() {
      stopCuttingPoll();
      const day = document.getElementById("cuttingDaySelect").value;
      if (!day) return;
      cuttingSession.pollId = setInterval(function () {
        const screen = document.getElementById("cuttingScreen");
        if (!screen || !screen.classList.contains("active")) return;
        loadCutting(true);
      }, 30000);
    }

    function stopCuttingPoll() {
      if (cuttingSession.pollId) {
        clearInterval(cuttingSession.pollId);
        cuttingSession.pollId = null;
      }
    }

    function markCuttingWriteStart() {
      cuttingSession.pendingWrites++;
      cuttingSession.quietUntil = Date.now() + 18000;
    }

    function markCuttingWriteEnd() {
      cuttingSession.pendingWrites = Math.max(0, cuttingSession.pendingWrites - 1);
      cuttingSession.quietUntil = Date.now() + 12000;
      cuttingSession.fingerprint = cuttingFingerprint(cuttingItemsCache, {
        active: cuttingSession.active, day: cuttingSession.day, startedAt: cuttingSession.startedAt
      });
    }

    function queueCelebrateCut() {
      cuttingSession.celebrateCutQueued = 0;
      if (cuttingSession.celebrateCutTimer) {
        clearTimeout(cuttingSession.celebrateCutTimer);
        cuttingSession.celebrateCutTimer = null;
      }
      try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); } catch (e) {}
    }

    function cutSortRank(item) {
      if (item.done && item.laid) return 3;
      if (item.done) return 2;
      if (item.laid) return 1;
      return 0;
    }

    function sortCuttingItems() {
      cuttingItemsCache.sort(function (a, b) {
        const ra = cutSortRank(a);
        const rb = cutSortRank(b);
        if (ra !== rb) return ra - rb;
        return (a.row || 0) - (b.row || 0);
      });
    }

    function cuttingCounters() {
      var toCut = 0, laidOnly = 0, both = 0;
      (cuttingItemsCache || []).forEach(function (it) {
        if (it.done && it.laid) both++;
        else if (it.laid && !it.done) laidOnly++;
        if (!it.done) toCut++;
      });
      return { toCut: toCut, laidOnly: laidOnly, both: both };
    }

    function renderCuttingSummary() {
      const summary = document.getElementById("cuttingSummary");
      if (!summary) return;
      const c = cuttingCounters();
      summary.innerHTML =
        '<div class="cut-stats">' +
          '<div class="cut-stat to-cut"><div class="cut-stat-num" id="cutStatToCut">' + c.toCut + '</div><div class="cut-stat-label">осталось нарезать</div></div>' +
          '<div class="cut-stat laid-only"><div class="cut-stat-num" id="cutStatLaid">' + c.laidOnly + '</div><div class="cut-stat-label">выложено, не нарезано</div></div>' +
          '<div class="cut-stat both"><div class="cut-stat-num" id="cutStatBoth">' + c.both + '</div><div class="cut-stat-label">выложено и нарезано</div></div>' +
        "</div>";
    }

    function updateCuttingCountersLive() {
      const c = cuttingCounters();
      const a = document.getElementById("cutStatToCut");
      const b = document.getElementById("cutStatLaid");
      const d = document.getElementById("cutStatBoth");
      if (a) a.textContent = String(c.toCut);
      if (b) b.textContent = String(c.laidOnly);
      if (d) d.textContent = String(c.both);
    }

    function formatCutElapsed(ms) {
      const totalSec = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    function renderCuttingSessionBox() {
      const sessionBox = document.getElementById("cuttingSessionBox");
      if (!sessionBox) return;
      if (cuttingSession.active) {
        const label = formatCutElapsed(Date.now() - cuttingSession.startedAt);
        sessionBox.innerHTML =
          '<div class="cut-timer-box">' +
            '<div class="cut-timer-value" id="cutTimerValue">' + label + "</div>" +
            '<div class="cut-timer-label">идёт нарезка</div>' +
          "</div>";
      } else {
        sessionBox.innerHTML =
          '<button class="btn-action btn-green" type="button" id="btnStartCutting" onclick="startCutting()">Начать нарезку</button>';
      }
    }

    function tickCuttingTimer() {
      const el = document.getElementById("cutTimerValue");
      if (!el || !cuttingSession.active) return;
      el.textContent = formatCutElapsed(Date.now() - cuttingSession.startedAt);
    }

    async function startCutting() {
      const day = document.getElementById("cuttingDaySelect").value;
      if (!day) {
        await uiAlertAsync("Сначала выберите день");
        return;
      }
      if (!cuttingItemsCache.length) {
        await uiAlertAsync("Нечего резать");
        return;
      }
      const startedAt = Date.now();
      try {
        const res = await apiGet({ action: "startCuttingSession", day: day, startedAt: startedAt });
        applyRemoteCuttingSession((res && res.session) || { active: true, day: day, startedAt: startedAt });
      } catch (e) {
        applyRemoteCuttingSession({ active: true, day: day, startedAt: startedAt });
      }
      renderCuttingSessionBox();
      const finishBtn = document.getElementById("btnFinishCutting");
      if (finishBtn) finishBtn.style.display = "block";
      cuttingSession.fingerprint = "";
      showToast("Нарезка началась — видно всем");
      startCuttingPoll();
    }

    function stopCuttingTimer(keepElapsed) {
      var elapsed = 0;
      if (cuttingSession.active && cuttingSession.startedAt) {
        elapsed = Date.now() - cuttingSession.startedAt;
      }
      if (cuttingSession.timerId) {
        clearInterval(cuttingSession.timerId);
        cuttingSession.timerId = null;
      }
      cuttingSession.active = false;
      cuttingSession.startedAt = 0;
      cuttingSession.day = "";
      if (!keepElapsed) {
        const sessionBox = document.getElementById("cuttingSessionBox");
        if (sessionBox && document.getElementById("cuttingDaySelect").value && cuttingItemsCache.length) {
          renderCuttingSessionBox();
        } else if (sessionBox) {
          sessionBox.innerHTML = "";
        }
      }
      return elapsed;
    }

    function cutRowClass(item) {
      var laid = !!(item && item.laid);
      var done = !!(item && item.done);
      var outNext = !!(item && item.outNext);
      var cls = "cut-row";
      if (done && laid) cls += " done";
      else if (laid && !done) cls += " laid-only";
      else if (done) cls += " done";
      if (outNext) cls += " out-next";
      return cls;
    }

    function renderCutRowHtml(item) {
      normalizeCutFlagsUi_(item);
      const dryLabel = item.unit === "шт" ? (item.dry + " шт") : (item.dry + " гр сухого");
      const rawLabel = item.unit === "шт"
        ? (item.raw + " шт")
        : (Number(item.raw).toFixed(2) + " кг сырого");
      return `<div class="${cutRowClass(item)}" id="cut_${item.row}" data-row="${item.row}">
        <button type="button" class="cut-bang${item.outNext ? " active" : ""}" title="Нет на следующую нарезку" onclick="toggleCutOutNext(${item.row})">!</button>
        <div class="cut-title">${escapeHtml(item.name)}</div>
        <div class="cut-meta">Нужно: <b>${dryLabel}</b><br>Сырьё: <b>${rawLabel}</b></div>
        ${renderCutNoteHint(item)}
        <div class="cut-actions">
          <label class="check-line"><input type="checkbox" ${item.laid ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleCutLaid(${item.row}, this.checked)"> Выложено</label>
          <label class="check-line"><input type="checkbox" ${item.done ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleCutDone(${item.row}, this.checked)"> Нарезано</label>
          <label>Излишек <input type="number" inputmode="decimal" id="surplus_${item.row}" value="${item.surplus || 0}" step="0.1"></label>
          <button class="btn-action btn-blue" style="width:auto;padding:0 14px;height:40px;" onclick="saveCutSurplus(${item.row})">Сохранить излишек</button>
        </div>
      </div>`;
    }

    function syncCutRowDomFromCache_(row) {
      var cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(row); });
      var el = document.getElementById("cut_" + row);
      if (!cached || !el) return;
      el.className = cutRowClass(cached);
      var checks = el.querySelectorAll(".cut-actions input[type=checkbox]");
      if (checks[0]) checks[0].checked = !!cached.laid;
      if (checks[1]) checks[1].checked = !!cached.done;
      var bang = el.querySelector(".cut-bang");
      if (bang) bang.classList.toggle("active", !!cached.outNext);
    }

    function reorderCuttingDom() {
      sortCuttingItems();
      const box = document.getElementById("cuttingContainer");
      if (!box) return;
      cuttingItemsCache.forEach(function (it) {
        const el = document.getElementById("cut_" + it.row);
        if (el) {
          el.className = cutRowClass(it);
          box.appendChild(el);
          syncCutRowDomFromCache_(it.row);
        }
      });
      updateCuttingCountersLive();
    }

    async function toggleCutLaid(row, laid) {
      const cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(row); });
      const prev = cached ? !!cached.laid : null;
      if (cached) cached.laid = !!laid;
      rememberCuttingLocalFlag_(row, { laid: !!laid }, cached && cached.name);
      reorderCuttingDom();
      const ok = await persistCuttingFlag_(row, { laid: !!laid });
      if (!ok && cached && prev !== null) {
        cached.laid = prev;
        rememberCuttingLocalFlag_(row, { laid: prev }, cached && cached.name);
        syncCutRowDomFromCache_(row);
        reorderCuttingDom();
      }
    }
    window.toggleCutLaid = toggleCutLaid;

    async function toggleCutDone(row, done) {
      const cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(row); });
      const prev = cached ? !!cached.done : null;
      if (cached) cached.done = !!done;
      rememberCuttingLocalFlag_(row, { done: !!done }, cached && cached.name);
      reorderCuttingDom();
      if (done) {
        try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); } catch (e) {}
      }
      const ok = await persistCuttingFlag_(row, { done: !!done });
      if (!ok && cached && prev !== null) {
        cached.done = prev;
        rememberCuttingLocalFlag_(row, { done: prev }, cached && cached.name);
        syncCutRowDomFromCache_(row);
        reorderCuttingDom();
        return;
      }
      // все нарезано → предложить завершить (как авто-экран сборки/курьера)
      if (ok && done && cuttingSession.active) {
        var left = (cuttingItemsCache || []).filter(function (x) { return !x.done; }).length;
        if (left === 0) {
          try {
            var go = await uiConfirmAsync("Все позиции отмечены. Завершить нарезку?");
            if (go) await finishCutting();
          } catch (eFin) {}
        }
      }
    }
    window.toggleCutDone = toggleCutDone;

    async function toggleCutOutNext(row) {
      const cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(row); });
      if (!cached) return;
      const next = !cached.outNext;
      const okAsk = next
        ? await uiConfirmAsync("Пометить «" + cached.name + "»: на эту нарезку хватает, на следующую — уже нет?")
        : await uiConfirmAsync("Снять пометку дефицита на следующую нарезку?");
      if (!okAsk) return;
      const prev = !!cached.outNext;
      cached.outNext = next;
      rememberCuttingLocalFlag_(row, { outNext: next }, cached && cached.name);
      syncCutRowDomFromCache_(row);
      const ok = await persistCuttingFlag_(row, { outNext: next });
      if (!ok) {
        cached.outNext = prev;
        rememberCuttingLocalFlag_(row, { outNext: prev }, cached && cached.name);
        syncCutRowDomFromCache_(row);
        return;
      }
      showToast(next ? "Помечено: нет на следующую" : "Пометка снята");
    }

    async function saveCutSurplus(row) {
      const surplus = Number(document.getElementById("surplus_" + row).value) || 0;
      const cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(row); });
      if (cached) cached.surplus = surplus;
      const ok = await persistCuttingFlag_(row, { surplus: surplus });
      if (ok) showToast("Излишек сохранён");
      recoverUiFocus();
    }
    window.toggleCutOutNext = toggleCutOutNext;
    window.saveCutSurplus = saveCutSurplus;

    async function commitFinishCutting(day, ready, missing, elapsed) {
      (ready || []).forEach(function (r) {
        const cached = cuttingItemsCache.find(function (x) { return Number(x.row) === Number(r.row); });
        if (cached) { cached.done = true; cached.laid = true; }
      });
      const flags = (cuttingItemsCache || []).map(function (it) {
        return [
          it.row,
          it.laid ? 1 : 0,
          it.done ? 1 : 0,
          it.outNext ? 1 : 0,
          Number(it.surplus) || 0
        ].join(",");
      }).join("|");
      const readyRows = (ready || []).map(function (r) { return r.row; }).join(",");
      const missingEnc = (missing || []).map(function (m) {
        return String(m.row) + "~" + String(m.name || "").replace(/[|~]/g, " ");
      }).join("|");

      let res = null;
      try {
        res = await apiGet({
          action: "finishCutting",
          day: day,
          elapsed: elapsed || 0,
          flags: flags,
          readyRows: readyRows,
          missing: missingEnc
        });
      } catch (e1) {}

      if (!res || res.status !== "success") {

        const ticket = "f" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
        try {
          await apiPost({
            action: "prepareFinishCutting",
            ticket: ticket,
            day: day,
            ready: ready || [],
            missing: missing || [],
            items: (cuttingItemsCache || []).map(function (it) {
              return {
                row: it.row,
                done: !!it.done,
                laid: !!it.laid,
                outNext: !!it.outNext,
                surplus: Number(it.surplus) || 0
              };
            }),
            elapsed: elapsed || 0
          });
        } catch (ePrep) {}
        await new Promise(function (r) { setTimeout(r, 500); });
        try {
          res = await apiGet({ action: "finishCutting", ticket: ticket, day: day, elapsed: elapsed || 0, flags: flags });
        } catch (e2) {}
      }

      if (!res || res.status !== "success") {
        for (let i = 0; i < (cuttingItemsCache || []).length; i++) {
          const it = cuttingItemsCache[i];
          try {
            await apiGet({
              action: "updateCutting",
              day: day,
              row: it.row,
              done: it.done ? "true" : "false",
              laid: it.laid ? "true" : "false",
              outNext: it.outNext ? "true" : "false",
              surplus: Number(it.surplus) || 0
            });
          } catch (eUp) {}
        }
        try {
          res = await apiGet({
            action: "finishCutting",
            day: day,
            elapsed: elapsed || 0,
            readyRows: readyRows,
            missing: missingEnc
          });
        } catch (e3) {}
      }
      return res || { status: "error" };
    }

    async function finishCutting() {
      const day = document.getElementById("cuttingDaySelect").value;
      if (!day) { await uiAlertAsync("Выберите день"); return; }
      if (!cuttingSession.active) {
        await uiAlertAsync("Сначала нажмите «Начать нарезку».");
        return;
      }
      const pending = (cuttingItemsCache || []).filter(function (x) { return !x.done; });
      const ready = [];
      const missing = [];
      if (pending.length) {
        for (let i = 0; i < pending.length; i++) {
          const it = pending[i];
          const ans = await uiChoiceAsync(
            "Позиция: " + it.name,
            "Есть в наличии и заготовлена?",
            [
              { label: "Да, заготовлена", value: "ready", cls: "btn-green" },
              { label: "Нет в наличии", value: "missing", cls: "btn-orange" }
            ]
          );
          if (ans == null) {
            showToast("Отменено");
            return;
          }
          if (ans === "ready") ready.push({ row: it.row, name: it.name });
          else missing.push({ row: it.row, name: it.name });
        }
      } else {
        const ok = await uiConfirmAsync("Все позиции уже отмечены. Завершить нарезку?");
        if (!ok) return;
      }
      const btn = document.getElementById("btnFinishCutting");
      if (btn) { btn.disabled = true; btn.innerText = "Завершаю…"; }
      try {
        const elapsed = cuttingSession.active && cuttingSession.startedAt
          ? (Date.now() - cuttingSession.startedAt) : 0;
        const res = await commitFinishCutting(day, ready, missing, elapsed);
        if (!res || res.status !== "success") {
          await uiAlertAsync("Не удалось сохранить завершение нарезки. Проверьте Deploy Code.gs и попробуйте ещё раз.");
          return;
        }
        stopCuttingTimer(true);
        applyRemoteCuttingSession({ active: false, day: "", startedAt: 0 });
        var dateKey = (res.completion && (res.completion.dateText || res.completion.date)) ||
          (cuttingItemsCache && cuttingItemsCache._date) || "";
        var completion = res.completion || {
          day: day,
          dateText: dateKey,
          date: dateKey,
          elapsedMs: elapsed || 0,
          finishedAt: new Date().toISOString(),
          count: (cuttingItemsCache || []).length,
          items: (cuttingItemsCache || []).slice()
        };
        if (!completion.items && cuttingItemsCache && cuttingItemsCache.length) {
          completion.items = cuttingItemsCache.slice();
        }
        if (!completion.count) completion.count = (completion.items || []).length || (cuttingItemsCache || []).length;
        if (!completion.elapsedMs && elapsed) completion.elapsedMs = elapsed;
        if (!completion.day) completion.day = day;
        cuttingCompletionCache = completion;
        cuttingDetailExpanded_ = false;
        writeCutDoneLocal(day, dateKey, completion);
        try { apiCacheBustMem_("getCutting"); } catch (eBust) {}
        window._cuttingNeedRefresh = false;
        renderFinishedCuttingDay(completion);
        stopCuttingPoll();

        try { if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success"); } catch (eH) {}
        if (missing.length) {
          showToast("Дефицит: пуш сейчас + с утра каждые 30 мин");
          await uiAlertAsync("По позициям без наличия пуш ушёл сразу. С утра следующего дня — каждые 30 мин, пока кто-то не нажмёт «Куплено и заготовлено».");
        } else {
          showToast("Нарезка завершена за " + formatCutElapsed(elapsed));
        }
        cuttingSession.fingerprint = "";
        try {
          await loadCutting({ keepCompletion: true, force: true });
        } catch (eLoad) {}
      } catch (err) {
        await uiAlertAsync(err.message || String(err));
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Завершить нарезку"; }
        recoverUiFocus();
      }
    }

    function opsWeekdayNameNow() {
      var names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
      return names[new Date().getDay()];
    }

    function opsCuttingTargetDayNow() {
      var names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
      var d = new Date();
      d.setDate(d.getDate() + 1);
      return names[d.getDay()];
    }

    function setSelectDayValue(sel, day) {
      if (!sel || !day) return false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === day || sel.options[i].text === day) {
          sel.selectedIndex = i;
          return true;
        }
      }
      return false;
    }

    function persistOpsDay(day) {
      var d = String(day || "").trim();
      if (!d) return;
      try { localStorage.setItem("opsDayCourier", d); } catch (e) {}
      try { localStorage.setItem("opsDayAssembly", d); } catch (e) {}
    }

    function readPersistedOpsDay() {
      try {
        return localStorage.getItem("opsDayCourier") || localStorage.getItem("opsDayAssembly") || "";
      } catch (e) {
        return "";
      }
    }

    function ensureOpsDaySelected(opts) {
      opts = opts || {};
      var cour = document.getElementById("courierDaySelect");
      var asm = document.getElementById("assemblyDaySelect");
      var prefer = opsWeekdayNameNow();
      var mem = readPersistedOpsDay();
      var cur = (cour && cour.value) || (asm && asm.value) || "";
      var day = cur || mem || prefer;
      if (cour) setSelectDayValue(cour, day);
      if (asm) setSelectDayValue(asm, (cour && cour.value) || day);
      var finalDay = (cour && cour.value) || (asm && asm.value) || "";
      if (finalDay) persistOpsDay(finalDay);
      return finalDay;
    }

    function ensureCuttingDaySelected(opts) {
      opts = opts || {};
      var sel = document.getElementById("cuttingDaySelect");
      if (!sel) return "";
      var prefer = opsCuttingTargetDayNow();
      if (sel.value) return sel.value;
      var mem = "";
      try { mem = localStorage.getItem("opsDayCutting") || ""; } catch (e2) {}
      setSelectDayValue(sel, mem || prefer);
      return sel.value || "";
    }
    window.ensureCuttingDaySelected = ensureCuttingDaySelected;
    window.opsCuttingTargetDayNow = opsCuttingTargetDayNow;

    function onCuttingDayChange() {
      var day = document.getElementById("cuttingDaySelect") && document.getElementById("cuttingDaySelect").value;
      if (day) {
        try { localStorage.setItem("opsDayCutting", day); } catch (e) {}
      }
      loadCutting(false);
    }
    window.onCuttingDayChange = onCuttingDayChange;

    function onCourierDayChange() {
      var day = document.getElementById("courierDaySelect").value;
      persistOpsDay(day);
      courierDetailExpanded_ = false;
      var asm = document.getElementById("assemblyDaySelect");
      if (asm && day) setSelectDayValue(asm, day);
      loadCourier(true);
    }
    window.onCourierDayChange = onCourierDayChange;

    function onAssemblyDayChange() {
      var day = document.getElementById("assemblyDaySelect").value;
      persistOpsDay(day);
      assemblyDetailExpanded_ = false;
      var cour = document.getElementById("courierDaySelect");
      if (cour && day) setSelectDayValue(cour, day);
      loadAssembly(true);
    }
    window.onAssemblyDayChange = onAssemblyDayChange;

    async function loadCourier(force) {
      ensureOpsDaySelected();
      const day = document.getElementById("courierDaySelect").value;
      const box = document.getElementById("courierContainer");
      var loadSeq = ++_courierLoadSeq;
      setDepartTimeLocked(false);
      if (!day) {
        box.innerHTML = '<p class="muted">Выберите день...</p>';
        courierClientsCache = [];
        refreshCourierSummary();
        document.getElementById("routePlanBox").innerHTML = "";
        routePlanState.routes = [[], []];
        return;
      }

      if (!force && courierClientsCache && courierClientsCache.length && courierClientsCache._day === day) {
        refreshCourierSummary();
        renderCourierClientsUi_();
        return;
      }
      courierClientsCache = [];
      courierDetailExpanded_ = false;
      refreshCourierSummary();
      document.getElementById("routePlanBox").innerHTML = "";
      routePlanState.routes = [[], []];
      box.innerHTML = loadingDanceHtml("Собираю маршрут…");
      try {
        const res = await apiGet(
          { action: "getCourier", day: day },
          { timeoutMs: force ? 22000 : 18000, retries: force ? 1 : 0 }
        );
        if (loadSeq !== _courierLoadSeq) return;
        var curDay = document.getElementById("courierDaySelect") && document.getElementById("courierDaySelect").value;
        if (String(curDay || "") !== String(day)) return;
        if (res.status !== "success" || !res.clients || !res.clients.length) {
          box.innerHTML = '<p class="muted">Нет клиентов на день</p>';
          courierClientsCache = [];
          refreshCourierSummary();
          document.getElementById("routePlanBox").innerHTML = "";
          routePlanState.routes = [[], []];
          return;
        }
        courierClientsCache = res.clients;
        courierClientsCache._date = res.date || day;
        courierClientsCache._day = day;
        try { applyCourierLocalFlags_(courierClientsCache); } catch (eCf) {}
        refreshCourierSummary();
        renderCourierClientsUi_();
      } catch (err) {
        if (loadSeq !== _courierLoadSeq) return;
        box.innerHTML = '<p class="muted">Ошибка: ' + escapeHtml(err.message || String(err)) + "</p>";
      }
    }

    var courierDetailExpanded_ = false;
    var assemblyDetailExpanded_ = false;

    function courFlagKey_(name) {
      return String(name || "").trim().toUpperCase();
    }
    function rememberCourierLocalFlag_(name, delivered) {
      var k = courFlagKey_(name);
      if (!k) return;
      courierLocalFlags[k] = { delivered: !!delivered, ts: Date.now() };
    }
    function applyCourierLocalFlags_(clients) {
      var now = Date.now();
      (clients || []).forEach(function (c) {
        var k = courFlagKey_(c && c.name);
        var o = k && courierLocalFlags[k];
        if (!o) return;
        if ((now - (o.ts || 0)) > 1800000) {
          delete courierLocalFlags[k];
          return;
        }
        if (o.delivered !== undefined) c.delivered = !!o.delivered;
      });
    }

    function courierAllDelivered_() {
      var list = courierClientsCache || [];
      return list.length > 0 && list.every(function (c) { return !!c.delivered; });
    }

    function renderCourierFinishedSummary_() {
      var box = document.getElementById("courierContainer");
      var summary = document.getElementById("courierSummary");
      var list = courierClientsCache || [];
      var day = document.getElementById("courierDaySelect").value;
      var dateLabel = (courierClientsCache && courierClientsCache._date) || day || "";
      var paidN = list.filter(function (c) {
        return String(c.paid || "").toLowerCase() === "yes";
      }).length;
      if (summary) {
        summary.innerHTML =
          '<div class="cut-done-summary">' +
            '<div class="cut-done-title">Доставки завершены' + (dateLabel ? (" · " + escapeHtml(String(dateLabel))) : "") + "</div>" +
            '<div class="cut-done-meta">Клиентов: <b>' + list.length + "</b>" +
              (paidN ? (" · оплачено ПП: <b>" + paidN + "</b>") : "") +
            "</div>" +
          "</div>";
      }
      if (box) {
        box.innerHTML =
          '<div class="card" style="text-align:center;">' +
            '<div class="muted" style="margin-bottom:10px;">Все галочки проставлены</div>' +
            '<button type="button" class="btn-action btn-blue" onclick="showCourierDoneDetails_()">Подробнее</button>' +
          "</div>";
      }
    }

    function showCourierDoneDetails_() {
      courierDetailExpanded_ = true;
      renderCourierClientsUi_();
    }
    window.showCourierDoneDetails_ = showCourierDoneDetails_;

    function renderCourierClientsUi_() {
      var box = document.getElementById("courierContainer");
      if (!box) return;
      if (courierAllDelivered_() && !courierDetailExpanded_) {
        renderCourierFinishedSummary_();
        return;
      }
      var resClients = courierClientsCache || [];
      box.innerHTML = resClients.map(function (c, idx) {
          const lines = basketLinesHtml(c.basket || []);
          const priceHtml = formatOrderPriceHtml(c);
          const courNote = noteTextForRole(c.note || "", "cour");
          const addrPublic = courierPublicAddress_(c.address || "");
          const addrPrivate = courierPrivateAddressHtml_(c.address || "");
          const phoneRaw = c.phone || extractPhone(c.note || "");
          const telBlock = phoneRaw
            ? formatTelHtml(phoneRaw, { always: true })
            : '<div class="delivery-line courier-tel-line muted" onclick="event.stopPropagation()">📞 нет телефона</div>';
          return `<div class="courier-row${c.delivered ? " is-delivered" : ""}" id="courierRow_${idx}" onclick="toggleCourierClientDetail_(${idx}, event)">
            <label class="check-line" onclick="event.stopPropagation()">
              <input type="checkbox" ${c.delivered ? "checked" : ""} onchange="toggleDelivered(${idx}, this.checked)">
              <span class="cut-title">${idx + 1}. ${escapeHtml(c.name)}</span>
              ${c.assembled ? ('<span class="client-badge" style="margin-left:8px;background:rgba(255,159,10,0.25);color:#ffd60a;">собран</span>') : ""}
              ${clientTechBadgesHtml_(c)}
            </label>
            <div class="courier-addr-main">${addrPublic ? ("Адрес: <b>" + escapeHtml(addrPublic) + "</b>") : "Адрес не указан"}
              <span class="muted" style="font-size:11px;"> · тап → этаж/кв</span>
            </div>
            ${telBlock}
            <div class="courier-extra" id="courierExtra_${idx}">
              <div>${addrPrivate}</div>
              ${priceHtml}
              ${courNote ? ("<div style=\"margin-top:4px;\">Примечание: " + escapeHtml(courNote) + "</div>") : ""}
              ${!c.delivered ? ('<button type="button" class="btn-action btn-orange" style="margin-top:8px;width:100%;" onclick="event.stopPropagation();notifyMissedDelivery_(' + idx + ')">Не получил → менеджеру</button>') : ""}
            </div>
            <div>${lines || '<span class="muted">Пустой заказ</span>'}</div>
          </div>`;
        }).join("");
    }

    function toggleCourierClientDetail_(idx, ev) {
      if (ev) {
        var t = ev.target;
        if (t && (
          t.tagName === "INPUT" ||
          t.tagName === "BUTTON" ||
          t.tagName === "A" ||
          (t.closest && (t.closest("label.check-line") || t.closest("a.tel-link") || t.closest("a")))
        )) return;
      }
      var row = document.getElementById("courierRow_" + idx);
      if (!row) return;
      var open = row.classList.toggle("is-open");
      try {
        if (open && tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
      } catch (eH) {}
    }
    window.toggleCourierClientDetail_ = toggleCourierClientDetail_;

    function refreshCourierSummary() {
      const day = document.getElementById("courierDaySelect").value;
      const summary = document.getElementById("courierSummary");
      if (!day || !courierClientsCache.length) {
        summary.innerHTML = "";
        return;
      }
      const doneCount = courierClientsCache.filter(c => c.delivered).length;
      const dateLabel = (courierClientsCache._date || day);
      summary.innerHTML = `<div class="total-summary-badge">${escapeHtml(dateLabel)} · ${courierClientsCache.length} клиентов · доставлено <span style="color:var(--success-color)">${doneCount}</span></div>`;
    }

    async function toggleDelivered(index, delivered) {
      const day = document.getElementById("courierDaySelect").value;
      const client = courierClientsCache[index];
      if (!client) return;
      var paidAnswer = null;
      if (delivered && client.askPaid) {
        var slotLabel = (client.deliveriesN >= 2)
          ? (" доставка " + (client.deliverySlot || 1) + "/" + client.deliveriesN)
          : "";
        var picked = await uiChoiceAsync(
          "Оплата",
          "Клиент " + client.name + " (ПП, N=" + (client.deliveriesN || 2) + slotLabel + "). Оплачено?",
          [
            { label: "Да, оплачено", value: "yes", cls: "btn-green" },
            { label: "Нет", value: "no", cls: "btn-orange" },
            { label: "Отмена", value: "", cls: "" }
          ]
        );
        if (!picked) {

          var rows0 = document.querySelectorAll("#courierContainer .courier-row input[type=checkbox]");
          if (rows0[index]) rows0[index].checked = false;
          return;
        }
        paidAnswer = picked;
      }
      client.delivered = delivered;
      if (paidAnswer) client.paid = paidAnswer;
      rememberCourierLocalFlag_(client.name, delivered);
      if (!delivered) courierDetailExpanded_ = true;
      refreshCourierSummary();
      renderCourierClientsUi_();
      try {
        var body = { action: "setDelivered", day: day, client: client.name, delivered: delivered };
        if (paidAnswer) body.paid = paidAnswer;
        if (client.matchKey) body.matchKey = client.matchKey;
        var delRes = await apiPost(body);
        var delOk = delRes && (delRes.status === "success" || delRes.status === "sent_opaque");
        if (!delOk) throw new Error((delRes && delRes.message) || "save_failed");
        try { apiCacheBustMem_("getCourier"); } catch (eClr) {}
      } catch (e) {
        client.delivered = !delivered;
        rememberCourierLocalFlag_(client.name, !delivered);
        refreshCourierSummary();
        renderCourierClientsUi_();
        showToast("Не удалось сохранить галочку");
      }
    }

    async function notifyMissedDelivery_(index) {
      var day = document.getElementById("courierDaySelect").value;
      var client = courierClientsCache[index];
      if (!client) return;
      if (client.delivered) {
        showToast("Уже отмечен доставленным");
        return;
      }
      var reason = await uiChoiceAsync(
        "Не получил · " + client.name,
        "Коротко: почему не вручили? Менеджер получит задачу на перенос.",
        [
          { label: "Не открыл / не дома", value: "не дома", cls: "btn-orange" },
          { label: "Перенос по просьбе", value: "просил перенос", cls: "btn-blue" },
          { label: "Другое", value: "другое", cls: "" },
          { label: "Отмена", value: "", cls: "" }
        ]
      );
      if (!reason) return;
      if (reason === "другое") {
        var custom = await uiPromptAsync("Причина (кратко)", "например: звонок не берёт");
        if (custom === null) return;
        reason = String(custom || "").trim() || "другое";
      }
      var tid = "";
      try { tid = String(await ensureTelegramId() || "").trim(); } catch (eT) { tid = String(myTelegramId || ""); }
      if (!tid) {
        await uiAlertAsync("Нужен Telegram ID (вход в мини-апп)");
        return;
      }
      var myName = "";
      try {
        var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        myName = [u && u.first_name, u && u.last_name].filter(Boolean).join(" ").trim();
      } catch (eN) {}
      try {
        showToast("Отправляю менеджеру…");
        var body = {
          action: "notifyMissedDelivery",
          telegramId: tid,
          client: client.name,
          day: day,
          date: courierClientsCache._date || "",
          reason: reason,
          segment: client.segment || "",
          matchKey: client.matchKey || "",
          basket: client.basket || [],
          address: client.address || "",
          phone: client.phone || "",
          note: client.note || "",
          createdByName: myName
        };
        var res = null;
        try { res = await apiPost(body); } catch (ePost) { res = null; }
        if (!res || (res.status !== "success" && res.status !== "sent_opaque")) {
          try {
            res = await apiGet(Object.assign({}, body, {
              basket: JSON.stringify(client.basket || []),
              _: String(Date.now())
            }), { timeoutMs: 25000, cacheTtlMs: 0 });
          } catch (eGet) {}
        }
        if (!res || (res.status !== "success" && res.status !== "sent_opaque")) {
          await uiAlertAsync("Не удалось: " + ((res && res.message) || "ошибка / Deploy"));
          return;
        }
        try {
          courierClientsCache.splice(index, 1);
          refreshCourierSummary();
          renderCourierClientsUi_();
        } catch (eUi) {}
        try {
          apiCacheBustMem_("getCourier");
          apiCacheBustMem_("getClients");
          apiCacheBustMem_("getViewCompare");
          apiCacheBustMem_("getMonthOverview");
          apiCacheBustMem_("listDeferred");
        } catch (eClr) {}
        showToast("Снят с дня · только в Переносах");
        try {
          var xferId = (res && res.id) || ("xfer_" + Date.now());
          var xferItem = {
            id: xferId,
            mode: "transfer",
            title: "Перенос · не получил",
            clientNick: client.name,
            status: "open",
            payload: {
              mode: "transfer",
              parked: true,
              reason: reason,
              day: day,
              date: courierClientsCache._date || "",
              client: client.name,
              matchKey: client.matchKey || "",
              segment: client.segment || "",
              basket: client.basket || [],
              createdByName: myName
            }
          };
          var wantKey = "";
          try { wantKey = viewClientKey(client.name || client.matchKey || ""); } catch (eK) {}
          deferredCache = [xferItem].concat((deferredCache || []).filter(function (it) {
            if (!it || String(it.id) === String(xferId)) return false;
            var m = deferredItemMode_(it);
            if (m === "buy" || m === "remind" || m === "partner") return true;
            var nick = String(it.clientNick || (it.payload && (it.payload.client || it.payload.clientNick)) || it.client || "");
            var key = "";
            try { key = viewClientKey(nick); } catch (eN) {}
            if (wantKey && key && wantKey === key) return false;
            return true;
          }));
          deferredCacheAt = Date.now();
          _tasksTab = "xfer";
          _tasksAutoPickOnOpen = false;
          try { renderTasksDrawer(false); } catch (ePaint) {}
        } catch (eX) {}
      } catch (e) {
        await uiAlertAsync(e.message || "Ошибка сети");
      }
    }
    window.notifyMissedDelivery_ = notifyMissedDelivery_;

    async function openTransferTask_(id) {
      id = String(id || "").trim();
      if (!id) return;
      var tid = "";
      try { tid = String(await ensureTelegramId() || "").trim(); } catch (eT) { tid = String(myTelegramId || ""); }
      try { closeTasksDrawer(); } catch (eC) {}
      showToast("Загрузка переноса…");
      var res = null;
      try {
        res = await apiGet({
          action: "getTransferTask",
          telegramId: tid,
          id: id,
          _: String(Date.now())
        }, { timeoutMs: 20000, cacheTtlMs: 0 });
      } catch (e) {
        await uiAlertAsync(e.message || "Ошибка сети");
        return;
      }
      if (!res || res.status !== "success" || !res.item) {
        await uiAlertAsync("Задача не найдена — нужен Deploy или уже закрыта");
        return;
      }
      var it = res.item;
      var p = it.payload || {};
      var week = res.weekCounts || [];
      var weekHtml = week.length
        ? ('<div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;">' +
          week.filter(function (w) { return w.short !== "Сб" && w.short !== "Вс"; }).map(function (w) {
            return '<span class="client-badge" style="background:#222;">' +
              escapeHtml(w.short) + " " + (Number(w.count) || 0) + "</span>";
          }).join("") + "</div>")
        : "";
      var basket = Array.isArray(p.basket) ? p.basket : [];
      var basketLines = basket.slice(0, 12).map(function (x) {
        var nm = String(x.name || x.main || "").trim();
        var v = x.val != null ? x.val : x.value;
        return nm ? ("· " + nm + (v != null && v !== "" ? (" — " + v) : "")) : "";
      }).filter(Boolean).join("<br>");
      var modalP = openModal(
        '<div class="modal-title">Перенос · ' + escapeHtml(it.clientNick || p.client || "") + "</div>" +
        '<div class="modal-text">' +
        "<b>Тип:</b> " + escapeHtml(p.segment || "—") + "<br>" +
        "<b>Был день:</b> " + escapeHtml(p.day || p.date || "—") + "<br>" +
        "<b>Причина:</b> " + escapeHtml(p.reason || "—") + "<br>" +
        (p.createdByName ? ("<b>Курьер:</b> " + escapeHtml(p.createdByName) + "<br>") : "") +
        weekHtml +
        (basketLines ? ('<div class="muted" style="margin-top:8px;font-size:12px;"><b>Состав</b><br>' + basketLines + "</div>") : "") +
        "</div>" +
        '<div class="modal-actions">' +
        '<button class="btn-action btn-green" type="button" id="modalXferGo">Перенести на другой день</button>' +
        '<button class="btn-action" type="button" id="modalXferLater" style="background:#3a3a3c;">Позже</button>' +
        "</div>"
      );
      setTimeout(function () {
        var a = document.getElementById("modalXferGo");
        var b = document.getElementById("modalXferLater");
        if (a) a.onclick = function () { closeModal("go"); };
        if (b) b.onclick = function () { closeModal(null); };
      }, 0);
      var go = await modalP;
      if (go !== "go") return;
      var clientName = it.clientNick || p.client || "";
      var pickedDate = await uiPickMoveDate(clientName, p.dateIso || p.date || "");
      if (!pickedDate) return;
      var target = await resolveMoveTargetFromDate_(pickedDate);
      if (!target || !target.newDate) {
        await uiAlertAsync("Не удалось определить дату");
        return;
      }
      var cutLabel = target.newDate + (target.newDay ? (" · " + target.newDay) : " · календарь");
      var cutP = openModal(
        '<div class="modal-title">Перенос клиента</div>' +
        '<div class="modal-text">Перенос <b>' + escapeHtml(clientName) + '</b> → <b>' + escapeHtml(cutLabel) + '</b>.<br><br>' +
        'Нарезать сырьё на этого клиента в новом дне вместе со всеми?</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-action btn-orange" type="button" id="modalCutYes">Да, резать</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalCutNo">Нет — только перенос</button>' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
        "</div>"
      );
      setTimeout(function () {
        var y = document.getElementById("modalCutYes");
        var n = document.getElementById("modalCutNo");
        var c = document.getElementById("modalCancel");
        if (y) y.onclick = function () { closeModal("yes"); };
        if (n) n.onclick = function () { closeModal("no"); };
        if (c) c.onclick = function () { closeModal(null); };
      }, 0);
      var cutRaw = await cutP;
      if (!cutRaw) return;
      var placed = null;
      try {
        placed = await apiGet({
          action: "placeTransferTask",
          telegramId: tid,
          id: id,
          newDate: target.newDate,
          newDay: target.newDay || "",
          cutRaw: cutRaw === "yes" ? "1" : "0",
          _: String(Date.now())
        }, { timeoutMs: 30000, cacheTtlMs: 0 });
      } catch (ePl) {
        await uiAlertAsync(ePl.message || "Ошибка сети");
        return;
      }
      if (!placed || placed.status !== "success") {
        await uiAlertAsync("Не удалось: " + ((placed && (placed.message || placed.status)) || "ошибка"));
        return;
      }
      deferredCacheAt = 0;
      try {
        apiCacheBustMem_("getClients");
        apiCacheBustMem_("getViewCompare");
        apiCacheBustMem_("getMonthOverview");
        apiCacheBustMem_("listDeferred");
        afterPeopleMutationDays_(target.newDay ? [target.newDay] : []);
      } catch (eClr) {}
      try { await loadClientsForDay(); } catch (eLd) {}
      if (target.newDay) {
        try { await refreshDayViews(target.newDay, { force: true }); } catch (eR) {}
      }
      try { renderTasksDrawer(true); } catch (eR) {}
      showToast("Перенесено на " + (target.newDay || target.newDate));
    }
    window.openTransferTask_ = openTransferTask_;

    function consumeXferDeepLink_() {
      var id = "";
      try {
        var u = new URL(location.href);
        id = String(u.searchParams.get("xfer") || "").trim();
      } catch (eU) {}
      if (!id) {
        try {
          var sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
          if (/^xfer[_-]/i.test(sp)) id = String(sp).replace(/^xfer[_-]/i, "").trim();
        } catch (eS) {}
      }
      if (!id) return;
      try {
        var u2 = new URL(location.href);
        u2.searchParams.delete("xfer");
        history.replaceState({}, "", u2.toString());
      } catch (eH) {}
      setTimeout(function () {
        try { setTasksTab("xfer"); openTasksDrawer(); } catch (eD) {}
        openTransferTask_(id);
      }, 700);
    }
    window.consumeXferDeepLink_ = consumeXferDeepLink_;

    function defaultOrderNote() {
      return { text: "", roles: { mgr: false, cut: false, cour: true }, permanent: false, itemKey: "" };
    }
    function noteItemKeyFromBasketItem_(it) {
      var main = String((it && (it.main || it.name)) || "").trim();
      var sub = String((it && it.sub) || "").trim();
      if (!main) return "";
      return sub ? (main + "/" + sub) : main;
    }
    function basketNoteItemOptionsHtml_(selected) {
      selected = String(selected || "");
      var opts = ['<option value="">Ко всему заказу</option>'];
      var seen = {};
      (basket || []).forEach(function (it) {
        var key = noteItemKeyFromBasketItem_(it);
        if (!key || seen[key]) return;
        seen[key] = true;
        var label = key.replace(/\//g, " · ");
        opts.push('<option value="' + String(key).replace(/"/g, "&quot;") + '"' +
          (selected === key ? " selected" : "") + ">" + escapeHtml(label) + "</option>");
      });
      return opts.join("");
    }
    function renderOrderNotes() {
      var box = document.getElementById("notesList");
      if (!box) return;
      if (!orderNotes.length) orderNotes = [defaultOrderNote()];
      box.innerHTML = orderNotes.map(function (n, i) {
        var r = n.roles || {};
        var itemRow = r.cut
          ? ('<div class="note-item-row"><span class="muted" style="font-size:12px;">Позиция:</span>' +
            '<select onchange="setOrderNoteItem(' + i + ', this.value)">' + basketNoteItemOptionsHtml_(n.itemKey) + "</select></div>")
          : "";
        return '<div class="note-block" data-ni="' + i + '">' +
          '<input type="text" class="note-text" placeholder="Текст примечания" value="' + String(n.text || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;") + '" ' +
          'oninput="onOrderNoteText(' + i + ', this.value)">' +
          '<div class="note-meta">' +
          '<button type="button" class="seg-btn' + (r.mgr ? " active" : "") + '" onclick="toggleOrderNoteRole(' + i + ',\'mgr\')">Менеджеру</button>' +
          '<button type="button" class="seg-btn' + (r.cut ? " active" : "") + '" onclick="toggleOrderNoteRole(' + i + ',\'cut\')">Нарезчику</button>' +
          '<button type="button" class="seg-btn' + (r.cour ? " active" : "") + '" onclick="toggleOrderNoteRole(' + i + ',\'cour\')">Курьеру</button>' +
          (orderNotes.length > 1 ? '<button type="button" class="seg-btn" onclick="removeOrderNote(' + i + ')">✕</button>' : "") +
          '</div>' +
          itemRow +
          '<div class="note-perm-row">' +
          '<button type="button" class="seg-btn' + (!n.permanent ? " active" : "") + '" onclick="setOrderNotePerm(' + i + ',false)">Разовое</button>' +
          '<button type="button" class="seg-btn' + (n.permanent ? " active" : "") + '" onclick="setOrderNotePerm(' + i + ',true)">Постоянное → Контакты</button>' +
          '</div></div>';
      }).join("");
      syncLegacyNoteInput();
      try { updateNotesSummary(); } catch (e) {}
    }
    function onOrderNoteText(i, v) {
      if (!orderNotes[i]) return;
      orderNotes[i].text = v;
      syncLegacyNoteInput();
    }
    function toggleOrderNoteRole(i, role) {
      if (!orderNotes[i]) return;
      orderNotes[i].roles[role] = !orderNotes[i].roles[role];
      if (role === "cut" && !orderNotes[i].roles.cut) orderNotes[i].itemKey = "";
      renderOrderNotes();
    }
    function setOrderNotePerm(i, perm) {
      if (!orderNotes[i]) return;
      orderNotes[i].permanent = !!perm;
      renderOrderNotes();
    }
    function setOrderNoteItem(i, key) {
      if (!orderNotes[i]) return;
      orderNotes[i].itemKey = String(key || "").trim();
      syncLegacyNoteInput();
    }
    function addOrderNote() {
      orderNotes.push(defaultOrderNote());
      renderOrderNotes();
    }
    function removeOrderNote(i) {
      orderNotes.splice(i, 1);
      if (!orderNotes.length) orderNotes = [defaultOrderNote()];
      renderOrderNotes();
    }
    function syncLegacyNoteInput() {
      var ni = document.getElementById("noteInput");
      if (ni) ni.value = serializeOrderNotes(orderNotes);
    }
    function sanitizeNoteItemKey_(key) {
      return String(key || "").trim().replace(/[\[\]\|]/g, " ").replace(/\s+/g, " ").trim();
    }
    function serializeOrderNotes(list) {
      var parts = [];
      (list || []).forEach(function (n) {
        var t = String(n.text || "").trim();
        if (!t) return;
        var roles = [];
        if (n.roles && n.roles.mgr) roles.push("mgr");
        if (n.roles && n.roles.cut) roles.push("cut");
        if (n.roles && n.roles.cour) roles.push("cour");
        if (!roles.length) roles = ["cour"];
        var kind = n.permanent ? "perm" : "once";
        var item = sanitizeNoteItemKey_(n.itemKey);
        var tag = "[NOTE:" + roles.join(",") + "|" + kind + (item && roles.indexOf("cut") >= 0 ? ("|ITEM:" + item) : "") + "]";
        parts.push(tag + " " + t);
      });
      return parts.join(" || ");
    }
    function parseOrderNotesFromRaw(raw) {
      var s = String(raw || "").trim();
      if (!s) return [defaultOrderNote()];
      var blocks = [];
      var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([^]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
      var m;
      while ((m = re.exec(s))) {
        var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
        var roles = { mgr: rolesArr.indexOf("mgr") >= 0, cut: rolesArr.indexOf("cut") >= 0, cour: rolesArr.indexOf("cour") >= 0 };
        blocks.push({
          text: String(m[4] || "").trim(),
          roles: roles,
          permanent: m[2] === "perm",
          itemKey: String(m[3] || "").trim()
        });
      }
      if (blocks.length) return blocks;

      var rolesL = parseNoteAudience(s);
      var text = stripMetaFromNote(s).replace(/\[TEL:[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim();
      text = text.replace(/\[NOTE:[^\]]+\]/gi, "").trim();
      return [{
        text: text,
        roles: { mgr: rolesL.indexOf("mgr") >= 0, cut: rolesL.indexOf("cut") >= 0, cour: rolesL.indexOf("cour") >= 0 },
        permanent: false,
        itemKey: ""
      }];
    }
    function loadOrderNotesFromRaw(raw) {
      orderNotes = parseOrderNotesFromRaw(raw);
      renderOrderNotes();
    }
    function clearOrderNotes() {
      orderNotes = [defaultOrderNote()];
      renderOrderNotes();
    }
    function collectPermanentNotesText() {
      return (orderNotes || []).filter(function (n) {
        return n.permanent && String(n.text || "").trim();
      }).map(function (n) { return String(n.text).trim(); }).join(" · ");
    }
    function assembleNoteForSave(extraTags) {
      var body = serializeOrderNotes(orderNotes);
      var tags = String(extraTags || "").trim();
      return (tags + (tags && body ? " " : "") + body).trim();
    }
    window.addOrderNote = addOrderNote;
    window.removeOrderNote = removeOrderNote;
    window.toggleOrderNoteRole = toggleOrderNoteRole;
    window.setOrderNotePerm = setOrderNotePerm;
    window.setOrderNoteItem = setOrderNoteItem;
    window.onOrderNoteText = onOrderNoteText;

    function stripDeliveryTags(note) {
      return String(note || "")
        .replace(/\[ЕВРОПОЧТА\]/gi, "")
        .replace(/\[БЕЛПОЧТА\]/gi, "")
        .replace(/\[КУРЬЕР\]/gi, "")
        .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
        .replace(/\[TO:[^\]]+\]/gi, "")
        .replace(/\[NOTE:[^\]]+\]/gi, "")
        .replace(/\[TEL:[^\]]+\]/gi, "")
        .replace(/\[PAID:[^\]]+\]/gi, "")
        .replace(/\[ЦЕНА:[^\]]*\]/gi, "")
        .replace(/\[GEO:[^\]]+\]/gi, "")
        .replace(/\[YMAPS:[^\]]+\]/gi, "")
        .replace(/\[SEG:[^\]]*\]/gi, "")
        .replace(/\[SUB:[^\]]*\]/gi, "")
        .replace(/\[ПП[^\]]*\]/gi, "")
        .replace(/ПП\s*N\s*=\s*\d+[^\n[]*/gi, "")
        .replace(/\[НЕ РЕЗАТЬ\]/gi, "")
        .replace(/\[РЕЗАТЬ\]/gi, "")
        .replace(/\|\|/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function stripMetaFromNote(note) {
      return stripDeliveryTags(note);
    }

    function humanVisibleNote(note, role) {
      role = role || "mgr";
      var raw = String(note || "");
      var bits = [];
      var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([^]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
      var m;
      var anyBlock = false;
      var matchedRoles = [];
      while ((m = re.exec(raw))) {
        anyBlock = true;
        var rolesArr = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
        if (rolesArr.indexOf(role) < 0) continue;
        var t = String(m[4] || "").replace(/\[TEL:[^\]]+\]/gi, "").trim();
        t = stripMetaFromNote(t);
        var item = String(m[3] || "").trim();
        if (t) {
          bits.push(item ? ("[" + item + "] " + t) : t);
          matchedRoles = rolesArr;
        }
      }
      if (anyBlock) {
        return { text: bits.join(" · "), fromBlocks: true, roles: matchedRoles };
      }
      var free = stripMetaFromNote(raw);

      free = free.replace(/\+?375[\d\s\-]{9,}/g, "").replace(/\s{2,}/g, " ").trim();
      return { text: free, fromBlocks: false, roles: [] };
    }

    function parseNoteAudience(note) {
      const m = String(note || "").match(/\[TO:([^\]]+)\]/i);
      if (!m) return ["mgr", "cour"]; // старые примечания — менеджеру и курьеру
      const roles = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(function (r) {
        return r === "mgr" || r === "cut" || r === "cour";
      });
      return roles.length ? roles : ["mgr", "cour"];
    }

    function formatNoteRoles(roles) {
      const map = { mgr: "менеджер", cut: "нарезчик", cour: "курьер" };
      return (roles || []).map(function (r) { return map[r] || r; }).join(", ");
    }

    function noteTextForRole(note, role) {
      return humanVisibleNote(note, role).text;
    }

    function applyNoteAudience(note, roles) {
      const clean = stripMetaFromNote(note);
      const list = (roles || []).filter(function (r) {
        return r === "mgr" || r === "cut" || r === "cour";
      });
      if (!clean || !list.length) return clean;
      return ("[TO:" + list.join(",") + "] " + clean).trim();
    }

    function getSelectedNoteRoles() {
      const out = [];
      if (noteRoles.mgr) out.push("mgr");
      if (noteRoles.cut) out.push("cut");
      if (noteRoles.cour) out.push("cour");
      return out;
    }

    function setNoteRoles(next) {
      noteRoles = {
        mgr: !!(next && next.mgr),
        cut: !!(next && next.cut),
        cour: !!(next && next.cour)
      };
      const map = { mgr: "noteRoleMgr", cut: "noteRoleCut", cour: "noteRoleCour" };
      Object.keys(map).forEach(function (k) {
        const el = document.getElementById(map[k]);
        if (el) el.classList.toggle("active", !!noteRoles[k]);
      });
    }

    function setNoteRolesFromNote(note) {
      const roles = parseNoteAudience(note);
      setNoteRoles({
        mgr: roles.indexOf("mgr") >= 0,
        cut: roles.indexOf("cut") >= 0,
        cour: roles.indexOf("cour") >= 0
      });
    }

    function toggleNoteRole(role) {
      if (!noteRoles.hasOwnProperty(role)) return;
      noteRoles[role] = !noteRoles[role];
      setNoteRoles(noteRoles);
    }

    function stripOfficeTag(note) {
      return String(note || "")
        .replace(/\[ОТДЕЛЕНИЕ:[^\]]*\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function applyOfficeTag(note, officeAddr) {
      const clean = stripOfficeTag(note);
      const addr = String(officeAddr || "").trim();
      if (!addr) return clean;
      return (clean + " [ОТДЕЛЕНИЕ:" + addr.replace(/[\[\]]/g, "") + "]").trim();
    }

    function parseOfficeAddress(note) {
      const m = String(note || "").match(/\[ОТДЕЛЕНИЕ:([^\]]+)\]/i);
      return m ? String(m[1] || "").trim() : "";
    }

    function applyDeliveryTag(note, method) {
      const clean = stripDeliveryTags(note);
      const tag = method === "euro" ? "[ЕВРОПОЧТА]" : method === "bel" ? "[БЕЛПОЧТА]" : method === "courier" ? "[КУРЬЕР]" : "";
      return (tag + (clean ? " " + clean : "")).trim();
    }

    function parseDeliveryMethod(note) {
      const n = String(note || "");
      if (/\[ЕВРОПОЧТА\]/i.test(n)) return "euro";
      if (/\[БЕЛПОЧТА\]/i.test(n)) return "bel";
      if (/\[КУРЬЕР\]/i.test(n)) return "courier";
      return null;
    }

    function setDeliveryMethod(method) {
      selectedDeliveryMethod = method;
      const map = { euro: "delivEuro", bel: "delivBel", courier: "delivCourier" };
      Object.keys(map).forEach(function (k) {
        const el = document.getElementById(map[k]);
        if (el) el.classList.toggle("active", k === method);
      });
      const officeGroup = document.getElementById("postOfficeGroup");
      const isPost = method === "euro" || method === "bel";
      if (officeGroup) officeGroup.style.display = isPost ? "block" : "none";
    }

    function looksLikeOtherCity(addr) {
      return /(брест|гродн|гомел|витебск|могил[её]в|борисов|жодино|молодечн|баранович|пинск|орша|полоцк|лида|слоним|бобруйск|солигорск|слуцк|дзержинск|фанипол|смолевич|светлогорск|жлобин|речиц|новополоцк|мозыр|колодищ|голодищ|городищ|боровлян|жданович|ратомк|миханович|семков|прилук|крыжовк|хатежин|тарасов|раубич|озерц|щепич|заславл|логойск|руденск|мачулищ|сеница|копищ|юхновк|лесной|гай\b)/i.test(addr);
    }

    function detectSearchLocality_(text) {
      var s = String(text || "");
      var m = s.match(/(колодищ\w*|голодищ\w*|городищ\w*|боровлян\w*|жданович\w*|фанипол\w*|дзержинск\w*|смолевич\w*|ратомк\w*|миханович\w*|семков\w*|прилук\w*|крыжовк\w*|хатежин\w*|тарасов\w*|раубич\w*|озерц\w*|щепич\w*|заславл\w*|логойск\w*|руденск\w*|мачулищ\w*|сениц\w*|копищ\w*|юхновк\w*|лесной|боровляны|брест\w*|гродн\w*|гомел\w*|витебск\w*|могил[её]в\w*|борисов\w*|жодино|молодечн\w*|баранович\w*|пинск\w*|орша|полоцк\w*|лида|слоним\w*|бобруйск\w*|солигорск\w*|слуцк\w*)/i);
      if (!m) return "";
      var loc = String(m[0] || "");

      if (/^голодищ/i.test(loc)) loc = loc.replace(/^голодищ/i, "Колодищ");
      return loc;
    }

    function normalizeLocalityTypo_(s) {
      return String(s || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/голодищ/g, "колодищ")
        .replace(/гродищ/g, "городищ");
    }

    function geocodeQuery(addr) {
      const a = String(addr || "").trim();
      if (!a) return "";
      if (looksLikeOtherCity(a) || /минск/i.test(a)) {
        return /беларусь/i.test(a) ? a : ("Беларусь, " + a);
      }
      return "Беларусь, " + DEFAULT_CITY + ", " + a;
    }

    async function isOutsideMinskDelivery(addr) {
      const a = String(addr || "").trim();
      if (!a) return false;
      if (looksLikeOtherCity(a)) return true;
      const geo = await geocodeAddress(a, true);
      if (!geo) return false;
      return haversineKm(MINSK_CENTER, geo) > MINSK_RADIUS_KM;
    }

    async function onAddressBlur() {
      try { autofillAddressDetailFields_(); } catch (eAf) {}
      const addr = document.getElementById("addressInput").value.trim();
      if (!addr) {
        document.getElementById("deliveryMethodGroup").style.display = "none";
        return;
      }
      const outside = await isOutsideMinskDelivery(addr);
      const group = document.getElementById("deliveryMethodGroup");
      if (!outside) {
        group.style.display = "none";
        selectedDeliveryMethod = null;
        const pog = document.getElementById("postOfficeGroup");
        if (pog) pog.style.display = "none";
        return;
      }
      group.style.display = "block";
      if (!selectedDeliveryMethod) {
        const picked = await uiChoiceAsync(
          "Доставка за Минском",
          "Этот адрес вне Минска или дальше 20 км. Как доставляем?",
          [
            { label: "Европочта", value: "euro", cls: "btn-green" },
            { label: "Белпочта", value: "bel", cls: "btn-blue" },
            { label: "Курьер", value: "courier", cls: "" }
          ]
        );
        if (picked) setDeliveryMethod(picked);
      } else {
        setDeliveryMethod(selectedDeliveryMethod);
      }
    }

    function onPostOfficeInput() {
      selectedPostOfficeGeo = null;
      var q = document.getElementById("postOfficeInput").value.trim();
      clearTimeout(postOfficeSuggestTimer);
      var box = document.getElementById("postOfficeSuggest");
      if (q.length < 2) {
        if (box) { box.classList.remove("open"); box.innerHTML = ""; }
        return;
      }
      postOfficeSuggestTimer = setTimeout(function () { fetchPostOfficeSuggest(q); }, 180);
    }

    function onPostOfficeBlurDelayed() {
      setTimeout(function () {
        var a = document.activeElement;
        if (a && a.closest && a.closest("#postOfficeSuggest")) return;
        var box = document.getElementById("postOfficeSuggest");
        if (box) { box.classList.remove("open"); box.innerHTML = ""; }
      }, 280);
    }

    async function fetchPostOfficeSuggest(q) {
      var seq = ++postOfficeSuggestSeq;
      var box = document.getElementById("postOfficeSuggest");
      if (!box) return;
      box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ищу отделение…</div>';
      box.classList.add("open");
      var list = [];
      try { list = await photonSuggestClient(q); } catch (e1) {}
      if ((!list || !list.length) && seq === postOfficeSuggestSeq) {
        try {
          var res = await apiGet({ action: "suggestAddress", text: q });
          list = (res && res.results) || [];
        } catch (e2) {}
      }
      if (seq !== postOfficeSuggestSeq) return;
      if (!list.length) {
        box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ничего не найдено — можно ввести вручную</div>';
        return;
      }
      box._items = list;
      box.innerHTML = list.map(function (item, i) {
        return '<button type="button" class="addr-suggest-item" data-idx="' + i + '">' +
          escapeHtml(item.title || item.address || "") +
          (item.subtitle ? '<span class="addr-suggest-sub">' + escapeHtml(item.subtitle) + "</span>" : "") +
          "</button>";
      }).join("");
      box.querySelectorAll(".addr-suggest-item").forEach(function (btn) {
        btn.onmousedown = function (e) { e.preventDefault(); };
        btn.onclick = function () {
          var it = list[Number(btn.getAttribute("data-idx"))];
          if (!it) return;
          document.getElementById("postOfficeInput").value = it.address || it.title || "";
          selectedPostOfficeGeo = {
            lat: it.lat, lon: it.lon,
            address: it.address || it.title || "",
            yandexUrl: it.yandexUrl
          };
          box.classList.remove("open");
          box.innerHTML = "";
        };
      });
    }

    function extractPhone(text) {
      const s = String(text || "");
      const mTel = s.match(/\[TEL:([^\]]+)\]/i);
      if (mTel) return mTel[1].trim();
      const m = s.match(/(\+?375[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+?\d[\d\s\-]{8,}\d)/);
      return m ? m[1].replace(/\s+/g, "") : "";
    }

    function extractOrderPrice(note) {
      var m = String(note || "").match(/\[ЦЕНА:\s*([0-9]+(?:[.,][0-9]+)?)\s*BYN?\]/i);
      if (!m) return null;
      var n = Number(String(m[1]).replace(",", "."));
      return isNaN(n) ? null : n;
    }
    function resolveClientOrderPrice(clientOrNote) {
      if (clientOrNote && typeof clientOrNote === "object") {
        if (clientOrNote.orderPrice != null && clientOrNote.orderPrice !== "" && !isNaN(Number(clientOrNote.orderPrice))) {
          return Number(clientOrNote.orderPrice);
        }
        return extractOrderPrice(clientOrNote.note || "");
      }
      return extractOrderPrice(clientOrNote);
    }
    function formatOrderPriceHtml(noteOrPrice, opts) {
      // ПП уже оплачен — цену не пишем (бейдж «оплачено» в clientTechBadgesHtml_)
      if (noteOrPrice && typeof noteOrPrice === "object") {
        if (noteOrPrice.ppPaid || String(noteOrPrice.paid || "").toLowerCase() === "yes") {
          return "";
        }
      }
      var price = (typeof noteOrPrice === "number") ? noteOrPrice : resolveClientOrderPrice(noteOrPrice);
      if (price == null) return "";
      var br = opts && opts.br ? "<br>" : "";
      return br + '<div class="delivery-line" style="color:#30d158;font-weight:700;">Цена: ' +
        escapeHtml(String(price)) + " BYN</div>";
    }
    function clientTechBadgesHtml_(client) {
      var bits = [];
      var seg = String((client && client.segment) || "").trim().toUpperCase();
      if (!(seg === "ПП" || seg === "БП" || seg === "Р" || seg.indexOf("ПАРТ") === 0 || seg === "АФК")) {
        seg = orderTypeToSegment_(resolveClientOrderType_(client)) || "";
      }
      if (seg === "AFK" || seg === "АФК") seg = "ПП";
      if (seg === "PP") seg = "ПП";
      if (seg === "BP") seg = "БП";
      if (seg) bits.push('<span class="client-badge" style="background:rgba(94,92,230,0.25);color:#bfbfff;">' + escapeHtml(seg) + "</span>");

      var ppPaid = !!(client && (client.ppPaid || String(client.paid || "").toLowerCase() === "yes"));
      var isPpSeg = (seg === "ПП" || seg === "АФК");
      if (ppPaid && isPpSeg) {
        bits.push('<span class="client-badge" style="background:rgba(48,209,88,0.28);color:#30d158;">оплачено</span>');
      } else {
        var price = resolveClientOrderPrice(client);
        if (price != null) bits.push('<span class="client-badge" style="background:rgba(48,209,88,0.2);color:#30d158;">' + escapeHtml(String(price)) + " BYN</span>");
      }
      var aft = String((client && client.deliveryAfter) || "").trim();
      var bef = String((client && client.deliveryBefore) || "").trim();
      if (aft) bits.push('<span class="client-badge" style="background:rgba(255,159,10,0.2);color:#ffd60a;">≥' + escapeHtml(aft) + "</span>");
      if (bef) bits.push('<span class="client-badge" style="background:rgba(255,69,58,0.2);color:#ff6961;">≤' + escapeHtml(bef) + "</span>");
      var part = String((client && client.ppPartner) || "").trim();
      var isBpSeg = (seg === "БП" || seg === "BP");
      if (part && isBpSeg) bits.push('<span class="client-badge" style="background:rgba(100,210,255,0.2);color:#64d2ff;">→' + escapeHtml(part) + "</span>");
      var cq = Number(client && client.couponsQty) || 0;
      var cp = Number(client && client.couponPrice) || 0;
      if (cq > 0 && cp > 0) {
        bits.push('<span class="client-badge" style="background:rgba(255,214,10,0.2);color:#ffd60a;">купоны ' +
          escapeHtml(String(cq)) + " шт · " + escapeHtml(String(cp)) + " BYN</span>");
      }
      return bits.join(" ");
    }
    window.extractOrderPrice = extractOrderPrice;
    window.resolveClientOrderPrice = resolveClientOrderPrice;
    function normalizeTelHref(phone) {
      let d = String(phone || "").replace(/[^\d+]/g, "");
      if (!d) return "";
      if (d.indexOf("+") !== 0) {
        if (d.indexOf("375") === 0) d = "+" + d;
        else if (d.length === 9) d = "+375" + d;
        else if (d.length === 11 && d[0] === "8") d = "+375" + d.slice(1);
        else d = "+" + d.replace(/^\+/, "");
      }
      return "tel:" + d;
    }
    function callPhoneFromEl_(el, ev) {
      if (ev) {
        try { ev.preventDefault(); } catch (e0) {}
        try { ev.stopPropagation(); } catch (e1) {}
        try { ev.stopImmediatePropagation(); } catch (e1b) {}
      }
      var href = "";
      if (el) {
        href = el.getAttribute("data-tel") || el.getAttribute("href") || "";
      }
      if (!href) return false;
      try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light"); } catch (eH) {}
      // Telegram Mini App: tel: надёжнее через window.open('_blank')
      try {
        var w = window.open(href, "_blank");
        if (w) return false;
      } catch (e2) {}
      try {
        window.location.href = href;
        return false;
      } catch (e3) {}
      try {
        var a = document.createElement("a");
        a.setAttribute("href", href);
        a.setAttribute("target", "_blank");
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { try { a.remove(); } catch (eR) {} }, 500);
      } catch (e4) {}
      return false;
    }
    window.callPhoneFromEl_ = callPhoneFromEl_;
    function formatTelHtml(phone, opts) {
      const p = String(phone || "").trim();
      if (!p) return "";
      const href = normalizeTelHref(p);
      if (!href) return "";
      var cls = (opts && opts.always) ? "courier-tel-line" : "";
      return '<div class="delivery-line ' + cls + '" onclick="event.stopPropagation()">' +
        '<button type="button" class="tel-link tel-btn" data-tel="' + href + '"' +
        ' onclick="return callPhoneFromEl_(this, event)">📞 ' + escapeHtml(p) + "</button></div>";
    }

    function applyDepotPreset(addr) {
      const el = document.getElementById("depotAddress");
      if (el) el.value = addr;
      saveDepotAddress();
      const btn = document.getElementById("depotPresetWh");
      if (btn) btn.classList.add("active");
      showToast("Выезд: " + addr);
    }
    window.applyDepotPreset = applyDepotPreset;

    function parseGeoFromNote(note) {
      const m = String(note || "").match(/\[GEO:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/i);
      if (!m) return null;
      return { lat: Number(m[1]), lon: Number(m[2]) };
    }

    function parseYandexUrlFromNote(note) {
      const m = String(note || "").match(/\[YMAPS:(https:\/\/[^\]]+)\]/i);
      return m ? m[1] : "";
    }

    function stripGeoTags(note) {
      return String(note || "")
        .replace(/\[GEO:[^\]]+\]/gi, "")
        .replace(/\[YMAPS:[^\]]+\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function applyGeoTags(note, geo) {
      var clean = stripGeoTags(note);
      if (!geo || geo.lat == null || geo.lon == null) return clean;
      var tags = "[GEO:" + geo.lat + "," + geo.lon + "]";
      if (geo.yandexUrl) tags += " [YMAPS:" + geo.yandexUrl + "]";
      return (clean + " " + tags).trim();
    }

    function setAddressPickedHint(on) {
      var el = document.getElementById("addressPickedHint");
      if (el) el.classList.toggle("show", !!on);
    }

    try {
      localStorage.removeItem("superboyna_addr_memory_v1");
      localStorage.removeItem("superboyna_addr_memory_v2");
    } catch (eClrAddrMem) {}

    function normalizeAddrSearchKey(s) {
      return String(s || "")
        .toUpperCase()
        .replace(/Ё/g, "Е")
        .replace(/І/g, "И")
        .replace(/Ў/g, "У")
        .replace(/['’ʻ]/g, "")
        .replace(/\bУЛ\.?\b/g, " ")
        .replace(/\bУЛИЦ[АЫ]\b/g, " ")
        .replace(/\bВУЛ\.?\b/g, " ")
        .replace(/\bВУЛІЦ[АЫЕУ]?\b/g, " ")
        .replace(/\bПР\.?-?\s*Т\.?\b/g, " ")
        .replace(/\bПРОСПЕКТ(Е|А|У)?\b/g, " ")
        .replace(/\bПРАСПЕКТ(Е|А|У)?\b/g, " ")
        .replace(/\bПР\.?\b/g, " ")
        .replace(/\bПЕР\.?\b/g, " ")
        .replace(/\bПЕРЕУЛОК\b/g, " ")
        .replace(/\bЗАВУЛАК\b/g, " ")
        .replace(/\bБУЛ\.?\b/g, " ")
        .replace(/\bБУЛЬВАР\b/g, " ")
        .replace(/\bПЛ\.?\b/g, " ")
        .replace(/\bПЛОЩАД[ЬИ]\b/g, " ")
        .replace(/\bПЛОШЧ[АЫЕУ]?\b/g, " ")
        .replace(/\bМИНСК\b/g, " ")
        .replace(/\bМІНСК\b/g, " ")
        .replace(/\bБЕЛАРУСЬ\b/g, " ")
        .replace(/ОВСКОГО\b/g, "ОВСКОГО")
        .replace(/АЎСКАГА\b/g, "ОВСКОГО")
        .replace(/АУСКАГА\b/g, "ОВСКОГО")
        .replace(/СКОГО\b/g, "СКОГО")
        .replace(/СКАГА\b/g, "СКОГО")
        .replace(/ОВА\b/g, "ОВА")
        .replace(/АВА\b/g, "ОВА")
        .replace(/[.,«»"']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeHouseKey_(h) {
      return String(h || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\s+/g, "")
        .replace(/корп\.?|корпус/gi, "к")
        .replace(/стр\.?|строение/gi, "с")
        .replace(/[k]/g, "к");
    }

    function stripAddressDetailsForSearch_(text) {

      var raw0 = String(text || "").trim().replace(/\s+/g, " ");
      if (!raw0) return "";
      return raw0
        .replace(/(?:^|[·|;,\s])(?:подъезд|под\.|п\.)\s*[0-9]+[а-яa-z]?/gi, " ")
        .replace(/(?:^|[·|;,\s])(?:этаж|эт\.?)\s*[0-9]+[а-яa-z]?/gi, " ")
        .replace(/(?:^|[·|;,\s])(?:квартира|кв\.?)\s*[0-9]+[а-яa-z\-\/]*/gi, " ")
        .replace(/(?:^|[·|;,\s])[0-9]+[а-яa-z\-\/]*\s*кв\.?\b/gi, " ")
        .replace(/(?:^|[·|;,\s])домофон\s*[^\s·|;,]{1,24}/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim() || raw0;
    }

    function greaterMinskNominatimViewbox_() {
      return "27.15,54.15,28.05,53.65";
    }

    function inGreaterMinskRegion_(lat, lon) {
      lat = Number(lat);
      lon = Number(lon);
      return lat >= 53.65 && lat <= 54.15 && lon >= 27.15 && lon <= 28.05;
    }

    function inBelarusBbox_(lat, lon) {
      lat = Number(lat);
      lon = Number(lon);
      return lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9;
    }

    function addressGeoAllowed_(lat, lon, text) {
      if (looksLikeOtherCity(text) || detectSearchLocality_(text)) {
        return inBelarusBbox_(lat, lon);
      }
      return inGreaterMinskRegion_(lat, lon);
    }

    function localityLabelFromOsm_(ad, props) {
      var loc = "";
      if (ad) {
        loc = String(ad.village || ad.hamlet || ad.town || ad.suburb || ad.municipality || "").trim();
        if (!loc && ad.city && !/^(минск|minsk|м[іи]нск)$/i.test(String(ad.city))) {
          loc = String(ad.city).trim();
        }
      }
      if (!loc && props) {
        loc = String(props.locality || props.city || props.town || props.district || "").trim();
        if (/^(минск|minsk|м[іи]нск)$/i.test(loc)) loc = "";
      }
      if (/^(минск|minsk|м[іи]нск)$/i.test(loc)) return "";
      return loc;
    }

    function buildAddressSuggestTitle_(street, house, locality) {
      var st = String(street || "").trim();
      var h = String(house || "").trim();
      var loc = String(locality || "").trim();
      if (/^(минск|minsk|м[іи]нск)$/i.test(loc)) loc = "";
      var core = "";
      if (st && h) core = st + ", " + h;
      else if (st) core = st;
      else if (loc && h) core = loc + ", " + h;
      else if (h) core = h;
      else core = loc;
      if (loc && core) {
        var coreU = core.toLowerCase();
        var locU = loc.toLowerCase();
        if (coreU.indexOf(locU) < 0) core = loc + ", " + core;
      } else if (!core) {
        core = loc;
      }
      return formatStreetHouse(core) || core;
    }

    function streetTokensFuzzyOk_(qStreet, aStreet) {
      var qWords = String(qStreet || "").split(" ").filter(function (w) {
        return w.length >= 4 && !/^\d/.test(w);
      });
      var aWords = String(aStreet || "").split(" ").filter(function (w) {
        return w.length >= 3 && !/^\d/.test(w);
      });
      if (!qWords.length) return true;
      if (!aWords.length) return false;
      qWords.sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < qWords.length; i++) {
        var qw = qWords[i];
        for (var j = 0; j < aWords.length; j++) {
          var aw = aWords[j];
          if (aw.indexOf(qw) >= 0 || qw.indexOf(aw) >= 0) return true;
          var n = Math.min(5, qw.length, aw.length);
          if (n >= 4 && qw.slice(0, n) === aw.slice(0, n)) return true;
          // RU↔BY: Независимости / Незалежнасці, Сурганова / Сурганава
          if (qw.length >= 6 && aw.length >= 6) {
            var same = 0;
            var lim = Math.min(qw.length, aw.length, 10);
            for (var k = 0; k < lim; k++) {
              if (qw.charAt(k) === aw.charAt(k)) same++;
            }
            if (same >= Math.max(4, Math.floor(lim * 0.55))) return true;
          }
        }
      }
      return false;
    }

    function streetNameMatchesQuery_(resultTitle, queryText, resultHouse) {
      var want = parseSearchStreetHouse_(queryText);
      var qStreet = normalizeLocalityTypo_(normalizeAddrSearchKey(want.street || queryText));
      var aStreet = normalizeLocalityTypo_(normalizeAddrSearchKey(resultTitle));
      if (!qStreet || !aStreet) return true;
      var loc = detectSearchLocality_(queryText);
      if (loc) {
        var locN = normalizeLocalityTypo_(normalizeAddrSearchKey(loc));
        var prefLoc = locN.slice(0, Math.min(6, locN.length));
        if (prefLoc.length >= 4 && aStreet.indexOf(prefLoc) >= 0) return true;
      }
      if (streetTokensFuzzyOk_(qStreet, aStreet)) return true;
      // дом совпал — не отбрасывать из‑за RU/BY написания улицы в OSM
      var wantH = normalizeHouseKey_(want.house);
      var gotH = normalizeHouseKey_(resultHouse || houseFromSuggestTitle_(resultTitle));
      if (wantH && gotH && (gotH === wantH || gotH.indexOf(wantH) === 0 || wantH.indexOf(gotH) === 0)) {
        return true;
      }
      return false;
    }

    function suggestDedupeKey_(it) {
      var title = formatStreetHouse((it && (it.address || it.title)) || "");
      var p = parseSearchStreetHouse_(title);
      var house = normalizeHouseKey_((it && it.house) || p.house || "");
      if (house) return normalizeAddrSearchKey(p.street || title) + "#" + house;
      if (it && it.lat != null && it.lon != null) {
        return Number(it.lat).toFixed(4) + "," + Number(it.lon).toFixed(4);
      }
      return normalizeAddrSearchKey(title);
    }

    function suggestKindBonus_(it) {
      var k = String((it && (it.kind || it.addresstype || it.category)) || "").toLowerCase();
      if (/house|building|residential|apartments|yes/.test(k)) return 28;
      if (/shop|amenity|leisure|office|tourism|clinic/.test(k)) return 6;
      if (/road|highway|street|pedestrian/.test(k)) return -20;
      return 0;
    }

    function finalizeAddressSuggests_(list, q) {
      var wantH = normalizeHouseKey_(parseSearchStreetHouse_(q).house);
      var byKey = {};
      var order = [];
      (list || []).forEach(function (it) {
        if (!it) return;
        if (!streetNameMatchesQuery_(it.address || it.title || "", q, it.house)) return;
        var key = suggestDedupeKey_(it);
        if (!key) return;
        if (!byKey[key]) {
          byKey[key] = it;
          order.push(key);
          return;
        }
        var prev = byKey[key];
        if (suggestKindBonus_(it) > suggestKindBonus_(prev)) byKey[key] = it;
      });
      var merged = order.map(function (k) { return byKey[k]; });
      merged.sort(function (a, b) {
        return (scoreSuggestItem_(b, q) + suggestKindBonus_(b)) - (scoreSuggestItem_(a, q) + suggestKindBonus_(a));
      });
      if (wantH) {
        var withH = [];
        var onlySt = [];
        for (var i = 0; i < merged.length; i++) {
          var got = normalizeHouseKey_((merged[i] && merged[i].house) || houseFromSuggestTitle_((merged[i].address || merged[i].title) || ""));
          if (got) withH.push(merged[i]);
          else onlySt.push(merged[i]);
        }

        merged = withH.concat(onlySt.slice(0, withH.length ? 2 : 6));
      }
      return merged.slice(0, 8);
    }

    function parseSearchStreetHouse_(text) {
      var raw0 = String(text || "").trim().replace(/\s+/g, " ");
      if (!raw0) return { street: "", house: "", raw: "" };
      var s = stripAddressDetailsForSearch_(raw0) || raw0;
      var house = "";
      var street = s;
      var m = s.match(/^(.*?)(?:,\s*|\s+)(?:д\.?|дом)\s*([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
      if (m && /[а-яa-z]/i.test(m[1])) {
        street = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
        house = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");
        return { street: street, house: house, raw: s };
      }
      m = s.match(/^(.*?)(?:,\s*|\s+)([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
      if (m) {
        var st = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
        var hn = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");

        if (st && /[а-яa-z]/i.test(st) && !/^\d{5,6}$/.test(hn)) {
          street = st;
          house = hn;
        }
      }
      return { street: street, house: house, raw: s };
    }

    function houseFromSuggestTitle_(title) {
      var p = parseSearchStreetHouse_(title);
      return p.house || "";
    }

    function expandAddressQueries(text) {
      var raw0 = String(text || "").trim().replace(/\s+/g, " ");
      if (!raw0) return [];
      raw0 = raw0.replace(/голодищ/gi, "Колодищ").replace(/гродищ/gi, "Городищ");
      var raw = stripAddressDetailsForSearch_(raw0);
      if (!raw) raw = raw0;
      var parsed = parseSearchStreetHouse_(raw);
      var streetOnly = parsed.house ? parsed.street : raw;
      var bare = streetOnly
        .replace(/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок|бул\.?|бульвар)\s+/i, "")
        .trim();
      var locWant = detectSearchLocality_(raw);
      var withType = bare;
      var isLocalityQuery = !!(locWant && bare && normalizeLocalityTypo_(bare).indexOf(normalizeLocalityTypo_(locWant).slice(0, 5)) >= 0);
      if (isLocalityQuery) {
        withType = streetOnly;
      } else if (!/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок)/i.test(streetOnly)) {
        withType = "улица " + bare;
      } else {
        withType = streetOnly
          .replace(/^ул\.?\s+/i, "улица ")
          .replace(/^пр\.?-?\s*т\.?\s+/i, "проспект ")
          .replace(/^пр\.?\s+/i, "проспект ");
      }
      var out = isLocalityQuery ? [raw, streetOnly, bare] : [raw, streetOnly, bare, withType];
      if (raw0 !== raw) out.unshift(raw0);
      if (parsed.house) {
        var h = parsed.house;
        out.push(streetOnly + ", " + h);
        out.push(streetOnly + " " + h);
        out.push(bare + ", " + h);
        out.push(bare + " " + h);
        if (!isLocalityQuery) {
          out.push(withType + ", " + h);
          out.push(withType + " " + h);
          out.push(withType + ", д." + h);
        }
        out.push(streetOnly + ", д." + h);
      }
      if (locWant) {
        out.push(locWant + ", Минский район");
        out.push(locWant + ", Беларусь");
        out.push("аг. " + locWant);
        if (parsed.house) {
          out.push(locWant + ", " + parsed.house);
          out.push(locWant + " " + parsed.house + ", Беларусь");
        }
      } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(raw)) {
        out.push(raw + ", Минск");
        out.push("Минск, " + raw);
        if (parsed.house) {
          out.push("Минск, " + withType + ", " + parsed.house);
          out.push(withType + ", " + parsed.house + ", Минск");
          out.push("Минск, " + bare + ", " + parsed.house);
        } else {
          out.push(bare + ", Минск");
          out.push("Минск, " + bare);
          out.push(withType + ", Минск");
          out.push("Минск, " + withType);
        }
      }
      var seen = {};
      var uniq = [];
      out.forEach(function (q) {
        var k = String(q || "").trim().toLowerCase();
        if (!k || seen[k]) return;
        seen[k] = true;
        uniq.push(String(q).trim());
      });
      return uniq.slice(0, 12);
    }

    function scoreAddress(addr, q) {
      var a = normalizeAddrSearchKey(addr);
      var qu = normalizeAddrSearchKey(q);
      if (!a || !qu) return 0;
      if (a === qu) return 100;
      if (a.indexOf(qu) === 0) return 94;
      if (a.indexOf(qu) >= 0) return 86;
      if (streetTokensFuzzyOk_(qu, a)) return 70;
      var qWords = qu.split(" ").filter(function (w) { return w.length >= 2 || /^\d/.test(w); });
      if (!qWords.length) return 0;
      var hit = 0;
      for (var i = 0; i < qWords.length; i++) {
        var w = qWords[i];
        if (a.indexOf(w) >= 0) { hit++; continue; }

        var parts = a.split(" ");
        var pref = false;
        for (var j = 0; j < parts.length; j++) {
          if (parts[j].indexOf(w) === 0 || w.indexOf(parts[j]) === 0) { pref = true; break; }
        }
        if (pref) hit += 0.7;
      }
      var ratio = hit / qWords.length;
      if (ratio >= 1) return 80;
      if (ratio >= 0.7) return 68;
      if (ratio >= 0.5 && qWords.length >= 2) return 52;
      var qi = 0;
      for (var k = 0; k < a.length && qi < qu.length; k++) {
        if (a.charAt(k) === qu.charAt(qi)) qi++;
      }
      if (qi === qu.length && qu.length >= 4) return 48;
      return 0;
    }

    function scoreSuggestItem_(it, q) {
      var title = String((it && (it.address || it.title)) || "");
      var base = scoreAddress(title, q);
      var want = parseSearchStreetHouse_(q);
      var wantH = normalizeHouseKey_(want.house);
      if (!wantH) return base;
      var gotH = normalizeHouseKey_((it && it.house) || houseFromSuggestTitle_(title));
      if (gotH && gotH === wantH) return base + 45;
      if (gotH && (gotH.indexOf(wantH) === 0 || wantH.indexOf(gotH) === 0)) return base + 30;
      if (gotH) return base + 8;

      return base - 40;
    }

    function rankAddressSuggests_(list, q) {
      return (list || []).slice().sort(function (a, b) {
        return scoreSuggestItem_(b, q) - scoreSuggestItem_(a, q);
      });
    }

    function suggestHasWantedHouse_(list, q) {
      var wantH = normalizeHouseKey_(parseSearchStreetHouse_(q).house);
      if (!wantH) return true;
      for (var i = 0; i < (list || []).length; i++) {
        var it = list[i];
        var got = normalizeHouseKey_((it && it.house) || houseFromSuggestTitle_((it && (it.address || it.title)) || ""));
        if (got && (got === wantH || got.indexOf(wantH) === 0 || wantH.indexOf(got) === 0)) return true;
      }
      return false;
    }
    function clearAddressSuggest() {
      var box = document.getElementById("addressSuggest");
      if (box) {
        box.classList.remove("open");
        box.innerHTML = "";
      }
    }

    function pauseAddressSuggest_() {
      addressSuggestPaused = true;
      addressSuggestSeq++;
      clearTimeout(addressSuggestTimer);
      clearAddressSuggest();
    }

    function onAddressInput() {
      addressSuggestPaused = false;
      selectedAddressGeo = null;
      setAddressPickedHint(false);
      var q = document.getElementById("addressInput").value.trim();
      clearTimeout(addressSuggestTimer);
      var box = document.getElementById("addressSuggest");
      if (q.length < 1) {
        clearAddressSuggest();
        return;
      }

      if (parseLatLonFromText_(q)) {
        if (box) {
          box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ищу по координатам…</div>';
          box.classList.add("open");
        }
        addressSuggestTimer = setTimeout(function () { fetchAddressSuggest(q); }, 120);
        return;
      }
      if (q.length < 2) {
        clearAddressSuggest();
        return;
      }
      if (box) {
        box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ищу на карте…</div>';
        box.classList.add("open");
      }
      addressSuggestTimer = setTimeout(function () { fetchAddressSuggest(q); }, 180);
    }

    function onAddressBlurDelayed() {
      setTimeout(function () {
        var a = document.activeElement;
        if (a && a.closest && a.closest("#addressSuggest")) return;
        pauseAddressSuggest_();
        onAddressBlur();
      }, 280);
    }

    function mergeSuggestLists() {
      var seen = {};
      var out = [];
      for (var ai = 0; ai < arguments.length; ai++) {
        var arr = arguments[ai] || [];
        for (var i = 0; i < arr.length; i++) {
          var it = arr[i];
          if (!it) continue;
          var short = formatStreetHouse(it.address || it.title || "");
          if (!short) continue;
          var house = String(it.house || houseFromSuggestTitle_(short) || "").trim();
          it = Object.assign({}, it, { title: short, address: short, subtitle: "", house: house });
          var key = suggestDedupeKey_(it);
          if (!key || seen[key]) continue;
          seen[key] = true;
          out.push(it);
        }
      }
      return out;
    }

    function mapPhotonFeatures(features, text) {
      var out = [];
      var seen = {};
      var wantH = normalizeHouseKey_(parseSearchStreetHouse_(text).house);
      var locWant = detectSearchLocality_(text);
      var otherOk = !!(looksLikeOtherCity(text) || locWant);
      (features || []).forEach(function (f) {
        var coords = (f.geometry && f.geometry.coordinates) || [];
        if (coords.length < 2) return;
        var lon = Number(coords[0]);
        var lat = Number(coords[1]);
        if (!isFinite(lat) || !isFinite(lon)) return;
        if (!addressGeoAllowed_(lat, lon, text)) return;
        var p = f.properties || {};
        var street = String(p.street || "").trim();
        var house = String(p.housenumber || "").trim();
        if (!street && p.name && (p.osm_key === "highway" || p.type === "street" || !house)) {
          street = String(p.name).trim();
        }
        if (!street && !house && p.name && (p.type === "district" || p.osm_value === "village" || p.osm_key === "place")) {
          street = "";
        }
        var locality = localityLabelFromOsm_(null, p) || (p.name && /village|hamlet|town|suburb/i.test(String(p.type || p.osm_value || "")) ? String(p.name) : "");
        var title = buildAddressSuggestTitle_(street, house, locality);
        if (!title && p.name) title = formatStreetHouse(String(p.name));
        if (!title) return;
        if (!streetNameMatchesQuery_(title, text, house)) return;
        var minScore = wantH ? 14 : (locWant ? 12 : 28);
        if (scoreAddress(title, text) < minScore && !otherOk) {
          if (!(wantH && house && normalizeHouseKey_(house) === wantH)) return;
        }
        var keyDup = suggestDedupeKey_({ address: title, house: house, lat: lat, lon: lon });
        if (seen[keyDup]) return;
        seen[keyDup] = true;
        out.push({
          title: title,
          subtitle: "",
          address: title,
          house: house,
          kind: String(p.type || p.osm_value || ""),
          lat: lat,
          lon: lon,
          yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
        });
      });
      return out;
    }

    function pushNominatimRows_(data, text, seen, merged) {
      var locWant = detectSearchLocality_(text);
      var otherOk = !!(looksLikeOtherCity(text) || locWant);
      (data || []).forEach(function (row) {
        var lat = Number(row.lat);
        var lon = Number(row.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        if (!addressGeoAllowed_(lat, lon, text)) return;
        var ad = row.address || {};
        var street = ad.road || ad.pedestrian || ad.street || ad.avenue || "";
        var house = ad.house_number || "";
        var locality = localityLabelFromOsm_(ad, null);
        if (!street && !house && (ad.village || ad.hamlet || ad.town)) {
          locality = locality || String(ad.village || ad.hamlet || ad.town);
        }
        var title = buildAddressSuggestTitle_(street, house, locality);
        if (!title) title = formatStreetHouse(row.display_name || "");
        if (!title) return;
        if (!streetNameMatchesQuery_(title, text, house)) return;
        var wantH = normalizeHouseKey_(parseSearchStreetHouse_(text).house);
        var minScore = wantH ? 14 : (locWant ? 12 : 22);
        if (scoreAddress(title, text) < minScore && !otherOk) {
          if (!(wantH && house && normalizeHouseKey_(house) === wantH)) return;
        }
        var key = suggestDedupeKey_({ address: title, house: house, lat: lat, lon: lon });
        if (seen[key]) return;
        seen[key] = true;
        merged.push({
          title: title,
          subtitle: "",
          address: title,
          house: house,
          kind: String(row.addresstype || row.category || row.type || ""),
          lat: lat,
          lon: lon,
          yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map"
        });
      });
    }

    async function nominatimStructuredClient_(street, house, city) {
      if (!street || !house) return [];
      var streetParam = String(house).trim() + " " + String(street).trim();
      var cityName = String(city || "Минск").trim() || "Минск";
      var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru" +
        "&street=" + encodeURIComponent(streetParam) +
        "&city=" + encodeURIComponent(cityName);
      if (!detectSearchLocality_(cityName) && !looksLikeOtherCity(cityName)) {
        url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewbox_()) + "&bounded=0";
      }
      var res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "superboyna-courier/1.0" }
      });
      if (!res.ok) return [];
      return await res.json();
    }

    async function photonSuggestClient(text) {
      var queries = expandAddressQueries(text);
      if (!queries.length) return [];
      var merged = [];
      var wantHouse = !!parseSearchStreetHouse_(text).house;
      var locWant = detectSearchLocality_(text);
      for (var qi = 0; qi < Math.min(queries.length, wantHouse || locWant ? 8 : 5); qi++) {
        try {
          var qq = queries[qi];
          if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(qq) && !detectSearchLocality_(qq)) {
            qq = qq + ", Минск";
          } else if (locWant && !/беларусь/i.test(qq)) {
            qq = qq + ", Беларусь";
          }
          var url = "https://photon.komoot.io/api/?limit=12&lang=default&lat=53.9&lon=27.56&q=" +
            encodeURIComponent(qq);
          var res = await fetch(url);
          if (!res.ok) continue;
          var data = await res.json();
          merged = mergeSuggestLists(merged, mapPhotonFeatures(data && data.features, text));
          if (wantHouse) {
            if (suggestHasWantedHouse_(merged, text) && merged.length >= 1) break;
          } else if (merged.length >= 5) {
            break;
          }
        } catch (e) {}
      }
      return finalizeAddressSuggests_(merged, text);
    }

    async function nominatimSuggestClient(text) {
      var queries = expandAddressQueries(text);
      if (!queries.length) return [];
      var merged = [];
      var seen = {};
      var parsed = parseSearchStreetHouse_(text);
      var wantHouse = !!parsed.house;
      var locWant = detectSearchLocality_(text);
      var otherOk = !!(looksLikeOtherCity(text) || locWant);
      if (wantHouse && parsed.street) {
        try {
          var stVariants = [parsed.street];
          var bareSt = parsed.street
            .replace(/^(ул\.?|улица|пр\.?-?\s*т\.?|проспект|пер\.?|переулок|бул\.?|бульвар)\s+/i, "")
            .trim();
          if (bareSt && bareSt !== parsed.street) stVariants.push(bareSt);
          if (!/^(ул\.?|улица)/i.test(parsed.street) && !locWant) stVariants.push("улица " + bareSt);
          var cityForStruct = locWant || "Минск";
          for (var si = 0; si < stVariants.length; si++) {
            var rows = await nominatimStructuredClient_(stVariants[si], parsed.house, cityForStruct);
            pushNominatimRows_(rows, text, seen, merged);
            if (suggestHasWantedHouse_(merged, text)) break;
          }
        } catch (eSt) {}
      }
      for (var qi = 0; qi < Math.min(queries.length, wantHouse || locWant ? 7 : 4); qi++) {
        try {
          var q = queries[qi];
          if (locWant) {
            if (!/беларусь/i.test(q)) q = q + ", Беларусь";
          } else if (!/минск|беларусь|брест|гродн|гомел|витебск|могил/i.test(q)) {
            q = q + ", Минск, Беларусь";
          }
          var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru&q=" +
            encodeURIComponent(q);
          if (!otherOk) {
            url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewbox_());

          }
          var res = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "superboyna-courier/1.0" }
          });
          if (!res.ok) continue;
          var data = await res.json();
          pushNominatimRows_(data, text, seen, merged);
          if (wantHouse) {
            if (suggestHasWantedHouse_(merged, text) && merged.length >= 1) break;
          } else if (merged.length >= 5) {
            break;
          }
        } catch (e) {}
      }
      return finalizeAddressSuggests_(merged, text);
    }

    async function fetchAddressSuggest(q) {
      if (addressSuggestPaused) return;
      var seq = ++addressSuggestSeq;
      var box = document.getElementById("addressSuggest");
      if (!box) return;

      var coords = parseLatLonFromText_(q);
      if (coords) {
        box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ищу по координатам…</div>';
        box.classList.add("open");
        var revList = [];
        try {
          var settled = await Promise.all([
            reverseGeocodeCoordsClient_(coords.lat, coords.lon).catch(function () { return []; }),
            apiGet({
              action: "suggestAddress",
              text: coords.lat + "," + coords.lon,
              lat: coords.lat,
              lon: coords.lon
            }).then(function (res) {
              return (res && res.results) ? res.results : [];
            }).catch(function () { return []; })
          ]);
          revList = mergeSuggestLists(settled[0] || [], settled[1] || []);
        } catch (eRev) {}
        if (seq !== addressSuggestSeq) return;
        if (!revList.length) {

          revList = [{
            title: coords.lat.toFixed(6) + ", " + coords.lon.toFixed(6),
            address: coords.lat.toFixed(6) + ", " + coords.lon.toFixed(6),
            lat: coords.lat,
            lon: coords.lon,
            yandexUrl: "https://yandex.ru/maps/?pt=" + coords.lon + "," + coords.lat + "&z=17&l=map",
            fromCoords: true
          }];
        } else {
          revList = revList.map(function (it) {
            return Object.assign({}, it, { fromCoords: true });
          });
        }
        renderAddressSuggestList(box, revList);
        return;
      }

      if (seq === addressSuggestSeq) {
        box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ищу на карте…</div>';
        box.classList.add("open");
      }
      var photonList = [];
      var nomiList = [];
      var serverList = [];
      try {
        var settledTxt = await Promise.all([
          nominatimSuggestClient(q).catch(function () { return []; }),
          photonSuggestClient(q).catch(function () { return []; }),
          apiGet({ action: "suggestAddress", text: q }).then(function (res) {
            return (res && res.results) ? res.results : [];
          }).catch(function () { return []; })
        ]);
        nomiList = settledTxt[0] || [];
        photonList = settledTxt[1] || [];
        serverList = settledTxt[2] || [];
      } catch (e1) {}
      if (seq !== addressSuggestSeq || addressSuggestPaused) return;
      var list = finalizeAddressSuggests_(mergeSuggestLists(nomiList, serverList, photonList), q);
      if (addressSuggestPaused || seq !== addressSuggestSeq) return;
      if (!list.length) {
        box.innerHTML = '<div class="addr-suggest-item" style="color:#8e8e93;">Ничего не найдено — можно ввести адрес вручную или 📍 координаты</div>';
        box.classList.add("open");
        return;
      }
      renderAddressSuggestList(box, list);
    }

    function parseLatLonFromText_(text) {
      var s = String(text || "").trim();
      if (!s) return null;
      var ym = s.match(/[?&#]pt=([+-]?\d{1,3}(?:[.,]\d+)?)\s*,\s*([+-]?\d{1,3}(?:[.,]\d+)?)/i);
      if (ym) {
        var ya = Number(String(ym[1]).replace(",", "."));
        var yb = Number(String(ym[2]).replace(",", "."));
        if (isFinite(ya) && isFinite(yb)) return orderLatLonPair_(ya, yb);
      }
      s = s.replace(/^@+/, "").trim();

      var m = s.match(/^([+-]?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]+\s*([+-]?\d{1,3}(?:[.,]\d+)?)\s*$/);
      if (!m) return null;
      if (!/[.,]\d/.test(m[1]) && !/[.,]\d/.test(m[2])) return null;
      var x = Number(String(m[1]).replace(",", "."));
      var y = Number(String(m[2]).replace(",", "."));
      if (!isFinite(x) || !isFinite(y)) return null;
      return orderLatLonPair_(x, y);
    }

    function orderLatLonPair_(a, b) {

      if (a >= 50 && a <= 58 && b >= 22 && b <= 41) return { lat: a, lon: b };
      if (b >= 50 && b <= 58 && a >= 22 && a <= 41) return { lat: b, lon: a };
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
      return null;
    }

    async function reverseGeocodeCoordsClient_(lat, lon) {
      var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ru&lat=" +
        encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon);
      var res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "superboyna-courier/1.0" }
      });
      if (!res.ok) return [];
      var row = await res.json();
      if (!row) return [];
      var ad = row.address || {};
      var street = ad.road || ad.pedestrian || ad.street || ad.avenue || "";
      var house = ad.house_number || "";
      var title = street && house ? (street + ", " + house)
        : (street || formatStreetHouse(row.display_name || ""));
      title = formatStreetHouse(title) || (Number(lat).toFixed(6) + ", " + Number(lon).toFixed(6));
      return [{
        title: title,
        subtitle: "",
        address: title,
        lat: Number(lat),
        lon: Number(lon),
        yandexUrl: "https://yandex.ru/maps/?pt=" + lon + "," + lat + "&z=17&l=map",
        fromCoords: true
      }];
    }

    async function promptAddressByCoords_() {
      var raw = "";
      try {
        if (typeof uiPromptAsync === "function") {
          raw = await uiPromptAsync(
            "Координаты: широта, долгота (напр. 53.907861, 27.484504) или ссылка Яндекс с pt=",
            ""
          );
        } else {
          raw = window.prompt("Координаты (широта, долгота)", "") || "";
        }
      } catch (eP) {
        raw = window.prompt("Координаты (широта, долгота)", "") || "";
      }
      raw = String(raw || "").trim();
      if (!raw) return;
      var c = parseLatLonFromText_(raw);
      if (!c) {
        showToast("Не разобрал координаты");
        return;
      }
      var el = document.getElementById("addressInput");
      if (el) el.value = c.lat.toFixed(6) + ", " + c.lon.toFixed(6);
      selectedAddressGeo = null;
      setAddressPickedHint(false);
      fetchAddressSuggest(el ? el.value : (c.lat + "," + c.lon));
    }
    window.promptAddressByCoords_ = promptAddressByCoords_;
    window.parseLatLonFromText_ = parseLatLonFromText_;

    function renderAddressSuggestList(box, list) {
      box._items = list;
      box.innerHTML = list.map(function (item, i) {
        var title = formatStreetHouse(item.title || item.address || "");
        var sub = item.local ? "из памяти" : (item.fromCoords ? "по координатам" : "");
        return '<button type="button" class="addr-suggest-item" data-idx="' + i + '">' +
          escapeHtml(title) +
          (sub ? '<span class="addr-suggest-sub">' + escapeHtml(sub) + "</span>" : "") +
          "</button>";
      }).join("");
      box.classList.add("open");
      box.querySelectorAll(".addr-suggest-item").forEach(function (btn) {
        btn.onmousedown = function (e) { e.preventDefault(); };
        btn.onclick = function () {
          var it = list[Number(btn.getAttribute("data-idx"))];
          if (it) pickAddressSuggest(it);
        };
      });
    }

    function pickAddressSuggest(item) {
      var short = formatStreetHouse(item.address || item.title || "");
      document.getElementById("addressInput").value = short;
      selectedAddressGeo = {
        lat: item.lat,
        lon: item.lon,
        address: short,
        yandexUrl: item.yandexUrl || (item.lat != null ? ("https://yandex.ru/maps/?pt=" + item.lon + "," + item.lat + "&z=17&l=map") : "")
      };
      setAddressPickedHint(true);
      clearAddressSuggest();
      dismissKeyboard();
      onAddressBlur();
    }

    function normalizeAddressForMaps(addr) {
      const a = String(addr || "").trim();
      if (!a) return "";
      if (/минск/i.test(a) || looksLikeOtherCity(a)) return a;
      return DEFAULT_CITY + ", " + a;
    }

    function getDepotAddress() {
      const el = document.getElementById("depotAddress");
      let v = el ? String(el.value || "").trim() : "";
      if (!v) v = DEPOT_PRESETS[0];
      if (!/минск/i.test(v)) v = DEFAULT_CITY + ", " + v;
      return v;
    }

    function saveDepotAddress() {
      try {
        const el = document.getElementById("depotAddress");
        const raw = el ? String(el.value || "").trim() : "";
        localStorage.setItem(DEPOT_LS_KEY, raw);
        DEPOT_PRESETS.forEach(function (p, i) {
          const btn = document.getElementById("depotPreset" + i);
          if (btn) btn.classList.toggle("active", raw === p || raw === ("Минск, " + p));
        });
      } catch (e) {}
    }

    function loadDepotAddress() {
      const el = document.getElementById("depotAddress");
      if (!el) return;
      try {
        const saved = localStorage.getItem(DEPOT_LS_KEY);
        if (saved != null && saved !== "") {
          el.value = String(saved).replace(/^минск\s*,\s*/i, "");
        } else {
          el.value = DEPOT_PRESETS[0];
        }
      } catch (e) {
        el.value = DEPOT_PRESETS[0];
      }
      saveDepotAddress();
    }

    function pad2(n) {
      return String(n).padStart(2, "0");
    }

    function updateDepartHint() {
      const hint = document.getElementById("departTimeHint");
      if (!hint) return;
      if (departTimeLocked) {
        hint.textContent = "Зафиксировано " + pad2(departHour) + ":" + pad2(departMinute) + " · после сборки маршрута";
      } else {
        hint.textContent = "Выбрано " + pad2(departHour) + ":" + pad2(departMinute) + " · листайте как будильник";
      }
    }

    function setDepartTimeLocked(locked) {
      departTimeLocked = !!locked;
      const wrap = document.getElementById("departTimeWheel");
      if (wrap) wrap.classList.toggle("is-locked", departTimeLocked);
      updateDepartHint();
    }

    function saveDepartTime() {
      if (departTimeLocked) {
        updateDepartHint();
        return;
      }
      try {
        localStorage.setItem(DEPART_LS_KEY, pad2(departHour) + ":" + pad2(departMinute));
      } catch (e) {}
      updateDepartHint();
    }

    function highlightWheel(col, value) {
      if (!col) return;
      col.querySelectorAll(".time-wheel-item").forEach(function (el) {
        el.classList.toggle("is-active", Number(el.getAttribute("data-val")) === value);
      });
    }

    function snapWheelColumn(col, maxVal, onChange) {
      if (!col) return;
      const idx = Math.round(col.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(maxVal, idx));
      col.scrollTop = clamped * TIME_ITEM_H;
      onChange(clamped);
      highlightWheel(col, clamped);
    }

    function bindWheelColumn(col, maxVal, getVal, setVal) {
      if (!col) return;
      let settleTimer = null;
      col.addEventListener("scroll", function () {
        if (departTimeLocked) {
          col.scrollTop = getVal() * TIME_ITEM_H;
          highlightWheel(col, getVal());
          return;
        }
        const approx = Math.round(col.scrollTop / TIME_ITEM_H);
        highlightWheel(col, Math.max(0, Math.min(maxVal, approx)));
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
          if (departTimeLocked) return;
          snapWheelColumn(col, maxVal, function (v) {
            setVal(v);
            saveDepartTime();
          });
        }, 80);
      }, { passive: true });

      requestAnimationFrame(function () {
        col.scrollTop = getVal() * TIME_ITEM_H;
        highlightWheel(col, getVal());
      });
    }

    function buildTimeWheels() {
      const hourCol = document.getElementById("departHourCol");
      const minCol = document.getElementById("departMinCol");
      if (!hourCol || !minCol) return;

      try {
        const saved = localStorage.getItem(DEPART_LS_KEY);
        const m = saved && saved.match(/^(\d{1,2}):(\d{2})$/);
        if (m) {
          departHour = Math.min(23, Number(m[1]));
          departMinute = Math.min(59, Number(m[2]));
        } else {
          const now = new Date();
          departHour = now.getHours();
          departMinute = Math.round(now.getMinutes() / 5) * 5 % 60;
        }
      } catch (e) {}

      let hourHtml = '<div class="time-wheel-pad"></div>';
      for (let h = 0; h < 24; h++) {
        hourHtml += '<div class="time-wheel-item" data-val="' + h + '">' + pad2(h) + "</div>";
      }
      hourHtml += '<div class="time-wheel-pad"></div>';
      hourCol.innerHTML = hourHtml;

      let minHtml = '<div class="time-wheel-pad"></div>';
      for (let mi = 0; mi < 60; mi++) {
        minHtml += '<div class="time-wheel-item" data-val="' + mi + '">' + pad2(mi) + "</div>";
      }
      minHtml += '<div class="time-wheel-pad"></div>';
      minCol.innerHTML = minHtml;

      bindWheelColumn(hourCol, 23, function () { return departHour; }, function (v) { departHour = v; });
      bindWheelColumn(minCol, 59, function () { return departMinute; }, function (v) { departMinute = v; });
      updateDepartHint();
    }

    function parseDepartTime() {
      const d = new Date();
      d.setHours(departHour, departMinute, 0, 0);
      return d;
    }

    function setCourierCount(n) {
      routePlanState.courierCount = n === 2 ? 2 : 1;
      const b1 = document.getElementById("courierCount1");
      const b2 = document.getElementById("courierCount2");
      if (b1) b1.classList.toggle("active", routePlanState.courierCount === 1);
      if (b2) b2.classList.toggle("active", routePlanState.courierCount === 2);
      if (routePlanState.routes[0].length || routePlanState.routes[1].length) {
        autoSplitStops(routePlanState.routes[0].concat(routePlanState.routes[1]));
        renderRoutePlan();
      }
    }

    function haversineKm(a, b) {
      const R = 6371;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLon = (b.lon - a.lon) * Math.PI / 180;
      const la1 = a.lat * Math.PI / 180;
      const la2 = b.lat * Math.PI / 180;
      const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    function geoKey(p) {
      if (!p || p.lat == null || p.lon == null) return "";
      return Number(p.lat).toFixed(5) + "," + Number(p.lon).toFixed(5);
    }

    function driveMinutesBetween(a, b) {
      if (!a || !b || a.lat == null || b.lat == null) return 12 * TRAFFIC_FACTOR;
      const m = routePlanState.matrix;
      if (m && m.index && m.durations) {
        const ia = m.index[geoKey(a)];
        const ib = m.index[geoKey(b)];
        if (ia != null && ib != null && m.durations[ia] && m.durations[ia][ib] != null) {
          const sec = Number(m.durations[ia][ib]);
          if (isFinite(sec) && sec >= 0) return Math.max(1, (sec / 60) * TRAFFIC_FACTOR);
        }
      }
      const km = haversineKm(a, b) * ROAD_FACTOR;
      return (km / AVG_SPEED_KMH) * 60 * TRAFFIC_FACTOR;
    }

    async function refreshDriveMatrix(depot, stops) {
      routePlanState.matrix = null;
      const nodes = [depot].concat((stops || []).filter(function (s) {
        return s && s.lat != null && s.lon != null;
      }));
      if (nodes.length < 2) return;
      const index = {};
      nodes.forEach(function (n, i) {
        index[geoKey(n)] = i;
      });
      try {
        const coords = nodes.map(function (n) { return n.lon + "," + n.lat; }).join(";");
        const url = "https://router.project-osrm.org/table/v1/driving/" + coords + "?annotations=duration";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.code === "Ok" && data.durations) {
          routePlanState.matrix = { index: index, durations: data.durations };
        }
      } catch (e) {}
    }

    function estimateDriveOnlyMinutes(depot, stops) {
      if (!stops.length) return 0;
      let t = 0;
      let cur = depot;
      for (let i = 0; i < stops.length; i++) {
        t += driveMinutesBetween(cur, stops[i]);
        cur = stops[i];
      }
      return t;
    }

    function hhmmToMin_(s) {
      var m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      var h = Number(m[1]);
      var mi = Number(m[2]);
      if (h > 23 || mi > 59) return null;
      return h * 60 + mi;
    }

    function departMinutesNow_() {
      return (Number(departHour) || 0) * 60 + (Number(departMinute) || 0);
    }

    function simulateRouteTimeline_(depot, stops, departMin) {
      var t = departMin != null ? departMin : departMinutesNow_();
      var cur = depot;
      var wait = 0;
      var late = 0;
      var drive = 0;
      var items = [];
      for (var i = 0; i < (stops || []).length; i++) {
        var d = driveMinutesBetween(cur, stops[i]);
        drive += d;
        t += d;
        var after = hhmmToMin_(stops[i].deliveryAfter);
        var before = hhmmToMin_(stops[i].deliveryBefore);
        var waited = 0;
        if (after != null && t < after) {
          waited = after - t;
          wait += waited;
          t = after;
        }
        var lateBy = 0;
        if (before != null && t > before) {
          lateBy = t - before;
          late += lateBy;
        }
        items.push({ arrive: t, waited: waited, lateBy: lateBy });
        if (i < stops.length - 1) t += STOP_MINUTES;
        cur = stops[i];
      }
      return { drive: drive, wait: wait, late: late, totalWall: drive + wait, finish: t, items: items };
    }

    function routeWindowScore_(depot, stops, departMin) {
      var sim = simulateRouteTimeline_(depot, stops, departMin);
      return sim.drive + sim.wait * 0.7 + sim.late * 30;
    }

    function nearestNeighborOrder(depot, stops) {
      const left = stops.slice();
      const ordered = [];
      let cur = depot;
      while (left.length) {
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < left.length; i++) {
          const d = driveMinutesBetween(cur, left[i]);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        const next = left.splice(bestI, 1)[0];
        ordered.push(next);
        cur = next;
      }
      return ordered;
    }

    function twoOptImprove(depot, stops, departMin) {
      let route = stops.slice();
      if (route.length < 3) return route;
      let improved = true;
      let guard = 0;
      while (improved && guard < 50) {
        improved = false;
        guard++;
        const base = routeWindowScore_(depot, route, departMin);
        for (let i = 0; i < route.length - 1; i++) {
          for (let k = i + 1; k < route.length; k++) {
            const cand = route.slice(0, i)
              .concat(route.slice(i, k + 1).reverse())
              .concat(route.slice(k + 1));
            const score = routeWindowScore_(depot, cand, departMin);
            if (score + 0.05 < base) {
              route = cand;
              improved = true;
              i = route.length;
              break;
            }
          }
        }
      }
      return route;
    }

    function optimizeRouteOrder(depot, stops) {
      const departMin = departMinutesNow_();
      const withGeo = (stops || []).filter(function (s) { return s && s.lat != null; });
      const noGeo = (stops || []).filter(function (s) { return !s || s.lat == null; });
      if (withGeo.length <= 1) return withGeo.concat(noGeo);
      const seeded = withGeo.slice().sort(function (a, b) {
        var ba = hhmmToMin_(a.deliveryBefore);
        var bb = hhmmToMin_(b.deliveryBefore);
        if (ba != null && bb != null && ba !== bb) return ba - bb;
        if (ba != null && bb == null) return -1;
        if (ba == null && bb != null) return 1;
        var aa = hhmmToMin_(a.deliveryAfter);
        var ab = hhmmToMin_(b.deliveryAfter);
        if (aa != null && ab != null && aa !== ab) return aa - ab;
        return 0;
      });
      let best = nearestNeighborOrder(depot, seeded);
      let bestScore = routeWindowScore_(depot, best, departMin);
      const limit = Math.min(seeded.length, 12);
      for (let i = 0; i < limit; i++) {
        const start = seeded[i];
        const rest = seeded.filter(function (_, idx) { return idx !== i; });
        const cand = [start].concat(nearestNeighborOrder(start, rest));
        const score = routeWindowScore_(depot, cand, departMin);
        if (score < bestScore) {
          best = cand;
          bestScore = score;
        }
      }
      best = twoOptImprove(depot, best, departMin);
      return best.concat(noGeo);
    }

    function estimateRouteMinutes(depot, stops) {

      if (!stops.length) return 0;
      let t = 0;
      let cur = depot;
      for (let i = 0; i < stops.length; i++) {
        t += driveMinutesBetween(cur, stops[i]);
        if (i < stops.length - 1) t += STOP_MINUTES;
        cur = stops[i];
      }
      return Math.round(t);
    }

    function bearingFrom(depot, p) {
      const dLon = (p.lon - depot.lon) * Math.PI / 180;
      const lat1 = depot.lat * Math.PI / 180;
      const lat2 = p.lat * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    async function geocodeAddress(addr, rawQuery) {
      const query = rawQuery ? geocodeQuery(addr) : geocodeQuery(normalizeAddressForMaps(addr));
      const key = String(query || "").trim().toLowerCase();
      if (!key) return null;
      if (routePlanState.geoCache[key]) return routePlanState.geoCache[key];
      try {
        const cached = localStorage.getItem("geo:" + key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.lat != null) {
            routePlanState.geoCache[key] = parsed;
            return parsed;
          }
        }
      } catch (e) {}

      const variants = [query];
      const plain = String(addr || "").trim();
      if (plain && plain.toLowerCase() !== query.toLowerCase()) variants.push(geocodeQuery(plain));

      const stripped = plain.replace(/,?\s*(кв\.?|квартира)\s*\d+[а-яa-z]?/ig, "").replace(/корп\.?\s*\d+/ig, "").trim();
      if (stripped && stripped !== plain) variants.push(geocodeQuery(stripped));

      for (let v = 0; v < variants.length; v++) {
        const q = encodeURIComponent(variants[v]);
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=by&q=" + q;
        try {
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (!res.ok) continue;
          const data = await res.json();
          await new Promise(function (r) { setTimeout(r, 1100); });
          if (!data || !data[0]) continue;
          const point = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
          routePlanState.geoCache[key] = point;
          try { localStorage.setItem("geo:" + key, JSON.stringify(point)); } catch (e2) {}
          return point;
        } catch (e3) {}
      }
      return null;
    }

    async function nearestPostOffice(kind, depot) {
      const list = POST_OFFICES[kind] || POST_OFFICES.euro;
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const office = list[i];
        const geo = { lat: office.lat, lon: office.lon };
        const d = haversineKm(depot, geo);
        if (!best || d < best.dist) {
          best = { address: office.address, lat: office.lat, lon: office.lon, dist: d };
        }
      }
      return best || { address: list[0].address, lat: list[0].lat, lon: list[0].lon, dist: 0 };
    }

    function formatMinutes(m) {
      m = Math.max(0, Math.round(Number(m) || 0));
      if (m < 60) return "~" + m + " мин";
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return "~" + h + " ч " + (mm ? mm + " мин" : "");
    }

    function driveMinutesToStop(depot, stops, index) {
      if (!stops || !stops[index]) return 5;
      const from = index <= 0 ? (depot || stops[0]) : stops[index - 1];
      return Math.max(1, Math.round(driveMinutesBetween(from, stops[index])));
    }

    function approxMinutesForClient(mins) {
      const m = Math.max(5, Math.round(Number(mins) || 0));
      return Math.max(5, Math.round(m / 5) * 5);
    }

    function etaLabelForStop(depot, stops, index, depart) {

      const arrive = driveMinutesToStop(depot, stops, index);
      if (!depart) return "через ~" + arrive + " мин";
      const a = new Date(depart.getTime() + arrive * 60000);
      return String(a.getHours()).padStart(2, "0") + ":" + String(a.getMinutes()).padStart(2, "0");
    }

    function geoCentroid_(stops) {
      var n = 0, lat = 0, lon = 0;
      (stops || []).forEach(function (s) {
        if (s && s.lat != null && s.lon != null) {
          lat += Number(s.lat); lon += Number(s.lon); n++;
        }
      });
      if (!n) return null;
      return { lat: lat / n, lon: lon / n };
    }

    function splitGeographic2_(stops) {
      var list = (stops || []).filter(function (s) { return s && s.lat != null; });
      if (list.length <= 1) return [list.slice(), []];
      var a = list[0], b = list[1], bestD = -1;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var d = haversineKm(list[i], list[j]);
          if (d > bestD) { bestD = d; a = list[i]; b = list[j]; }
        }
      }
      var ca = { lat: a.lat, lon: a.lon };
      var cb = { lat: b.lat, lon: b.lon };
      var A = [], B = [];
      for (var iter = 0; iter < 14; iter++) {
        A = []; B = [];
        list.forEach(function (s) {
          if (haversineKm(s, ca) <= haversineKm(s, cb)) A.push(s);
          else B.push(s);
        });
        if (!A.length || !B.length) {
          var depot = routePlanState.depot || { lat: 53.9, lon: 27.56 };
          var sorted = list.slice().sort(function (x, y) {
            return bearingFrom(depot, x) - bearingFrom(depot, y);
          });
          var mid = Math.ceil(sorted.length / 2);
          return [sorted.slice(0, mid), sorted.slice(mid)];
        }
        ca = geoCentroid_(A) || ca;
        cb = geoCentroid_(B) || cb;
      }
      return [A, B];
    }

    function balanceTwoRoutes_(depot, a, b) {
      var departMin = departMinutesNow_();
      a = optimizeRouteOrder(depot, a);
      b = optimizeRouteOrder(depot, b);
      for (var guard = 0; guard < 24; guard++) {
        var sa = routeWindowScore_(depot, a, departMin);
        var sb = routeWindowScore_(depot, b, departMin);
        if (Math.abs(sa - sb) < 10) break;
        var fromLong = sa > sb;
        var from = fromLong ? a : b;
        var to = fromLong ? b : a;
        var toC = geoCentroid_(to) || depot;
        var fromC = geoCentroid_(from) || depot;
        var best = null;
        for (var i = 0; i < from.length; i++) {
          var cand = from[i];
          if (haversineKm(cand, fromC) + 0.4 < haversineKm(cand, toC)) continue;
          var from2 = from.slice(0, i).concat(from.slice(i + 1));
          var to2 = to.concat([cand]);
          from2 = optimizeRouteOrder(depot, from2);
          to2 = optimizeRouteOrder(depot, to2);
          var sFrom = routeWindowScore_(depot, from2, departMin);
          var sTo = routeWindowScore_(depot, to2, departMin);
          var lateBefore = simulateRouteTimeline_(depot, from, departMin).late + simulateRouteTimeline_(depot, to, departMin).late;
          var lateAfter = simulateRouteTimeline_(depot, from2, departMin).late + simulateRouteTimeline_(depot, to2, departMin).late;
          if (lateAfter > lateBefore + 0.5) continue;
          var bal = Math.max(sFrom, sTo) * 1000 + Math.abs(sFrom - sTo);
          var balOld = Math.max(sa, sb) * 1000 + Math.abs(sa - sb);
          if (bal + 1 < balOld) {
            if (!best || bal < best.bal) best = { from2: from2, to2: to2, bal: bal, fromLong: fromLong };
          }
        }
        if (!best) break;
        if (best.fromLong) { a = best.from2; b = best.to2; }
        else { b = best.from2; a = best.to2; }
      }
      return [a, b];
    }

    function autoSplitStops(stops) {
      const depot = routePlanState.depot || { lat: 53.9, lon: 27.56 };
      const withGeo = stops.filter(function (s) { return s.lat != null; });
      const noGeo = stops.filter(function (s) { return s.lat == null; });

      if (routePlanState.courierCount === 1 || stops.length <= 1) {
        routePlanState.routes = [optimizeRouteOrder(depot, withGeo.concat(noGeo)), []];
        return;
      }

      if (!withGeo.length) {
        const half = Math.ceil(noGeo.length / 2);
        routePlanState.routes = [noGeo.slice(0, half), noGeo.slice(half)];
        return;
      }

      var parts = splitGeographic2_(withGeo);
      var a = parts[0] || [];
      var b = parts[1] || [];
      var balanced = balanceTwoRoutes_(depot, a, b);
      a = balanced[0];
      b = balanced[1];
      noGeo.forEach(function (s) {
        var ta = estimateRouteMinutes(depot, a);
        var tb = estimateRouteMinutes(depot, b);
        if (ta <= tb) a.push(s);
        else b.push(s);
      });
      routePlanState.routes = [optimizeRouteOrder(depot, a), optimizeRouteOrder(depot, b)];
    }

    async function buildRoutePlan() {
      const box = document.getElementById("routePlanBox");
      const allWithAddr = (courierClientsCache || []).filter(function (c) {
        return String(c.address || "").trim();
      });
      const deliveredSkipped = allWithAddr.filter(function (c) { return !!c.delivered; });

      const withAddr = allWithAddr.filter(function (c) { return !c.delivered; });
      if (!withAddr.length) {
        if (deliveredSkipped.length) {
          await uiAlertAsync("Все клиенты с адресом уже отмечены доставленными — в маршрут некого добавлять.");
        } else {
          await uiAlertAsync("Нет адресов на этот день. Сначала выберите день и проверьте адреса.");
        }
        return;
      }

      box.innerHTML = '<div class="card"><p class="muted">Считаю точки и отделения…' +
        (deliveredSkipped.length ? (" · без доставленных: " + deliveredSkipped.length) : "") +
        "</p></div>";
      const depotAddr = normalizeAddressForMaps(getDepotAddress());
      saveDepotAddress();

      const depotGeo = await geocodeAddress(depotAddr, true);
      routePlanState.depot = depotGeo || { lat: MINSK_CENTER.lat, lon: MINSK_CENTER.lon };

      const stops = [];
      for (let i = 0; i < withAddr.length; i++) {
        const c = withAddr[i];
        box.innerHTML = '<div class="card"><p class="muted">Точка ' + (i + 1) + "/" + withAddr.length + "…</p></div>";
        let method = parseDeliveryMethod(c.note || "");
        const clientAddr = String(c.address || "").trim();
        const outside = await isOutsideMinskDelivery(clientAddr);
        if (!method && outside) method = "euro"; // старые заказы без метки — по умолчанию Европочта

        if (method === "euro" || method === "bel") {
          const officeAddr = parseOfficeAddress(c.note || "");
          let lat = null;
          let lon = null;
          let address = officeAddr;
          if (officeAddr) {
            const geo = await geocodeAddress(normalizeAddressForMaps(officeAddr), true);
            if (geo) { lat = geo.lat; lon = geo.lon; }
          } else {
            const office = await nearestPostOffice(method, routePlanState.depot);
            address = office.address;
            lat = office.lat;
            lon = office.lon;
          }
          stops.push({
            name: c.name,
            address: address,
            clientAddress: clientAddr,
            note: stripMetaFromNote(c.note || ""),
            price: extractOrderPrice(c.note || ""),
            delivery: method,
            deliveryLabel: method === "euro" ? "Европочта" : "Белпочта",
            clientIndex: courierClientsCache.indexOf(c),
            lat: lat,
            lon: lon,
            deliveryAfter: c.deliveryAfter || "",
            deliveryBefore: c.deliveryBefore || ""
          });
        } else {
          const addr = normalizeAddressForMaps(clientAddr);
          const savedGeo = c.geo || parseGeoFromNote(c.note || "");
          let lat = savedGeo ? savedGeo.lat : null;
          let lon = savedGeo ? savedGeo.lon : null;
          if (lat == null) {
            const geo = await geocodeAddress(addr, true);
            if (geo) { lat = geo.lat; lon = geo.lon; }
          }
          stops.push({
            name: c.name,
            address: addr,
            clientAddress: clientAddr,
            note: stripMetaFromNote(c.note || ""),
            price: extractOrderPrice(c.note || ""),
            delivery: "courier",
            deliveryLabel: null,
            clientIndex: courierClientsCache.indexOf(c),
            lat: lat,
            lon: lon,
            yandexUrl: (savedGeo && savedGeo.yandexUrl) || parseYandexUrlFromNote(c.note || ""),
            deliveryAfter: c.deliveryAfter || "",
            deliveryBefore: c.deliveryBefore || ""
          });
        }
      }

      box.innerHTML = '<div class="card"><p class="muted">Считаю оптимальный порядок по дорогам…</p></div>';
      await refreshDriveMatrix(routePlanState.depot, stops);
      autoSplitStops(stops);
      renderRoutePlan();
      setDepartTimeLocked(true);
      celebrateSuccess("route");
      const t0 = estimateRouteMinutes(routePlanState.depot, routePlanState.routes[0]);
      const t1 = estimateRouteMinutes(routePlanState.depot, routePlanState.routes[1]);
      const wall = routePlanState.courierCount === 2 ? Math.max(t0, t1) : t0;
      showToast("Готово · ≈" + formatMinutes(wall) +
        (deliveredSkipped.length ? (" · без доставленных: " + deliveredSkipped.length) : "") +
        " · с запасом на пробки");
    }

    function moveStopBetweenRoutes(fromRoute, stopIndex, toRoute) {
      const item = routePlanState.routes[fromRoute].splice(stopIndex, 1)[0];
      if (!item) return;
      routePlanState.routes[toRoute].push(item);
      const depot = routePlanState.depot;
      routePlanState.routes[toRoute] = optimizeRouteOrder(depot, routePlanState.routes[toRoute]);
      routePlanState.routes[fromRoute] = optimizeRouteOrder(depot, routePlanState.routes[fromRoute]);
      renderRoutePlan();
    }

    function routePointsForYandex(routeIndex) {
      const stops = routePlanState.routes[routeIndex] || [];
      const depotAddr = normalizeAddressForMaps(getDepotAddress());
      const depotGeo = routePlanState.depot;
      const points = [];

      if (depotGeo && depotGeo.lat != null && depotGeo.lon != null) {
        points.push({ lat: Number(depotGeo.lat), lon: Number(depotGeo.lon), label: depotAddr });
      } else {
        points.push({ address: depotAddr, label: depotAddr });
      }
      stops.forEach(function (s) {
        if (s && s.lat != null && s.lon != null && isFinite(Number(s.lat)) && isFinite(Number(s.lon))) {
          points.push({
            lat: Number(s.lat),
            lon: Number(s.lon),
            label: s.name || s.address || "",
            address: s.address || ""
          });
        } else if (s && s.address) {
          points.push({ address: String(s.address), label: s.name || s.address });
        }
      });
      return { stops: stops, points: points, depotAddr: depotAddr };
    }

    function normalizeYandexPointList(points) {
      const out = [];
      (points || []).forEach(function (p) {
        if (p == null || p === "") return;
        if (typeof p === "object") {
          if (p.lat != null && p.lon != null && isFinite(Number(p.lat)) && isFinite(Number(p.lon))) {
            out.push({
              lat: Number(p.lat),
              lon: Number(p.lon),
              label: p.label || p.address || p.name || "",
              address: p.address || ""
            });
            return;
          }
          const addr = String(p.address || p.name || "").trim();
          if (addr) out.push({ address: addr, label: p.label || addr });
          return;
        }
        const s = String(p).trim();
        if (!s) return;
        const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (m) out.push({ lat: Number(m[1]), lon: Number(m[2]), label: s });
        else out.push({ address: s, label: s });
      });
      return out;
    }

    function pointToYandexRtext(p) {
      if (p == null) return "";
      if (typeof p === "object") {
        if (p.lat != null && p.lon != null && isFinite(Number(p.lat)) && isFinite(Number(p.lon))) {

          return Number(p.lat) + "," + Number(p.lon);
        }
        return String(p.address || p.name || "").trim();
      }
      return String(p).trim();
    }

    function yandexRtextFromPoints(points) {
      return normalizeYandexPointList(points).map(pointToYandexRtext).filter(Boolean).join("~");
    }

    function buildYandexRouteUrl(points) {
      const rtext = yandexRtextFromPoints(points);
      if (!rtext) return "https://yandex.ru/maps/";

      return "https://yandex.ru/maps/?mode=routes&rtt=auto&rtext=" +
        encodeURIComponent(rtext).replace(/%2C/gi, ",").replace(/%7E/gi, "~");
    }

    function buildYandexMapsAppUrl(points) {
      const rtext = yandexRtextFromPoints(points);
      if (!rtext) return "yandexmaps://maps.yandex.ru/";
      return "yandexmaps://maps.yandex.ru/?rtt=auto&rtext=" +
        encodeURIComponent(rtext).replace(/%2C/gi, ",").replace(/%7E/gi, "~");
    }

    function buildYandexWidgetUrl(points) {
      const rtext = yandexRtextFromPoints(points);
      if (!rtext) return "https://yandex.ru/map-widget/v1/?lang=ru_RU";
      return "https://yandex.ru/map-widget/v1/?lang=ru_RU&mode=routes&rtt=auto&rtext=" +
        encodeURIComponent(rtext).replace(/%2C/gi, ",").replace(/%7E/gi, "~");
    }

    function buildYandexNaviUrl(points) {
      const list = normalizeYandexPointList(points).filter(function (p) {
        return p.lat != null && p.lon != null;
      });
      if (list.length < 2) return "";
      const from = list[0];
      const to = list[list.length - 1];
      let url = "yandexnavi://build_route_on_map?lat_from=" + from.lat + "&lon_from=" + from.lon +
        "&lat_to=" + to.lat + "&lon_to=" + to.lon;
      for (let i = 1; i < list.length - 1; i++) {
        const v = list[i];
        const idx = i - 1;
        url += "&lat_via_" + idx + "=" + v.lat + "&lon_via_" + idx + "=" + v.lon;
      }
      return url;
    }

    function buildYandexPointUrl(addr) {
      const u = new URL("https://yandex.ru/maps/");
      u.searchParams.set("text", addr);
      return u.toString();
    }

    function buildYandexBridgeUrl(points) {
      const rtext = yandexRtextFromPoints(points);
      return YANDEX_ROUTE_PAGE + "?rtext=" +
        encodeURIComponent(rtext).replace(/%2C/gi, ",").replace(/%7E/gi, "~") +
        "&fixed=1";
    }

    function countMissingGeoInPoints(points) {
      return normalizeYandexPointList(points).filter(function (p) {
        return p.lat == null || p.lon == null;
      }).length;
    }

    function openAllInYandex(points) {
      const list = normalizeYandexPointList(points);
      if (!list.length) {
        showToast("Нет точек для маршрута");
        return;
      }
      const missing = countMissingGeoInPoints(list);
      const pts = list;

      const old = document.getElementById("yandexRouteOverlay");
      if (old) old.remove();

      const wrap = document.createElement("div");
      wrap.id = "yandexRouteOverlay";
      wrap.className = "yandex-route-overlay";
      wrap.innerHTML =
        '<div class="yandex-route-top">' +
          '<div class="yr-title">Маршрут · ' + pts.length + " точек</div>" +
          '<div class="yr-sub">Порядок как в мини-аппе. В Яндексе не жмите Оптимизировать.</div>' +
          (missing
            ? ('<div class="yr-sub" style="color:#ff9f0a;">Без координат: ' + missing + " — Яндекс может перегеокодировать адреса</div>")
            : "") +
          '<button class="btn-action btn-green" type="button" id="yrOpenNavi">Навигатор (фикс. порядок)</button>' +
          '<button class="btn-action btn-blue" type="button" id="yrOpenApp">Яндекс.Карты</button>' +
          '<button class="btn-action" type="button" id="yrClose" style="background:#3a3a3c;">Закрыть</button>' +
        "</div>" +
        '<iframe id="yrFrame" src="' + buildYandexWidgetUrl(pts).replace(/"/g, "&quot;") + '" allow="geolocation *; clipboard-write *"></iframe>';

      document.body.appendChild(wrap);
      dismissKeyboard();

      function closeYr() {
        try { wrap.remove(); } catch (e) {}
        recoverUiFocus();
      }
      var btnClose = document.getElementById("yrClose");
      var btnApp = document.getElementById("yrOpenApp");
      var btnNavi = document.getElementById("yrOpenNavi");
      if (btnClose) btnClose.onclick = closeYr;
      if (btnApp) {
        btnApp.onclick = function () {
          const appUrl = buildYandexMapsAppUrl(pts);
          const webUrl = buildYandexRouteUrl(pts);
          openExternalLink(appUrl);
          setTimeout(function () { openExternalLink(webUrl); }, 600);
          showToast("Порядок как в мини-аппе");
        };
      }
      if (btnNavi) {
        btnNavi.onclick = function () {
          const navi = buildYandexNaviUrl(pts);
          if (!navi) {
            showToast("Нужны координаты всех точек — соберите маршрут ещё раз");
            openExternalLink(buildYandexRouteUrl(pts));
            return;
          }
          openExternalLink(navi);
          showToast("Навигатор · порядок зафиксирован");
        };
      }
    }

    async function openRouteInYandex(routeIndex) {
      const info = routePointsForYandex(routeIndex);
      if (!info.stops.length) {
        showToast("В этом маршруте нет адресов");
        return;
      }
      openAllInYandex(info.points);
    }

    function buildCourierShareText(routeIndex) {
      const stops = routePlanState.routes[routeIndex] || [];
      const depot = routePlanState.depot;
      const mins = estimateRouteMinutes(depot, stops);
      let t = "Маршрут курьера · " + stops.length + " точек\n";
      t += "Выезд: " + normalizeAddressForMaps(getDepotAddress()) + "\n";
      t += "Ориентир по длине: " + formatMinutes(mins) + " (точнее смотри Яндекс)\n";
      t += "Порядок зафиксирован. В Яндексе НЕ жми Оптимизировать.\n\n";
      stops.forEach(function (s, i) {
        t += (i + 1) + ". " + s.name;
        if (s.deliveryLabel) t += " (" + s.deliveryLabel + ")";
        t += "\n" + s.address + "\n\n";
      });
      const info = routePointsForYandex(routeIndex);
      t += "Яндекс.Карты:\n" + buildYandexRouteUrl(info.points);
      const navi = buildYandexNaviUrl(info.points);
      if (navi) t += "\n\nЯндекс Навигатор:\n" + navi;
      return t.trim();
    }

    async function registerMeAsCourier() {
      try {
        if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;
        const u = tg.initDataUnsafe.user;
        var dayKey = "";
        try {
          var d = new Date();
          dayKey = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
          if (localStorage.getItem("superboyna_courier_reg") === String(u.id) + "|" + dayKey) return;
        } catch (eLs) {}
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        await apiPost({
          action: "registerCourier",
          telegramId: u.id,
          name: name,
          username: u.username || ""
        });
        try { localStorage.setItem("superboyna_courier_reg", String(u.id) + "|" + dayKey); } catch (e2) {}
      } catch (e) {}
    }

    async function shareCourierRoute(routeIndex) {
      const text = buildCourierShareText(routeIndex);
      if (!text || !(routePlanState.routes[routeIndex] || []).length) {
        showToast("Сначала соберите маршруты");
        return;
      }

      let couriers = [];
      try {
        const res = await apiGet({ action: "getCouriers" });
        if (res.status === "success" && res.couriers) couriers = res.couriers;
      } catch (e) {}

      if (!couriers.length) {
        await uiAlertAsync("Пока никого в списке. Пусть курьер напишет боту /start или откроет этот мини-апп — тогда появится здесь.");
        return;
      }

      const listHtml = couriers.map(function (c, i) {
        const label = (c.name || c.username || ("id " + c.id));
        const sub = c.username ? ("@" + c.username) : ("id " + c.id);
        return '<button type="button" class="modal-day-btn courier-pick-btn" data-idx="' + i + '" style="text-align:left;height:auto;min-height:44px;padding:10px 12px;">' +
          escapeHtml(label) + '<br><span style="color:#8e8e93;font-size:12px;">' + escapeHtml(sub) + "</span></button>";
      }).join("");

      const p = openModal(
        '<div class="modal-title">Кому отправить маршрут</div>' +
        '<div class="modal-text">Бот пришлёт маршрут в личку (нужен /start боту).</div>' +
        '<div class="modal-actions" style="max-height:45vh;overflow:auto;margin-bottom:12px;">' + listHtml + "</div>" +
        '<div class="modal-actions">' +
          '<button class="btn-action" type="button" id="shareCopy" style="background:#3a3a3c;">Скопировать текст</button>' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Закрыть</button>' +
        "</div>"
      );

      setTimeout(function () {
        document.querySelectorAll(".courier-pick-btn").forEach(function (btn) {
          btn.onclick = async function () {
            const c = couriers[Number(btn.getAttribute("data-idx"))];
            if (!c) return;
            var labelRestore = btn.innerHTML;
            btn.disabled = true;
            btn.textContent = "Отправляю…";
            var id = String(c.id || "").trim();
            if (!id) { showToast("Пустой id курьера"); btn.disabled = false; btn.innerHTML = labelRestore; return; }
            var st = null;
            try { st = await apiGet({ action: "telegramStatus" }); } catch (e) {}
            if (st && st.hasToken === false) {
              await uiAlertAsync("Бот не настроен: в Apps Script → Project Settings → Script properties добавьте TELEGRAM_BOT_TOKEN (токен от BotFather), затем Deploy → New version.");
              btn.disabled = false;
              btn.innerHTML = labelRestore;
              return;
            }

            var ticket = "r" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
            try {
              await apiPost({ action: "prepareCourierRoute", ticket: ticket, text: text });
            } catch (ePrep) {}
            await new Promise(function (r) { setTimeout(r, 350); });
            var sendRes = null;
            try {
              sendRes = await apiGet({ action: "sendCourierRoute", telegramId: id, ticket: ticket });
            } catch (eSend) {}
            if ((!sendRes || sendRes.status !== "success") && /ticket|need_id|text/i.test(String((sendRes && sendRes.message) || ""))) {
              await new Promise(function (r) { setTimeout(r, 500); });
              try {
                sendRes = await apiGet({ action: "sendCourierRoute", telegramId: id, ticket: ticket });
              } catch (eRetry) {}
            }

            if (!sendRes || sendRes.status !== "success") {
              var shortText = text.length > 850 ? (text.slice(0, 850) + "\n…") : text;
              try {
                sendRes = await apiGet({ action: "sendCourierRoute", telegramId: id, text: shortText });
              } catch (eShort) {}
            }
            if (sendRes && sendRes.status === "success") {
              showToast("Отправлено: " + (c.name || c.username || id));
              closeModal(true);
            } else {
              var msg = (sendRes && (sendRes.message || sendRes.description || sendRes.error)) || "send_failed";
              if (/token|no_token/i.test(String(msg))) {
                await uiAlertAsync("Нет TELEGRAM_BOT_TOKEN в Script Properties. Добавьте токен бота и задеплойте Code.gs заново (Deploy → Manage deployments → Edit → New version).");
              } else if (/chat|forbidden|bot was blocked|not found|blocked/i.test(String(msg))) {
                await uiAlertAsync("Курьер должен сначала написать боту /start (или открыть мини-апп). Потом отправка сработает.");
              } else {
                showToast("Не дошло: " + msg);
              }
              btn.disabled = false;
              btn.innerHTML = labelRestore;
            }
          };
        });
        const copy = document.getElementById("shareCopy");
        const cancel = document.getElementById("modalCancel");
        if (copy) copy.onclick = async function () {
          showToast((await copyText(text)) ? "Скопировано" : "Не скопировалось");
        };
        if (cancel) cancel.onclick = function () { closeModal(true); };
      }, 0);

      await p;
      recoverUiFocus();
    }

    function igMessageForStop(depot, stops, index) {
      const mins = approxMinutesForClient(driveMinutesToStop(depot, stops, index));
      return "Здравствуйте! Буду примерно через " + mins + " мин.";
    }

    async function copyOneIgMessage(routeIndex, stopIndex) {
      const depot = routePlanState.depot;
      const stops = routePlanState.routes[routeIndex] || [];
      if (!stops[stopIndex]) return;
      const text = igMessageForStop(depot, stops, stopIndex);
      const ok = await copyText(text);
      showToast(ok ? ("Скопировано · через ~" + approxMinutesForClient(driveMinutesToStop(depot, stops, stopIndex)) + " мин") : "Не скопировалось");
    }

    function etaShortForMsg(depot, stops, index, depart) {
      return String(approxMinutesForClient(driveMinutesToStop(depot, stops, index))) + " мин";
    }

    function buildIgMessagesForRoute(routeIndex) {
      const depot = routePlanState.depot;
      const stops = routePlanState.routes[routeIndex] || [];
      return stops.map(function (s, i) {
        return s.name + ":\n" + igMessageForStop(depot, stops, i);
      }).join("\n\n---\n\n");
    }

    async function copyIgMessages(routeIndex) {
      const text = buildIgMessagesForRoute(routeIndex);
      if (!text) {
        showToast("Пустой маршрут");
        return;
      }
      showToast((await copyText(text)) ? "Тексты скопированы (время от сейчас)" : "Не скопировалось");
    }

    function renderRoutePlan() {
      const box = document.getElementById("routePlanBox");
      if (!box) return;
      const depot = routePlanState.depot || { lat: 53.9, lon: 27.56 };
      const count = routePlanState.courierCount;
      let html = "";
      let totalMin = 0;

      for (let r = 0; r < count; r++) {
        const stops = routePlanState.routes[r] || [];
        const mins = estimateRouteMinutes(depot, stops);
        if (mins > totalMin) totalMin = mins;
        html += '<div class="route-card">';
        html += '<div class="route-head"><div class="route-title">Курьер ' + (r + 1) + " · " + stops.length + " точ" +
          (stops.length === 1 ? "ка" : (stops.length >= 2 && stops.length <= 4 ? "ки" : "ек")) +
          '</div><div class="route-time">ориентир ' + formatMinutes(mins) + "</div></div>";

        if (!stops.length) {
          html += '<p class="muted">Пока пусто — перенесите точки сюда</p>';
        } else {
          var timeline = simulateRouteTimeline_(depot, stops, departMinutesNow_());
          if (timeline && timeline.late > 0.5) {
            html += '<div class="muted" style="color:#ff9f0a;font-size:12px;margin-bottom:8px;">Окна: опоздание ~' +
              Math.round(timeline.late) + " мин суммарно — проверьте порядок / окна клиентов</div>";
          }
          stops.forEach(function (s, i) {
            const other = r === 0 ? 1 : 0;
            const canMove = count === 2;
            var winBits = [];
            if (s.deliveryAfter) winBits.push("≥ " + s.deliveryAfter);
            if (s.deliveryBefore) winBits.push("≤ " + s.deliveryBefore);
            html += '<div class="route-stop">';
            html += '<div class="route-stop-top">';
            html += '<div><div class="route-stop-name">' + (i + 1) + ". " + escapeHtml(s.name) +
              (winBits.length ? (' <span class="route-badge">' + escapeHtml(winBits.join(" · ")) + "</span>") : "") +
              "</div>";
            html += '<div class="route-stop-addr">' + escapeHtml(s.address) + "</div>";
            if (s.price != null) {
              html += '<div style="color:#30d158;font-weight:700;font-size:13px;margin-top:2px;">Цена: ' +
                escapeHtml(String(s.price)) + " BYN</div>";
            }
            if (s.deliveryLabel) {
              html += '<div class="route-badge">' + escapeHtml(s.deliveryLabel) +
                (s.clientAddress ? (" → " + escapeHtml(s.clientAddress)) : "") + "</div>";
            }
            html += '<div class="ig-bubble">Сообщение клиенту посчитает время <b>в момент копирования</b>' +
              '<div class="ig-bubble-actions"><button type="button" class="route-mini" onclick="copyOneIgMessage(' + r + "," + i + ')">Копировать «через N мин»</button></div></div>';
            html += "</div>";
            if (canMove) {
              html += '<button type="button" class="route-mini" onclick="moveStopBetweenRoutes(' + r + "," + i + "," + other + ')">→ ' + (other + 1) + "</button>";
            }
            html += "</div></div>";
          });
        }

        html += '<div class="route-actions">';
        html += '<button class="btn-action btn-green" type="button" onclick="openRouteInYandex(' + r + ')">Карты · порядок мини-аппа · курьер ' + (r + 1) + "</button>";
        html += '<button class="btn-action btn-blue" type="button" onclick="shareCourierRoute(' + r + ')">Отправить курьеру ' + (r + 1) + " в Telegram</button>";
        html += '<button class="btn-action" type="button" style="background:#3a3a3c;" onclick="copyIgMessages(' + r + ')">Все тексты клиентам · ' + (r + 1) + "</button>";
        html += "</div></div>";
      }

      if (count === 2) {
        html = '<div class="total-summary-badge">Ориентир длины (параллельно) ' + formatMinutes(totalMin) +
          " · точное время — в Яндексе · клиенту пиши кнопкой на точке</div>" + html;
      } else {
        html = '<div class="total-summary-badge">Ориентир длины маршрута ' + formatMinutes(totalMin) +
          " · точное время смотри в Яндексе · клиенту — «через N мин» при копировании</div>" + html;
      }
      box.innerHTML = html;
    }

    function openExternalLink(url) {
      try {
        if (tg && typeof tg.openLink === "function") {
          tg.openLink(url, { try_instant_view: false });
          return true;
        }
      } catch (e) {}
      try {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 300);
        return true;
      } catch (e2) {}
      try {

        if (String(url).indexOf("yandexmaps://") === 0 || String(url).indexOf("yandexnavi://") === 0) {
          window.location.href = url;
          return true;
        }
        window.location.href = url;
        return true;
      } catch (e3) {
        return false;
      }
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (e) {}
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch (e2) {
        return false;
      }
    }

    async function openYandexMaps() {
      const dayStops = courierClientsCache.filter(function (c) {
        return String(c.address || "").trim();
      });
      if (!dayStops.length) {
        await uiAlertAsync("Нет адресов. Заполните адреса у клиентов на этот день.");
        return;
      }

      showToast("Собираю все адреса дня…");
      const depotAddr = normalizeAddressForMaps(getDepotAddress());
      saveDepotAddress();
      let depotGeo = routePlanState.depot;
      if (!depotGeo || depotGeo.lat == null) {
        depotGeo = await geocodeAddress(depotAddr, true);
        routePlanState.depot = depotGeo || { lat: MINSK_CENTER.lat, lon: MINSK_CENTER.lon };
      }

      const stops = [];
      for (let i = 0; i < dayStops.length; i++) {
        const c = dayStops[i];
        let method = parseDeliveryMethod(c.note || "");
        const clientAddr = String(c.address || "").trim();
        const outside = await isOutsideMinskDelivery(clientAddr);
        if (!method && outside) method = "euro";

        if (method === "euro" || method === "bel") {
          const officeAddr = parseOfficeAddress(c.note || "");
          let lat = null, lon = null, address = officeAddr;
          if (officeAddr) {
            const geo = await geocodeAddress(normalizeAddressForMaps(officeAddr), true);
            if (geo) { lat = geo.lat; lon = geo.lon; }
          } else {
            const office = await nearestPostOffice(method, routePlanState.depot);
            address = office.address; lat = office.lat; lon = office.lon;
          }
          stops.push({ name: c.name, address: address, lat: lat, lon: lon });
        } else {
          const addr = normalizeAddressForMaps(clientAddr);
          const savedGeo = c.geo || parseGeoFromNote(c.note || "");
          let lat = savedGeo ? savedGeo.lat : null;
          let lon = savedGeo ? savedGeo.lon : null;
          if (lat == null) {
            const geo = await geocodeAddress(addr, true);
            if (geo) { lat = geo.lat; lon = geo.lon; }
          }
          stops.push({ name: c.name, address: addr, lat: lat, lon: lon });
        }
      }

      await refreshDriveMatrix(routePlanState.depot, stops);
      const ordered = optimizeRouteOrder(routePlanState.depot, stops);
      depotGeo = routePlanState.depot;
      const points = [];
      if (depotGeo && depotGeo.lat != null && depotGeo.lon != null) {
        points.push({ lat: Number(depotGeo.lat), lon: Number(depotGeo.lon), label: depotAddr, address: depotAddr });
      } else {
        points.push({ address: depotAddr, label: depotAddr });
      }
      ordered.forEach(function (s) {
        if (s.lat != null && s.lon != null) {
          points.push({ lat: Number(s.lat), lon: Number(s.lon), address: s.address || "", label: s.name || s.address || "" });
        } else if (s.address) {
          points.push({ address: s.address, label: s.name || s.address });
        }
      });
      openAllInYandex(points);
    }

    function showAccessGate(title, text, actionsHtml) {
      var gate = document.getElementById("accessGate");
      document.getElementById("accessTitle").textContent = title;
      document.getElementById("accessText").textContent = text;
      document.getElementById("accessActions").innerHTML = actionsHtml || "";
      gate.classList.add("open");
    }
    function hideAccessGate() {
      var gate = document.getElementById("accessGate");
      if (!gate) return;
      gate.classList.remove("open");
      gate.style.display = "none";
      gate.style.pointerEvents = "none";
    }

    async function bootstrapAccess() {
      try {
        var u = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
        myTelegramId = String(u.id || "") || readTelegramIdFromTg() || loadStoredTelegramId();
        if (!myTelegramId) {
          try { myTelegramId = readTelegramIdFromUrl_() || ""; } catch (eUrl) {}
        }
        if (myTelegramId) storeTelegramId(myTelegramId);
        myAccessName = String(u.first_name || "") + (u.last_name ? " " + u.last_name : "");
        var username = String(u.username || "");

        var cachedRole = "";
        try { cachedRole = String(localStorage.getItem("superboyna_app_role") || ""); } catch (eR0) {}
        var bootedEarly = false;
        if (cachedRole && cachedRole !== "none" && cachedRole !== "pending" && cachedRole !== "denied") {
          APP_ROLE = cachedRole;
          if (APP_ROLE === "owner" || APP_ROLE === "all") weekTabUnlocked = true;
          applyRoleTabs({ skipSwitch: true, skipNetwork: true });
          restoreLastScreen();
          bootedEarly = true;
        }
        if (!myTelegramId) {
          APP_ROLE = "all";
          weekTabUnlocked = true;
          try { localStorage.setItem("superboyna_app_role", "all"); } catch (eR1) {}
          if (!bootedEarly) {
            applyRoleTabs({ skipSwitch: true, skipNetwork: true });
            restoreLastScreen();
          }
          maybeAskWeekPullFromMonth();
          return;
        }
        var res = await apiGet({
          action: "getMyAccess",
          telegramId: myTelegramId,
          name: myAccessName,
          username: username
        }, { timeoutMs: window.__BOINYA_C_CUTOVER__ ? 8000 : 18000, retries: 0, cacheTtlMs: 120000 });
        if (!res || res.status !== "success") {
          APP_ROLE = "all";
          weekTabUnlocked = true;
          try { localStorage.setItem("superboyna_app_role", "all"); } catch (eR2) {}
          if (!bootedEarly) {
            applyRoleTabs({ skipSwitch: true, skipNetwork: true });
            restoreLastScreen();
          }
          maybeAskWeekPullFromMonth();
          return;
        }
        var prevRole = APP_ROLE;
        APP_ROLE = res.role || "none";
        try { localStorage.setItem("superboyna_app_role", String(APP_ROLE)); } catch (eR3) {}
        if (APP_ROLE === "owner" || APP_ROLE === "all") weekTabUnlocked = true;
        if (APP_ROLE === "none" || APP_ROLE === "pending") {
          showAccessGate(
            APP_ROLE === "pending" ? "Ожидание" : "Нет доступа",
            APP_ROLE === "pending"
              ? "Заявка отправлена. Владелец назначит роль."
              : "Нажмите «Запросить доступ». Владелец увидит заявку.",
            APP_ROLE === "pending"
              ? ""
              : '<button class="btn-action btn-orange" type="button" onclick="doRequestAccess()">Запросить доступ</button>'
          );
          applyRoleTabs({ skipSwitch: true, skipNetwork: true });
          return;
        }
        if (APP_ROLE === "denied") {
          showAccessGate("Доступ закрыт", "Обратитесь к владельцу.", "");
          applyRoleTabs({ skipSwitch: true, skipNetwork: true });
          return;
        }
        hideAccessGate();
        if (!bootedEarly || prevRole !== APP_ROLE) {
          applyRoleTabs({ skipSwitch: true, skipNetwork: true });
          if (!bootedEarly) restoreLastScreen();
        }
        setTimeout(function () {
          try { refreshDeferredBadge(false); } catch (eDef) {}
        }, 800);
        maybeAskWeekPullFromMonth();
      } catch (e) {
        APP_ROLE = "all";
        weekTabUnlocked = true;
        try { localStorage.setItem("superboyna_app_role", "all"); } catch (eR4) {}
        applyRoleTabs({ skipSwitch: true, skipNetwork: true });
        restoreLastScreen();
        setTimeout(function () {
          try { refreshDeferredBadge(false); } catch (eDef2) {}
        }, 800);
        maybeAskWeekPullFromMonth();
      }
    }

    const WEEK_PULL_LS = "superboyna_week_pull_";
    const FINISH_REFUSE_LS = "superboyna_finish_refuse_";
    const FINISH_REFUSE_UNTIL_LS = "superboyna_finish_refuse_until_";
    const FINISH_DONE_LS = "superboyna_finish_done_";
    const FINISH_REAL_LS = "superboyna_finish_real_"; // только после успешного finishFullWeek
    const FINISH_HIDE_LS = "superboyna_finish_hide_"; // «Уже завершили — скрыть»
    let subsSegment = "ПП";
    var bpListFilter = "all";
    var bpEditMode = false;
    var bpPicked = Object.create(null); // key -> {nick,label,subId}
    var bpBasketTab = 1;
    var subDetailBasketBp1 = [];
    var subDetailBasketBp2 = [];

    function currentWeekKeyLocal() {
      var d = new Date();
      var day = d.getDay();
      var diff = (day === 0 ? -6 : 1 - day);
      var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
      function pad(n) { return n < 10 ? "0" + n : "" + n; }
      return mon.getFullYear() + "-" + pad(mon.getMonth() + 1) + "-" + pad(mon.getDate());
    }

    function isSundayForFinishWeek_() {
      return new Date().getDay() === 0;
    }
    function isMondayMorning() {
      var d = new Date();
      return d.getDay() === 1 && d.getHours() < 12;
    }
    function isFinishWeekWindow_() {
      return isSundayForFinishWeek_() || isMondayMorning();
    }
    function refuseSnoozeActive_(wk) {
      try {
        var until = Number(localStorage.getItem(FINISH_REFUSE_UNTIL_LS + wk) || 0);
        if (until > Date.now()) return true;

        if (until > 0 || localStorage.getItem(FINISH_REFUSE_LS + wk) === "1") {
          localStorage.removeItem(FINISH_REFUSE_UNTIL_LS + wk);
          localStorage.removeItem(FINISH_REFUSE_LS + wk);
        }
        return false;
      } catch (e) { return false; }
    }

    function onOrderDaySelectChange_() {
      try {
        renderOrderDayCounts_((_orderDayCountsCache && _orderDayCountsCache.items) || null);
      } catch (e) {}
    }
    window.onOrderDaySelectChange_ = onOrderDaySelectChange_;

    function refreshWeekBanners(opts) {
      opts = opts || {};
      try { refreshWeekBannersAsync_(opts); } catch (e) {}
    }

    function invalidateOpsDayCaches_(day) {
      day = String(day || "");
      try {
        if (courierClientsCache && courierClientsCache.length) {
          if (!day || String(courierClientsCache._day || "") === day) courierClientsCache = [];
        }
      } catch (eC) { courierClientsCache = []; }
      try {
        if (assemblyCache) {
          if (!day || String(assemblyCache.day || "") === day) assemblyCache = null;
        }
      } catch (eA) { assemblyCache = null; }
      try {
        window._cuttingNeedRefresh = true;
        // не обнулять cuttingItemsCache — иначе галочки слетают до ответа сервера
        if (cuttingSession) cuttingSession.fingerprint = "";
      } catch (eCut) {}
    }
    window.invalidateOpsDayCaches_ = invalidateOpsDayCaches_;

    var _orderDayCountsAt = 0;
    var _orderDayCountsInFlight = null;
    var _orderDayCountsCache = null;

    function renderOrderDayCounts_(items) {
      var box = document.getElementById("orderDayCounts");
      if (!box) return;
      var cur = "";
      try { cur = String((document.getElementById("day") && document.getElementById("day").value) || ""); } catch (e0) {}
      var list = items && items.length ? items : [
        { day: "Понедельник", short: "Пн", count: "·" },
        { day: "Вторник", short: "Вт", count: "·" },
        { day: "Среда", short: "Ср", count: "·" },
        { day: "Четверг", short: "Чт", count: "·" },
        { day: "Пятница", short: "Пт", count: "·" },
        { day: "Суббота", short: "Сб", count: "·" },
        { day: "Воскресенье", short: "Вс", count: "·" },
        { day: "Будущая неделя", short: "Буд", count: "·" }
      ];
      box.innerHTML = list.map(function (it) {
        var n = it.count;
        var num = Number(n);
        var cls = "order-day-chip";
        if (String(it.day) === cur) cls += " is-active";
        if (isFinite(num)) {
          if (num <= 0) cls += " is-empty";
          else if (num >= 12) cls += " is-full";
        } else {
          cls += " is-empty";
        }
        var safeDay = String(it.day || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return '<button type="button" class="' + cls + '" onclick="selectOrderDayFromCount_(\'' + safeDay + '\')">' +
          '<span class="odc-label">' + escapeHtml(it.short || "") + "</span>" +
          '<span class="odc-count">' + escapeHtml(String(n)) + "</span>" +
          "</button>";
      }).join("");
      try { updateWeekSkewBanner_(items, _orderDayCountsCache); } catch (eSkew) {}
    }

    function parseDmyToDate_(raw) {
      var s = String(raw || "").trim();
      var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        var p = s.slice(0, 10).split("-");
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      }
      return null;
    }

    function updateWeekSkewBanner_(items, meta) {
      var ban = document.getElementById("weekSkewBanner");
      var txt = document.getElementById("weekSkewText");
      if (!ban) return;
      meta = meta || {};
      if (meta.fromCalendar && meta.sheetMonday) {
        ban.style.display = "block";
        if (txt) {
          txt.textContent =
            "Лист «Прием» стоит на " + String(meta.sheetMonday) +
            " (закрытие недели ускакало). Счётчики и нарезка сейчас с календаря " +
            String(meta.calendarMonday || "") +
            ". Вставка Code.gs даты не откатывает — нужен вызов repairWeekMonday.";
        }
        return;
      }
      var mon = null;
      (items || []).forEach(function (it) {
        if (it && String(it.day) === "Понедельник") mon = it;
      });
      if (!mon || !mon.date) {
        ban.style.display = "none";
        return;
      }
      var d = parseDmyToDate_(mon.date);
      if (!d || isNaN(d.getTime())) {
        ban.style.display = "none";
        return;
      }
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      var diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
      // норма: Пн этой/прошлой/следующей недели (±10 дней от сегодня)
      if (diffDays >= -10 && diffDays <= 14) {
        ban.style.display = "none";
        return;
      }
      ban.style.display = "block";
      if (txt) {
        txt.textContent =
          "На листе понедельник " + String(mon.date) +
          " (сейчас должно быть около текущей недели). " +
          "Приём/нарезка/курьер показывают эту дату. Нужен Deploy Code.gs → repairWeekMonday.";
      }
    }

    function selectOrderDayFromCount_(dayName) {
      dayName = String(dayName || "").trim();
      if (!dayName) return;
      var sel = document.getElementById("day");
      if (sel) {
        sel.value = dayName;
        try { sel.dispatchEvent(new Event("change")); } catch (e1) {}
      }
      var dateEl = document.getElementById("deliveryDate");
      var hit = null;
      if (_orderDayCountsCache && _orderDayCountsCache.items) {
        for (var i = 0; i < _orderDayCountsCache.items.length; i++) {
          if (String(_orderDayCountsCache.items[i].day) === dayName) {
            hit = _orderDayCountsCache.items[i];
            break;
          }
        }
      }
      if (dateEl && hit && hit.date) {
        var rawD = String(hit.date || "").trim();
        var isoD = "";
        var mD = rawD.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (mD) isoD = mD[3] + "-" + ("0" + mD[2]).slice(-2) + "-" + ("0" + mD[1]).slice(-2);
        else if (/^\d{4}-\d{2}-\d{2}/.test(rawD)) isoD = rawD.slice(0, 10);
        if (isoD) dateEl.value = isoD;
        try { if (orderType === "pp") refreshPpFactPrice(); } catch (ePp) {}
      }
      renderOrderDayCounts_((_orderDayCountsCache && _orderDayCountsCache.items) || null);
      showToast(dayName);
    }
    window.selectOrderDayFromCount_ = selectOrderDayFromCount_;

    async function refreshOrderDayCounts_(opts) {
      opts = opts || {};
      var force = !!opts.force;

      if (!force && _orderDayCountsCache) {
        renderOrderDayCounts_(_orderDayCountsCache.items || []);
        return _orderDayCountsCache;
      }
      if (_orderDayCountsInFlight) return _orderDayCountsInFlight;
      _orderDayCountsInFlight = (async function () {
        try {
          var res = await apiGet({
            action: "getWeekDayCounts",
            force: force ? "1" : "",
            _: force ? String(Date.now()) : undefined
          }, { timeoutMs: 12000, cacheTtlMs: force ? 0 : 15000 });
          if (res && res.status === "success" && res.items) {
            _orderDayCountsCache = res;
            _orderDayCountsAt = Date.now();
            renderOrderDayCounts_(res.items);
            return res;
          }
          renderOrderDayCounts_(null);
        } catch (e) {
          renderOrderDayCounts_(null);
        } finally {
          _orderDayCountsInFlight = null;
        }
        return null;
      })();
      return _orderDayCountsInFlight;
    }
    window.refreshOrderDayCounts_ = refreshOrderDayCounts_;

    var _weekBannerState = { finished: false, pulled: false, refused: false, weekKey: "", finishedAt: "", by: "" };
    const FINISH_SEEN_LS = "superboyna_finish_seen_";

    function maybeAnnounceWeekFinished_(st, wk) {
      if (!st || !st.finished) return;
      var at = String(st.finishedAt || "1");
      var seenKey = FINISH_SEEN_LS + String(wk || "");
      try {
        if (localStorage.getItem(seenKey) === at) return;
        localStorage.setItem(seenKey, at);
      } catch (eS) {}
      var me = String(myTelegramId || "").trim();
      var by = String(st.by || "").trim();
      if (by && me && by === me) return;
      var msg = "Неделя уже завершена";
      if (by) msg += " (кем: " + by + ")";
      msg += ". Кнопка «Завершить» скрыта — дальше «Подтянуть из месяца».";
      try { showToast(msg); } catch (eT) {}
      try { uiAlertAsync(msg); } catch (eA) {}
    }

    var _weekBannerLoading = false;
    var _weekBannerFetchedAt = 0;
    var _weekBannerInflight = null;

    async function refreshWeekBannersAsync_(opts) {
      opts = opts || {};
      var force = !!opts.force;
      var soft = !!opts.soft;
      var fin = document.getElementById("finishWeekBanner");
      var pull = document.getElementById("pullWeekBanner");
      if (!fin || !pull) return;
      var wk = currentWeekKeyLocal();
      var bannerFresh = !!(
        _weekBannerState &&
        _weekBannerState.weekKey === wk &&
        _weekBannerFetchedAt &&
        (Date.now() - _weekBannerFetchedAt) < 60000 &&
        !force
      );
      if (soft && bannerFresh) {

      } else if (!force && _weekBannerInflight) {
        try { await _weekBannerInflight; } catch (eJoin) {}
      } else if (!bannerFresh || force) {
        _weekBannerLoading = true;
        _weekBannerInflight = (async function () {
          try {
            var st = await apiGet(
              { action: "getWeekBannerState", weekKey: wk },
              { timeoutMs: soft ? 10000 : 12000, retries: soft ? 0 : 1 }
            );
            _weekBannerFetchedAt = Date.now();
            if (st && st.status === "success") {
              _weekBannerState = {
                finished: !!st.finished,
                pulled: !!st.pulled,
                refused: !!st.refused,
                weekKey: st.weekKey || wk,
                finishedAt: st.finishedAt || "",
                by: st.by || ""
              };
              try { maybeAnnounceWeekFinished_(st, wk); } catch (eAnn) {}
            }
          } catch (eGet) {
            if (!_weekBannerFetchedAt) {
              _weekBannerState = {
                finished: localStorage.getItem(FINISH_REAL_LS + wk) === "1",
                pulled: localStorage.getItem(WEEK_PULL_LS + wk) === "pulled",
                refused: false,
                weekKey: wk
              };
              _weekBannerFetchedAt = Date.now();
            }
          } finally {
            _weekBannerLoading = false;
          }
        })();
        try { await _weekBannerInflight; } catch (eAw) {}
        _weekBannerInflight = null;
      }

      var realClosed = localStorage.getItem(FINISH_REAL_LS + wk) === "1";
      var hidden = localStorage.getItem(FINISH_HIDE_LS + wk) === "1";
      var refused = refuseSnoozeActive_(wk);
      var finished = realClosed || !!_weekBannerState.finished;
      var pulled = realClosed || !!_weekBannerState.pulled || localStorage.getItem(WEEK_PULL_LS + wk) === "pulled";

      var canFinish = false;
      if ((APP_ROLE === "owner" || APP_ROLE === "all") && isFinishWeekWindow_()) {
        if (!realClosed && !hidden && !refused) canFinish = true;
      }

      if (canFinish && (_weekBannerState.finished || _weekBannerState.pulled || _weekBannerState.refused)) {
        _weekBannerState.finished = false;
        _weekBannerState.pulled = false;
        _weekBannerState.refused = false;
        try {
          localStorage.removeItem(FINISH_DONE_LS + wk);
          localStorage.removeItem(WEEK_PULL_LS + wk);
          localStorage.removeItem(FINISH_REFUSE_LS + wk);
        } catch (eLs) {}
        try {
          apiGet({
            action: "setWeekBannerState",
            weekKey: wk,
            finished: "0",
            pulled: "0",
            refused: "0",
            telegramId: String(myTelegramId || ""),
            _: String(Date.now())
          }, { timeoutMs: 12000, cacheTtlMs: 0 }).catch(function () {});
        } catch (eClr) {}
        finished = false;
        pulled = false;
      }

      fin.style.display = canFinish ? "" : "none";
      var showPull = false;
      if ((APP_ROLE === "owner" || APP_ROLE === "manager" || APP_ROLE === "all") && !canFinish && finished && !pulled) {
        showPull = true;
      }
      pull.style.display = showPull ? "" : "none";
      if (showPull) loadPullWeekPreview();
      try {
        syncFinishWeekPeopleUi_({
          finished: finished,
          pulled: pulled,
          realClosed: realClosed,
          showPull: showPull,
          by: _weekBannerState && _weekBannerState.by
        });
      } catch (ePe) {}
    }

    function syncFinishWeekPeopleUi_(st) {
      st = st || {};
      var card = document.getElementById("finishWeekPeopleCard");
      var statusEl = document.getElementById("finishWeekPeopleStatus");
      var btnFin = document.getElementById("btnFinishWeekPeople");
      var btnPull = document.getElementById("btnPullWeekPeople");
      if (!card) return;
      var isOwner = (APP_ROLE === "owner" || APP_ROLE === "all");
      card.style.display = isOwner ? "" : "none";
      if (!isOwner) return;
      var wk = currentWeekKeyLocal();
      var inWindow = isFinishWeekWindow_();
      var realClosed = !!st.realClosed || localStorage.getItem(FINISH_REAL_LS + wk) === "1";
      var finished = realClosed || !!st.finished;
      var pulled = !!st.pulled || localStorage.getItem(WEEK_PULL_LS + wk) === "pulled";
      var by = String(st.by || "").trim();
      var lines = [];
      lines.push("Неделя с " + wk);
      if (realClosed || finished) {
        lines.push("Статус: уже закрыта" + (by ? (" · " + by) : ""));
      } else if (inWindow) {
        lines.push("Статус: окно закрытия (вс / пн до 12) — можно закрывать");
      } else {
        lines.push("Статус: вне окна вс/пн — кнопка всё равно доступна владельцу");
      }
      if (statusEl) statusEl.textContent = lines.join(". ");
      if (btnFin) {
        btnFin.disabled = !!realClosed;
        btnFin.style.opacity = realClosed ? "0.45" : "1";
        btnFin.innerText = realClosed ? "Неделя уже закрыта" : "Завершить неделю";
      }
      if (btnPull) {
        var showPull = !!st.showPull || (finished && !pulled);
        btnPull.style.display = showPull ? "" : "none";
      }
    }
    window.syncFinishWeekPeopleUi_ = syncFinishWeekPeopleUi_;

    async function dismissFinishWeekBanner() {
      var wk = currentWeekKeyLocal();
      try {
        localStorage.setItem(FINISH_HIDE_LS + wk, "1");
        localStorage.removeItem(FINISH_REFUSE_UNTIL_LS + wk);
        localStorage.removeItem(FINISH_REFUSE_LS + wk);
      } catch (eLs) {}
      var fin = document.getElementById("finishWeekBanner");
      if (fin) fin.style.display = "none";
      showToast("Скрыто до конца окна вс/пн");
    }
    window.dismissFinishWeekBanner = dismissFinishWeekBanner;

    async function loadPullWeekPreview() {
      var box = document.getElementById("pullWeekPreview");
      if (!box) return;
      try {
        var st = await apiGet({ action: "weekPullStatus" });
        if (!st || st.status !== "success") { box.textContent = ""; return; }
        var lines = (st.days || []).map(function (d) {
          return d.day + ": месяц " + (d.inMonth || 0) + " → неделя " + (d.inWeek || 0) + (d.maybeMissing ? (" (ещё +" + d.maybeMissing + ")") : "");
        });
        box.innerHTML = "В месяце: <b>" + (st.monthPeople || 0) + "</b>, в неделе: <b>" + (st.weekPeople || 0) + "</b>. Дописать примерно: <b>" + (st.maybeMissing || 0) + "</b><br>" +
          lines.map(function (l) { return '<div class="pack-line">' + escapeHtml(l) + "</div>"; }).join("");
      } catch (e) { box.textContent = ""; }
    }

    async function onFinishWeekClick() {
      if (!(APP_ROLE === "owner" || APP_ROLE === "all")) {
        await uiAlertAsync("Закрыть неделю может только владелец.");
        return;
      }
      if (window.__finishWeekInFlight) {
        await uiAlertAsync("Закрытие уже запущено — подожди, не нажимай ещё раз.");
        return;
      }
      var wkNow = currentWeekKeyLocal();
      if (localStorage.getItem(FINISH_REAL_LS + wkNow) === "1") {
        await uiAlertAsync("Эта неделя уже закрыта. Повторно нельзя.");
        return;
      }
      var ok = await uiConfirmAsync(
        "ЗАКРЫТЬ НЕДЕЛЮ на живой таблице?\n\n" +
        "• Склад: остаток F = F+B−расход, приход B=0\n" +
        "• Даты Пн–Пт и Доставки +7 дней\n" +
        "• Очистка заказов Пн–Пт (ники, состав, адрес, примечание)\n" +
        "• «Будущая неделя» → блок Понедельника\n" +
        "• Люди из месяца сразу пишутся на новую неделю\n" +
        "• Память нарезки/доставок очищается\n\n" +
        "Сырьё (приходы) вноси после закрытия — на новую неделю.\n" +
        "Отменить будет нельзя. Продолжить?"
      );
      if (!ok) return;
      var ok2 = await uiConfirmAsync("Точно закрыть неделю сейчас?");
      if (!ok2) return;
      if (window.__BOINYA_C_CUTOVER__) {
        var ok3 = await uiConfirmAsync(
          "Бойня C · LIVE\n\nЗакрытие уйдёт в боевые Google Sheets.\n" +
          "Это не песочница. Продолжить?"
        );
        if (!ok3) return;
      }
      var tid = String(myTelegramId || "").trim();
      if (!tid) {
        try {
          var tg = window.Telegram && Telegram.WebApp;
          var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
          if (u && u.id) tid = String(u.id);
        } catch (e0) {}
      }
      if (!tid) {
        await uiAlertAsync("Нет Telegram ID — открой из бота под владельцем.");
        return;
      }
      window.__finishWeekInFlight = true;
      try { if (typeof syncFinishWeekPeopleUi_ === "function") syncFinishWeekPeopleUi_({ realClosed: true }); } catch (eDis) {}
      showToast("Закрываем неделю…");
      var res = null;
      try {
        try { apiCacheBustMem_(); } catch (eClr) {}
        var finishPayload = {
          action: "finishFullWeek",
          telegramId: tid,
          confirm: "1",
          weekKey: currentWeekKeyLocal()
        };
        // cutover Worker без allowDanger=1 отвечает cutover_danger_blocked
        if (window.__BOINYA_C_CUTOVER__) finishPayload.allowDanger = "1";
        res = await apiGet(
          finishPayload,
          { timeoutMs: 180000, cacheTtlMs: 0, directGas: true }
        );
      } catch (e1) {
        window.__finishWeekInFlight = false;
        try { if (typeof syncFinishWeekPeopleUi_ === "function") syncFinishWeekPeopleUi_({}); } catch (eEn) {}
        await uiAlertAsync("Ошибка сети: " + (e1 && e1.message ? e1.message : e1));
        return;
      }
      if (!res || res.status !== "success") {
        window.__finishWeekInFlight = false;
        try { if (typeof syncFinishWeekPeopleUi_ === "function") syncFinishWeekPeopleUi_({}); } catch (eEn2) {}
        var msg = (res && res.message) || "finish_failed";
        if (msg === "owner_only") msg = "Только владелец (Deploy Code.gs + доступ owner).";
        if (msg === "need_confirm") msg = "Нет подтверждения.";
        if (msg === "unknown_action") msg = "Нужен Deploy Code.gs с action finishFullWeek.";
        if (msg === "week_already_finished") {
          msg = "Неделя уже закрыта — повторно нельзя." + (res && res.tip ? ("\n" + res.tip) : "");
          try { localStorage.setItem(FINISH_REAL_LS + currentWeekKeyLocal(), "1"); } catch (eLsFin) {}
          try { if (typeof syncFinishWeekPeopleUi_ === "function") syncFinishWeekPeopleUi_({ realClosed: true }); } catch (eDis2) {}
        }
        if (msg === "week_finish_busy") msg = "Закрытие уже идёт. Подожди и не нажимай повторно.";
        if (msg === "cutover_danger_blocked") {
          msg = "Cutover заблокировал закрытие. Обнови Mini App (новая версия) и повтори.";
        }
        if (msg === "sandbox_no_prod_week") {
          msg = "Песочница D1 (нет cutover=1): люди в D1 ок, боевые Sheets не меняются. Открой ?cutover=1";
        }
        await uiAlertAsync("Не закрылось: " + msg + (res && res.tip && msg.indexOf(res.tip) < 0 ? ("\n" + res.tip) : ""));
        return;
      }
      var wk = currentWeekKeyLocal();
      localStorage.setItem(FINISH_REAL_LS + wk, "1");
      localStorage.setItem(FINISH_DONE_LS + wk, "1");
      localStorage.setItem(WEEK_PULL_LS + wk, "pulled");
      localStorage.setItem(FINISH_HIDE_LS + wk, "1");
      localStorage.removeItem(FINISH_REFUSE_LS + wk);
      localStorage.removeItem(FINISH_REFUSE_UNTIL_LS + wk);
      _weekBannerState.finished = true;
      _weekBannerState.pulled = true;
      _weekBannerState.weekKey = wk;
      try {
        await apiGet({
          action: "setWeekBannerState",
          weekKey: wk,
          finished: "1",
          pulled: "1",
          telegramId: tid,
          _: String(Date.now())
        }, { timeoutMs: 15000, cacheTtlMs: 0 });
      } catch (eSet) {}
      var addedN = Number(res.materializeAdded != null ? res.materializeAdded
        : (res.materialize && res.materialize.totalAdded)) || 0;
      showToast("Неделя закрыта. Пн: " + (res.mondayDate || "ок") +
        (addedN ? (" · из месяца +" + addedN) : ""));
      try { logLearnEvent("finishFullWeek", { weekKey: wk, mondayDate: res.mondayDate || "", materializeAdded: addedN }); } catch (e2) {}
      try { apiCacheBustMem_(); } catch (eClr2) {}
      // Worker D1 ещё со старой неделей — принудительно подтянуть GAS (+ сброс нарезки/курьера)
      try {
        await apiGet({ action: "getWeekDayCounts", force: "1", _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
      } catch (eCnt) {}
      try {
        // доп. пинок: пустые ops-экраны не должны показывать «завершено» из mem
        cuttingCompletionCache = null;
        cuttingItemsCache = [];
        courierClientsCache = [];
      } catch (eMem) {}
      viewWeekOverviewCache = null;
      viewMonthOverviewCache = null;
      try { await ensureWeekOverviewLoaded_({ force: true }); } catch (eW) {}
      refreshWeekBanners();
      try {
        await uiAlertAsync(
          "Неделя закрыта.\n\nНовый понедельник: " + (res.mondayDate || "—") +
          (addedN ? ("\nИз месяца дописано: +" + addedN) : "") +
          "\n\nЕсли экран ещё старый — закрой Mini App и открой снова."
        );
      } catch (eA) {}
      window.__finishWeekInFlight = false;
    }

    async function refuseFinishWeek() {

      var wk = currentWeekKeyLocal();
      var until = Date.now() + 3 * 60 * 60 * 1000;
      try {
        localStorage.setItem(FINISH_REFUSE_UNTIL_LS + wk, String(until));
        localStorage.removeItem(FINISH_REFUSE_LS + wk);
      } catch (eLs) {}
      _weekBannerState.refused = false;
      _weekBannerState.weekKey = wk;
      var fin = document.getElementById("finishWeekBanner");
      if (fin) fin.style.display = "none";
      showToast("Ок, напомним через ~3 часа");
    }
    window.onFinishWeekClick = onFinishWeekClick;
    window.refuseFinishWeek = refuseFinishWeek;

    async function dismissPullWeekBanner() {
      var wk = currentWeekKeyLocal();
      try {
        localStorage.setItem(WEEK_PULL_LS + wk, "pulled");
        localStorage.setItem(FINISH_DONE_LS + wk, "1");
      } catch (eLs) {}
      _weekBannerState.pulled = true;
      _weekBannerState.finished = true;
      _weekBannerState.weekKey = wk;
      try {
        await apiGet({
          action: "setWeekBannerState",
          weekKey: wk,
          pulled: "1",
          finished: "1",
          telegramId: String(myTelegramId || ""),
          _: String(Date.now())
        }, { timeoutMs: 12000, cacheTtlMs: 0 });
      } catch (eSet) {}
      try { refreshWeekBanners(); } catch (eR) {}
      showToast("Баннер скрыт");
    }
    window.dismissPullWeekBanner = dismissPullWeekBanner;

    async function confirmPullWeekFromHome() {
      var st = null;
      try { st = await apiGet({ action: "weekPullStatus" }); } catch (e) {}
      var msg = "Подтянуть людей из месяцев на всю Пн–Вс?\nСостав подставится с листов ПП/АФК/БП (ПП — с учётом 1-й/2-й доставки).\nУже стоящих с составом не затираем.";
      if (st && st.status === "success") {
        msg += "\n\nМесяц: " + (st.monthPeople || 0) + ", неделя: " + (st.weekPeople || 0) + ", дописать ~" + (st.maybeMissing || 0);
      }
      var ok = await uiConfirmAsync(msg);
      if (!ok) return;
      await runMaterializeWeek(false);
      refreshWeekBanners();
    }
    window.confirmPullWeekFromHome = confirmPullWeekFromHome;

    function setBpListFilter(f) {
      bpListFilter = f || "all";
      document.querySelectorAll("#bpFilterRow .bp-chip").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-bp") === bpListFilter);
      });
      renderSubsList();
    }
    window.setBpListFilter = setBpListFilter;

    function syncBpEditBarUi_() {
      var bar = document.getElementById("bpEditBar");
      var btn = document.getElementById("bpEditToggleBtn");
      if (bar) bar.classList.toggle("on", !!bpEditMode);
      if (btn) {
        btn.textContent = bpEditMode ? "Выбор вкл." : "Редактировать";
        btn.style.background = bpEditMode ? "#0a84ff" : "#3a3a3c";
      }
    }

    function toggleBpEditMode(force) {
      if (typeof force === "boolean") bpEditMode = force;
      else bpEditMode = !bpEditMode;
      if (!bpEditMode) bpPicked = Object.create(null);
      syncBpEditBarUi_();
      renderSubsList();
      if (bpEditMode) showToast("Режим выбора: жми на человека");
    }
    window.toggleBpEditMode = toggleBpEditMode;

    function bpPickKey_(s) {
      return String((s && (s.subId || s.nick || s.label)) || "").trim().toUpperCase();
    }

    function onBpRowClick(i, ev) {
      if (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e0) {}
      }
      var list = window._subsListCache || [];
      var s = list[i];
      if (!s) return;
      if (!bpEditMode || subsSegment !== "БП") {
        openSubDetail(i);
        return;
      }
      var key = bpPickKey_(s);
      if (!key) return;
      if (bpPicked[key]) delete bpPicked[key];
      else {
        bpPicked[key] = {
          nick: s.nick || s.label || "",
          label: s.label || s.nick || "",
          subId: s.subId || ""
        };
      }
      renderSubsList();
    }
    window.onBpRowClick = onBpRowClick;

    function todayYmdLocal_() {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function ymdPlusDaysLocal_(ymd, days) {
      var d;
      if (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd)) {
        var p = String(ymd).slice(0, 10).split("-");
        d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      } else {
        d = new Date();
      }
      d.setDate(d.getDate() + (Number(days) || 0));
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    async function fillOwnerSelect_(selectId, selectedId) {
      var sel = document.getElementById(selectId);
      if (!sel) return;
      var people = [];
      try { people = await loadReminderPeople_(); } catch (eP) { people = []; }
      var cur = String(selectedId || sel.value || "").trim();
      var html = '<option value="">— выберите —</option>';
      for (var i = 0; i < people.length; i++) {
        var p = people[i] || {};
        var id = String(p.telegramId || "").trim();
        if (!id) continue;
        var label = (p.name || p.username || id);
        if (p.role) label += " · " + p.role;
        html += '<option value="' + escapeHtml(id) + '"' + (id === cur ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
      }
      sel.innerHTML = html;
      if (cur) sel.value = cur;
    }

    function ownerFromSelect_(selectId) {
      var sel = document.getElementById(selectId);
      if (!sel || !sel.value) return { telegramId: "", name: "" };
      var opt = sel.options[sel.selectedIndex];
      var name = opt ? String(opt.textContent || "").replace(/\s·\s.*$/, "").trim() : "";
      return { telegramId: String(sel.value).trim(), name: name };
    }

    async function openAddBpClientForm() {
      var card = document.getElementById("bpAddCard");
      if (!card) return;
      card.style.display = "block";
      var nick = document.getElementById("bpAddNick");
      if (nick) nick.focus();
      var stage = document.getElementById("bpAddStage");
      if (stage && !stage.value) stage.value = "БП1";
      onBpAddStageChange_();
      try { await fillOwnerSelect_("bpAddOwner", myTelegramId || ""); } catch (eO) {}
    }

    function onBpAddStageChange_() {
      var stage = (document.getElementById("bpAddStage") && document.getElementById("bpAddStage").value) || "БП1";
      var wrap = document.getElementById("bpAddSurveyDateWrap");
      var lab = document.getElementById("bpAddSurveyDateLabel");
      var sd = document.getElementById("bpAddSurveyDate");
      if (wrap) wrap.style.display = "block";
      if (lab) {
        lab.textContent = stage === "ФИНАЛ"
          ? "Дата финального опросника (пусто = +4 дня после 2-й)"
          : "Дата опросника после 1-й доставки (пусто = +4 дня)";
      }
      if (sd && !sd.value) sd.value = ymdPlusDaysLocal_("", 4);
    }
    window.onBpAddStageChange_ = onBpAddStageChange_;

    function closeAddBpClientForm() {
      var card = document.getElementById("bpAddCard");
      if (card) card.style.display = "none";
    }

    function normalizeBpStage_(raw) {
      var u = String(raw || "").trim().toUpperCase();
      if (!u) return "БП1";
      if (/ФИНАЛ|FINAL|БП2_FINAL|БП2FINAL/.test(u)) return "ФИНАЛ";
      if (/БП1_SURVEY|БП1SURVEY|ОПРОС/.test(u)) return "БП2";
      if (/\bБП2\b/.test(u) || /^БП2/.test(u) || u.indexOf("БП2") >= 0) return "БП2";
      if (/ДУМА/.test(u)) return "ФИНАЛ";
      return "БП1";
    }

    async function resolveBpOrderChain_(clientName, deliveryDate) {
      var existing = null;
      try {
        showToast("Ищу в БП…");
        var res = await apiGet({
          action: "getSubscription",
          nick: clientName,
          segment: "БП",
          sheet: "БП",
          _: String(Date.now())
        }, { timeoutMs: 22000, cacheTtlMs: 0 });
        if (res && res.status === "success" && (res.nick || res.label || res.rowIndex)) {
          existing = res;
        }
      } catch (eLook) {}

      async function ensureOwner_(seed) {
        if (seed && seed.telegramId) return seed;
        var ownerPick = await pickReminderTargetAsync_();
        if (!ownerPick || !ownerPick.telegramId) {
          showToast("Нужен ответственный менеджер");
          return null;
        }
        return { telegramId: ownerPick.telegramId || "", name: ownerPick.name || "" };
      }

      if (!existing) {
        var createBp = await uiConfirmAsync(
          "«" + clientName + "» ещё нет в БП.\nСоздать карточку БП1 (1-я доставка)?\nОпросник — через 4 дня после получения."
        );
        if (!createBp) return null;
        var ownNew = await ensureOwner_(null);
        if (!ownNew) return false;
        return {
          createCard: true,
          needSurvey: true,
          status: "БП1",
          stage: "БП1",
          surveyDate: ymdPlusDaysLocal_(deliveryDate || "", 4),
          surveyKind: "bp2",
          ownerTelegramId: ownNew.telegramId,
          ownerName: ownNew.name,
          subId: "",
          advance: "new"
        };
      }

      var st = normalizeBpStage_(existing.ppStatus || existing.status || existing.stage || "БП1");
      var seedOwner = {
        telegramId: existing.ownerTelegramId || "",
        name: existing.ownerName || ""
      };
      var due = ymdPlusDaysLocal_(deliveryDate || "", 4);

      if (st === "ФИНАЛ") {
        var updFin = await uiConfirmAsync(
          "«" + clientName + "» уже в Финале БП.\nОбновить состав 2-й доставки и дату финального опросника на " + due + "?"
        );
        if (!updFin) return null;
        var ownFin = await ensureOwner_(seedOwner);
        if (!ownFin) return false;
        return {
          createCard: true,
          needSurvey: true,
          status: "ФИНАЛ",
          stage: "ФИНАЛ",
          surveyDate: due,
          surveyKind: "final",
          ownerTelegramId: ownFin.telegramId,
          ownerName: ownFin.name,
          subId: existing.subId || "",
          advance: "refresh_final"
        };
      }

      var go2 = await uiConfirmAsync(
        "«" + clientName + "» уже в БП (" + st + ").\nЭто 2-я доставка?\n→ Финал + финальный опросник на " + due + "."
      );
      if (go2) {
        var own2 = await ensureOwner_(seedOwner);
        if (!own2) return false;
        return {
          createCard: true,
          needSurvey: true,
          status: "ФИНАЛ",
          stage: "ФИНАЛ",
          surveyDate: due,
          surveyKind: "final",
          ownerTelegramId: own2.telegramId,
          ownerName: own2.name,
          subId: existing.subId || "",
          advance: "to_final"
        };
      }

      var stay1 = await uiConfirmAsync(
        "Оставить этап " + st + " и обновить состав 1-й доставки?\nОпросник после 1-й → " + due + "."
      );
      if (!stay1) return null;
      var own1 = await ensureOwner_(seedOwner);
      if (!own1) return false;
      return {
        createCard: true,
        needSurvey: true,
        status: st === "БП2" ? "БП2" : "БП1",
        stage: st === "БП2" ? "БП2" : "БП1",
        surveyDate: due,
        surveyKind: "bp2",
        ownerTelegramId: own1.telegramId,
        ownerName: own1.name,
        subId: existing.subId || "",
        advance: "refresh_first"
      };
    }
    window.resolveBpOrderChain_ = resolveBpOrderChain_;

    function bpStageSurveyKind_(stage) {
      var st = normalizeBpStage_(stage);
      if (st === "ФИНАЛ") return "final";
      return "bp2"; // БП1 и БП2 — опросник после 1-й доставки
    }

    async function submitAddBpClient() {
      var nickEl = document.getElementById("bpAddNick");
      var nick = nickEl ? String(nickEl.value || "").trim() : "";
      if (!nick) {
        showToast("Укажи ник");
        return;
      }
      var stageEl = document.getElementById("bpAddStage");
      var status = normalizeBpStage_(stageEl ? stageEl.value : "БП1");
      var surveyKind = bpStageSurveyKind_(status);
      var needSurvey = !!surveyKind;
      var surveyDateEl = document.getElementById("bpAddSurveyDate");
      var surveyDate = surveyDateEl ? String(surveyDateEl.value || "").trim() : "";
      var address = (document.getElementById("bpAddAddress") && document.getElementById("bpAddAddress").value) || "";
      var phone = (document.getElementById("bpAddPhone") && document.getElementById("bpAddPhone").value) || "";
      var wishes = (document.getElementById("bpAddWishes") && document.getElementById("bpAddWishes").value) || "";
      var owner = ownerFromSelect_("bpAddOwner");
      if (!owner.telegramId) {
        showToast("Выбери ответственного менеджера");
        return;
      }
      if (needSurvey && !surveyDate) surveyDate = ymdPlusDaysLocal_("", 4);
      var payload = {
        action: "ensureBpFromOrder",
        nick: nick,
        createCard: true,
        needSurvey: needSurvey ? "1" : "0",
        status: status,
        surveyDate: needSurvey ? (surveyDate || "") : "",
        surveyKind: surveyKind || "",
        wishes: String(wishes || "").trim(),
        address: String(address || "").trim(),
        phone: String(phone || "").trim(),
        ownerTelegramId: owner.telegramId,
        ownerName: owner.name,
        basket: []
      };
      try {
        try {
          await apiPost(payload);
        } catch (ePost) {}
        var res = await apiGet({
          action: "ensureBpFromOrder",
          nick: nick,
          createCard: "1",
          needSurvey: needSurvey ? "1" : "0",
          status: status,
          surveyDate: needSurvey ? (surveyDate || "") : "",
          surveyKind: surveyKind || "",
          wishes: String(wishes || "").trim(),
          address: String(address || "").trim(),
          phone: String(phone || "").trim(),
          ownerTelegramId: owner.telegramId,
          ownerName: owner.name,
          basket: "[]"
        }, { timeoutMs: 60000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast("Не создалось: " + ((res && res.message) || "Deploy Code.gs"));
          return;
        }
        if (needSurvey && (!res.survey || !res.survey.id)) {
          try {
            var sv = await apiGet({
              action: "saveSurvey",
              nick: nick,
              kind: surveyKind || "bp2",
              dueDate: surveyDate || ymdPlusDaysLocal_("", 4),
              stage: status,
              status: "planned",
              templateId: surveyKind === "final" ? "survey_final" : "survey_bp2",
              ownerTelegramId: owner.telegramId,
              ownerName: owner.name,
              note: "from_manual_bp",
              _: String(Date.now())
            }, { timeoutMs: 45000, cacheTtlMs: 0 });
            if (sv && sv.status === "success") res.survey = sv.item;
          } catch (eSv) {}
        }
        var msg = "БП · " + status;
        if (needSurvey) msg += " · опрос " + ((res.survey && res.survey.dueDate) || surveyDate || "");
        showToast(msg);
        closeAddBpClientForm();
        if (nickEl) nickEl.value = "";
        await loadSubscriptions({ force: true });
        try {
          var list = window._subsListCache || window._subsListFull || [];
          var idx = -1;
          var want = nick.toLowerCase();
          for (var i = 0; i < list.length; i++) {
            var n = String((list[i] && (list[i].nick || list[i].label)) || "").toLowerCase();
            if (n === want || n.indexOf(want) >= 0) { idx = i; break; }
          }
          if (idx >= 0 && typeof openSubDetail === "function") openSubDetail(idx);
        } catch (eOpen) {}
      } catch (e) {
        showToast("Ошибка создания БП — нужен Deploy Code.gs v7.11.17");
      }
    }
    window.openAddBpClientForm = openAddBpClientForm;
    window.closeAddBpClientForm = closeAddBpClientForm;
    window.submitAddBpClient = submitAddBpClient;

    function bpStageColor_(s) {

      var st = normalizeBpStage_(s && (s.status || s.stage || s.ppStatus));
      if (st === "ФИНАЛ") return "red";
      if (st === "БП2") return "orange";
      var finalDue = surveyDueYmdLocal_(s && s.surveyFinalDue);
      var bp2Due = surveyDueYmdLocal_(s && s.surveyBp2Due);
      var today = todayYmdLocal_();
      if (finalDue && finalDue <= today) return "red";
      if (bp2Due) return "orange";
      return "green";
    }

    function surveyDueYmdLocal_(raw) {
      var s = String(raw || "").trim();
      if (!s) return "";
      var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : s.slice(0, 10);
    }

    function onBpCardStageChange_() {
      var sel = document.getElementById("subDetailStatusSelect");
      var stage = normalizeBpStage_(sel && sel.value);
      if (sel) sel.value = stage;
      var statusInp = document.getElementById("subDetailStatus");
      if (statusInp) statusInp.value = stage;
      var d2 = document.getElementById("subDetailSurveyBp2");
      var df = document.getElementById("subDetailSurveyFinal");
      var d2Wrap = d2 ? d2.closest(".form-group") : null;
      var dfWrap = df ? df.closest(".form-group") : null;
      var isFinal = stage === "ФИНАЛ";
      if (d2Wrap) d2Wrap.style.display = isFinal ? "none" : "block";
      if (dfWrap) dfWrap.style.display = isFinal ? "block" : "none";
      if (!isFinal && d2 && !d2.value) d2.value = ymdPlusDaysLocal_("", 4);
      if (isFinal && df && !df.value) df.value = ymdPlusDaysLocal_("", 4);
      var mapTxt = document.getElementById("subDetailBpMapText");
      if (mapTxt) {
        var tip = stage === "ФИНАЛ"
          ? "2-я доставка · финальный опрос через 4 дня"
          : (stage === "БП2"
            ? "после 1-й · опрос / договорённость о 2-й"
            : "1-я доставка · опрос через 4 дня");
        mapTxt.textContent = "Этап: " + stage + " · " + tip;
      }
    }
    window.onBpCardStageChange_ = onBpCardStageChange_;

    function applyBpStatusUi_(sheet, statusRaw) {
      var isBp = String(sheet || "") === "БП";
      var sel = document.getElementById("subDetailStatusSelect");
      var statusInp = document.getElementById("subDetailStatus");
      if (!sel || !statusInp) return;
      if (isBp) {
        sel.style.display = "block";
        statusInp.style.display = "none";
        sel.value = normalizeBpStage_(statusRaw);
        onBpCardStageChange_();
      } else {
        sel.style.display = "none";
        statusInp.style.display = "block";
      }
    }

    function groupBpSubscriptions_(list) {
      var byNick = Object.create(null);
      var order = [];
      (list || []).forEach(function (s) {
        var nick = String(s.nick || s.label || "").trim();
        var key = nick.toUpperCase() || ("#" + (s.subId || Math.random()));
        if (!byNick[key]) {
          byNick[key] = Object.assign({}, s, {
            basketBp1: s.basketBp1 || ((/БП1/.test(String(s.status || ""))) ? (s.basket || []) : []),
            basketBp2: s.basketBp2 || ((/БП2/.test(String(s.status || ""))) ? (s.basket || []) : [])
          });
          order.push(key);
        } else {
          var cur = byNick[key];
          var st = String(s.status || "");
          if (/БП1/.test(st) && (s.basket || s.basketBp1)) cur.basketBp1 = s.basketBp1 || s.basket || cur.basketBp1;
          if (/БП2/.test(st) && (s.basket || s.basketBp2)) cur.basketBp2 = s.basketBp2 || s.basket || cur.basketBp2;
          if (s.surveyBp2Due) cur.surveyBp2Due = s.surveyBp2Due;
          if (s.surveyFinalDue) cur.surveyFinalDue = s.surveyFinalDue;
          if (s.ownerTelegramId) cur.ownerTelegramId = s.ownerTelegramId;
          if (s.ownerName) cur.ownerName = s.ownerName;
          if (s.wishes) cur.wishes = (cur.wishes ? cur.wishes + "\n" : "") + s.wishes;
          if (st && (!cur.status || st.length >= String(cur.status).length)) cur.status = st;
        }
      });
      return order.map(function (k) { return byNick[k]; });
    }

    function setBpBasketTab(n) {
      syncBpBasketFromTab_();
      bpBasketTab = n === 2 ? 2 : 1;
      var t1 = document.getElementById("bpBasketTab1");
      var t2 = document.getElementById("bpBasketTab2");
      if (t1) t1.classList.toggle("active", bpBasketTab === 1);
      if (t2) t2.classList.toggle("active", bpBasketTab === 2);
      subDetailBasket = (bpBasketTab === 2 ? subDetailBasketBp2 : subDetailBasketBp1).slice();
      renderSubDetailBasket();
    }
    window.setBpBasketTab = setBpBasketTab;

    function syncBpBasketFromTab_() {
      if (bpBasketTab === 2) subDetailBasketBp2 = (subDetailBasket || []).slice();
      else subDetailBasketBp1 = (subDetailBasket || []).slice();
    }

    async function bpBatchDelete() {
      if (!bpEditMode) {
        toggleBpEditMode(true);
        showToast("Сначала выбери людей");
        return;
      }
      var keys = Object.keys(bpPicked);
      if (!keys.length) { showToast("Никого не выбрано — жми на иконку человека"); return; }
      var targets = keys.map(function (k) { return bpPicked[k]; })
        .filter(function (t) { return t && (t.nick || t.label || t.subId); });
      var ok = await uiConfirmAsync("Удалить из БП: " + targets.length + " чел.?");
      if (!ok) return;
      showToast("Удаляю " + targets.length + "…");
      var items = targets.map(function (t) {
        return {
          // Только ник: subId+ник раньше матчились через ИЛИ и могли снести чужие строки.
          // После Deploy Code.gs AND-матч безопасен; ник достаточнен для удаления.
          nick: t.label || t.nick || "",
          label: t.label || t.nick || ""
        };
      });
      var res = null;
      try {
        res = await apiGet({
          action: "deleteSubscriptionBatch",
          sheet: "БП",
          segment: "БП",
          items: JSON.stringify(items),
          _: String(Date.now())
        }, { timeoutMs: 90000, cacheTtlMs: 0 });
      } catch (e0) { res = null; }

      if (!res || res.status !== "success") {
        if (res && res.message === "unknown_action") {
          var okN = 0;
          var fail = [];
          for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            try {
              var one = await apiGet({
                action: "deleteSubscription",
                nick: t.label || t.nick || "",
                subId: t.subId || "",
                sheet: "БП",
                segment: "БП",
                _: String(Date.now()) + "_" + i
              }, { timeoutMs: 25000, cacheTtlMs: 0 });
              if (one && one.status === "success" && (one.deletedCount > 0 || one.deletedRow)) okN++;
              else fail.push((t.nick || t.label || "?") + ": " + ((one && one.message) || "err"));
            } catch (e1) {
              fail.push((t.nick || t.label || "?") + ": сеть");
            }
          }
          try { apiCacheBustMem_(); } catch (eClr0) {}
          bpPicked = Object.create(null);
          bpEditMode = false;
          syncBpEditBarUi_();
          if (fail.length) {
            await uiAlertAsync("Удалено " + okN + " из " + targets.length + ".\n" + fail.slice(0, 8).join("\n") +
              "\n\nЗадеплой Code.gs v7.11.22 — будет удаление одной пачкой.");
          } else {
            showToast("Удалено: " + okN);
          }
          await loadSubscriptions();
          return;
        }
        await uiAlertAsync("Не удалилось. Нужен Deploy Code.gs v7.11.23 (deleteSubscriptionBatch).\n" +
          ((res && res.message) || ""));
        return;
      }
      try { apiCacheBustMem_(); } catch (eClr) {}
      bpPicked = Object.create(null);
      bpEditMode = false;
      syncBpEditBarUi_();
      var deleted = res.deletedPeople != null ? res.deletedPeople : (res.deletedCount || 0);
      if (res.failCount > 0) {
        var fails = (res.failed || []).slice(0, 6).map(function (f) {
          return (f.nick || f.subId || "#" + f.i) + ": " + (f.message || "?");
        });
        await uiAlertAsync("Удалено " + deleted + " из " + targets.length + ".\n" + fails.join("\n"));
      } else {
        showToast("Удалено: " + deleted + (res.surveysCancelled ? (" · опросн.−" + res.surveysCancelled) : ""));
      }
      await loadSubscriptions();
    }
    window.bpBatchDelete = bpBatchDelete;

    async function closeAllOpenDeficitsUi() {
      var ok = await uiConfirmAsync("Закрыть ВСЕ открытые дефициты нарезки?\nTG перестанет спамить каждые 30 мин.");
      if (!ok) return;
      var tid = String(myTelegramId || "").trim();
      var res = await apiGet({ action: "closeAllOpenDeficits", telegramId: tid, confirm: "1" }, { timeoutMs: 30000, cacheTtlMs: 0 });
      if (res && res.status === "success") showToast("Закрыто: " + (res.closed || 0));
      else await uiAlertAsync("Не вышло: " + ((res && res.message) || "Deploy Code.gs"));
    }
    window.closeAllOpenDeficitsUi = closeAllOpenDeficitsUi;

    async function bpCardTransferToPp() {
      var nick = (document.getElementById("subDetailNick").value || document.getElementById("subDetailLabel").value || "").trim();
      var label = (document.getElementById("subDetailLabel").value || nick || "").trim();
      var subId = (document.getElementById("subDetailSubId").value || "").trim();
      if (!nick && !label) { showToast("Нет ника"); return; }
      syncBpBasketFromTab_();
      var ok = await uiConfirmAsync(
        "Перевести «" + (label || nick) + "» с БП в ПП?\nПопадёт в статистику «стало ПП», затем откроется расчёт."
      );
      if (!ok) return;
      try {
        showToast("БП → ПП…");
        var res = await apiGet({
          action: "moveSubscription",
          nick: label || nick,
          subId: subId,
          fromSheet: "БП",
          toSheet: "ПП",
          sheet: "БП",
          _: String(Date.now())
        }, { timeoutMs: 30000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          // уже в ПП / нет строки — всё равно журнал перехода + штамп
          try {
            await apiGet({
              action: "recordBpToPpConversion",
              nick: label || nick,
              label: label || nick,
              subId: subId,
              telegramId: String(myTelegramId || "").trim(),
              _: String(Date.now())
            }, { timeoutMs: 20000, cacheTtlMs: 0 });
          } catch (eRec) {}
          var why = (res && res.message) || "ошибка";
          if (why === "unknown_action") {
            showToast("Нужен Deploy Code.gs (moveSubscription)");
          } else {
            showToast("Переход записан в статистику · открой расчёт");
          }
        } else {
          try { apiCacheBustMem_(); } catch (eClr) {}
          // дубль-страховка: move мог не дописать Stats_Переходы на старом Deploy
          try {
            await apiGet({
              action: "recordBpToPpConversion",
              nick: label || nick,
              label: label || nick,
              subId: (res && res.subId) || subId,
              telegramId: String(myTelegramId || "").trim(),
              _: String(Date.now())
            }, { timeoutMs: 20000, cacheTtlMs: 0 });
          } catch (eRec2) {}
          var shEl = document.getElementById("subDetailSheet");
          if (shEl) shEl.value = "ПП";
          showToast("В ПП · учтено в статистике БП→ПП");
        }
        window._enrollFromBp = { nick: label || nick, subId: subId, at: Date.now() };
        setOrderType("pp");
        switchTab("priceScreen");
        var nameEl = document.getElementById("enrollDisplayName") || document.getElementById("client");
        if (nameEl) nameEl.value = label || nick;
      } catch (e) { showToast(e.message || "Ошибка"); }
    }
    window.bpCardTransferToPp = bpCardTransferToPp;

    async function bpCardMarkTouch() {
      var nick = (document.getElementById("subDetailNick").value || document.getElementById("subDetailLabel").value || "").trim();
      if (!nick) { showToast("Нет ника"); return; }
      try {
        await apiGet({
          action: "markBpTouch",
          nick: nick,
          sheet: "БП",
          _: String(Date.now())
        }, { timeoutMs: 15000, cacheTtlMs: 0 });
        showToast("Контакт отмечен");
      } catch (e) {
        showToast("Не вышло — Deploy Code.gs");
      }
    }
    window.bpCardMarkTouch = bpCardMarkTouch;

    async function openBpIdleFromTasks_(nick) {
      nick = String(nick || "").trim();
      if (!nick) return;
      try { closeTasksDrawer(); } catch (e0) {}
      switchTab("subsScreen");
      setSubsSegment("БП", { skipLoad: true });
      try {
        await loadSubscriptions({ force: true });
      } catch (e1) {}
      var list = window._subsListCache || window._subsListFull || [];
      var want = nick.toLowerCase().replace(/^@/, "");
      var idx = -1;
      for (var i = 0; i < list.length; i++) {
        var n = String(list[i].nick || list[i].label || "").toLowerCase().replace(/^@/, "");
        if (n === want || n.indexOf(want) >= 0 || want.indexOf(n) >= 0) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        openSubDetail(idx);
      } else {
        showToast("Открой БП вручную: " + nick);
      }
    }
    window.openBpIdleFromTasks_ = openBpIdleFromTasks_;

    function dismissBpIdleTask_(id) {
      deferredCache = (deferredCache || []).filter(function (it) {
        return String(it.id) !== String(id);
      });
      updateTasksBadge();
      try { renderTasksDrawer(false); } catch (e) {}
    }
    window.dismissBpIdleTask_ = dismissBpIdleTask_;

    async function loadBpIdleIntoDeferred_() {
      try {
        var res = await apiGet({ action: "listBpIdle", days: "7", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });

        var items = (res && (res.idle || res.items)) || [];
        if (!items.length) return;
        var existing = {};
        (deferredCache || []).forEach(function (it) { existing[String(it.id)] = true; });
        items.forEach(function (it) {
          var id = "bpidle:" + String(it.nick || it.label || it.id || "");
          if (existing[id]) return;
          deferredCache.unshift({
            id: id,
            mode: "bp_idle",
            title: "БП2 простой >7д",
            nick: it.nick || "",
            label: (it.nick || it.label || "") + " · БП2 простой >7д",
            status: "open",
            note: it.note || it.wishes || ""
          });
        });
        updateTasksBadge();
      } catch (e) { /* silent until Deploy */ }
    }

    function setSubsSegment(seg, opts) {
      opts = opts || {};
      if (seg !== "БП" && bpEditMode) {
        bpEditMode = false;
        bpPicked = Object.create(null);
        syncBpEditBarUi_();
      }
      subsSegment = seg;
      document.querySelectorAll("#subsTabs .seg-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-seg") === seg);
      });
      if (opts.skipLoad) return;
      loadSubscriptions({ soft: true });
    }
    window.setSubsSegment = setSubsSegment;

    async function loadStats(opts) {
      opts = opts || {};
      var box = document.getElementById("statsContainer");
      if (!box) return;
      try { ensureStatsExpectDates_(); } catch (eD) {}
      var hasCache = !!window._statsCacheHtml;

      function applyStatsRes_(res) {
        if (!res || res.status !== "success") return false;
        if (!res.factCutoff) res._oldDeploy = true;
        var html = renderStatsDashboard_(res);
        window._statsCacheHtml = html;
        window._statsCacheAt = Date.now();
        box.innerHTML = html;
        return true;
      }

      if (!opts.force && hasCache) {
        box.innerHTML = window._statsCacheHtml;
        if (opts.soft) {
          // фон: обновить без лоадера
          apiGet({
            action: "getStats",
            period: "month",
            force: "1",
            _: String(Date.now())
          }, { timeoutMs: 60000, cacheTtlMs: 0, retries: 0 }).then(function (res) {
            try { applyStatsRes_(res); } catch (eBg) {}
          }).catch(function () {});
          return;
        }
      } else if (!hasCache) {
        box.innerHTML = simpleLoadingHtml("Считаю месяц…");
      } else if (opts.force) {
        box.insertAdjacentHTML("afterbegin",
          '<div class="muted" id="statsRefreshHint" style="font-size:12px;margin-bottom:8px;">Обновляю…</div>');
      }
      try {
        var statsParams = { action: "getStats", period: "month" };
        if (opts.force) {
          statsParams.force = "1";
          statsParams._ = String(Date.now());
        }
        var res = await apiGet(statsParams, {
          timeoutMs: opts.force ? 90000 : 20000,
          cacheTtlMs: opts.force ? 0 : 120000
        });
        if (!applyStatsRes_(res)) {
          if (!hasCache) {
            box.innerHTML = '<p class="muted">Статистика не ответила. Нужен Deploy Code.gs.</p>';
          } else {
            var hint = document.getElementById("statsRefreshHint");
            if (hint) hint.textContent = "Не обновилось — показан прошлый снимок";
          }
          return;
        }
      } catch (e) {
        if (!hasCache) box.innerHTML = '<p class="muted">Нет данных / нужен деплой бэкенда</p>';
      }
    }
    window.loadStats = loadStats;

    function ensureStatsExpectDates_() {
      var fromEl = document.getElementById("statsExpectFrom");
      var toEl = document.getElementById("statsExpectTo");
      if (!fromEl || !toEl) return;
      if (fromEl.value && toEl.value) return;
      var now = new Date();
      var y = now.getFullYear();
      var m = now.getMonth();
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var first = y + "-" + pad(m + 1) + "-01";
      var lastDay = new Date(y, m + 1, 0).getDate();
      var last = y + "-" + pad(m + 1) + "-" + pad(lastDay);
      if (!fromEl.value) fromEl.value = first;
      if (!toEl.value) toEl.value = last;
    }

    async function loadExpectedProfit() {
      var box = document.getElementById("statsExpectBox");
      if (!box) return;
      ensureStatsExpectDates_();
      var from = (document.getElementById("statsExpectFrom") || {}).value || "";
      var to = (document.getElementById("statsExpectTo") || {}).value || "";
      if (!from || !to) {
        box.innerHTML = '<p class="muted">Укажите даты «с» и «по»</p>';
        return;
      }
      box.innerHTML = '<p class="muted">Считаю диапазон…</p>';
      var res = null;
      try {

        res = await apiGet({
          action: "getStats",
          mode: "expected",
          dateFrom: from,
          dateTo: to,
          force: "1",
          _: String(Date.now())
        }, { timeoutMs: 45000, cacheTtlMs: 0 });
      } catch (e1) { res = null; }
      if (!res || res.status !== "success") {
        try {
          res = await apiGet({
            action: "getExpectedProfit",
            fromDate: from,
            toDate: to,
            _: String(Date.now())
          }, { timeoutMs: 45000, cacheTtlMs: 0 });
        } catch (e2) { res = null; }
      }
      if (!res || res.status !== "success") {
        var msg = (res && res.message) || "Не удалось посчитать";
        if (msg === "unknown_action" || !res || res.status === "unknown_action") {
          msg = "Нужен Deploy Code.gs: вставь актуальный Code.gs → Deploy → New version. Без этого нет расчёта диапазона и фильтра «только прошедшие».";
        }
        box.innerHTML = '<p class="muted" style="color:#ff9f0a;">' + escapeHtml(msg) + "</p>";
        return;
      }
      var by = res.bySource || {};
      var html = "";
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><div class="muted" style="font-size:11px;">Прибыль (=оборот)</div><div style="font-size:22px;font-weight:800;color:#30d158;">' + (res.profit != null ? res.profit : res.revenue || 0) + "</div></div>";
      html += '<div><div class="muted" style="font-size:11px;">Чистое</div><div style="font-size:22px;font-weight:800;color:#ff9f0a;">' + (res.clean != null ? res.clean : Math.round(((res.revenue || 0) - (res.cost || 0)) * 100) / 100) + "</div></div>";
      html += '<div><div class="muted" style="font-size:11px;">Затраты</div><div style="font-size:18px;font-weight:700;color:#64d2ff;">' + (res.cost || 0) + "</div></div>";
      html += '<div><div class="muted" style="font-size:11px;">Доставок</div><div style="font-size:18px;font-weight:700;">' + (res.deliveries || 0) + "</div></div>";
      html += "</div>";
      html += '<div class="muted" style="font-size:12px;margin-top:10px;">' + escapeHtml(res.from) + " → " + escapeHtml(res.to) + "</div>";
      html += '<div class="muted" style="font-size:12px;margin-top:6px;">ПП ' + (by.pp || 0) +
        " · БП " + (by.bp || 0) +
        " · розница " + (by.retail || 0) +
        " · партнёр-заказ " + (by.partner || 0) + "</div>";
      box.innerHTML = html;
    }
    window.loadExpectedProfit = loadExpectedProfit;

    function statsBarRow_(label, value, maxV, color) {
      var v = Number(value) || 0;
      var max = Math.max(Number(maxV) || 0, 1);
      var pct = Math.max(2, Math.min(100, Math.round((v / max) * 100)));
      return '<div style="margin:6px 0;">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">' +
        '<span>' + escapeHtml(label) + '</span><b>' + escapeHtml(String(v)) + '</b></div>' +
        '<div style="height:10px;background:#2c2c2e;border-radius:6px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + (color || "#ff9f0a") + ';border-radius:6px;"></div>' +
        '</div></div>';
    }

    function statsDeltaTxt_(d) {
      if (!d || d.prev == null) return "";
      var abs = Number(d.abs) || 0;
      var sign = abs > 0 ? "+" : "";
      var pct = (d.pct != null) ? (" (" + sign + d.pct + "%)") : "";
      var color = abs > 0 ? "#30d158" : (abs < 0 ? "#ff453a" : "#8e8e93");
      return '<span style="color:' + color + ';font-size:11px;">' + sign + abs + pct + "</span>";
    }

    function renderStatsDashboard_(res) {
      var pp = res.pp || {};
      var bp = res.bp || {};
      var m = res.month || {};
      var money = res.money || {};
      var fact = res.fact || {};
      var by = fact.bySource || m.bySource || {};
      var costBy = fact.costBySource || m.costBySource || {};

      var deliveries = fact.deliveries != null ? fact.deliveries : (m.deliveries != null ? m.deliveries : (res.deliveries || 0));
      var retail = fact.retail != null ? fact.retail : (money.retail != null ? money.retail : (m.retailRevenue || 0));
      var partnerOrd = fact.partner != null ? fact.partner : (money.partner != null ? money.partner : (m.partnerRevenue || 0));
      var ppActual = fact.ppRevenue != null ? fact.ppRevenue : (pp.actual != null ? pp.actual : (money.ppActual || 0));
      var calTurnover = fact.revenue != null ? fact.revenue : (money.turnover != null ? money.turnover : (Number(ppActual) + Number(retail) + Number(partnerOrd)));
      var costActual = fact.cost != null ? fact.cost : (money.cost || m.costActual || 0);
      var bpSpend = fact.bpCost != null ? fact.bpCost : (bp.spend != null ? bp.spend : (money.bpSpend || 0));
      var bpDeliv = fact.bpDeliveries != null ? fact.bpDeliveries : (bp.deliveries || 0);
      var converted = (bp.convertedToPp != null) ? bp.convertedToPp : 0;
      var cac = bp.costPerConvert;
      var productCost = fact.productCost != null ? fact.productCost : 0;
      var couponsCost = fact.couponsCost != null ? fact.couponsCost : 0;
      var retailCost = costBy.retail != null ? costBy.retail : 0;
      var ppBasketCost = fact.ppBasketCost != null ? fact.ppBasketCost : 0;
      var partnerCostApp = costBy.partner != null ? costBy.partner : 0;
      var ppLightCost = fact.ppLightCost != null ? fact.ppLightCost : 0;
      var ppDeliveryCost = fact.ppDeliveryCost != null ? fact.ppDeliveryCost : 0;
      var ppLightPeople = fact.ppLightPeople != null ? fact.ppLightPeople : 0;
      var ppDelivN = fact.ppDeliveries != null ? fact.ppDeliveries : (by.pp || 0);
      var ppLightEach = fact.ppLightFeeEach != null ? fact.ppLightFeeEach : 11;
      var ppDelivEach = fact.ppDeliveryFeeEach != null ? fact.ppDeliveryFeeEach : 6;
      var profitFact = fact.profit != null ? fact.profit : calTurnover;
      var cleanFact = fact.clean != null ? fact.clean : Math.round((Number(calTurnover) - Number(costActual)) * 100) / 100;
      var life = bp.life || {};
      var partners = (fact.byPartner || res.byPartner || []).filter(function (p) {
        var n = String(p.name || "").trim();
        return n && n.indexOf("без партн") < 0;
      });
      var ppTurnover = (pp.turnover != null) ? pp.turnover : (money.ppTurnover || 0);
      var ppClean = (pp.clean != null) ? pp.clean : (money.ppClean || 0);
      var ppCost = (pp.cost != null) ? pp.cost : (money.ppCost || 0);

      function tile_(label, value, bg, fg) {
        return '<div style="background:' + bg + ';border-radius:14px;padding:12px 14px;min-width:0;">' +
          '<div style="font-size:11px;opacity:0.85;color:' + fg + ';">' + escapeHtml(label) + "</div>" +
          '<div style="font-size:22px;font-weight:800;color:' + fg + ';margin-top:4px;">' + escapeHtml(String(value)) + "</div></div>";
      }
      function line_(label, value, color) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
          '<span class="muted">' + escapeHtml(label) + '</span><b style="color:' + (color || "#fff") + ';">' +
          escapeHtml(String(value)) + "</b></div>";
      }

      var html = '';
      if (res._oldDeploy) {
        html += '<div class="card" style="border-color:#ff9f0a;background:rgba(255,159,10,0.08);"><b style="color:#ff9f0a;">Старый Deploy Code.gs</b>' +
          '<div class="muted" style="font-size:12px;margin-top:6px;">Вставь актуальный Code.gs → Deploy → New version.</div></div>';
      }

      html += '<div class="card" style="background:linear-gradient(160deg,#1c1c1e 0%,#252530 100%);">';
      html += '<div class="section-title" style="margin-top:0;color:#fff;">' + escapeHtml(res.monthLabel || res.title || "Месяц") + "</div>";
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += tile_("Прибыль (=оборот)", profitFact, "rgba(48,209,88,0.18)", "#30d158");
      html += tile_("Чистое", cleanFact, "rgba(255,159,10,0.18)", "#ff9f0a");
      html += tile_("Затраты", costActual, "rgba(100,210,255,0.16)", "#64d2ff");
      html += tile_("Доставок", deliveries, "rgba(191,90,242,0.16)", "#bf5af2");
      html += "</div>";
      html += '<div class="muted" style="font-size:12px;margin-top:12px;">ПП ' + (by.pp || 0) +
        " · БП " + (by.bp || 0) +
        " · розница " + (by.retail || 0) +
        " · партнёр-заказ " + (by.partner || 0) +
        ((by.other || 0) ? (" · прочее " + by.other) : "") +
        "</div>";
      html += "</div>";

      html += '<div class="card">';
      html += '<div class="section-title" style="margin-top:0;color:#30d158;">Откуда деньги</div>';
      html += line_("ПП", ppActual + " BYN", "#bf5af2");
      html += line_("Розница", retail + " BYN", "#ff9f0a");
      html += line_("Заказы «Партнёр»", partnerOrd + " BYN", "#64d2ff");
      html += "</div>";

      html += '<div class="card">';
      html += '<div class="section-title" style="margin-top:0;color:#64d2ff;">Затраты</div>';
      html += line_("Продукция всего", productCost + " BYN", "#fff");
      html += line_(" · розница (состав)", retailCost + " BYN", "#ff9f0a");
      html += line_(" · ПП (состав)", ppBasketCost + " BYN", "#bf5af2");
      html += line_(" · партнёр-заказ", partnerCostApp + " BYN", "#64d2ff");
      html += line_("Купоны", couponsCost + " BYN", "#ffd60a");
      html += line_("Свет ПП (" + ppLightEach + "р × " + ppLightPeople + " чел)", ppLightCost + " BYN", "#bf5af2");
      html += line_("Доставки ПП (" + ppDelivEach + "р × " + ppDelivN + ")", ppDeliveryCost + " BYN", "#bf5af2");
      html += line_("БП (состав + 6р)", bpSpend + " BYN · " + bpDeliv + " дост.", "#ff453a");
      html += line_("Всего", costActual + " BYN", "#64d2ff");
      html += '<div class="muted" style="font-size:11px;margin-top:8px;">ПП: состав + свет 11р/чел (раз в месяц) + 6р за доставку. БП: состав + 6р. Прайс — лист Розница / Подписка.</div>';
      html += "</div>";

      html += '<div class="card" style="border:1px solid rgba(255,69,58,0.35);">';
      html += '<div class="section-title" style="margin-top:0;color:#ff453a;">БП</div>';
      html += line_("Переходов в ПП (месяц)", converted, "#fff");
      html += line_("На одного (месяц)", cac != null ? (cac + " BYN") : "—", "#ff9f0a");
      html += '<div style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(255,69,58,0.1);">';
      html += '<div class="muted" style="font-size:12px;margin-bottom:6px;color:#ff6961;">За всё время</div>';
      html += line_("Перешло", life.converted || 0, "#fff");
      html += line_("Затраты на БП", (life.bpCost || 0) + " BYN", "#ff453a");
      html += line_("Выручка ПП с них", (life.ppRevenue || 0) + " BYN", "#30d158");
      html += line_("Выхлоп", (life.profit || 0) + " BYN", "#ff9f0a");
      html += "</div></div>";

      html += '<div class="card" id="statsPartnersCard" style="border:1px solid rgba(100,210,255,0.35);background:linear-gradient(160deg,#1a2228 0%,#1c1c1e 100%);">';
      html += '<div class="section-title" style="margin-top:0;color:#64d2ff;">Партнёры</div>';
      html += '<div class="muted" style="font-size:12px;margin-bottom:10px;">БП от партнёра → сколько стало ПП · прибыль = выручка ПП − затрата БП (если платит себест — затрата 0)</div>';
      if (!partners.length) {
        html += '<div style="padding:14px;border-radius:12px;background:rgba(100,210,255,0.08);text-align:center;">';
        html += '<div style="font-size:14px;margin-bottom:6px;">Пока пусто</div>';
        html += '<div class="muted" style="font-size:12px;margin-bottom:10px;">Добавь партнёров и указывай при заказе БП</div>';
        html += '<button type="button" class="btn-action btn-purple" style="margin:0;" onclick="switchTab(\'peopleScreen\',{focus:\'partners\'})">Открыть список партнёров</button>';
        html += "</div>";
      } else {
        partners.forEach(function (p) {
          var good = Number(p.profit) || 0;
          var goodColor = good >= 0 ? "#30d158" : "#ff453a";
          var bpCame = (p.bpClients != null) ? p.bpClients : (p.deliveries || 0);
          var becamePp = (p.convertedToPp != null) ? p.convertedToPp : 0;
          var ppRev = (p.ppRevenue != null) ? p.ppRevenue : (p.revenue || 0);
          var costShow = (p.cost != null) ? p.cost : 0;
          html += '<div style="margin:0 0 10px;padding:12px;border-radius:12px;background:rgba(100,210,255,0.1);border:1px solid rgba(100,210,255,0.2);">';
          html += '<div style="font-weight:800;font-size:15px;color:#64d2ff;">' + escapeHtml(p.name) +
            (p.paysCost ? ' <span class="client-badge" style="background:rgba(48,209,88,0.25);color:#30d158;font-weight:600;">платит себест</span>' : "") +
            "</div>";
          html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:12px;">';
          html += '<div><span class="muted">БП пришло</span><div style="font-weight:700;">' + bpCame + "</div></div>";
          html += '<div><span class="muted">Стало ПП</span><div style="font-weight:700;">' + becamePp + "</div></div>";
          html += '<div><span class="muted">Выручка ПП</span><div style="font-weight:700;color:#30d158;">' + ppRev + "</div></div>";
          html += '<div><span class="muted">Затраты БП</span><div style="font-weight:700;color:#ff9f0a;">' +
            (p.paysCost ? "0 (платит)" : costShow) + "</div></div>";
          html += '<div style="grid-column:1/-1;"><span class="muted">Прибыль</span><div style="font-weight:800;font-size:16px;color:' + goodColor + ';">' + good + " BYN</div></div>";
          html += "</div></div>";
        });
        html += '<button type="button" class="btn-action btn-blue" style="margin:4px 0 0;" onclick="switchTab(\'peopleScreen\',{focus:\'partners\'})">Управлять партнёрами</button>';
      }
      html += "</div>";

      html += '<div class="card">';
      html += '<div class="section-title" style="margin-top:0;color:#ff9f0a;">Лист ПП (снимок)</div>';
      html += line_("Оборот листа", ppTurnover, "#ff9f0a");
      html += line_("Себест листа", ppCost, "#64d2ff");
      html += line_("Выхлоп листа", ppClean, "#30d158");
      html += '<div class="muted" style="font-size:11px;margin-top:6px;">Не факт доставок — статичный лист подписок.</div>';
      html += "</div>";

      return html;
    }

    async function exportStatsMonth() {
      try {
        var res = await apiGet({ action: "exportStats", format: "accountant" }, { timeoutMs: 45000, cacheTtlMs: 0 });
        if (res && res.status === "success") {
          showToast(res.message || "Экспорт готов");
          if (res.tsv) {
            try { await navigator.clipboard.writeText(res.tsv); showToast("TSV скопирован"); } catch (e2) {}
          }
        } else {
          showToast("Экспорт не вышел — Deploy Code.gs v7.11.23");
        }
      } catch (e) { showToast("Ошибка экспорта"); }
    }
    window.exportStatsMonth = exportStatsMonth;

    function logLearnEvent(action, meta) {
      var payload = {
        action: "logEvent",
        event: action,
        screen: (document.querySelector(".screen.active") || {}).id || "",
        role: APP_ROLE,
        telegramId: myTelegramId || "",
        meta: meta || {},
        at: new Date().toISOString()
      };
      try { apiPost(payload); } catch (e) {}
    }

    async function openBugReport() {
      var screen = (document.querySelector(".screen.active") || {}).id || "";
      var what = prompt("Что работает некорректно? (кратко)", "");
      if (what == null) return;
      what = String(what || "").trim();
      if (!what) { showToast("Пусто — не отправили"); return; }
      var expect = prompt("Что ожидалось?", "") || "";
      try {
        await apiPost({
          action: "reportBug",
          screen: screen,
          role: APP_ROLE,
          telegramId: myTelegramId || "",
          what: what,
          expected: String(expect || "").trim(),
          client: (document.getElementById("client") && document.getElementById("client").value) || "",
          day: (document.getElementById("day") && document.getElementById("day").value) || "",
          at: new Date().toISOString()
        });
        showToast("Репорт записан → агент подхватит в ТЗ");
        logLearnEvent("bugReport", { screen: screen });
      } catch (e) {
        showToast("Не удалось отправить — проверьте деплой Code.gs");
      }
    }
    window.openBugReport = openBugReport;

    async function maybeAskWeekPullFromMonth() {

      try { refreshWeekBanners({ soft: true }); } catch (e) {}
      try { refreshOrderDayCounts_({ soft: true }); } catch (e2) {}
    }

    async function runMaterializeWeek(quiet) {
      try {
        if (!quiet) showToast("Подтягиваю неделю из месяца…");
        const wk = currentWeekKeyLocal();
        const payload = {
          action: "materializeWeek",
          onlyMissing: "1",
          includeFuture: "1",
          dropExtras: "1",
          confirm: "1",
          weekKey: wk,
          _: String(Date.now())
        };
        if (window.__BOINYA_C_CUTOVER__) payload.allowDanger = "1";
        const res = await apiGet(payload, { timeoutMs: 180000, cacheTtlMs: 0, directGas: true });
        const added = res && res.result ? (res.result.totalAdded || 0) : 0;
        const dropped = res && res.result ? (Number(res.result.totalDropped) || 0) : 0;
        const preserved = res && res.result && res.result.days
          ? (res.result.days || []).reduce(function (s, d) { return s + (Number(d.preserved) || 0); }, 0)
          : 0;

        if (wk) {
          localStorage.setItem(WEEK_PULL_LS + wk, "pulled");
          _weekBannerState.pulled = true;
          _weekBannerState.weekKey = wk;
          try {
            await apiGet({
              action: "setWeekBannerState",
              weekKey: wk,
              pulled: "1",
              telegramId: String(myTelegramId || ""),
              _: String(Date.now())
            }, { timeoutMs: 15000, cacheTtlMs: 0 });
          } catch (ePullFlag) {}
        }
        var bits = [];
        if (dropped) bits.push("снято лишних: " + dropped);
        if (added) bits.push("добавлено: " + added);
        if (preserved) bits.push("контакты: " + preserved);
        if (bits.length) showToast(bits.join(" · "));
        else showToast("Новых не нашлось (уже всё на месте?)");
        try { apiCacheBustMem_(); } catch (eBust) {}
        try {
          await apiGet({ action: "getWeekDayCounts", force: "1", _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
        } catch (eCnt) {}
        try { refreshWeekBanners(); } catch (eBan) {}
        const day = document.getElementById("viewDaySelect") && document.getElementById("viewDaySelect").value;
        if (day) await loadClientsForDay();
        return res;
      } catch (err) {
        await uiAlertAsync(err.message || String(err));
      }
    }

    async function pullWeekFromMonth() {
      await confirmPullWeekFromHome();
    }
    window.pullWeekFromMonth = pullWeekFromMonth;

    async function topUpDayFromMonth() {
      await stageAllFromMonth();
    }
    window.topUpDayFromMonth = topUpDayFromMonth;

    async function doRequestAccess() {
      var u = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
      await apiPost({
        action: "requestAccess",
        telegramId: String(u.id || myTelegramId || ""),
        name: myAccessName || String(u.first_name || ""),
        username: String(u.username || "")
      });
      showAccessGate("Ожидание", "Заявка отправлена. Владелец назначит роль.", "");
      showToast("Заявка отправлена");
    }
    window.doRequestAccess = doRequestAccess;

    function setCourierSub(which) {
      courierSub = which;
      document.getElementById("courierSubRoute").classList.toggle("active", which === "route");
      document.getElementById("courierSubAsm").classList.toggle("active", which === "assembly");
      document.getElementById("courierRoutePane").style.display = which === "route" ? "" : "none";
      document.getElementById("courierAssemblyPane").style.display = which === "assembly" ? "" : "none";
      ensureOpsDaySelected();
      if (which === "assembly") {
        var d = document.getElementById("courierDaySelect").value;
        if (d) setSelectDayValue(document.getElementById("assemblyDaySelect"), d);
        loadAssembly(false);
      } else {
        loadCourier(false);
      }
    }
    window.setCourierSub = setCourierSub;

    async function loadAssembly(force) {
      ensureOpsDaySelected();
      var day = document.getElementById("assemblyDaySelect").value || document.getElementById("courierDaySelect").value;
      var box = document.getElementById("assemblyContainer");
      var loadSeq = ++_assemblyLoadSeq;
      if (!day) { box.innerHTML = '<p class="muted">Выберите день…</p>'; return; }
      if (!force && assemblyCache && assemblyCache.status === "success" && String(assemblyCache.day || "") === String(day)) {
        renderAssemblyView();
        return;
      }
      if (force) assemblyDetailExpanded_ = false;
      box.innerHTML = loadingDanceHtml("Считаю пакеты…");
      try {
        var res = await apiGet(
          { action: "getAssembly", day: day },
          { timeoutMs: force ? 22000 : 18000, retries: force ? 1 : 0 }
        );
        if (loadSeq !== _assemblyLoadSeq) return;
        var curDay = document.getElementById("assemblyDaySelect") && document.getElementById("assemblyDaySelect").value;
        if (!curDay) curDay = document.getElementById("courierDaySelect") && document.getElementById("courierDaySelect").value;
        if (String(curDay || "") !== String(day)) return;
        if (!res || res.status !== "success") {
          box.innerHTML = '<p class="muted">Не удалось загрузить</p>';
          return;
        }
        try { applyAssemblyLocalFlags_(res.clients || []); } catch (eAf) {}
        assemblyCache = res;
        renderAssemblyView();
      } catch (e) {
        if (loadSeq !== _assemblyLoadSeq) return;
        box.innerHTML = '<p class="muted">Ошибка сети</p>';
      }
    }

    var ASM_CAP_PRODUCT = { small: 20, medium: 100, large: 250 };
    var ASM_CAP_LIGHT = { small: 15, medium: 80, large: 190 };
    var ASM_CRAFT_HOLDS = { large: 4, medium: 7, small: 35 };
    var ASM_CHEW_FEW = 2;
    var ASM_CHEW_PER_BIG = 4;

    function asmFormatOn(enabled, key) {
      if (!enabled) return true;
      return enabled[key] !== false;
    }

    function asmIsLargeChewFrac(sub) {
      var u = String(sub || "").toUpperCase();
      return /ОГР|ОГРОМ|ГИГАНТ|КРУПН|БОЛЬШ|БОЛ|^ОБЫЧН/.test(u);
    }

    function asmPackGrams(grams, caps, enabled) {
      var out = { "маленький": 0, "средний": 0, "большой": 0 };
      var g = Number(grams) || 0;
      if (g <= 0) return out;
      var levels = [];
      if (asmFormatOn(enabled, "большой")) levels.push({ key: "большой", cap: caps.large });
      if (asmFormatOn(enabled, "средний")) levels.push({ key: "средний", cap: caps.medium });
      if (asmFormatOn(enabled, "маленький")) levels.push({ key: "маленький", cap: caps.small });
      if (!levels.length) {
        levels = [
          { key: "большой", cap: caps.large },
          { key: "средний", cap: caps.medium },
          { key: "маленький", cap: caps.small }
        ];
      }
      var rem = g;
      var largest = levels[0];
      var nFull = Math.floor(rem / largest.cap);
      if (nFull > 0) {
        out[largest.key] += nFull;
        rem -= nFull * largest.cap;
      }
      if (rem <= 0) return out;
      for (var i = levels.length - 1; i >= 0; i--) {
        if (rem <= levels[i].cap) {
          out[levels[i].key]++;
          return out;
        }
      }
      out[largest.key] += Math.ceil(rem / largest.cap);
      return out;
    }

    function asmPackChews(val, sub, enabled) {
      var out = { "маленький": 0, "средний": 0, "большой": 0 };
      var n = Number(val) || 0;
      if (n <= 0) return out;
      var wantMed = n <= ASM_CHEW_FEW && !asmIsLargeChewFrac(sub);
      var canM = asmFormatOn(enabled, "средний");
      var canL = asmFormatOn(enabled, "большой");
      if (wantMed && canM) { out["средний"] = 1; return out; }
      var bags = Math.max(1, Math.ceil(n / ASM_CHEW_PER_BIG));
      if (canL) { out["большой"] = bags; return out; }
      if (canM) { out["средний"] = bags; return out; }
      out["большой"] = bags;
      return out;
    }

    function asmCraftBags(doy) {
      var s = Number(doy["маленький"]) || 0;
      var m = Number(doy["средний"]) || 0;
      var l = (Number(doy["большой"]) || 0) + (Number(doy["целое"]) || 0);
      if (s + m + l <= 0) return 0;
      var fill = l / ASM_CRAFT_HOLDS.large + m / ASM_CRAFT_HOLDS.medium + s / ASM_CRAFT_HOLDS.small;
      return Math.max(1, Math.ceil(fill - 1e-12));
    }

    function isAssemblyTreatItemLocal_(it) {
      var name = String((it && (it.name || it.main)) || "").trim();
      var cat = String((it && it.cat) || "").toLowerCase();
      if (!name && !cat) return false;
      if (cat === "chew" || cat === "chews") return true;
      if (isPieceSkuName(name)) return true;
      return false;
    }
    function basketForAssemblyPacks_(basket, printed) {
      if (!printed) return basket || [];
      return (basket || []).filter(function (it) { return !isAssemblyTreatItemLocal_(it); });
    }
    function buildAssemblyPacksLocal(basket, enabled) {
      var packs = [];
      var doy = { "маленький": 0, "средний": 0, "большой": 0, "целое": 0 };
      function pushDist(name, sub, val, unit, type, dist) {
        ["большой", "средний", "маленький"].forEach(function (key) {
          var n = Number(dist[key]) || 0;
          if (n <= 0) return;
          doy[key] = (doy[key] || 0) + n;
          packs.push({ name: name, sub: sub, val: val, unit: unit, bags: n, type: type, counterKey: key });
        });
      }
      (basket || []).forEach(function (it) {
        var name = String(it.name || it.main || "").trim();
        var sub = String(it.sub || "").trim();
        var val = Number(it.val != null ? it.val : it.value) || 0;
        var cat = String(it.cat || "").toLowerCase();
        var unit = String(it.unit || "").trim() || (isPieceSkuName(name) || cat === "chew" || cat === "chews" ? "шт" : "гр");
        if (!name || val <= 0) return;
        var dist;
        var type = "bulk";
        if (/л[её]гк/i.test(name) && !/баран/i.test(name) && !/крошк/i.test(name)) {
          dist = asmPackGrams(val, ASM_CAP_LIGHT, enabled);
          type = "light";
        } else if (/баран/i.test(name) && /л[её]гк/i.test(name)) {
          dist = asmPackGrams(val, ASM_CAP_PRODUCT, enabled);
          type = "bulk";
        } else if (cat === "chew" || cat === "chews" || isPieceSkuName(name)) {
          dist = asmPackChews(val, sub, enabled);
          type = "chew";
        } else {
          dist = asmPackGrams(val, ASM_CAP_PRODUCT, enabled);
          type = cat === "other" ? "other" : "bulk";
        }
        pushDist(name, sub, val, unit, type, dist);
      });
      if (asmFormatOn(enabled, "крафт")) {
        var cb = asmCraftBags(doy);
        if (cb > 0) {
          packs.push({ name: "КРАФТ", sub: "", val: cb, unit: "пак", bags: cb, type: "craft", counterKey: "крафт" });
        }
      }
      return packs;
    }

    function packCountsFromBasketLocal_(basket) {
      var packs = [];
      try { packs = buildAssemblyPacksLocal(basket || [], null) || []; } catch (e0) { packs = []; }
      var out = { small: 0, medium: 0, large: 0, legs: 0, u1: 0, u2: 0, u3: 0, up4: 0 };
      packs.forEach(function (p) {
        var bags = Number(p.bags) || 0;
        if (bags <= 0) return;
        var k = String(p.counterKey || "");
        if (k === "маленький") { out.small += bags; out.u1 += bags; }
        else if (k === "средний") { out.medium += bags; out.u2 += bags; }
        else if (k === "большой" || k === "целое") { out.large += bags; out.u3 += bags; }
        else if (k === "крафт" || p.type === "craft") { out.legs += bags; out.up4 += bags; }
      });
      return out;
    }

    function packCounterKey(p) {
      if (!p) return "";
      if (p.counterKey === "маленький" || p.counterKey === "средний" || p.counterKey === "большой" ||
          p.counterKey === "целое" || p.counterKey === "крафт") {
        return p.counterKey;
      }
      return "";
    }

    function togglePackType(key) {
      packTypesEnabled[key] = !packTypesEnabled[key];
      renderAssemblyView();
    }
    window.togglePackType = togglePackType;

    function assemblyItemNameIs(name, needle) {
      return String(name || "").toLowerCase().indexOf(String(needle || "").toLowerCase()) >= 0;
    }

    function sumAssemblyOrgansFromBasket(basket) {
      function emptyOrg() { return { total: 0, byFrac: {} }; }
      var out = { light: emptyOrg(), heart: emptyOrg(), kidney: emptyOrg(), rumen: emptyOrg() };
      (basket || []).forEach(function (g) {
        var n = String(g.name || g.main || "");
        var v = Number(g.val != null ? g.val : g.value) || 0;
        if (v <= 0) return;
        if (assemblyItemNameIs(n, "крошка") && (assemblyItemNameIs(n, "лёгк") || assemblyItemNameIs(n, "легк"))) return;
        var key = "";

        if (assemblyItemNameIs(n, "баран")) return;
        if (assemblyItemNameIs(n, "лёгк") || assemblyItemNameIs(n, "легк")) key = "light";
        else if (assemblyItemNameIs(n, "сердц")) key = "heart";
        else if (assemblyItemNameIs(n, "почк")) key = "kidney";
        else if (assemblyItemNameIs(n, "рубец")) key = "rumen";
        if (!key) return;
        var sub = String(g.sub || "").trim() || "—";
        out[key].total += v;
        out[key].byFrac[sub] = (out[key].byFrac[sub] || 0) + v;
      });
      return out;
    }

    function mergeAssemblyOrgan(dst, src) {
      dst.total += Number(src.total) || 0;
      Object.keys(src.byFrac || {}).forEach(function (sub) {
        dst.byFrac[sub] = (dst.byFrac[sub] || 0) + (Number(src.byFrac[sub]) || 0);
      });
    }

    function renderAssemblyOrganCell(org, label) {
      var fracOrder = ["Мелкое", "Среднее", "Крупное", "Большое", "Целое", "ОЧ МАЛ", "МАЛ", "СРЕД", "БОЛ", "ОГР"];
      var keys = Object.keys(org.byFrac || {}).sort(function (a, b) {
        var ia = fracOrder.indexOf(a); var ib = fracOrder.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "ru");
      });
      var fracs = keys.map(function (k) {
        return '<div>' + escapeHtml(k) + ': <b>' + org.byFrac[k] + '</b></div>';
      }).join("");
      return '<div class="pack-type-cell" style="cursor:default;flex:1 1 21%;min-width:72px">' +
        '<span class="n">' + (Number(org.total) || 0) + '</span>' +
        '<span class="l">' + escapeHtml(label) + '</span>' +
        (fracs ? '<div class="fracs">' + fracs + '</div>' : '<div class="fracs muted">—</div>') +
        "</div>";
    }

    function assemblyNoteMatchesLine_(itemKey, name, sub) {
      var key = String(itemKey || "").trim();
      if (!key) return false;
      var parts = key.split("/");
      var wantName = String(parts[0] || "").trim().toUpperCase().replace(/\s+/g, " ");
      var wantSub = String(parts[1] || "").trim().toUpperCase().replace(/\s+/g, " ");
      var n = String(name || "").trim().toUpperCase().replace(/\s+/g, " ");
      var s = String(sub || "").trim().toUpperCase().replace(/\s+/g, " ");
      if (!wantName || !n) return false;
      var nameOk = n === wantName || n.indexOf(wantName) >= 0 || wantName.indexOf(n) >= 0;
      if (!nameOk) return false;
      if (wantSub) {
        if (!s) return false;
        if (s !== wantSub && s.indexOf(wantSub) < 0 && wantSub.indexOf(s) < 0) return false;
      }
      return true;
    }

    function collectAssemblyNotesFromClients_(clients) {
      var out = [];
      (clients || []).forEach(function (c) {
        var raw = String(c.note || "");
        if (!raw) return;
        var re = /\[NOTE:([^\|\]]+)\|(perm|once)(?:\|ITEM:([^\]]+))?\]\s*([^]*?)(?=\s*\|\|\s*\[NOTE:|$)/gi;
        var m;
        var any = false;
        while ((m = re.exec(raw))) {
          any = true;
          var roles = String(m[1] || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
          if (roles.indexOf("cut") < 0 && roles.indexOf("cour") < 0) continue;
          var text = String(m[4] || "").replace(/\[TEL:[^\]]+\]/gi, "").trim();
          text = (typeof stripMetaFromNote === "function") ? stripMetaFromNote(text) : text;
          if (!text) continue;
          out.push({
            client: c.name || "",
            item: String(m[3] || "").trim(),
            text: text,
            roles: roles
          });
        }
        if (!any) {

          var cutTxt = noteTextForRole(raw, "cut");
          if (cutTxt) out.push({ client: c.name || "", item: "", text: cutTxt, roles: ["cut"] });
        }
      });
      return out;
    }

    function renderAssemblyNotesHtml_(notes) {
      if (!notes || !notes.length) return "";

      var sorted = notes.slice().sort(function (a, b) {
        var ai = a.item ? 0 : 1;
        var bi = b.item ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return String(a.client || "").localeCompare(String(b.client || ""), "ru");
      });
      return '<div class="cut-notes-box" style="margin-top:10px;">' +
        '<div class="cut-notes-title">Примечания по сырью / фракциям</div>' +
        sorted.map(function (n) {
          var item = n.item
            ? (' <span class="muted">[' + escapeHtml(String(n.item).replace(/\//g, " · ")) + "]</span>")
            : "";
          return '<div class="cut-note-line"><b>' + escapeHtml(n.client || "") + ":</b>" + item + " " +
            escapeHtml(n.text || "") + "</div>";
        }).join("") +
        "</div>";
    }

    function assemblyLineNotesHtml_(client, name, sub) {
      var notes = collectAssemblyNotesFromClients_([client]).filter(function (n) {
        if (!n.item) return false;
        return assemblyNoteMatchesLine_(n.item, name, sub);
      });
      if (!notes.length) return "";
      return notes.map(function (n) {
        return '<div class="cut-note-hint" style="margin:2px 0 6px 12px;">⚠ ' +
          escapeHtml(n.text || "") + "</div>";
      }).join("");
    }

    function renderAssemblyView() {
      var box = document.getElementById("assemblyContainer");
      var res = assemblyCache;
      if (!res) return;

      var COUNTER_ORDER = ["маленький", "средний", "большой", "целое", "крафт"];
      var COUNTER_LABEL = {
        "маленький": "маленький",
        "средний": "средний",
        "большой": "большой",
        "целое": "целое",
        "крафт": "крафт"
      };

      var clientsSorted = (res.clients || []).slice().sort(function (a, b) {
        var aa = a && a.assembled ? 1 : 0;
        var bb = b && b.assembled ? 1 : 0;
        if (aa !== bb) return aa - bb;
        return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "ru");
      });
      var pending = clientsSorted.filter(function (c) { return !(c && c.assembled); });

      var rawTotals = {};
      COUNTER_ORDER.forEach(function (k) { rawTotals[k] = 0; });
      var organs = {
        light: { total: 0, byFrac: {} },
        heart: { total: 0, byFrac: {} },
        kidney: { total: 0, byFrac: {} },
        rumen: { total: 0, byFrac: {} }
      };

      pending.forEach(function (c) {
        var packs = buildAssemblyPacksLocal(basketForAssemblyPacks_(c.basket || [], c.printed), packTypesEnabled);
        (packs || []).forEach(function (p) {
          var key = packCounterKey(p);
          if (!key) return;
          if (!packTypesEnabled.hasOwnProperty(key)) packTypesEnabled[key] = true;
          rawTotals[key] = (rawTotals[key] || 0) + (Number(p.bags) || 0);
        });
        var og = sumAssemblyOrgansFromBasket(c.basket);
        mergeAssemblyOrgan(organs.light, og.light);
        mergeAssemblyOrgan(organs.heart, og.heart);
        mergeAssemblyOrgan(organs.kidney, og.kidney);
        mergeAssemblyOrgan(organs.rumen, og.rumen);
      });

      var enabledTotal = 0;
      COUNTER_ORDER.forEach(function (k) {
        if (packTypesEnabled[k] !== false) enabledTotal += rawTotals[k] || 0;
      });

      var phraseParts = COUNTER_ORDER.filter(function (k) {
        return (rawTotals[k] || 0) > 0;
      }).map(function (k) {
        return (rawTotals[k] || 0) + " " + COUNTER_LABEL[k];
      });
      var phrase = phraseParts.length ? phraseParts.join(" · ") : "нет пакетов";

      var cells = COUNTER_ORDER.filter(function (k) {

        return (rawTotals[k] || 0) > 0 || packTypesEnabled[k] === false;
      }).map(function (k) {
        var on = packTypesEnabled[k] !== false;
        return '<div class="pack-type-cell' + (on ? "" : " off") + '" onclick="togglePackType(\'' + k + '\')">' +
          '<span class="n">' + (rawTotals[k] || 0) + '</span>' +
          '<span class="l">' + COUNTER_LABEL[k] + '</span></div>';
      }).join("");

      var organCells =
        '<div class="pack-type-row" style="margin-top:8px;align-items:stretch;">' +
        renderAssemblyOrganCell(organs.light, "лёгкое г") +
        renderAssemblyOrganCell(organs.heart, "сердце г") +
        renderAssemblyOrganCell(organs.kidney, "почки г") +
        renderAssemblyOrganCell(organs.rumen, "рубец г") +
        "</div>";

      var clientsHtml = clientsSorted.map(function (c, idx) {
        var bags = 0;
        var byCounter = {};
        var packsLocal = buildAssemblyPacksLocal(basketForAssemblyPacks_(c.basket || [], c.printed), packTypesEnabled);
        (packsLocal || []).forEach(function (p) {
          var key = packCounterKey(p);
          if (!key) return;
          if (packTypesEnabled[key] === false) return;
          var n = Number(p.bags) || 0;
          byCounter[key] = (byCounter[key] || 0) + n;
          bags += n;
        });
        var packSummary = COUNTER_ORDER.filter(function (k) { return byCounter[k] > 0; }).map(function (k) {
          return byCounter[k] + " " + COUNTER_LABEL[k];
        }).join(" · ") || "—";

        var basket = c.basket && c.basket.length ? c.basket : (c.packs || []).map(function (p) {
          return { name: p.name, sub: p.sub, val: p.val, unit: p.unit };
        }).filter(function (g) { return String(g.name || "").toUpperCase() !== "КРАФТ"; });
        var composition = (basket || []).map(function (g) {
          var unit = g.unit || unitForItem(g.cat, g.name || g.main);
          var frac = g.sub ? ' <span class="muted">(' + escapeHtml(g.sub) + ")</span>" : "";
          var lineName = g.name || g.main || "";
          return '<div class="order-detail-line"><span>• ' + escapeHtml(lineName) + frac +
            '</span><span class="order-detail-volume">' + (g.val != null ? g.val : g.value) + " " + unit + "</span></div>" +
            assemblyLineNotesHtml_(c, lineName, g.sub || "");
        }).join("") || '<div class="muted">Пустой состав</div>';

        var clientGeneralNotes = collectAssemblyNotesFromClients_([c]).filter(function (n) {
          return !n.item;
        });
        var clientNotesHtml = clientGeneralNotes.length
          ? ('<div class="cut-note-hint" style="margin-top:8px;">' +
            clientGeneralNotes.map(function (n) {
              return "⚠ " + escapeHtml(n.text || "");
            }).join("<br>") + "</div>")
          : "";

        var titleName = c.displayName || c.name || "";
        if (c.dogPart && c.dogName) {
          titleName = (c.ownerName || String(c.name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim()) +
            " · " + c.dogName;
        } else if (Number(c.dogPart) === 1) {
          titleName = (c.ownerName || c.name) + " · Собака 1";
        } else if (Number(c.dogPart) === 2) {
          titleName = (c.ownerName || String(c.name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim()) +
            " · Собака 2";
        }
        var safeName = String(c.name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return '<div class="card' + (c.assembled ? " is-delivered" : "") + '" style="margin-bottom:10px;' +
          (c.assembled ? "opacity:.72;" : "") + '" id="asmCard_' + idx + '">' +
          '<label class="check-line" style="margin-bottom:4px;">' +
          '<input type="checkbox" ' + (c.assembled ? "checked" : "") +
          ' onchange="toggleAssembledByName(\'' + safeName + '\', this.checked)">' +
          '<span class="cut-title">' + escapeHtml(titleName) + '</span>' +
          ' <span class="muted">· ' + bags + " пак.</span>" +
          (c.assembled ? ' <span class="client-badge" style="margin-left:6px;background:rgba(255,159,10,0.25);color:#ffd60a;">собран</span>' : "") +
          (c.printed ? ' <span class="client-badge" style="margin-left:6px;background:rgba(10,132,255,0.22);color:#64d2ff;">пропечатано</span>' : "") +
          "</label>" +
          '<label class="check-line" style="margin-bottom:6px;font-size:13px;">' +
          '<input type="checkbox" ' + (c.printed ? "checked" : "") +
          ' onchange="togglePrintedByName(\'' + safeName + '\', this.checked)">' +
          '<span>Пропечатано <span class="muted">(без лакомств)</span></span>' +
          "</label>" +
          (c.address ? '<div class="muted" style="font-size:12px;margin-top:4px;">' + escapeHtml(c.address) + "</div>" : "") +
          '<div style="margin-top:8px;"><b>Состав</b></div>' + composition +
          clientNotesHtml +
          '<div class="pack-line" style="margin-top:8px;"><b>Пакеты:</b> ' + escapeHtml(packSummary) +
          (c.printed ? ' <span class="muted">· без лакомств</span>' : "") + "</div>" +
          "</div>";
      }).join("") || '<p class="muted">Нет клиентов</p>';

      var doneAsm = (res.clients || []).filter(function (c) { return c.assembled; }).length;
      var totalAsm = (res.clients || []).length;
      var allAsmDone = totalAsm > 0 && doneAsm >= totalAsm;
      var asmNotes = collectAssemblyNotesFromClients_(pending);
      var asmNotesHtml = renderAssemblyNotesHtml_(asmNotes);

      if (allAsmDone && !assemblyDetailExpanded_) {
        box.innerHTML =
          '<div class="cut-done-summary">' +
            '<div class="cut-done-title">Сборка завершена</div>' +
            '<div class="cut-done-meta">Клиентов: <b>' + totalAsm + "</b> · пакетов: <b>" + enabledTotal + "</b></div>" +
          "</div>" +
          '<div class="card" style="text-align:center;margin-top:10px;">' +
            '<div class="muted" style="margin-bottom:10px;">Все собраны</div>' +
            '<button type="button" class="btn-action btn-blue" onclick="showAssemblyDoneDetails_()">Подробнее</button>' +
          "</div>";
        return;
      }

      box.innerHTML =
        '<div class="card"><b>Форматы пакетов (несобранные)</b>' +
        '<div class="pack-type-row">' + cells + "</div>" +
        '<div class="total-summary-badge">' + escapeHtml(phrase) + "</div>" +
        '<div class="total-summary-badge" style="margin-top:6px;">Итого пакетов: ' + enabledTotal + "</div>" +
        '<div class="total-summary-badge" style="margin-top:6px;">Собрано: <span style="color:var(--success-color)">' + doneAsm + "</span> / " + totalAsm + "</div>" +
        '<div style="margin-top:12px;"><b>Дрессура для нарезки (несобранные)</b></div>' +
        organCells +
        asmNotesHtml +
        "</div></div>" +
        '<div class="section-title">По клиентам · отметь кого собрали</div>' +
        clientsHtml;
    }
    function showAssemblyDoneDetails_() {
      assemblyDetailExpanded_ = true;
      renderAssemblyView();
    }
    window.showAssemblyDoneDetails_ = showAssemblyDoneDetails_;
    window.loadAssembly = loadAssembly;

    function asmFlagKey_(name) {
      return String(name || "").trim().toUpperCase();
    }
    function rememberAssemblyLocalFlag_(name, patch) {
      var k = asmFlagKey_(name);
      if (!k) return;
      var o = assemblyLocalFlags[k] || { ts: Date.now() };
      if (patch.assembled !== undefined) o.assembled = !!patch.assembled;
      if (patch.printed !== undefined) o.printed = !!patch.printed;
      o.ts = Date.now();
      assemblyLocalFlags[k] = o;
    }
    function applyAssemblyLocalFlags_(clients) {
      var now = Date.now();
      (clients || []).forEach(function (c) {
        var k = asmFlagKey_(c && c.name);
        var o = k && assemblyLocalFlags[k];
        if (!o) return;
        if ((now - (o.ts || 0)) > 1800000) {
          delete assemblyLocalFlags[k];
          return;
        }
        if (o.assembled !== undefined) c.assembled = !!o.assembled;
        if (o.printed !== undefined) c.printed = !!o.printed;
      });
    }

    async function toggleAssembledByName(clientName, assembled) {
      var res = assemblyCache;
      if (!res || !res.clients) return;
      var name = String(clientName || "");
      var client = null;
      for (var i = 0; i < res.clients.length; i++) {
        if (String(res.clients[i].name || "") === name) { client = res.clients[i]; break; }
      }
      if (!client) return;
      var day = document.getElementById("assemblyDaySelect").value || document.getElementById("courierDaySelect").value;
      var next = assembled === undefined ? !client.assembled : !!assembled;
      client.assembled = next;
      rememberAssemblyLocalFlag_(client.name, { assembled: next });
      if (!next) assemblyDetailExpanded_ = true;
      renderAssemblyView();
      try {
        var asmRes = await apiPost({
          action: "setAssembled",
          day: day,
          client: client.name,
          matchKey: client.matchKey || "",
          dogPart: client.dogPart || "",
          assembled: next
        });
        if (!asmRes || (asmRes.status !== "success" && asmRes.status !== "sent_opaque")) {
          throw new Error((asmRes && asmRes.message) || "save_failed");
        }
        try { apiCacheBustMem_("getAssembly"); } catch (eClr) {}
        showToast(next ? ("Собран: " + (client.dogName || client.name)) : ("Снято: " + (client.dogName || client.name)));
      } catch (e) {
        client.assembled = !next;
        rememberAssemblyLocalFlag_(client.name, { assembled: !next });
        showToast("Не удалось сохранить");
        renderAssemblyView();
      }
    }

    async function togglePrintedByName(clientName, printed) {
      var res = assemblyCache;
      if (!res || !res.clients) return;
      var name = String(clientName || "");
      var client = null;
      for (var i = 0; i < res.clients.length; i++) {
        if (String(res.clients[i].name || "") === name) { client = res.clients[i]; break; }
      }
      if (!client) return;
      var day = document.getElementById("assemblyDaySelect").value || document.getElementById("courierDaySelect").value;
      var next = printed === undefined ? !client.printed : !!printed;
      client.printed = next;
      rememberAssemblyLocalFlag_(client.name, { printed: next });
      renderAssemblyView();
      try {
        await apiPost({ action: "setPrinted", day: day, client: client.name, printed: next });
        try { apiCacheBustMem_("getAssembly"); } catch (eClr) {}
        showToast(next ? ("Пропечатано без лакомств: " + client.name) : ("Печать сброшена: " + client.name));
      } catch (e) {
        client.printed = !next;
        rememberAssemblyLocalFlag_(client.name, { printed: !next });
        showToast("Не удалось сохранить");
        renderAssemblyView();
      }
    }

    async function toggleAssembled(index, assembled) {
      var res = assemblyCache;
      if (!res || !res.clients) return;
      var clientsSorted = (res.clients || []).slice().sort(function (a, b) {
        var aa = a && a.assembled ? 1 : 0;
        var bb = b && b.assembled ? 1 : 0;
        if (aa !== bb) return aa - bb;
        return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "ru");
      });
      var client = clientsSorted[index];
      if (!client) return;
      await toggleAssembledByName(client.name, assembled);
    }
    window.toggleAssembled = toggleAssembled;
    window.toggleAssembledByName = toggleAssembledByName;
    window.togglePrintedByName = togglePrintedByName;

    function buildIgKnownMap() {
      if (window._igKnownMapCache) return window._igKnownMapCache;
      var known = {};
      Object.keys(catalog).forEach(function (k) {
        (catalog[k].items || []).forEach(function (n) {
          known[n.toUpperCase()] = { cat: k, name: n, fractions: (catalog[k].fractions || {})[n] || [] };
        });
      });
      window._igKnownMapCache = known;
      return known;
    }
    function igAliasResolve(up) {
      var key = String(up || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      var aliases = {
        "РУБЕЦ": "РУБЕЦ Т",
        "РУБЕЦ ТЁРПЫЙ": "РУБЕЦ Т",
        "РУБЕЦ ТЕРПЫЙ": "РУБЕЦ Т",
        "ТЁРПЫЙ РУБЕЦ": "РУБЕЦ Т",
        "СВЕТЛЫЙ РУБЕЦ": "СВЕТЛЫЙ РУБЕЦ",
        "РУБЕЦ С": "СВЕТЛЫЙ РУБЕЦ",
        "КРОШКА РУБЦА": "КРОШКА РУБЕЦ",
        "КОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "БЫЧИЙКОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "БЫЧИЙ КОРЕНЬ": "БЫЧИЙ КОРЕНЬ",
        "ЛЕГКОЕ": "ЛЁГКОЕ",
        "ЛЁГКОЕ": "ЛЁГКОЕ",
        "БАРАНЬЕ ЛЕГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "БАРАНЬЕ ЛЁГКОЕ": "БАРАНЬЕ ЛЁГКОЕ",
        "КРОШКА ЛЕГКОГО": "КРОШКА ЛЁГКОГО",
        "УШКО": "УХО Г",
        "УШКО Г": "УХО Г",
        "УШКО ГОВЯЖЬЕ": "УХО Г",
        "УХО": "УХО Г",
        "КАБАЧКИ": "КАБАЧОК",
        "ГРУШЫ": "ГРУШИ",
        "ГРУШИ": "ГРУШИ",
        "ГРУША": "ГРУШИ",
        "БАРАНЬЯ ПЕЧЕНЬ": "БАРАНЬЯ ПЕЧЕНЬ",
        "ЛОПАТЧНЫЙ ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОПАТОЧНЫЙ ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП. ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОП.ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЛОПАТ. ХРЯЩ": "ЛОП ХРЯЩ ШТ.",
        "ЯБЛОКО": "ЯБЛОКИ",
        "ЯБЛОКИ": "ЯБЛОКИ",
        "ПЕЧЕНЬ": "ПЕЧЕНЬ",
        "ПОЧКИ": "ПОЧКИ",
        "СЕРДЦЕ": "СЕРДЦЕ",
        "БАНАН": "БАНАНЫ",
        "БАНАНЫ": "БАНАНЫ",
        "ТЫКВА": "ТЫКВА",
        "УТИНАЯ ШЕЯ": "УТИНЫЕ ШЕИ ШТ.",
        "ТРАХЕЯ": "ТРАХЕЯ",
        "ТРАХЕИ": "ТРАХЕЯ",
        "ТРАХЕЮ": "ТРАХЕЯ",
        "СТАНОВАЯ ЖИЛА": "СТАНОВАЯ ЖИЛА",
        "ИНДЕЙКА": "ИНДЕЙКА",
        "ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "ЛОМТИК": "МЯСНЫЕ ЛОМТИКИ",
        "ЛОМТ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯС ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯС. ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСНЫЕ ЛОМТ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСН ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ",
        "МЯСНЫЕ ЛОМТИКИ": "МЯСНЫЕ ЛОМТИКИ"
      };
      if (aliases[key]) return aliases[key];
      if (/^ЛОМТИК/.test(key) || key === "ЛОМТ") return "МЯСНЫЕ ЛОМТИКИ";
      if (/^МЯСН?\s*ЛОМТ/.test(key)) return "МЯСНЫЕ ЛОМТИКИ";
      return key;
    }

    function canonicalProductMain_(raw) {
      var up = String(raw || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      if (!up) return "";
      return igAliasResolve(up);
    }

    function cleanChecklistLine_(line) {
      return String(line || "")
        .replace(/^[\s\uFEFF\u200B\u2060]+/, "")
        .replace(/^[\*•\-–—▪︎▸🔸✅✔️☑️👍🐾🦴🥩🍖🐶]+/u, "")
        .replace(/^\d+[\.\)\:]\s*/, "")
        .replace(/^[\s*•\-–—]+/, "")
        .trim();
    }

    function peelInlineChecklistFrac_(up) {
      var combo = up.match(/(?:(?:СРЕДН|СРЕДНЕВАТ|МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|КРУПН|БОЛЬШ|ОЧЕНЬ|СУПЕР|ОЧ)[\p{L}\p{N}_]*|(?:КУБИК|КУСОЧК)[\p{L}\p{N}_]*)\s+(?:(?:КУБИК|КУСОЧК)[\p{L}\p{N}_]*|(?:СРЕДН|МЕЛК|МАЛЕНЬК|КРУПН|БОЛЬШ|СРЕД)[\p{L}\p{N}_]*)/u);
      if (combo) {
        return {
          frac: combo[0],
          name: up.replace(combo[0], "").replace(/\s+/g, " ").trim()
        };
      }
      return { frac: "", name: up };
    }

    function parseIgLinesToItems(raw) {
      var IGNORE_LINE = /^(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s*$|^(?:вс[её]\s*подход|спасибо|заменил|второй\s*заказ|итоговая|цена\s|стоимость|будет\s*ли|вам\s*будет|давайте\s*под|удобно\s*получить|доставк)/i;
      var IGNORE_HAS = /(рубл|цена\s*за|стоимость\s*этого|итоговая\s*стоимость|с\s*учётом\s*доставк|вс[её]\s*подходит)/i;
      var lines = String(normalizeChecklistRaw_(raw) || "").split(/\r?\n/).map(cleanChecklistLine_).filter(Boolean);
      var added = [];
      var noteBits = [];
      var known = buildIgKnownMap();
      function mapChewFrac(token) {
        var t = String(token || "").toUpperCase().replace(/Ё/g, "Е");

        if (/(СРЕДН\w*|СРЕДНЕВАТ\w*|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ)/.test(t)) return "СРЕД";
        if (/(ОЧ\s*МАЛ|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)|СУПЕР\s*(?:МАЛ|МЕЛК)|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МИНИ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(ОЧ\s*МАЛ|ОЧЕНЬ|СУПЕР|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МИНИ)/.test(t)) return "МАЛ";
        if (/(БОЛЬШ|КРУПН|ЗДОРОВЕН|ОГРОМ|ГИГАНТ).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(БОЛЬШ|КРУПН|ЗДОРОВЕН|ОГРОМ|ГИГАНТ)/.test(t)) return "БОЛ";

        if (/ОЧ\s*МАЛ|ОЧЕНЬ\s*(МАЛ|МЕЛК)|СУПЕР\s*(МАЛ|МЕЛК)/.test(t)) return "ОЧ МАЛ";
        if (/ПОЛОВИН|ПОЛ\s*ШТ|1\/2/.test(t)) return "ПОЛОВИНКА";
        if (/ПАЛК|ПАЛОЧ/.test(t)) return "ПАЛК";
        if (/ПЛАСТ|ПЛАСТИН/.test(t)) return "ПЛАСТ";
        if (/ОГР|ОГРОМ|ГИГАНТ|РОГАЛИК/.test(t)) return "ОГР";
        if (/СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])/.test(t)) return "СРЕД";
        if (/БОЛЬШ|КРУПН|ЗДОРОВЕН|БОЛ([^А-ЯA-Z]|$)/.test(t)) return "БОЛ";

        if (/МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МЕЛКО|МИНИ(?![А-ЯA-Z])|КУБИК/.test(t)) return "МАЛ";
        if (/(^|[^А-ЯA-Z])МАЛ([^А-ЯA-Z]|$)/.test(t)) return "МАЛ";
        if (/ЦЕЛ|ЦЕЛИКОМ|ОБЫЧН/.test(t)) return "Обычная";
        return "";
      }
      function mapDressFrac(token) {
        var t = String(token || "").toUpperCase().replace(/Ё/g, "Е");

        if (/(СРЕДН\w*|СРЕДНЕВАТ\w*|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ)/.test(t)) return "Среднее";
        if (/(МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МИНИ(?![А-ЯA-Z])|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)|СУПЕР\s*(?:МАЛ|МЕЛК)).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИ|ОЧЕНЬ|СУПЕР)/.test(t)) return "Мелкое";
        if (/(КРУПН|БОЛЬШ|ЗДОРОВЕН|ОГРОМ|ГИГАНТ).{0,16}(КУБ|КУСОЧ)|(КУБ|КУСОЧ).{0,16}(КРУПН|БОЛЬШ|ЗДОРОВЕН|ОГРОМ|ГИГАНТ)/.test(t)) {
          return /КРУПН/.test(t) ? "Крупное" : "Большое";
        }
        if (/МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|МАЛЕНЬК|МЕЛК|МЕЛКО|МИНИ(?![А-ЯA-Z])/.test(t)) return "Мелкое";
        if (/СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|НОРМ(?![А-ЯA-Z])/.test(t)) return "Среднее";
        if (/КРУПН|ЗДОРОВЕНН|ОГРОМ|ГИГАНТ/.test(t)) return "Крупное";
        if (/БОЛЬШ|ЗДОРОВ(?![А-ЯA-Z])/.test(t)) return "Большое";
        if (/ЦЕЛ|ЦЕЛИКОМ/.test(t)) return "Целое";
        if (/ЛОМТ/.test(t)) return ""; // ломтики — не фракция каталога
        if (/ПОЛОСК|ПОЛОС(?![А-ЯA-Z])/.test(t)) return "Большое"; // полоски ≈ крупнее ломтика
        if (/КУСОЧК/.test(t)) return "Среднее";

        if (/КУБИК/.test(t)) return "Мелкое";
        return "";
      }
      function matchKnown(upRaw) {
        var up = igAliasResolve(upRaw);
        var keys = Object.keys(known).sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < keys.length; i++) {
          if (up === keys[i]) return known[keys[i]];
        }
        var best = null, bestLen = 0;
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j];
          if (up.indexOf(k) >= 0 && k.length > bestLen) { best = known[k]; bestLen = k.length; }
          else if (up.length >= 5 && k.indexOf(up) >= 0 && up.length > bestLen) { best = known[k]; bestLen = up.length; }
        }
        return best;
      }
      lines.forEach(function (line) {
        line = line.replace(/^(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s+/i, "");
        if (IGNORE_LINE.test(line) || IGNORE_HAS.test(line)) return;
        if (/^\d{1,2}([./-]\d{1,2})?\s*(июл|авг|сен|окт|ноя|дек|янв|фев|мар|апр|мая|июн)/i.test(line)) return;
        if (/доставк/i.test(line) && /(удобн|числ|вторник|понедельник|дата)/i.test(line)) return;

        var mult = 1;
        var multM = line.match(/\s*[x×х\*]\s*(\d+)\s*$/i);
        if (multM) {
          mult = Math.max(1, parseInt(multM[1], 10) || 1);
          line = line.slice(0, multM.index).trim();
        }
        line = line.replace(/(\d+(?:[.,]\d+)?)(г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$|[x×х\*])/gi, "$1 $2");

        var m = line.match(/^(.+?)\s*[—\-–:]\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|шт|кг)?(?:\s*[\(（]([^\)）]+)[\)）])?(?:\s+(.+))?$/i) ||
                line.match(/^(\d+(?:[.,]\d+)?)\s*(г|гр|шт|кг)?\s+(.+)$/i);
        var namePart = "", val = 0, unit = "", paren = "", trailing = "";
        if (m) {
          if (m[3] && /г|шт|кг/i.test(String(m[2] || ""))) {
            val = parseFloat(String(m[1]).replace(",", ".")); unit = m[2] || ""; namePart = m[3];
          } else {
            namePart = m[1]; val = parseFloat(String(m[2]).replace(",", ".")); unit = m[3] || "";
            paren = m[4] || ""; trailing = m[5] || "";
          }
        } else {
          var m2 = line.match(/(.+?)\s+(\d+(?:[.,]\d+)?)\s*(г|гр|шт|кг)?(?:\s*[\(（]([^\)）]+)[\)）])?$/i);
          if (m2) {
            namePart = m2[1]; val = parseFloat(String(m2[2]).replace(",", ".")); unit = m2[3] || ""; paren = m2[4] || "";
          } else {
            var m3 = line.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|шт|кг)\.?\s+(.+)$/i);
            if (!m3) return;
            namePart = m3[1]; val = parseFloat(String(m3[2]).replace(",", ".")); unit = m3[3] || ""; trailing = m3[4] || "";
          }
        }
        if (trailing && !paren) paren = trailing;
        namePart = String(namePart || "").replace(/[\(（][^\)）]+[\)）]/g, function (x) {
          if (!paren) paren = x.replace(/[\(\)（）]/g, "");
          return "";
        }).trim();
        if (!namePart || !(val > 0)) return;
        if (mult > 1) val = val * mult;

        if (/^(набор|состав|заказ|итого)/i.test(namePart)) return;
        namePart = String(namePart || "").replace(/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24}\s*:\s*/, "").trim();
        if (/кг/i.test(unit)) val = Math.round(val * 1000);

        var up = namePart.toUpperCase().replace(/\s+/g, " ").trim();
        var frac = "";
        var fracSrc = paren || "";
        var needFrac = false;
        var peeled = peelInlineChecklistFrac_(up);
        if (peeled.frac) {
          fracSrc = fracSrc || peeled.frac;
          up = peeled.name;
        }
        var fracHit = up.match(/((?:СРЕДН[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|МАЛЮСЕНЬК[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|СУПЕР\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*)\s+(?:КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*)|(?:КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*)\s+(?:СРЕДН[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*)|ОЧ\s*МАЛ|ОЧЕНЬ\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|СУПЕР\s*(?:МАЛ|МЕЛК)[\p{L}\p{N}_]*|МАЛЮСЕНЬК[\p{L}\p{N}_]*|МАХОНЬК[\p{L}\p{N}_]*|КРОШЕЧН[\p{L}\p{N}_]*|КРОХОТН[\p{L}\p{N}_]*|МИНИАТЮР[\p{L}\p{N}_]*|МАЛЕНЬК[\p{L}\p{N}_]*|МЕЛК[\p{L}\p{N}_]*|СРЕДНЕВАТ[\p{L}\p{N}_]*|СРЕДН[\p{L}\p{N}_]*|БОЛЬШ[\p{L}\p{N}_]*|КРУПН[\p{L}\p{N}_]*|ЗДОРОВЕНН[\p{L}\p{N}_]*|ОГРОМ[\p{L}\p{N}_]*|ГИГАНТ[\p{L}\p{N}_]*|ЦЕЛИКОМ|ЦЕЛ[\p{L}\p{N}_]*|ПОЛОВИН[\p{L}\p{N}_]*|ПАЛОЧ[\p{L}\p{N}_]*|ПАЛК|ПЛАСТИН[\p{L}\p{N}_]*|ПЛАСТ|КУБИК[\p{L}\p{N}_]*|КУСОЧК[\p{L}\p{N}_]*|ЛОМТ[\p{L}\p{N}_]*|ПОЛОСК[\p{L}\p{N}_]*|РОГАЛИК|СРЕД(?![\p{L}])|МАЛ(?![\p{L}])|БОЛ(?![\p{L}])|ОГР|МИНИ(?![\p{L}])|НОРМ(?![\p{L}]))/u);
        var protectMeatSlices = /МЯСН[\p{L}\p{N}_]*\s*ЛОМТ|^ЛОМТИК/u.test(up);
        if (fracHit && !protectMeatSlices) {
          fracSrc = fracSrc || fracHit[0];
          up = up.replace(fracHit[0], "").replace(/\s+/g, " ").trim();
        }
        up = igAliasResolve(up);
        var hit = matchKnown(up);
        if (!hit) {
          var canonTry = canonicalProductMain_(namePart.trim());
          if (canonTry && canonTry !== up) hit = matchKnown(canonTry);
        }
        if (!hit) {
          noteBits.push(namePart.trim() + " " + val + (unit || ""));
          var fallbackMain = canonicalProductMain_(namePart.trim()) || namePart.trim();
          added.push({ cat: "other", main: fallbackMain, name: fallbackMain, sub: "", value: val, val: val });
          return;
        }
        if (fracSrc) {
          frac = hit.cat === "chew" ? mapChewFrac(fracSrc) : mapDressFrac(fracSrc);
          if (hit.cat === "chew" && !frac) frac = mapDressFrac(fracSrc);
          if (hit.cat === "dressura" && frac === "Большое" && hit.fractions.indexOf("Большое") < 0 && hit.fractions.indexOf("Крупное") >= 0) frac = "Крупное";

          if (hit.cat === "chew" && !frac && /СРЕДН|СРЕД/.test(String(fracSrc).toUpperCase())) frac = "СРЕД";
          if (hit.name === "АОРТА" && /ЦЕЛ/.test(String(fracSrc).toUpperCase())) frac = "Обычная";
          if (hit.name === "УХО Г" && /ПОЛОВИН/.test(String(fracSrc).toUpperCase())) frac = "ПОЛОВИНКА";
          if (hit.name === "УХО Г" && /ЦЕЛ|ОБЫЧН/.test(String(fracSrc).toUpperCase())) frac = "Обычное";
        }
        if (hit.fractions && hit.fractions.length) {
          if (!frac) {

            needFrac = true;
            frac = "";
          } else if (hit.fractions.indexOf(frac) < 0) {

            var found = "";
            var wantF = String(frac).toUpperCase().replace(/\s+/g, " ").trim();
            for (var fi = 0; fi < hit.fractions.length; fi++) {
              var fu = String(hit.fractions[fi]).toUpperCase().replace(/\s+/g, " ").trim();
              if (fu === wantF) { found = hit.fractions[fi]; break; }
            }
            if (!found) {
              for (var fi2 = 0; fi2 < hit.fractions.length; fi2++) {
                var fu2 = String(hit.fractions[fi2]).toUpperCase().replace(/\s+/g, " ").trim();
                var fTokens = fu2.split(/\s+/);
                var wTokens = wantF.split(/\s+/);

                if (fTokens.length === wTokens.length && (fu2 === wantF ||
                    (wantF.length >= 3 && fu2.indexOf(wantF) === 0))) {
                  found = hit.fractions[fi2];
                  break;
                }
              }
            }
            if (found) frac = found;
            else {
              frac = "";
              needFrac = true;
            }
          }

          if (!needFrac && fracSrc) {
            var fsUp = String(fracSrc).toUpperCase().replace(/Ё/g, "Е");
            var hasSizeWord = /(СРЕДН|СРЕДНЕВАТ|СРЕД(?![А-ЯA-Z])|МЕЛК|МАЛЕНЬК|МАЛЮСЕНЬК|МАХОНЬК|КРОШЕЧН|КРОХОТН|МИНИАТЮР|КРУПН|БОЛЬШ|ЗДОРОВЕН|ОЧ\s*МАЛ|ОЧЕНЬ|СУПЕР|НОРМ(?![А-ЯA-Z])|ЦЕЛ|ПОЛОВИН|ПАЛК|ПАЛОЧ|ПЛАСТ|ОГР|ГИГАНТ|РОГАЛИК|(^|[^А-ЯA-Z])МАЛ([^А-ЯA-Z]|$)|БОЛ([^А-ЯA-Z]|$)|МИНИ(?![А-ЯA-Z]))/.test(fsUp);
            if (!hasSizeWord && /(КУБИК|КУСОЧК|ЛОМТ|ПОЛОСК)/.test(fsUp)) {
              needFrac = true;
            }
          }
        } else {
          frac = "";
        }
        var needPiece = false;
        var pieceHint = "";
        var pieceSku = hit.cat === "chew" || (typeof isPieceSkuName === "function" && isPieceSkuName(hit.name));
        if (pieceSku) {
          var unitLow = String(unit || "").toLowerCase().replace(/\./g, "");
          var gramUnit = /^(г|гр|грамм)$/i.test(unitLow);
          var pcsInLine = String(line || "").match(/(\d+)\s*шт/i);
          if (pcsInLine && gramUnit) {
            val = Math.max(1, parseInt(pcsInLine[1], 10) || 1);
          } else if ((gramUnit && val > 12) || (!unitLow && val > 20)) {
            needPiece = true;
            pieceHint = val + (gramUnit ? " г" : "");
            val = 0;
          }
        }
        added.push({
          cat: hit.cat,
          main: hit.name,
          name: hit.name,
          sub: frac,
          value: val,
          val: val,
          needFrac: !!needFrac,
          needPiece: !!needPiece,
          pieceHint: pieceHint,
          fractions: (hit.fractions || []).slice(),
          fracHint: fracSrc || ""
        });
      });
      return { items: added, noteBits: noteBits };
    }

    async function askChecklistFraction_(it, dogLabel) {
      var fracs = (it.fractions || []).slice();
      if (!fracs.length) return "";
      var choices = fracs.map(function (f) {
        var cls = (it.sub && f === it.sub) ? "btn-orange" : "btn-blue";
        return { label: f, value: f, cls: cls };
      });
      choices.push({ label: "Без фракции", value: "__none__", cls: "btn-orange" });
      var unitFn = (typeof priceUnitLabel === "function") ? priceUnitLabel : function () { return "г"; };
      var title = (dogLabel ? (dogLabel + " · ") : "") +
        prettyProductName(it.main || it.name) + " · " +
        (Number(it.val != null ? it.val : it.value) || 0) + " " +
        unitFn(it.cat, it.main || it.name);
      var msg = it.fracHint
        ? ("В чеклисте: «" + it.fracHint + "». Какая фракция?")
        : "Какая фракция / размер?";
      if (it.needFrac && it.sub) {
        msg += "\n(авто: «" + it.sub + "» — подтверди или выбери другую)";
      }
      var picked = await uiChoiceAsync(title, msg, choices);
      if (picked == null) return null;
      if (picked === "__none__") return "";
      return String(picked);
    }

    async function askChecklistPieceQty_(it, dogLabel) {
      var main = prettyProductName(it.main || it.name);
      var title = (dogLabel ? (dogLabel + " · ") : "") + main;
      var msg = it.pieceHint
        ? ("В чеклисте: «" + it.pieceHint + "». На лист жевалки пишем штуками. Сколько шт?")
        : "Сколько штук?";
      var choices = [1, 2, 3, 4, 5, 6, 8].map(function (n) {
        return { label: String(n) + " шт", value: String(n), cls: n === 2 ? "btn-orange" : "btn-blue" };
      });
      choices.push({ label: "Другое", value: "__other__", cls: "" });
      var picked = await uiChoiceAsync(title, msg, choices);
      if (picked == null) return null;
      if (picked === "__other__") {
        var custom = await uiPromptAsync("Количество (шт) · " + main, "2");
        if (custom == null) return null;
        var n = parseInt(String(custom).replace(",", "."), 10);
        return n > 0 ? n : null;
      }
      var n2 = parseInt(picked, 10);
      return n2 > 0 ? n2 : null;
    }

    async function resolveChecklistItemsFrac_(items, dogLabel) {
      var out = [];
      var asked = 0;
      for (var i = 0; i < (items || []).length; i++) {
        var it = items[i];
        var sub = it.sub || "";
        var val = Number(it.val != null ? it.val : it.value) || 0;
        if (it.needFrac && it.fractions && it.fractions.length) {
          asked++;
          var picked = await askChecklistFraction_(it, dogLabel || "");
          if (picked == null) return { cancelled: true, items: out, asked: asked };
          sub = picked;
        }
        if (it.needPiece) {
          asked++;
          var pcs = await askChecklistPieceQty_(it, dogLabel || "");
          if (pcs == null) return { cancelled: true, items: out, asked: asked };
          val = pcs;
        }
        if (!(val > 0)) continue;
        out.push({
          id: Date.now() + Math.random(),
          cat: it.cat,
          main: it.main,
          name: it.name,
          sub: sub,
          value: val,
          val: val
        });
      }
      return { cancelled: false, items: out, asked: asked };
    }

    async function parseIgChecklistIntoBasket() {
      var raw = (document.getElementById("igChecklistPaste").value || "").trim();
      if (!raw) { showToast("Вставь текст чеклиста"); return; }

      var sections = splitPriceChecklistByDogs_(raw, { forOrder: true });

      if (typeof orderDogCount !== "undefined" && orderDogCount >= 2) {
        sections = await ensureChecklistTwoDogSections_(raw, sections, { forOrder: true });
        if (!sections) { showToast("Отменено"); return; }
      } else {
        var dogsProbe = {};
        sections.forEach(function (sec) {
          dogsProbe[Number(sec.dog) === 2 ? 2 : 1] = true;
        });
        if (dogsProbe[1] && dogsProbe[2]) {
          sections = await ensureChecklistTwoDogSections_(raw, sections, { forOrder: true });
          if (!sections) { showToast("Отменено"); return; }
        }
      }

      var dogsUsed = {};
      sections.forEach(function (sec) {
        dogsUsed[Number(sec.dog) === 2 ? 2 : 1] = true;
      });
      var multi = !!dogsUsed[1] && !!dogsUsed[2];

      var built = { 1: [], 2: [] };
      var unknown = [];
      var totalAdded = 0;
      var asked = 0;
      var perDog = { 1: 0, 2: 0 };

      for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        var dogN = Number(sec.dog) === 2 ? 2 : 1;
        var parsed = parseIgLinesToItems(sec.text || "");
        if (parsed.noteBits && parsed.noteBits.length) {
          unknown = unknown.concat(parsed.noteBits);
        }
        if (!parsed.items.length) continue;
        var label = multi ? ("Собака " + dogN) : "";
        var resolved = await resolveChecklistItemsFrac_(parsed.items, label);
        if (resolved.cancelled) {
          showToast("Отменено");
          try { renderBasket(); } catch (eR) {}
          unlockPageScroll_();
          return;
        }
        asked += resolved.asked || 0;
        built[dogN] = built[dogN].concat(resolved.items);
        totalAdded += resolved.items.length;
        perDog[dogN] += resolved.items.length;
      }

      if (!totalAdded) {
        showToast("Не разобрал позиции — проверь формат чеклиста");
        return;
      }

      if (multi && (!built[1].length || !built[2].length)) {
        multi = false;
        var mergedItems = built[1].length ? built[1] : built[2];
        var mergedDog = built[1].length ? 1 : 2;
        built = { 1: mergedItems, 2: [] };
        dogsUsed = {};
        dogsUsed[mergedDog] = true;
      }

      if (multi) {
        try {
          if (typeof setOrderDogCount === "function") setOrderDogCount(2);
        } catch (eD) {}
        orderBaskets[1] = built[1];
        orderBaskets[2] = built[2];
        orderActiveDog = 1;
        basket = orderBaskets[1];
      } else {
        var onlyDog = dogsUsed[2] && !dogsUsed[1] ? 2 : (orderActiveDog || 1);
        if (onlyDog === 2 && orderDogCount < 2) {
          try { setOrderDogCount(2); } catch (eD2) {}
        }
        syncOrderBasketFromActive_();
        if (!orderBaskets[onlyDog]) orderBaskets[onlyDog] = [];
        var toAdd = built[onlyDog] || [];
        if (!toAdd.length && built[1] && built[1].length && onlyDog === 2) {
          toAdd = [];
        }
        orderBaskets[onlyDog] = orderBaskets[onlyDog].concat(toAdd);
        orderActiveDog = onlyDog;
        basket = orderBaskets[onlyDog];
      }

      if (unknown.length) {
        showToast("Не распознал: " + unknown.slice(0, 3).join("; ") + (unknown.length > 3 ? "…" : ""));
      }
      try { renderBasket(); } catch (eB) {}
      unlockPageScroll_();
      var dogsHint = multi
        ? (" · Собака 1: " + perDog[1] + " / Собака 2: " + perDog[2])
        : "";
      showToast("В корзину: " + totalAdded + dogsHint + (asked ? (" · фракций: " + asked) : ""));
    }
    window.parseIgChecklistIntoBasket = parseIgChecklistIntoBasket;
    function stashPriceActiveBasket() {
      priceBaskets[priceActiveDog] = priceBasket || [];
    }

    function loadPriceActiveBasket() {
      if (!priceBaskets[priceActiveDog]) priceBaskets[priceActiveDog] = [];
      priceBasket = priceBaskets[priceActiveDog];
    }

    function allPriceItems() {
      stashPriceActiveBasket();
      var list = (priceBaskets[1] || []).map(function (it) {
        return Object.assign({}, it, { dog: 1 });
      });
      if (priceDogCount >= 2) {
        list = list.concat((priceBaskets[2] || []).map(function (it) {
          return Object.assign({}, it, { dog: 2 });
        }));
      }
      return list;
    }

    function syncPriceDogNameInput_() {
      var inp = document.getElementById("priceDogNameInput");
      var lab = document.getElementById("priceDogNameLabel");
      if (lab) lab.textContent = "Кличка собаки " + priceActiveDog;
      if (inp) {
        inp.value = priceDogNames[priceActiveDog] || "";
        inp.placeholder = priceActiveDog === 2 ? "например Пэни" : "например Рекс";
      }
    }

    function onPriceDogNameInput_() {
      var inp = document.getElementById("priceDogNameInput");
      priceDogNames[priceActiveDog] = inp ? String(inp.value || "").trim() : "";
      updatePriceDogUi();
      schedulePriceLiveUpdate();
    }
    window.onPriceDogNameInput_ = onPriceDogNameInput_;

    function priceDogLabel_(n) {
      var name = String((priceDogNames && priceDogNames[n]) || "").trim();
      if (name) return name;
      return "Собака " + n;
    }

    function updatePriceDogUi() {
      var sw = document.getElementById("priceDogSwitch");
      var d1 = document.getElementById("priceDogs1");
      var d2 = document.getElementById("priceDogs2");
      var t1 = document.getElementById("priceDogTab1");
      var t2 = document.getElementById("priceDogTab2");
      var title = document.getElementById("priceBasketTitle");
      if (d1) d1.classList.toggle("active", priceDogCount === 1);
      if (d2) d2.classList.toggle("active", priceDogCount === 2);
      if (sw) sw.style.display = priceDogCount >= 2 ? "" : "none";
      if (t1) {
        t1.classList.toggle("active", priceActiveDog === 1);
        t1.textContent = priceDogNames[1] ? ("1 · " + priceDogNames[1]) : "Собака 1";
      }
      if (t2) {
        t2.classList.toggle("active", priceActiveDog === 2);
        t2.textContent = priceDogNames[2] ? ("2 · " + priceDogNames[2]) : "Собака 2";
      }
      if (title) {
        title.textContent = priceDogCount >= 2
          ? ("Состав · " + priceDogLabel_(priceActiveDog))
          : "Состав";
      }
      syncPriceDogNameInput_();
    }

    async function ensurePriceDogName_(n, opts) {
      opts = opts || {};
      n = Number(n) === 2 ? 2 : 1;
      var cur = String(priceDogNames[n] || "").trim();
      if (cur && !opts.force) return cur;
      if (!opts.prompt) return cur;
      var entered = await uiPromptAsync(
        "Кличка собаки " + n,
        cur || ""
      );
      if (entered == null) return cur;
      priceDogNames[n] = String(entered || "").trim();
      syncPriceDogNameInput_();
      updatePriceDogUi();
      return priceDogNames[n];
    }

    async function setPriceDogCount(n) {
      n = Number(n) === 2 ? 2 : 1;
      stashPriceActiveBasket();
      priceDogCount = n;
      if (n === 1) {
        priceActiveDog = 1;
        priceBaskets[2] = [];
        priceDogNames[2] = "";
      } else {
        if (!priceBaskets[2]) priceBaskets[2] = [];
        priceActiveDog = 1;
        await ensurePriceDogName_(1, { prompt: true });
      }
      loadPriceActiveBasket();
      updatePriceDogUi();
      renderPriceBasket();
      pricePpApiCache = null;
      if (priceMode === "pp") {
        pricePacksManual = false;
        syncPricePacksFromBasket_({ force: true });
      }
      schedulePriceLiveUpdate();
    }
    window.setPriceDogCount = setPriceDogCount;

    async function setPriceActiveDog(n) {
      n = Number(n) === 2 ? 2 : 1;
      if (priceDogCount < 2) n = 1;
      stashPriceActiveBasket();
      priceActiveDog = n;
      loadPriceActiveBasket();
      if (n === 2) {
        await ensurePriceDogName_(2, { prompt: !String(priceDogNames[2] || "").trim() });
      }
      updatePriceDogUi();
      renderPriceBasket();
      try {
        var inp = document.getElementById("priceDogNameInput");
        if (inp && priceDogCount >= 2) inp.focus();
      } catch (eF) {}
    }
    window.setPriceActiveDog = setPriceActiveDog;

    function clearPriceChecklist() {
      var el = document.getElementById("priceChecklistPaste");
      if (el) el.value = "";
    }
    window.clearPriceChecklist = clearPriceChecklist;

    function normalizePriceDogHeaderLine_(line) {
      return String(line || "")
        .replace(/^[^A-Za-zА-Яа-яЁё0-9]+/, "")
        .replace(/\*\*|__/g, "")
        .trim();
    }

    function isKnownChecklistProductName_(name) {
      var up = String(name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      if (!up) return false;
      try {
        var known = buildIgKnownMap();
        if (known[up]) return true;
        var aliased = typeof igAliasResolve === "function" ? igAliasResolve(up) : up;
        if (aliased && known[aliased]) return true;
      } catch (eK) {}
      return false;
    }

    function normalizeChecklistRaw_(raw) {
      var text = String(raw || "")
        .replace(/\u2028|\u2029/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\t+/g, " ")
        .replace(/\s+([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24}\s*:)/g, "\n$1");
      text = text.replace(/\s+(?=(?:дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)(?:\s|$))/gi, "\n");
      text = text.replace(/^(\s*)(дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?)\s+(?=[A-Za-zА-Яа-яЁё])/i, "$1$2\n");
      text = text.split("\n").map(function (line) {
        var qtyHits = line.match(/[—\-–]\s*\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$|[x×х\*])/gi);
        if (!qtyHits || qtyHits.length < 2) return line;
        return line.replace(/\s+(?=[A-ZА-ЯЁ][\p{L}\p{N}_\-']*\s*[—\-–]\s*\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|шт|кг)(?=\s|[\(,.;]|$))/gu, "\n");
      }).join("\n");
      return text;
    }

    function isBareCategoryHeader_(t) {
      var s = String(t || "").trim();
      if (/^(дрессур[аы]?|жевалк[аи]?|фрукт[ы]?|овощ[и]?|присыпк?[аи]?|заказ|итого|всего|состав|набор)\s*$/i.test(s)) return true;

      if (/^(овощ|фрукт)/i.test(s) && /(овощ|фрукт)/i.test(s)) return true;
      return false;
    }

    function splitChecklistByDogNameMarkers_(raw) {
      var text = normalizeChecklistRaw_(raw);
      var re = /([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24})\s*:/g;
      var marks = [];
      var m;
      while ((m = re.exec(text)) !== null) {
        var name = String(m[1] || "").trim();
        if (!name || isBareCategoryHeader_(name)) continue;
        if (/^собак/i.test(name) || /^dog\s*\d/i.test(name)) continue;
        if (isKnownChecklistProductName_(name)) continue;
        var prev = m.index > 0 ? text.charAt(m.index - 1) : "\n";
        if (/[A-Za-zА-Яа-яЁё0-9]/i.test(prev)) continue;
        marks.push({ index: m.index, end: m.index + m[0].length, name: name });
      }
      if (marks.length < 2) return null;

      var sections = [];
      for (var i = 0; i < 2; i++) {
        var start = marks[i].end;
        var stop = (i === 0) ? marks[1].index : text.length;
        sections.push({
          dog: i + 1,
          name: marks[i].name,
          text: text.slice(start, stop).trim()
        });
      }
      return sections;
    }

    function looksLikeOrderDogHeader_(line) {
      var raw = normalizePriceDogHeaderLine_(line);
      if (!raw) return false;
      if (/^[-–—=*_]{3,}$/.test(raw)) return true;
      var t = raw.replace(/[:：]\s*$/, "").replace(/[—\-–]\s*$/, "").trim();
      if (/^собак/i.test(t) || /^dog\s*\d/i.test(t)) return true;
      if (/^(для|состав|набор)\s+\S+/i.test(t)) return true;
      return false;
    }

    function looksLikePriceDogHeader_(line) {
      var raw = normalizePriceDogHeaderLine_(line);
      if (!raw) return false;
      if (/^[-–—=*_]{3,}$/.test(raw)) return true; // --- / === разделитель

      if (/\d/.test(raw) && /(г|гр|шт|кг)\b/i.test(raw)) return false;
      if (/[—\-–:].*\d|\d+\s*(г|гр|шт|кг)/i.test(raw)) return false;
      var hadColon = /[:：]\s*$/.test(raw);
      var t = raw.replace(/[:：]\s*$/, "").replace(/[—\-–]\s*$/, "").trim();
      if (!t || t.length > 48) return false;
      if (isBareCategoryHeader_(t)) return false;
      if (/^собак/i.test(t) || /^dog\s*\d/i.test(t)) return true;
      if (/^(для|состав|набор)\s+\S+/i.test(t)) return true;

      var n1 = String(priceDogNames[1] || "").trim().toLowerCase();
      var n2 = String(priceDogNames[2] || "").trim().toLowerCase();
      var low = t.toLowerCase();
      if ((n1 && low === n1) || (n2 && low === n2)) return true;

      var nickOk = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{0,24}(?:\s+[A-Za-zА-Яа-яЁё\-']{1,16})?$/.test(t);
      if (!nickOk) return false;
      if (isKnownChecklistProductName_(t)) return false;
      if (hadColon) return true;
      if (/^(кубик|ломтик|полоск|средн|мелк|больш|крупн|мал|норм)$/i.test(t)) return false;
      return true;
    }

    function resolvePriceDogHeader_(line) {
      var raw = normalizePriceDogHeaderLine_(line);
      if (/^[-–—=*_]{3,}$/.test(raw)) return { dog: 0, name: "", sep: true };
      var t = raw.replace(/[:：]\s*$/, "").replace(/[—\-–]\s*$/, "").trim();
      t = t.replace(/^(для|состав|набор)\s+/i, "").trim();
      var mNum = t.match(/^собак[аеи]?\s*([12])\b/i) || t.match(/^dog\s*([12])\b/i);
      if (mNum) {
        var n = Number(mNum[1]) === 2 ? 2 : 1;
        var rest = t.replace(/^собак[аеи]?\s*[12]\b\s*[·.\-–—:]?\s*/i, "")
          .replace(/^dog\s*[12]\b\s*[·.\-–—:]?\s*/i, "").trim();
        return { dog: n, name: rest };
      }
      var n1 = String(priceDogNames[1] || "").trim().toLowerCase();
      var n2 = String(priceDogNames[2] || "").trim().toLowerCase();
      var low = t.toLowerCase();
      if (n1 && low === n1) return { dog: 1, name: t };
      if (n2 && low === n2) return { dog: 2, name: t };
      return { dog: 0, name: t };
    }

    function enablePriceTwoDogsFromChecklist_(name1, name2) {
      stashPriceActiveBasket();
      priceDogCount = 2;
      if (!priceBaskets[1]) priceBaskets[1] = [];
      if (!priceBaskets[2]) priceBaskets[2] = [];
      if (name1) priceDogNames[1] = String(name1).trim();
      if (name2) priceDogNames[2] = String(name2).trim();
      priceActiveDog = 1;
      loadPriceActiveBasket();
      updatePriceDogUi();
    }

    function splitRawByBlankBlocks_(raw) {
      var parts = String(raw || "").split(/\n\s*\n+/).map(function (p) { return p.trim(); }).filter(Boolean);

      var withItems = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];

        var probe = p.replace(/^(дрессур|жевалк|фрукт|овощ|присып)[^\n]*\n?/igm, "").trim();
        var parsed = parseIgLinesToItems(probe || p);
        if (parsed.items && parsed.items.length) withItems.push(p);
      }
      if (withItems.length === 2) {
        return [
          { dog: 1, name: "", text: withItems[0] },
          { dog: 2, name: "", text: withItems[1] }
        ];
      }
      return null;
    }

    function splitRawBySepLine_(raw) {
      var lines = String(raw || "").split(/\r?\n/);
      var blocks = [];
      var cur = [];
      for (var i = 0; i < lines.length; i++) {
        if (/^\s*[-–—=*_]{3,}\s*$/.test(lines[i])) {
          var body = cur.join("\n").trim();
          if (body) blocks.push(body);
          cur = [];
          continue;
        }
        cur.push(lines[i]);
      }
      var last = cur.join("\n").trim();
      if (last) blocks.push(last);
      if (blocks.length === 2) {
        return [
          { dog: 1, name: "", text: blocks[0] },
          { dog: 2, name: "", text: blocks[1] }
        ];
      }
      return null;
    }

    function splitPriceChecklistByDogs_(raw, opts) {
      opts = opts || {};
      var forOrder = !!opts.forOrder;
      raw = normalizeChecklistRaw_(raw);

      var byMarks = splitChecklistByDogNameMarkers_(raw);
      if (byMarks && byMarks.length >= 2) return byMarks;

      var lines = String(raw || "").split(/\n/);
      var sections = [];
      var cur = { dog: 0, name: "", lines: [] };
      var autoDog = 1;
      var localNames = { 1: "", 2: "" };
      var headerHits = 0;
      function pushCur() {
        var body = cur.lines.join("\n").trim();
        if (!body && !cur.name) return;
        var dog = cur.dog;
        if (!dog) {
          dog = autoDog <= 2 ? autoDog : 1;
          if (autoDog < 2) autoDog += 1;
        }
        sections.push({ dog: dog, name: cur.name || "", text: body });
      }
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var isHdr = forOrder ? looksLikeOrderDogHeader_(line) : looksLikePriceDogHeader_(line);
        if (isHdr) {
          var hdr = resolvePriceDogHeader_(line);
          if (cur.lines.length || cur.name || cur.dog) pushCur();
          var dogN = hdr.dog;
          if (!dogN) {
            dogN = autoDog <= 2 ? autoDog : 1;
            if (autoDog < 2) autoDog += 1;
          }
          cur = { dog: dogN, name: hdr.sep ? "" : (hdr.name || ""), lines: [] };
          if (hdr.name) localNames[dogN] = hdr.name;
          headerHits++;
          continue;
        }
        cur.lines.push(line);
      }
      pushCur();

      if (sections.length <= 1 || headerHits === 0) {
        if (!forOrder) {
          var byBlank = splitRawByBlankBlocks_(raw);
          if (byBlank) return byBlank;
        }
        var bySep = splitRawBySepLine_(raw);
        if (bySep) return bySep;

        byMarks = splitChecklistByDogNameMarkers_(raw);
        if (byMarks && byMarks.length >= 2) return byMarks;
      }

      if (!sections.length) {
        var fallbackDog = forOrder ? 1 : (priceActiveDog || 1);
        return [{ dog: fallbackDog, name: "", text: String(raw || "").trim() }];
      }
      if (sections.length === 1 && !sections[0].name && !/собак|dog\s*[12]/i.test(String(raw || ""))) {
        if (forOrder) {
          sections[0].dog = (typeof orderActiveDog !== "undefined" && orderDogCount >= 2) ? (orderActiveDog || 1) : 1;
        } else {
          sections[0].dog = priceDogCount >= 2 ? (priceActiveDog || 1) : 1;
        }
      }
      sections.forEach(function (sec) {
        if (!sec.name && localNames[sec.dog]) sec.name = localNames[sec.dog];
      });
      return sections;
    }

    async function ensureChecklistTwoDogSections_(raw, sections, opts) {
      opts = opts || {};
      var forOrder = !!opts.forOrder;
      var dogsUsed = {};
      sections.forEach(function (sec) {
        dogsUsed[Number(sec.dog) === 2 ? 2 : 1] = true;
      });
      if (dogsUsed[1] && dogsUsed[2]) return sections;

      raw = normalizeChecklistRaw_(raw);
      var byMarks = splitChecklistByDogNameMarkers_(raw);
      if (byMarks && byMarks.length >= 2) return byMarks;

      if (!forOrder) {
        var byBlank = splitRawByBlankBlocks_(raw);
        if (byBlank) return byBlank;
      }
      var bySep = splitRawBySepLine_(raw);
      if (bySep) return bySep;

      var named = (String(raw).match(/([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-']{1,24})\s*:/g) || [])
        .map(function (x) { return x.replace(/\s*:$/, "").trim(); })
        .filter(function (n) { return n && !isBareCategoryHeader_(n) && !isKnownChecklistProductName_(n); });
      if (named.length >= 2) {
        byMarks = splitChecklistByDogNameMarkers_(raw);
        if (byMarks) return byMarks;
      }

      var hintTwo = forOrder
        ? ((typeof orderDogCount !== "undefined" && orderDogCount >= 2) ||
          /собак\s*2|dog\s*2|втор(ая|ой)\s*собак|двух\s*собак|2\s*собак/i.test(raw) ||
          named.length >= 2)
        : (priceDogCount >= 2 ||
          /собак\s*2|dog\s*2|втор(ая|ой)\s*собак|двух\s*собак|2\s*собак/i.test(raw) ||
          (!!String(priceDogNames[1] || "").trim() && !!String(priceDogNames[2] || "").trim()) ||
          named.length >= 2);
      if (!hintTwo) return sections;

      var how = await uiChoiceAsync(
        "2 собаки — как разделить чеклист?",
        "Не вижу границы. Нужны клички с двоеточием, напр. «Ария:» и «Киара:» (можно без пустых строк).",
        [
          { label: "Всё → собака 1", value: "1", cls: "btn-blue" },
          { label: "Всё → собака 2", value: "2", cls: "btn-blue" },
          { label: "Отмена — поправлю текст", value: "cancel", cls: "btn-orange" }
        ]
      );
      if (how == null || how === "cancel") return null;
      var dog = Number(how) === 2 ? 2 : 1;
      var dogName = forOrder ? "" : (priceDogNames[dog] || "");
      return [{ dog: dog, name: dogName, text: String(raw || "").trim() }];
    }

    async function parseIgChecklistIntoPrice() {
      var raw = (document.getElementById("priceChecklistPaste").value || "").trim();
      if (!raw) { showToast("Вставь текст чеклиста"); return; }

      var sections = splitPriceChecklistByDogs_(raw);
      sections = await ensureChecklistTwoDogSections_(raw, sections);
      if (!sections) { showToast("Отменено"); return; }

      var dogsUsed = {};
      sections.forEach(function (sec) {
        dogsUsed[Number(sec.dog) === 2 ? 2 : 1] = true;
      });
      var multi = !!dogsUsed[1] && !!dogsUsed[2];

      var built = { 1: [], 2: [] };
      var nameFromSec = { 1: "", 2: "" };
      var totalAdded = 0;
      var asked = 0;
      var unknown = [];
      var perDog = { 1: 0, 2: 0 };

      for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        var dogN = Number(sec.dog) === 2 ? 2 : 1;
        if (sec.name) nameFromSec[dogN] = String(sec.name).trim();
        var parsed = parseIgLinesToItems(sec.text || "");
        if (parsed.noteBits && parsed.noteBits.length) {
          unknown = unknown.concat(parsed.noteBits);
        }
        if (!parsed.items.length) continue;
        var label = nameFromSec[dogN] || (multi ? ("Собака " + dogN) : "");
        var resolved = await resolveChecklistItemsFrac_(parsed.items, multi ? label : "");
        if (resolved.cancelled) {
          showToast("Отменено");
          unlockPageScroll_();
          return;
        }
        asked += resolved.asked || 0;
        built[dogN] = built[dogN].concat(resolved.items);
        totalAdded += resolved.items.length;
        perDog[dogN] += resolved.items.length;
      }

      if (!totalAdded) {
        showToast("Не разобрал позиции — проверь формат чеклиста");
        return;
      }

      if (multi) {
        enablePriceTwoDogsFromChecklist_(
          nameFromSec[1] || priceDogNames[1],
          nameFromSec[2] || priceDogNames[2]
        );
        priceBaskets[1] = built[1];
        priceBaskets[2] = built[2];
        if (nameFromSec[1]) priceDogNames[1] = nameFromSec[1];
        if (nameFromSec[2]) priceDogNames[2] = nameFromSec[2];
        priceActiveDog = 1;
      } else {
        var onlyDog = dogsUsed[2] && !dogsUsed[1] ? 2 : (priceActiveDog || 1);
        if (onlyDog === 2 && priceDogCount < 2) {
          enablePriceTwoDogsFromChecklist_(priceDogNames[1], nameFromSec[2]);
        }
        if (!priceBaskets[onlyDog]) priceBaskets[onlyDog] = [];
        priceBaskets[onlyDog] = priceBaskets[onlyDog].concat(built[onlyDog] || built[1] || []);
        if (nameFromSec[onlyDog]) priceDogNames[onlyDog] = nameFromSec[onlyDog];
        priceActiveDog = onlyDog;
      }

      loadPriceActiveBasket();
      updatePriceDogUi();
      renderPriceBasket();
      pricePpApiCache = null;
      if (priceMode === "pp") {
        pricePacksManual = false;
        syncPricePacksFromBasket_({ force: true });
      }
      schedulePriceLiveUpdate();

      if (unknown.length) {
        showToast("Не распознал: " + unknown.slice(0, 3).join("; ") + (unknown.length > 3 ? "…" : ""));
      }
      var dogsHint = multi
        ? (" · " + (priceDogNames[1] || "Собака 1") + ": " + perDog[1] +
           " / " + (priceDogNames[2] || "Собака 2") + ": " + perDog[2])
        : (" · " + priceDogLabel_(priceActiveDog) + ": " + totalAdded);
      showToast("В состав: " + totalAdded + dogsHint + (asked ? (" · фракций: " + asked) : ""));
      unlockPageScroll_();
    }
    window.parseIgChecklistIntoPrice = parseIgChecklistIntoPrice;

    let priceManualCategory = "";
    function togglePriceManualEntry() {
      var panel = document.getElementById("priceManualEntryPanel");
      var btn = document.getElementById("btnPriceManualEntry");
      if (!panel) return;
      var open = panel.style.display === "block";
      panel.style.display = open ? "none" : "block";
      if (open) {
        var sel = document.getElementById("priceSelectorCard");
        if (sel) sel.style.display = "none";
      }
      if (btn) btn.textContent = open ? "Ручной ввод" : "Скрыть ручной ввод";
    }
    window.togglePriceManualEntry = togglePriceManualEntry;

    function openPriceProductSelector(catKey) {
      priceManualCategory = catKey;
      var cat = catalog[catKey];
      document.getElementById("priceSelectorTitle").innerText = cat.title;
      document.getElementById("priceSelectorCard").style.display = "block";
      var html = '<option value="">-- Выбрать --</option>';
      cat.items.forEach(function (n) { html += '<option value="' + n + '">' + n + "</option>"; });
      document.getElementById("priceMainSelect").innerHTML = html;
      document.getElementById("priceFractionGroup").style.display = "none";
      document.getElementById("priceVolumeInput").value = "";
      document.getElementById("priceValueLabel").innerText = catKey === "chew" ? "Количество (шт)" : "Вес (гр)";
    }
    window.openPriceProductSelector = openPriceProductSelector;

    function onPriceProductChange() {
      var mainVal = document.getElementById("priceMainSelect").value;
      var cat = catalog[priceManualCategory];
      document.getElementById("priceValueLabel").innerText =
        unitForItem(priceManualCategory, mainVal) === "шт" ? "Количество (шт)" : "Вес (гр)";
      if (cat.fractions && cat.fractions[mainVal]) {
        document.getElementById("priceFractionGroup").style.display = "block";
        document.getElementById("priceFractionSelect").innerHTML =
          cat.fractions[mainVal].map(function (f) { return '<option value="' + f + '">' + f + "</option>"; }).join("");
      } else {
        document.getElementById("priceFractionGroup").style.display = "none";
        document.getElementById("priceFractionSelect").innerHTML = "";
      }
    }
    window.onPriceProductChange = onPriceProductChange;

    async function addItemToPriceBasket() {
      var mainVal = document.getElementById("priceMainSelect").value;
      var fracVal = document.getElementById("priceFractionSelect").value || "";
      var inputVal = Number(document.getElementById("priceVolumeInput").value) || 0;
      if (!mainVal) { await uiAlertAsync("Выберите наименование"); return; }
      if (inputVal <= 0) { await uiAlertAsync("Укажите количество больше нуля"); return; }
      var cat = catalog[priceManualCategory];
      var needFrac = cat && cat.fractions && cat.fractions[mainVal] && cat.fractions[mainVal].length;
      if (needFrac && !fracVal) {
        await uiAlertAsync("Выберите фракцию / тип");
        return;
      }
      if (needFrac && cat.fractions[mainVal].indexOf(fracVal) < 0) {
        await uiAlertAsync("Такой фракции нет для «" + mainVal + "»");
        return;
      }
      priceBasket.push({
        id: Date.now() + Math.random(),
        cat: priceManualCategory,
        main: mainVal,
        name: mainVal,
        sub: fracVal,
        value: inputVal,
        val: inputVal
      });
      document.getElementById("priceSelectorCard").style.display = "none";
      document.getElementById("priceVolumeInput").value = "";
      renderPriceBasket();
      stashPriceActiveBasket();
      pricePpApiCache = null;
      if (priceMode === "pp") syncPricePacksFromBasket_();
      calcPriceFromBasket({ silent: true });
      showToast("Добавлено в состав");
    }
    window.addItemToPriceBasket = addItemToPriceBasket;

    function renderPriceBasket() {
      var box = document.getElementById("priceBasketContainer");
      if (!box) return;
      updatePriceDogUi();
      if (!priceBasket.length) {
        box.innerHTML = '<p class="muted">Пусто — добавь позиции вручную.</p>';
        return;
      }
      box.innerHTML = priceBasket.map(function (item) {
        var unit = unitForItem(item.cat, item.main);
        var sub = item.sub ? ("Фракция: " + item.sub) : ("Категория: " + item.cat);
        var priceHtml = "";
        if (priceMode === "retail") {
          var r = retailLineCost(item.main || item.name, item.sub || "", item.value != null ? item.value : item.val, item.cat);
          priceHtml = r.found
            ? ('<div class="basket-sub" style="color:#30d158;">' + r.cost + " BYN</div>")
            : '<div class="basket-sub" style="color:#ff9f0a;">нет в прайсе</div>';
        }
        return '<div class="basket-card ' + item.cat + '">' +
          '<button class="btn-inline-del" onclick="deletePriceBasketItem(' + item.id + ')">Удалить</button>' +
          '<div class="basket-info">' + escapeHtml(item.main) + " → " + item.value + " " + unit + "</div>" +
          '<div class="basket-sub">' + escapeHtml(sub) + "</div>" +
          priceHtml +
          "</div>";
      }).join("");
    }
    window.renderPriceBasket = renderPriceBasket;

    function deletePriceBasketItem(id) {
      priceBasket = priceBasket.filter(function (x) { return x.id !== id; });
      stashPriceActiveBasket();
      renderPriceBasket();
      pricePpApiCache = null;
      if (priceMode === "pp") syncPricePacksFromBasket_();
      if (allPriceItems().length) calcPriceFromBasket({ silent: true });
      else {
        var box = document.getElementById("priceResult");
        if (box) box.innerHTML = '<p class="muted">Набери состав и нажми «Собрать сообщение»</p>';
      }
    }
    window.deletePriceBasketItem = deletePriceBasketItem;

    async function clearPriceBasket() {
      var cur = priceBasket || [];
      if (!cur.length) { showToast("Состав уже пуст"); return; }
      var ok = await uiConfirmAsync(
        priceDogCount >= 2
          ? ("Очистить состав собаки " + priceActiveDog + " (" + cur.length + " поз.)?")
          : ("Очистить состав (" + cur.length + " поз.)?")
      );
      if (!ok) return;
      priceBasket = [];
      stashPriceActiveBasket();
      priceLastMessage = "";
      pricePpApiCache = null;
      renderPriceBasket();
      if (priceMode === "pp") syncPricePacksFromBasket_();
      if (allPriceItems().length) calcPriceFromBasket({ silent: true });
      else {
        var box = document.getElementById("priceResult");
        if (box) box.innerHTML = '<p class="muted">Набери состав и нажми «Собрать сообщение»</p>';
      }
      showToast("Состав очищен");
    }
    window.clearPriceBasket = clearPriceBasket;

    async function copyTextToClipboard_(text) {
      var t = String(text || "");
      if (!t) return false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(t);
          return true;
        }
      } catch (e1) {}
      try {
        var ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch (e2) {}
      return false;
    }

    async function showWarehouseDeficitModal_(whAlert, clientName) {
      if (!whAlert) return;
      var clientDefs = whAlert.clientDeficits || [];
      var totalDefs = whAlert.totalDeficits || [];
      if (!clientDefs.length && !totalDefs.length && !(whAlert.count > 0)) return;

      var name = clientName || whAlert.client || "клиент";
      var text = String(whAlert.messageText || "");

      function rowHtml_(d, accent) {
        return '<div style="padding:5px 0;line-height:1.35;' + (accent ? "color:#ff6961;" : "") + '">' +
          "<b>" + escapeHtml(d.name || "") + "</b>: −" + escapeHtml(formatWhNum(d.deficit)) +
          " " + escapeHtml(d.unit || "кг") +
          '<div class="muted" style="font-size:10px;margin-top:1px;">нужно ' +
          escapeHtml(formatWhNum(d.needRaw)) + " · есть " + escapeHtml(formatWhNum(d.available)) + "</div></div>";
      }

      var clientBlock = clientDefs.length
        ? ('<div><div style="font-weight:700;margin-bottom:6px;font-size:13px;">' +
          escapeHtml(name) + "</div>" + clientDefs.map(function (d) { return rowHtml_(d, true); }).join("") + "</div>")
        : ('<div class="muted" style="font-size:13px;">У ' + escapeHtml(name) +
          " по составу дефицита нет — см. общий.</div>");

      var totalBlock = totalDefs.length
        ? ('<div><div style="font-weight:700;margin-bottom:6px;font-size:13px;">Общий дефицит</div>' +
          totalDefs.map(function (d) { return rowHtml_(d, false); }).join("") + "</div>")
        : '<div class="muted" style="font-size:13px;">Общего дефицита нет.</div>';

      var html = '<div class="modal-title">Дефицит сырья</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;align-items:start;">' +
        clientBlock + totalBlock +
        "</div>" +
        '<div class="modal-actions row" style="margin-top:14px;flex-wrap:wrap;gap:8px;">' +
        '<button class="btn-action btn-orange" type="button" id="whAlertCopy">Скопировать</button>' +
        '<button class="btn-action btn-blue" type="button" id="whAlertShare">Отправить</button>' +
        '<button class="btn-action" type="button" id="whAlertOk" style="background:#3a3a3c;">OK</button>' +
        "</div>";

      var p = openModal(html);
      setTimeout(function () {
        var ok = document.getElementById("whAlertOk");
        var copyBtn = document.getElementById("whAlertCopy");
        var shareBtn = document.getElementById("whAlertShare");
        if (ok) ok.onclick = function () { closeModal(true); };
        if (copyBtn) copyBtn.onclick = async function () {
          if (await copyTextToClipboard_(text)) showToast("Скопировано");
          else showToast("Не скопировалось");
        };
        if (shareBtn) shareBtn.onclick = async function () {
          try {
            if (navigator.share) {
              await navigator.share({ text: text, title: "Дефицит сырья · " + name });
              return;
            }
          } catch (eSh) {}
          if (await copyTextToClipboard_(text)) showToast("Скопировано — вставь в чат");
          else await uiAlertAsync(text);
        };
      }, 0);
      await p;
      try { refreshDeferredBadge(true); } catch (eBadge) {}
    }
    window.showWarehouseDeficitModal_ = showWarehouseDeficitModal_;

    async function runWarehouseCheckAfterSave_(opts) {
      opts = opts || {};
      var client = String(opts.client || "").trim();
      var day = String(opts.day || "").trim();
      var date = String(opts.date || "").trim();
      if (!client || !day) return;
      try {
        showToast("Считаю сырьё…");
        var params = {
          action: "checkOrderWarehouse",
          client: client,
          day: day,
          date: date,
          force: "1",
          _: String(Date.now())
        };
        if (opts.basket && opts.basket.length) {
          try { params.basket = JSON.stringify(opts.basket); } catch (eB) {}
        }
        var res = await apiGet(params, { timeoutMs: 45000, cacheTtlMs: 0, retries: 0 });
        var whA = res && res.warehouseAlert;
        if (whA && (whA.count > 0 || whA.clientCount > 0 ||
            (whA.totalDeficits && whA.totalDeficits.length) ||
            (whA.clientDeficits && whA.clientDeficits.length))) {
          await showWarehouseDeficitModal_(whA, client);
        }
      } catch (eWh) {
        // сохранение уже ок — дефицит не блокируем
      }
    }
    window.runWarehouseCheckAfterSave_ = runWarehouseCheckAfterSave_;

    function warehouseTodayIso_() {
      var d = new Date();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
    }

    function formatWarehouseDayLabel_(iso) {
      if (!iso) iso = warehouseTodayIso_();
      try {
        var d = new Date(String(iso) + "T00:00:00");
        if (isNaN(d.getTime())) return iso;
        var days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        var dd = d.getDate();
        var mm = d.getMonth() + 1;
        return days[d.getDay()] + " " + (dd < 10 ? "0" : "") + dd + "." + (mm < 10 ? "0" : "") + mm;
      } catch (e) {
        return iso;
      }
    }

    function getWarehouseAsOfIso_() {
      return warehouseTodayIso_();
    }

    function mondayIsoFromIsoDate_(iso) {
      try {
        if (!iso) return "";
        var d = new Date(String(iso) + "T00:00:00");
        if (isNaN(d.getTime())) return "";
        var day = d.getDay();
        var diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        var y = d.getFullYear();
        var m = d.getMonth() + 1;
        var dd = d.getDate();
        return y + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
      } catch (e) {
        return "";
      }
    }

    function syncWarehouseViewButtons_() {
      var view = window._whView || "asOf";
      var wBtn = document.getElementById("whViewWeekBtn");
      if (wBtn) wBtn.classList.toggle("active", view === "weekStart");
      var lab = document.getElementById("whDayLabel");
      if (lab) {
        lab.textContent = view === "weekStart"
          ? "Неделя F+B"
          : formatWarehouseDayLabel_(warehouseTodayIso_());
      }
    }

    function toggleWarehouseWeekView_() {
      var next = (window._whView === "weekStart") ? "asOf" : "weekStart";
      window._whView = next;
      syncWarehouseViewButtons_();
      loadWarehouse({ force: 1, view: next });
      loadWarehousePreview({ force: 1 });
    }
    window.toggleWarehouseWeekView_ = toggleWarehouseWeekView_;

    async function loadWarehouse(opts) {
      opts = opts || {};
      var box = document.getElementById("warehouseContainer");
      var led = document.getElementById("warehouseLedger");
      if (opts.view) window._whView = opts.view === "weekStart" ? "weekStart" : "asOf";
      if (!window._whView) window._whView = "asOf";
      syncWarehouseViewButtons_();
      var view = window._whView;
      var asOf = getWarehouseAsOfIso_();
      if (opts.soft && window._whCacheHtml && window._whCacheView === view && window._whCacheAsOf === asOf) {
        box.innerHTML = window._whCacheHtml;
        if (led && window._whCacheLed) led.innerHTML = window._whCacheLed;
        return;
      }
      if (!opts.soft) box.innerHTML = '<p class="muted">Загрузка…</p>';
      else if (!window._whCacheHtml) box.innerHTML = '<p class="muted">Загрузка…</p>';

      async function fetchOnce_() {
        var q = { action: "getWarehouse", view: view };
        if (view === "asOf") q.asOf = asOf;
        if (opts.force) q._ = String(Date.now());
        return apiGet(q, { timeoutMs: 45000, cacheTtlMs: opts.force ? 0 : 15000 });
      }

      var res = null;
      var lastErr = null;
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetchOnce_();
          if (res && res.status === "success") break;
          lastErr = (res && (res.detail || res.message)) || "bad_status";
          res = null;
        } catch (e) {
          lastErr = e && e.message ? e.message : String(e);
          res = null;
        }
        if (attempt < 2) await new Promise(function (r) { setTimeout(r, 600 + attempt * 500); });
      }

      if (!res || res.status !== "success") {
        if (window._whCacheHtml) {
          box.innerHTML = window._whCacheHtml;
          if (led && window._whCacheLed) led.innerHTML = window._whCacheLed;
          try { showToast("Склад: показан кэш"); } catch (eT) {}
        } else {
          box.innerHTML = '<p class="muted">Ошибка загрузки склада' +
            (lastErr ? (": " + escapeHtml(String(lastErr).slice(0, 80))) : "") +
            '</p><button type="button" class="btn-action btn-blue" onclick="loadWarehouse({force:1})">Повторить</button>';
        }
        return;
      }

      try {
        var byRowAvail = {};
        var byRowStart = {};
        var byRowPrior = {};
        var gasAsOf = !!(res.view === "asOf" && res.items && res.items.some(function (it) {
          return it.asOfStock != null;
        }));
        var gasWeek = !!(res.view === "weekStart" && res.items && res.items.some(function (it) {
          return it.weekStart != null;
        }));
        if ((view === "asOf" && !gasAsOf) || (view === "weekStart" && !gasWeek)) {
          try {
            var prevQ = {
              action: "warehousePreview",
              force: "1",
              _: String(Date.now())
            };
            if (view === "asOf") {
              prevQ.dateFrom = asOf;
              prevQ.dateTo = asOf;
            }
            var prev = await apiGet(prevQ, { timeoutMs: 45000, cacheTtlMs: 0 });
            (prev && (prev.plan || [])).forEach(function (p) {
              byRowAvail[p.row] = p.available;
              byRowStart[p.row] = p.stockStart;
              byRowPrior[p.row] = p.priorRaw;
            });
          } catch (ePrev) {}
        }
        var caption = view === "weekStart"
          ? "F+B"
          : formatWarehouseDayLabel_(asOf);
        var html = '<div class="muted" style="font-size:12px;margin-bottom:8px;">' + escapeHtml(caption) + "</div>";
        html += (res.items || []).map(function (it) {
          var weekStart = it.weekStart != null ? Number(it.weekStart) : (Number(it.stock || 0) + Number(it.arrival || 0));
          if (byRowStart[it.row] != null) weekStart = Number(byRowStart[it.row]);
          var shown = weekStart;
          if (view === "asOf") {
            shown = (it.asOfStock != null && gasAsOf) ? Number(it.asOfStock)
              : (byRowAvail[it.row] != null ? Number(byRowAvail[it.row]) : weekStart);
          }
          return '<div class="card" style="margin-bottom:8px;">' +
            '<b>' + escapeHtml(it.name) + '</b> <span class="muted">' + escapeHtml(it.unit) + '</span>' +
            '<div style="margin-top:6px;font-size:13px;"><b>' + formatWhNum(shown) + '</b>' +
            (it.buy ? ' · <span style="color:var(--accent-color)">закупить</span>' : '') +
            '</div>' +
            '<div class="seg-row" style="margin-top:8px;">' +
            '<input type="number" id="arr_' + it.row + '" placeholder="дозакуп" inputmode="decimal" style="flex:1;height:40px;border-radius:8px;border:1px solid var(--border-color);background:#111;color:#fff;padding:0 10px;">' +
            '<button type="button" class="seg-btn" onclick="saveWarehouseArrival(' + it.row + ')">Сохранить</button>' +
            '</div></div>';
        }).join("") || '<p class="muted">Пусто</p>';
        var ledHtml = (res.ledger || []).slice(0, 15).map(function (x) {
          return '<div class="pack-line">' + escapeHtml(String(x.type || "")) + " · " + escapeHtml(String(x.qty)) + " " + escapeHtml(String(x.unit || "")) + "</div>";
        }).join("") || '<p class="muted">Лента пуста</p>';
        window._whCacheHtml = html;
        window._whCacheLed = ledHtml;
        window._whCacheAt = Date.now();
        window._whCacheView = view;
        window._whCacheAsOf = asOf;
        box.innerHTML = html;
        if (led) led.innerHTML = ledHtml;
      } catch (eRender) {
        box.innerHTML = '<p class="muted">Ошибка отрисовки склада</p>';
      }
    }
    window.loadWarehouse = loadWarehouse;

    async function saveWarehouseArrival(row) {
      var el = document.getElementById("arr_" + row);
      var qty = Number(el && el.value) || 0;
      await apiPost({ action: "setWarehouseArrival", row: row, qty: qty, telegramId: myTelegramId });
      showToast("Дозакуп сохранён");
      loadWarehouse({ force: 1 });
    }
    window.saveWarehouseArrival = saveWarehouseArrival;

    function getWarehouseDeficitDates_() {
      var today = warehouseTodayIso_();
      if (window._whView === "weekStart") {
        return { dateFrom: "", dateTo: "" };
      }
      return { dateFrom: today, dateTo: today };
    }

    async function loadWarehousePreview(opts) {
      opts = opts || {};
      var box = document.getElementById("warehousePreviewBox");
      if (box && !opts.soft) box.innerHTML = '<p class="muted">Считаю…</p>';
      try {
        var dates = getWarehouseDeficitDates_();
        var today = warehouseTodayIso_();
        var viewPrev = window._whView || "asOf";
        var params = {
          action: "warehousePreview",
          force: "1",
          asOf: viewPrev === "weekStart" ? mondayIsoFromIsoDate_(today) : today,
          _: String(Date.now())
        };
        if (dates.dateFrom) params.dateFrom = dates.dateFrom;
        if (dates.dateTo) params.dateTo = dates.dateTo;
        var res = await apiGet(params, { timeoutMs: 45000, cacheTtlMs: opts.force ? 0 : 15000 });
        if (!res || res.status !== "success") {
          if (box) box.innerHTML = '<p class="muted">' + escapeHtml((res && res.message) || "Ошибка") + "</p>";
          return;
        }
        var defs = res.deficits || [];
        var rows = (res.withPlan && res.withPlan.length) ? res.withPlan : defs;
        var rowsHtml = "";
        if (!rows.length) {
          rowsHtml = '<div style="padding:10px 0;" class="muted">Нет плана или хватает.</div>';
        } else {
          rowsHtml =
            '<div style="display:grid;grid-template-columns:1.3fr 0.7fr 0.7fr 0.7fr;gap:6px 8px;font-size:11px;color:#8e8e93;margin:8px 0 4px;">' +
            "<div>Позиция</div><div>План</div><div>Нужно</div><div>Есть</div></div>" +
            rows.map(function (d) {
              var unit = d.unit || "кг";
              var short = (Number(d.deficit) || 0) > 0;
              var planTxt = "";
              if (d.piece) {
                planTxt = formatWhNum(d.dryG || d.needRaw) + " шт";
              } else if (d.dryG != null) {
                planTxt = (Number(d.dryG) >= 1000)
                  ? (formatWhNum(Number(d.dryG) / 1000) + " кг")
                  : (formatWhNum(d.dryG) + " г");
              } else {
                planTxt = "—";
              }
              return '<div style="display:grid;grid-template-columns:1.3fr 0.7fr 0.7fr 0.7fr;gap:6px 8px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:13px;align-items:start;' +
                (short ? "background:rgba(255,69,58,0.08);" : "") + '">' +
                "<div><b" + (short ? ' style="color:#ff6961;"' : "") + ">" + escapeHtml(d.name || "") + "</b></div>" +
                "<div>" + escapeHtml(planTxt) + "</div>" +
                "<div><b>" + escapeHtml(formatWhNum(d.needRaw != null ? d.needRaw : d.need)) + "</b> " + escapeHtml(unit) + "</div>" +
                "<div>" + escapeHtml(formatWhNum(d.available)) + " " + escapeHtml(unit) + "</div>" +
                "</div>";
            }).join("");
        }
        var dayLab = viewPrev === "weekStart" ? "неделя" : formatWarehouseDayLabel_(today);
        if (box) {
          box.innerHTML = '<div class="card" style="margin-top:0;">' +
            "<b>" + escapeHtml(dayLab) + "</b>" +
            (defs.length ? (' · <span style="color:#ff6961;">−' + escapeHtml(String(defs.length)) + "</span>") : "") +
            rowsHtml +
            "</div>";
        }
      } catch (e) {
        if (box) box.innerHTML = '<p class="muted">Ошибка preview</p>';
      }
    }
    window.loadWarehousePreview = loadWarehousePreview;

    const SUBS_VIEW_PASSWORD = "708080";
    const SUBS_UNLOCK_SS = "superboyna_subs_unlocked_session";

    function isSubsUnlocked() {
      if (window._subsUnlocked) return true;
      try {
        if (sessionStorage.getItem(SUBS_UNLOCK_SS) === "1") {
          window._subsUnlocked = true;
          return true;
        }
      } catch (e) {}
      return false;
    }

    function setSubsUnlocked(ok) {
      window._subsUnlocked = !!ok;
      try {
        if (ok) sessionStorage.setItem(SUBS_UNLOCK_SS, "1");
        else sessionStorage.removeItem(SUBS_UNLOCK_SS);
      } catch (e) {}
    }

    function enterSubsScreen() {
      var gate = document.getElementById("subsGateCard");
      var main = document.getElementById("subsMainWrap");
      if (isSubsUnlocked()) {
        if (gate) gate.classList.remove("open");
        if (main) main.style.display = "";
        if (window._subsSkipNextEnterLoad) {
          window._subsSkipNextEnterLoad = false;
          return;
        }
        loadSubscriptions({ soft: true });
        return;
      }
      if (main) main.style.display = "none";
      if (gate) gate.classList.add("open");
      var inp = document.getElementById("subsPasswordInput");
      if (inp) {
        inp.value = "";
        setTimeout(function () { try { inp.focus(); } catch (eF) {} }, 80);
      }
    }
    window.enterSubsScreen = enterSubsScreen;

    function unlockSubsScreen() {
      var inp = document.getElementById("subsPasswordInput");
      var val = inp ? String(inp.value || "").trim() : "";
      if (val !== SUBS_VIEW_PASSWORD) {
        showToast("Неверный пароль");
        if (inp) { inp.value = ""; inp.focus(); }
        return;
      }
      setSubsUnlocked(true);
      enterSubsScreen();
      showToast("Ок");
    }
    window.unlockSubsScreen = unlockSubsScreen;

    function cancelSubsGate() {
      var inp = document.getElementById("subsPasswordInput");
      if (inp) inp.value = "";
      setSubsUnlocked(false);
      var gate = document.getElementById("subsGateCard");
      if (gate) gate.classList.remove("open");
      switchTab("orderScreen");
    }
    window.cancelSubsGate = cancelSubsGate;

    function lockSubsScreen() {
      setSubsUnlocked(false);
      var gate = document.getElementById("subsGateCard");
      var main = document.getElementById("subsMainWrap");
      if (main) main.style.display = "none";
      if (gate) gate.classList.remove("open");
      var inp = document.getElementById("subsPasswordInput");
      if (inp) inp.value = "";
    }
    window.lockSubsScreen = lockSubsScreen;

    var _subsLoadSeq = 0;
    var _surveyKindFilter = "bp2"; // bp2 | final | all

    function setSurveyKindFilter(kind) {
      _surveyKindFilter = kind === "final" ? "final" : (kind === "all" ? "all" : "bp2");
      try { renderSurveyList_(); } catch (eR) {}
    }
    window.setSurveyKindFilter = setSurveyKindFilter;

    function surveyNickOneLine_(raw) {
      var s = String(raw || "").replace(/\r/g, "\n").split("\n")[0] || "";
      s = s.replace(/^\s*@/, "").trim();
      if (/^(БП1|БП2|БП|ПП|АФК|ФИНАЛ)$/i.test(s)) return "";
      if (/станет|финальн|^\d{1,2}\s*[-–]?\s*[еeо]\b/i.test(s)) return "";
      return s;
    }

    function renderSurveyList_() {
      var box = document.getElementById("subsContainer");
      if (!box) return;
      var items = window._surveyList || [];
      var html = '<div class="seg-row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px;">' +
        '<button type="button" class="bp-chip' + (_surveyKindFilter === "bp2" ? " active" : "") + '" onclick="setSurveyKindFilter(\'bp2\')">БП2</button>' +
        '<button type="button" class="bp-chip' + (_surveyKindFilter === "final" ? " active" : "") + '" onclick="setSurveyKindFilter(\'final\')">ПП · финал</button>' +
        '<button type="button" class="bp-chip' + (_surveyKindFilter === "all" ? " active" : "") + '" onclick="setSurveyKindFilter(\'all\')">Все типы</button>' +
        '<button type="button" class="btn-action btn-green" style="padding:6px 10px;margin:0;" onclick="openAddSurveyForm()">+ Опросник</button>' +
        '<button type="button" class="btn-action" style="padding:6px 10px;margin:0;background:#5a1a1a;color:#ff8a80;" onclick="surveyBatchDelete()">Удалить выбранных</button>' +
        "</div>";
      html += '<div class="muted" style="font-size:12px;margin-bottom:6px;">Только с датой отправки сегодня или позже. Без даты и прошлое — удаляются с листа.</div>';
      html += '<div id="surveyAddCard" style="display:none;" class="card"></div>';
      var filtered = [];
      var seen = Object.create(null);
      var today = todayYmdLocal_();
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var st = String(it.status || "").toLowerCase();
        if (st !== "planned" && st !== "due") continue;
        if (String(it.sentAt || "").trim()) continue;
        var nick = surveyNickOneLine_(it.nick);
        if (!nick) continue;
        if (/станет|финальн|^\d{1,2}\s*[-–]?\s*[еeо]\b/i.test(nick)) continue;
        var due = String(it.dueDate || "").slice(0, 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < today) continue;
        var k = String(it.kind || "").toLowerCase();
        var isFinal = k === "final" || /финал|пп|final/.test(k);
        if (_surveyKindFilter === "bp2" && isFinal) continue;
        if (_surveyKindFilter === "final" && !isFinal) continue;
        var key = nick.toUpperCase() + "|" + (isFinal ? "final" : "bp2") + "|" + due;
        if (seen[key]) continue;
        seen[key] = true;
        filtered.push({
          index: i,
          nick: nick,
          kind: isFinal ? "final" : "bp2",
          dueDate: due,
          status: it.status || "planned",
          ownerName: it.ownerName || "",
          ownerTelegramId: it.ownerTelegramId || "",
          linkedSheet: it.linkedSheet || "",
          id: it.id || "",
          stage: it.stage || "",
          templateId: it.templateId || "",
          note: it.note || ""
        });
      }
      if (!filtered.length) {
        html += '<p class="muted">Нет опросников с датой отправки ≥ сегодня</p>';
        box.innerHTML = html;
        return;
      }
      html += '<div class="survey-grid">' + filtered.map(function (g) {
        var kindLabel = g.kind === "final" ? "ПП · финал" : "БП2";
        var meta = [
          kindLabel,
          g.dueDate ? ("до " + g.dueDate) : "",
          g.status || ""
        ].filter(Boolean).join(" · ");
        var ownerSelId = "surveyOwner_" + g.index;
        return '<div class="sub-row" style="display:flex;gap:8px;align-items:flex-start;">' +
          '<input type="checkbox" class="survey-sel" data-id="' + escapeHtml(g.id) + '" data-nick="' + escapeHtml(g.nick) + '" onclick="event.stopPropagation()">' +
          '<div style="flex:1;min-width:0;">' +
          '<div class="sub-row-nick">' + escapeHtml(g.nick) + "</div>" +
          '<div class="sub-row-meta">' + escapeHtml(meta) + "</div>" +
          '<div class="form-group" style="margin:8px 0 0;">' +
          '<label style="font-size:12px;">Ответственный</label>' +
          '<select id="' + ownerSelId + '" data-survey-idx="' + g.index + '"><option value="">—</option></select>' +
          "</div>" +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
          '<button type="button" class="seg-btn" onclick="saveSurveyOwner(' + g.index + ')">Сохранить отв.</button>' +
          '<button type="button" class="seg-btn" onclick="markSurveyStatus(' + g.index + ',\'sent\')" style="background:#1a3d2a;color:#30d158;">Отправлено</button>' +
          '<button type="button" class="seg-btn" onclick="markSurveyStatus(' + g.index + ',\'done\')">Готово</button>' +
          '<button type="button" class="seg-btn" onclick="markSurveyStatus(' + g.index + ',\'cancelled\')">Отмена</button>' +
          "</div></div></div>";
      }).join("") + "</div>";
      box.innerHTML = html;

      (async function () {
        var people = [];
        try { people = await loadReminderPeople_(); } catch (eP) { people = []; }
        for (var fi = 0; fi < filtered.length; fi++) {
          var g2 = filtered[fi];
          var sel = document.getElementById("surveyOwner_" + g2.index);
          if (!sel) continue;
          var cur = String(g2.ownerTelegramId || "").trim();
          var opts = '<option value="">— выберите —</option>';
          for (var pi = 0; pi < people.length; pi++) {
            var p = people[pi] || {};
            var pid = String(p.telegramId || "").trim();
            if (!pid) continue;
            var label = (p.name || p.username || pid);
            if (p.role) label += " · " + p.role;
            opts += '<option value="' + escapeHtml(pid) + '"' + (pid === cur ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
          }
          sel.innerHTML = opts;
          if (cur) sel.value = cur;
        }
      })();
    }

    async function surveyBatchDelete() {
      var boxes = document.querySelectorAll("#subsContainer input.survey-sel:checked");
      if (!boxes.length) { showToast("Никого не выбрано"); return; }
      var ids = [];
      var nicks = [];
      boxes.forEach(function (cb) {
        var id = cb.getAttribute("data-id") || "";
        var nick = cb.getAttribute("data-nick") || "";
        if (id) ids.push(id);
        if (nick) nicks.push(nick);
      });
      var ok = await uiConfirmAsync("Удалить (отменить) опросников: " + boxes.length + "?");
      if (!ok) return;
      try {
        showToast("Удаляю…");
        var res = null;
        try {
          res = await apiPost({ action: "deleteSurveyBatch", ids: ids, nicks: nicks });
        } catch (ePost) {}
        if (!res || res.status !== "success") {
          res = await apiGet({
            action: "deleteSurveyBatch",
            ids: JSON.stringify(ids),
            nicks: JSON.stringify(nicks),
            _: String(Date.now())
          }, { timeoutMs: 45000, cacheTtlMs: 0 });
        }
        if (!res || res.status !== "success") {

          var n = 0;
          for (var i = 0; i < ids.length; i++) {
            try {
              var one = await apiGet({ action: "deleteSurvey", id: ids[i], _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
              if (one && one.status === "success") n++;
            } catch (e1) {}
          }
          showToast("Удалено: " + n);
        } else {
          showToast("Удалено: " + (res.cancelled != null ? res.cancelled : ids.length));
        }
        await loadSurveyTab_();
      } catch (e) {
        showToast("Нужен Deploy Code.gs v7.11.09");
      }
    }
    window.surveyBatchDelete = surveyBatchDelete;

    async function repairSurveysUi() {
      try {
        showToast("Чиню лист «Опросник»…");
        var res = await apiGet({ action: "repairSurveys", _: String(Date.now()) }, { timeoutMs: 60000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          await uiAlertAsync("Не вышло: " + ((res && res.message) || "нужен Deploy Code.gs v7.11.09"));
          return;
        }
        showToast("Готово: " + (res.count || 0) + " чел.");
        await loadSurveyTab_();
      } catch (e) {
        showToast("Deploy Code.gs v7.11.09");
      }
    }
    window.repairSurveysUi = repairSurveysUi;

    async function loadSurveyTab_(opts) {
      opts = opts || {};
      var box = document.getElementById("subsContainer");
      if (!opts.force && opts.soft && window._surveyList && window._surveyListLoaded) {
        renderSurveyList_();
        return;
      }
      box.innerHTML = '<p class="muted">Загрузка опросников…</p>';
      try {
        var res = await apiGet({ action: "listSurvey", activeOnly: "1" }, { timeoutMs: 45000 });
        var items = (res && res.items) || [];
        window._surveyList = items;
        window._surveyListLoaded = true;
        if (res && res.purged > 0) showToast("С листа убрано: " + res.purged);
        var tpl = window._surveyTemplates;
        if (!tpl || !tpl.length) {
          try {
            var tr = await apiGet({ action: "listTemplates", kind: "survey" }, { timeoutMs: 10000, cacheTtlMs: 60000 });
            tpl = (tr && tr.templates) || (tr && tr.items) || [];
            window._surveyTemplates = tpl;
          } catch (eT) { tpl = []; }
        }
        renderSurveyList_();
      } catch (e) {
        box.innerHTML = '<p class="muted">Ошибка listSurvey — нужен Deploy Code.gs v7.11.12</p>';
      }
    }

    async function openAddSurveyForm() {
      var card = document.getElementById("surveyAddCard");
      if (!card) return;
      card.innerHTML =
        '<div class="section-title" style="margin-top:0;">Новый опросник</div>' +
        '<div class="form-group"><label>Ник</label><input type="text" id="surveyAddNick"></div>' +
        '<div class="form-group"><label>Тип</label><select id="surveyAddKind">' +
        '<option value="bp2">После БП1 — опросник на БП2</option>' +
        '<option value="final">После БП2 — финальный (→ ПП)</option>' +
        "</select></div>" +
        '<div class="form-group"><label>Дата отправки</label><input type="date" id="surveyAddDue" value="' + ymdPlusDaysLocal_("", 4) + '"></div>' +
        '<div class="form-group"><label>Ответственный</label><select id="surveyAddOwner"><option value="">—</option></select></div>' +
        '<button type="button" class="btn-action btn-blue" onclick="submitAddSurvey()">Сохранить</button>' +
        '<button type="button" class="btn-action" style="margin-top:8px;background:#3a3a3c;" onclick="closeAddSurveyForm()">Отмена</button>';
      card.style.display = "block";
      try { await fillOwnerSelect_("surveyAddOwner", myTelegramId || ""); } catch (eO) {}
    }

    function closeAddSurveyForm() {
      var card = document.getElementById("surveyAddCard");
      if (card) { card.style.display = "none"; card.innerHTML = ""; }
    }

    async function submitAddSurvey() {
      var nick = (document.getElementById("surveyAddNick") && document.getElementById("surveyAddNick").value || "").trim();
      if (!nick) { showToast("Укажи ник"); return; }
      var kind = (document.getElementById("surveyAddKind") && document.getElementById("surveyAddKind").value) || "bp2";
      var due = (document.getElementById("surveyAddDue") && document.getElementById("surveyAddDue").value) || ymdPlusDaysLocal_("", 4);
      due = String(due).slice(0, 10);
      var stage = kind === "final" ? "ФИНАЛ" : "БП2";
      var templateId = kind === "final" ? "survey_final" : "survey_bp2";
      var owner = ownerFromSelect_("surveyAddOwner");
      try {
        var res = await apiGet({
          action: "saveSurvey",
          nick: nick,
          kind: kind,
          dueDate: due,
          stage: stage,
          status: "planned",
          templateId: templateId,
          ownerTelegramId: owner.telegramId || "",
          ownerName: owner.name || "",
          _: String(Date.now())
        }, { timeoutMs: 45000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast("Не сохранилось: " + ((res && res.message) || "Deploy v7.11.14"));
          return;
        }
        var savedDue = (res.item && res.item.dueDate) ? String(res.item.dueDate).slice(0, 10) : due;
        showToast("Опросник на " + savedDue);
        closeAddSurveyForm();
        await loadSurveyTab_();
      } catch (e) {
        showToast("Ошибка saveSurvey — Deploy Code.gs v7.11.14");
      }
    }

    async function markSurveyStatus(index, status) {
      var items = window._surveyList || [];
      var it = items[index];
      if (!it) { showToast("Строка не найдена"); return; }
      var owner = ownerFromSelect_("surveyOwner_" + index);
      var payload = {
        action: "saveSurvey",
        id: it.id || "",
        nick: it.nick || "",
        kind: it.kind || "bp2",
        dueDate: String(it.dueDate || "").slice(0, 10),
        stage: it.stage || "",
        status: status,
        templateId: it.templateId || (String(it.kind || "").indexOf("final") >= 0 ? "survey_final" : "survey_bp2"),
        ownerTelegramId: owner.telegramId || it.ownerTelegramId || "",
        ownerName: owner.name || it.ownerName || "",
        _: String(Date.now())
      };
      try {
        showToast(status === "sent" ? "Отмечаю отправлено…" : (status === "done" ? "Сохраняю…" : "Отменяю…"));
        var res = await apiGet(payload, { timeoutMs: 45000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {

          if (status === "cancelled" && it.id) {
            res = await apiGet({ action: "deleteSurvey", id: it.id, _: String(Date.now()) }, { timeoutMs: 30000, cacheTtlMs: 0 });
          }
        }
        if (!res || res.status !== "success") {
          showToast("Не вышло: " + ((res && res.message) || "Deploy Code.gs"));
          return;
        }
        showToast(status === "sent" ? "Отправлено — напоминания выкл." : (status === "done" ? "Готово" : "Отменено"));
        await loadSurveyTab_();
      } catch (e) {
        showToast("Ошибка saveSurvey — Deploy Code.gs");
      }
    }

    async function saveSurveyOwner(index) {
      var items = window._surveyList || [];
      var it = items[index];
      if (!it) return;
      var owner = ownerFromSelect_("surveyOwner_" + index);
      if (!owner.telegramId) { showToast("Выбери ответственного"); return; }
      try {
        var res = await apiGet({
          action: "saveSurvey",
          id: it.id || "",
          nick: it.nick || "",
          kind: it.kind || "bp2",
          dueDate: String(it.dueDate || "").slice(0, 10),
          stage: it.stage || "",
          status: it.status || "planned",
          templateId: it.templateId || "",
          ownerTelegramId: owner.telegramId,
          ownerName: owner.name,
          _: String(Date.now())
        }, { timeoutMs: 45000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast("Не сохранилось — Deploy v7.11.10");
          return;
        }
        if (res.item) items[index] = res.item;
        showToast("Ответственный: " + (owner.name || owner.telegramId));
      } catch (e) {
        showToast("Ошибка saveSurvey");
      }
    }
    window.saveSurveyOwner = saveSurveyOwner;
    window.loadSurveyTab_ = loadSurveyTab_;
    window.openAddSurveyForm = openAddSurveyForm;
    window.closeAddSurveyForm = closeAddSurveyForm;
    window.submitAddSurvey = submitAddSurvey;
    window.markSurveyStatus = markSurveyStatus;

    async function loadSubscriptions(opts) {
      opts = opts || {};
      var force = !!opts.force;
      var soft = !!opts.soft;

      if (!isSubsUnlocked()) {
        enterSubsScreen();
        return;
      }
      var box = document.getElementById("subsContainer");
      var countEl = document.getElementById("subsCount");
      if (countEl) countEl.textContent = "";
      var fr = document.getElementById("bpFilterRow");
      if (fr) fr.style.display = (subsSegment === "БП") ? "flex" : "none";
      if (subsSegment !== "БП") {
        bpEditMode = false;
        bpPicked = Object.create(null);
        syncBpEditBarUi_();
      } else {
        syncBpEditBarUi_();
      }
      var bpAdd = document.getElementById("bpAddCard");
      if (bpAdd && subsSegment !== "БП") bpAdd.style.display = "none";
      if (subsSegment === "Опросник") {
        window._subsListFull = [];
        window._subsListCache = [];
        await loadSurveyTab_({ soft: soft, force: force });
        return;
      }
      var seq = ++_subsLoadSeq;
      var wantSheet = subsSegment;
      if (!window._subsBySheet) window._subsBySheet = Object.create(null);
      var cachedSheet = window._subsBySheet[wantSheet];
      // Пустой кэш НЕ считаем loaded — иначе soft «Пусто в ПП/АФК/БП» навсегда
      var cacheHasRows = !!(cachedSheet && cachedSheet.loaded && (cachedSheet.list || []).length);
      if (!force && cacheHasRows) {
        window._subsListFull = cachedSheet.list || [];
        window._subsListSheet = wantSheet;
        renderSubsList();
        if (soft) return;
      } else if (
        !force &&
        window._subsListFull &&
        window._subsListFull.length &&
        window._subsListSheet === wantSheet &&
        window._subsListLoadedSheet === wantSheet
      ) {
        renderSubsList();
        if (soft) return;
      } else {
        if (box) box.innerHTML = '<p class="muted">Загрузка…</p>';
      }
      // soft + пусто → всё равно сеть с force (оживляем после битого snap/кэша)
      if (soft && !force && !cacheHasRows) force = true;
      try {
        if (force) {
          try { apiCacheBustMem_("listSubscriptions"); } catch (eMem) {}
        }
        // Полный список без sheet= — иначе Worker/GAS кладут урезанный snap
        var params = { action: "listSubscriptions" };
        if (force) {
          params.force = "1";
          params._ = String(Date.now());
        }
        var res = await apiGet(params, {
          timeoutMs: 28000,
          cacheTtlMs: force ? 0 : 30000,
          __boinyaNoSnap: !!force
        });
        if (seq !== _subsLoadSeq || wantSheet !== subsSegment) return;
        if (!res || res.status !== "success") {
          if (!(cachedSheet && cachedSheet.loaded && (cachedSheet.list || []).length)) {
            window._subsListFull = [];
            window._subsListCache = [];
            window._subsListSheet = "";
            var why = (res && (res.message || res.detail)) ? String(res.message || res.detail) : "нет ответа";
            if (box) box.innerHTML = '<p class="muted">CRM: ' + escapeHtml(why) + '. Нужен Deploy Code.gs (v7.10.52+)</p>';
          }
          return;
        }
        var allSubs = Array.isArray(res.subscriptions) ? res.subscriptions : [];
        // Разложить по вкладкам сразу — переключение ПП/АФК/БП без повторного «Пусто»
        ["ПП", "АФК", "БП"].forEach(function (sh) {
          var rows = allSubs.filter(function (s) {
            return String((s && s.sheet) || "") === sh;
          });
          if (sh === "БП") rows = groupBpSubscriptions_(rows);
          if (rows.length) {
            window._subsBySheet[sh] = { list: rows, at: Date.now(), loaded: true };
          } else if (!(window._subsBySheet[sh] && (window._subsBySheet[sh].list || []).length)) {
            // пустое — не loaded, чтобы soft снова сходил в сеть
            window._subsBySheet[sh] = { list: [], at: Date.now(), loaded: false };
          }
        });
        var list = allSubs.filter(function (s) {
          return !wantSheet || String((s && s.sheet) || "") === wantSheet;
        });
        if (wantSheet === "БП") list = groupBpSubscriptions_(list);
        window._subsListFull = list;
        window._subsListSheet = wantSheet;
        window._subsListLoadedSheet = wantSheet;
        window._subsBySheet[wantSheet] = {
          list: list,
          at: Date.now(),
          loaded: list.length > 0
        };
        renderSubsList();
      } catch (e) {
        if (seq !== _subsLoadSeq) return;
        if (!(cachedSheet && cachedSheet.loaded && (cachedSheet.list || []).length)) {
          window._subsListFull = [];
          window._subsListCache = [];
          window._subsListSheet = "";
          if (box) box.innerHTML = '<p class="muted">Ошибка загрузки подписок. Deploy Code.gs v7.10.52+</p>';
        }
      }
    }
    window.loadSubscriptions = loadSubscriptions;

    function refreshSubscriptions() {
      return loadSubscriptions({ force: true });
    }
    window.refreshSubscriptions = refreshSubscriptions;

    function normSubsSearch(s) {
      return String(s || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[._\s\-]+/g, "");
    }

    function subsMatchesQuery(s, qNorm) {
      if (!qNorm) return true;
      var nick = normSubsSearch(s.nick || s.label || "");
      var label = normSubsSearch(s.label || "");
      var subId = normSubsSearch(s.subId || "");
      if (nick.indexOf(qNorm) >= 0 || label.indexOf(qNorm) >= 0 || subId.indexOf(qNorm) >= 0) return true;

      var hay = nick || label;
      var qi = 0;
      for (var i = 0; i < hay.length && qi < qNorm.length; i++) {
        if (hay.charAt(i) === qNorm.charAt(qi)) qi++;
      }
      return qi === qNorm.length;
    }

    function renderSubsList() {
      var box = document.getElementById("subsContainer");
      var countEl = document.getElementById("subsCount");
      if (!box) return;
      var full = window._subsListFull || [];
      var inp = document.getElementById("subsSearchInput");
      var qNorm = normSubsSearch(inp ? inp.value : "");
      var list = full.filter(function (s) { return subsMatchesQuery(s, qNorm); });
      window._subsListCache = list;
      if (countEl) {
        countEl.textContent = qNorm
          ? (list.length + " / " + full.length)
          : (full.length + " чел.");
      }
      if (!full.length) {
        box.innerHTML = '<p class="muted">Пусто в ' + escapeHtml(subsSegment) + "</p>";
        return;
      }
      if (!list.length) {
        box.innerHTML = '<p class="muted">Никого по «' + escapeHtml((inp && inp.value) || "") + '»</p>';
        return;
      }
      if (subsSegment === "БП" && bpListFilter && bpListFilter !== "all") {
        list = list.filter(function (s) { return bpStageColor_(s) === bpListFilter; });
        window._subsListCache = list;
        if (countEl) {
          countEl.textContent = qNorm
            ? (list.length + " / " + full.length)
            : (list.length + " / " + full.length + " чел.");
        }
        if (!list.length) {
          box.innerHTML = '<p class="muted">Нет карточек в фильтре</p>';
          return;
        }
      }
      box.innerHTML = '<div class="subs-grid">' + list.map(function (s, i) {
        var nick = s.nick || s.label || "";
        var meta = ["N=" + (s.deliveries || 0), s.status || ""].filter(Boolean).join(" · ");
        var color = (subsSegment === "БП") ? bpStageColor_(s) : "";
        var isBp = subsSegment === "БП";
        var key = isBp ? bpPickKey_(s) : "";
        var picked = !!(isBp && bpEditMode && key && bpPicked[key]);
        var rowClass = "sub-row" +
          (color ? (" bp-" + color) : "") +
          (isBp ? " bp-select" : "") +
          (isBp && bpEditMode ? " bp-edit-on" : "") +
          (picked ? " bp-picked" : "");
        var pickHit = (isBp && bpEditMode)
          ? ('<div class="bp-pick-hit" aria-hidden="true">' + (picked ? "✓" : "👤") + "</div>")
          : "";
        return '<div class="' + rowClass + '" role="button" tabindex="0" onclick="onBpRowClick(' + i + ', event)">' +
          pickHit +
          '<div class="sub-row-main">' +
          '<div class="sub-row-nick">' + escapeHtml(nick) + "</div>" +
          (meta ? '<div class="sub-row-meta">' + escapeHtml(meta) + "</div>" : "") +
          (isBp && bpEditMode ? '<div class="sub-row-meta">' + (picked ? "выбран · ещё раз снять" : "нажми чтобы выбрать") + "</div>" : "") +
          "</div></div>";
      }).join("") + "</div>";
      if (subsSegment === "БП") syncBpEditBarUi_();
    }
    window.renderSubsList = renderSubsList;

    function onSubsSearchInput() {
      try { renderSubsList(); } catch (e) {}
    }
    window.onSubsSearchInput = onSubsSearchInput;

    var currentSubDetail = null;
    var subDetailBasket = [];
    var subDetailManualCategory = "dressura";
    var subDetailDeepOpen = false;
    var subDetailPackCounts = { u1: 0, u2: 0, u3: 0, up4: 0 };
    var subDetailPacksManual = false;

    function parseDogFromWishes_(wishes) {
      var m = String(wishes || "").match(/\[DOG:([^\]]*)\]/i);
      if (!m) return { name: "", breed: "", weight: "" };
      var parts = String(m[1] || "").split("|");
      return {
        name: String(parts[0] || "").trim(),
        breed: String(parts[1] || "").trim(),
        weight: String(parts[2] || "").trim()
      };
    }

    function stripDogFromWishes_(wishes) {
      return String(wishes || "").replace(/\[DOG:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    }

    function stampDogIntoWishes_(wishes, dog) {
      var base = stripDogFromWishes_(wishes);
      dog = dog || {};
      var name = String(dog.name || "").trim();
      var breed = String(dog.breed || "").trim();
      var weight = String(dog.weight != null ? dog.weight : "").trim().replace(",", ".");
      if (!name && !breed && !weight) return base;
      var tag = "[DOG:" + name + "|" + breed + "|" + weight + "]";
      return (base + (base ? " " : "") + tag).trim();
    }

    function readSubDetailDogFields_() {
      return {
        name: (document.getElementById("subDetailDogName") && document.getElementById("subDetailDogName").value) || "",
        breed: (document.getElementById("subDetailDogBreed") && document.getElementById("subDetailDogBreed").value) || "",
        weight: (document.getElementById("subDetailDogWeight") && document.getElementById("subDetailDogWeight").value) || ""
      };
    }

    function fillSubDetailDogFields_(dog) {
      dog = dog || {};
      var n = document.getElementById("subDetailDogName");
      var b = document.getElementById("subDetailDogBreed");
      var w = document.getElementById("subDetailDogWeight");
      if (n) n.value = dog.name || "";
      if (b) b.value = dog.breed || "";
      if (w) w.value = dog.weight != null ? String(dog.weight) : "";
    }

    function getSubDetailFracRates_() {
      function num(id, def) {
        var el = document.getElementById(id);
        var v = el ? Number(String(el.value || "").replace(",", ".")) : def;
        return isFinite(v) ? v : def;
      }
      return {
        whole: num("subDetailFracWhole", 0),
        large: num("subDetailFracLarge", 1),
        medium: num("subDetailFracMedium", 2),
        small: num("subDetailFracSmall", 3)
      };
    }

    function renderSubDetailPackCounters_() {
      var map = { u1: "subDetailPackU1", u2: "subDetailPackU2", u3: "subDetailPackU3", up4: "subDetailPackUp4" };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k]);
        if (el) el.textContent = String(subDetailPackCounts[k] || 0);
      });
      var tot = packagesBynFromUCountsLocal_(subDetailPackCounts);
      var lab = document.getElementById("subDetailPackTotalLabel");
      if (lab) lab.textContent = "(" + tot + " BYN)";
      var hint = document.getElementById("subDetailPackModeHint");
      if (hint) hint.textContent = subDetailPacksManual ? "· вручную" : "· авто из состава";
    }

    function setSubDetailPackCounts_(pc, opts) {
      opts = opts || {};
      pc = pc || {};
      subDetailPackCounts = {
        u1: Number(pc.u1 != null ? pc.u1 : pc.small) || 0,
        u2: Number(pc.u2 != null ? pc.u2 : pc.medium) || 0,
        u3: Number(pc.u3 != null ? pc.u3 : pc.large) || 0,
        up4: Number(pc.up4 != null ? pc.up4 : pc.legs) || 0
      };
      if (opts.manual) subDetailPacksManual = true;
      if (opts.resetManual) subDetailPacksManual = false;
      renderSubDetailPackCounters_();
    }

    function syncSubDetailPacksFromBasket_(opts) {
      opts = opts || {};
      if (subDetailPacksManual && !opts.force) return;
      var list = [];
      try { list = subDetailBasketPayload_(); } catch (e0) { list = []; }
      var pc = packCountsFromBasketLocal_(list);
      setSubDetailPackCounts_({
        u1: pc.u1, u2: pc.u2, u3: pc.u3, up4: pc.up4
      }, { resetManual: true });
    }

    function resetSubDetailPacksAuto_() {
      subDetailPacksManual = false;
      syncSubDetailPacksFromBasket_({ force: true });
      recalcSubDetailFactCost_();
      showToast("Пакеты пересчитаны из состава");
    }
    window.resetSubDetailPacksAuto_ = resetSubDetailPacksAuto_;

    function bumpSubDetailPack_(kind, delta) {
      if (!subDetailPackCounts.hasOwnProperty(kind)) return;
      var next = (Number(subDetailPackCounts[kind]) || 0) + (Number(delta) || 0);
      if (next < 0) next = 0;
      subDetailPackCounts[kind] = next;
      subDetailPacksManual = true;
      renderSubDetailPackCounters_();
      recalcSubDetailFactCost_();
    }
    window.bumpSubDetailPack_ = bumpSubDetailPack_;

    function toggleSubDetailDeepEditor_(force) {
      if (typeof force === "boolean") subDetailDeepOpen = force;
      else subDetailDeepOpen = !subDetailDeepOpen;
      var panel = document.getElementById("subDetailDeepPanel");
      var btn = document.getElementById("btnSubDeepEditor");
      if (panel) panel.style.display = subDetailDeepOpen ? "block" : "none";
      if (btn) btn.textContent = subDetailDeepOpen ? "Глубокий редактор · открыт" : "Глубокий редактор";
      var sheet = (document.getElementById("subDetailSheet") && document.getElementById("subDetailSheet").value) || "";
      var extras = document.getElementById("subDetailDeepPpExtras");
      if (extras) extras.style.display = (sheet === "ПП") ? "block" : "none";
      renderSubDetailBasket();
      if (subDetailDeepOpen && sheet === "ПП") {
        try { recalcSubDetailFactCost_(); } catch (eR) {}
      }
    }
    window.toggleSubDetailDeepEditor_ = toggleSubDetailDeepEditor_;

    function renderSubDetailBasket() {
      var box = document.getElementById("subDetailBasket");
      var countEl = document.getElementById("subDetailBasketCount");
      if (countEl) countEl.textContent = subDetailBasket.length ? (subDetailBasket.length + " поз.") : "";
      if (!box) return;
      if (!subDetailBasket.length) {
        box.innerHTML = '<p class="muted">' +
          (subDetailDeepOpen ? "Состав пуст — добавь позиции вручную" : "Состав пуст") +
          "</p>";
        return;
      }
      box.innerHTML = subDetailBasket.map(function (item, idx) {
        var unit = unitForItem(item.cat, item.main || item.name);
        var sub = item.sub ? ("Фракция: " + item.sub) : ("Категория: " + (item.cat || ""));
        var delBtn = subDetailDeepOpen
          ? ('<button type="button" class="btn-inline-del" onclick="deleteSubDetailBasketItem(' + idx + ')">Удалить</button>')
          : "";
        return '<div class="basket-card ' + escapeHtml(item.cat || "") + '">' +
          delBtn +
          '<div class="basket-info">' + escapeHtml(item.main || item.name || "") + " → " +
          (item.val != null ? item.val : item.value) + " " + unit + "</div>" +
          '<div class="basket-sub">' + escapeHtml(sub) + "</div>" +
          "</div>";
      }).join("");
    }
    window.renderSubDetailBasket = renderSubDetailBasket;

    var _subDetailFactTimer = null;
    var _subDetailFactSeq = 0;
    var _subDetailCostCache = { fp: "", cost: null, packagesByn: 0 };
    var _subDetailOpenedFp = "";
    var _subDetailStatedTouched = false;

    function onSubDetailStatedPriceInput_() {
      _subDetailStatedTouched = true;
      var hint = document.getElementById("subDetailStatedHint");
      if (hint) hint.textContent = "вручную · сохранится в столбец «Факт стоимость» на листе ПП";
    }
    window.onSubDetailStatedPriceInput_ = onSubDetailStatedPriceInput_;

    function setSubDetailStatedPrice_(val, opts) {
      opts = opts || {};
      var el = document.getElementById("subDetailStatedPrice");
      if (!el) return;
      if (val == null || val === "") el.value = "";
      else el.value = String(val);
      if (!opts.keepTouched) _subDetailStatedTouched = false;
      var hint = document.getElementById("subDetailStatedHint");
      if (hint && !opts.keepTouched) {
        hint.textContent = val !== "" && val != null
          ? "с листа ПП (Факт стоимость) · можно поправить вручную"
          : "не пересчитывается · вносит менеджер вручную";
      }
    }

    function setSubDetailCoef_(v) {
      var el = document.getElementById("subDetailCoef");
      if (el) el.value = String(v);

      recalcSubDetailFactCost_();
    }
    window.setSubDetailCoef_ = setSubDetailCoef_;

    function syncSubDetailPpPriceUi_(sheet) {
      var box = document.getElementById("subDetailPpPriceBox");
      var isPp = String(sheet || "") === "ПП";
      if (box) box.style.display = isPp ? "block" : "none";
      var deepBtn = document.getElementById("btnSubDeepEditor");
      if (deepBtn) deepBtn.style.display = (isPp || String(sheet || "") === "БП") ? "" : "none";
      var extras = document.getElementById("subDetailDeepPpExtras");
      if (extras) extras.style.display = isPp ? "block" : "none";
      if (isPp) {
        try { syncSubDetailSchemeUi_(); } catch (eSchUi) {}
      } else {
        var btn = document.getElementById("btnMigratePpScheme");
        var hint = document.getElementById("subDetailSchemeHint");
        var badge = document.getElementById("subDetailSchemeBadge");
        if (btn) btn.style.display = "none";
        if (hint) hint.style.display = "none";
        if (badge) badge.textContent = "";
      }
    }

    function scheduleSubDetailFactRecalc_() {
      var sheet = (document.getElementById("subDetailSheet") && document.getElementById("subDetailSheet").value) || "";
      if (sheet !== "ПП") return;
      if (!subDetailPacksManual) {
        try { syncSubDetailPacksFromBasket_(); } catch (eSp) {}
      }
      clearTimeout(_subDetailFactTimer);
      _subDetailFactTimer = setTimeout(function () {
        recalcSubDetailFactCost_();
      }, 120);
    }
    window.scheduleSubDetailFactRecalc_ = scheduleSubDetailFactRecalc_;

    function parsePpCoefFromWishes_(wishes) {
      var m = String(wishes || "").match(/\[COEF:([0-9]+(?:[.,][0-9]+)?)\]/i);
      if (!m) return null;
      var v = Number(String(m[1]).replace(",", "."));
      return (isFinite(v) && v > 0) ? v : null;
    }

    function stripPpCoefFromWishes_(wishes) {
      return String(wishes || "").replace(/\[COEF:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    }

    function stampPpCoefIntoWishes_(wishes, coef) {
      var base = stripPpCoefFromWishes_(wishes);
      var v = Number(coef);
      if (!isFinite(v) || v <= 0) return base;
      var tag = "[COEF:" + (Math.round(v * 1000) / 1000) + "]";
      return (base + (base ? " " : "") + tag).trim();
    }

    var PP_SCHEME_CUTOFF_YMD = "2026-08-31";
    var PP_RAW26_COEF_DEFAULT = 2.6;
    var PP_RAW26_RECOVER_100 = 3.90;
    var PP_RAW26_RECOVER_PIECE = 0.50;
    var PP_RAW26_DELIVERY_PER = 9;
    var PP_LEGACY_COEF_DEFAULT = 2.3;
    var PP_LEGACY_FIXED = 11;
    var PP_LEGACY_DELIVERY_PER = 6;

    function todayYmdLocal_() {
      try {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
      } catch (e) {
        return "";
      }
    }

    function defaultPpSchemeForNewLocal_() {
      return todayYmdLocal_() >= PP_SCHEME_CUTOFF_YMD ? "RAW26" : "LEGACY";
    }

    function normalizePpSchemeLocal_(s) {
      var u = String(s || "").trim().toUpperCase();
      if (u === "RAW26" || u === "RAW" || u === "NEW" || u === "V2") return "RAW26";
      if (u === "LEGACY" || u === "OLD" || u === "V1") return "LEGACY";
      return "";
    }

    function parsePpSchemeFromWishes_(wishes) {
      var m = String(wishes || "").match(/\[SCHEME:([^\]]+)\]/i);
      if (!m) return "";
      return normalizePpSchemeLocal_(m[1]);
    }

    function stripPpSchemeFromWishes_(wishes) {
      return String(wishes || "").replace(/\[SCHEME:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    }

    function stampPpSchemeIntoWishes_(wishes, scheme) {
      var base = stripPpSchemeFromWishes_(wishes);
      var sch = normalizePpSchemeLocal_(scheme);
      if (!sch) return base;
      return (base + (base ? " " : "") + "[SCHEME:" + sch + "]").trim();
    }

    function stripPpMetaFromWishes_(wishes) {
      return stripPpSchemeFromWishes_(stripPpCoefFromWishes_(wishes));
    }

    function subDetailSchemeValue_() {
      if (currentSubDetail && currentSubDetail.ppScheme) {
        var s = normalizePpSchemeLocal_(currentSubDetail.ppScheme);
        if (s) return s;
      }
      var w = "";
      try {
        w = (currentSubDetail && currentSubDetail.wishes) || "";
      } catch (e0) {}
      return parsePpSchemeFromWishes_(w) || "LEGACY";
    }

    function syncSubDetailSchemeUi_() {
      var scheme = subDetailSchemeValue_();
      var badge = document.getElementById("subDetailSchemeBadge");
      var btn = document.getElementById("btnMigratePpScheme");
      var hint = document.getElementById("subDetailSchemeHint");
      if (badge) {
        badge.textContent = scheme === "RAW26"
          ? "· схема сырьё×2.6"
          : "· старая схема ×2.3+11+6N";
      }
      var showMig = scheme !== "RAW26";
      if (btn) btn.style.display = showMig ? "block" : "none";
      if (hint) hint.style.display = showMig ? "block" : "none";
    }

    function recoverBynFromBasketLocal_(list) {
      var sum = 0;
      (list || []).forEach(function (it) {
        var val = Number(it.val != null ? it.val : it.value) || 0;
        if (val <= 0) return;
        var cat = String(it.cat || "").toLowerCase();
        var name = String(it.main || it.name || "");
        var piece = cat === "chew" || cat === "chews" || cat === "powder";
        try {
          if (!piece && typeof unitForItem === "function" && unitForItem(cat || "other", name) === "шт") piece = true;
        } catch (eU) {}
        if (!piece && /шт/i.test(name)) piece = true;
        if (!piece && /крошка/i.test(name)) piece = true;
        if (piece) sum += PP_RAW26_RECOVER_PIECE * val;
        else sum += PP_RAW26_RECOVER_100 * (val / 100);
      });
      return Math.round(sum * 100) / 100;
    }


    function subDetailCoefValue_() {
      var el = document.getElementById("subDetailCoef");
      var scheme = subDetailSchemeValue_();
      var def = scheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT;
      var v = el ? Number(String(el.value || "").replace(",", ".")) : def;
      if (!isFinite(v) || v <= 0) v = def;
      return v;
    }

    function applySubDetailFact_(factCost, hintText) {
      var factEl = document.getElementById("subDetailFact");
      var hint = document.getElementById("subDetailFactHint");
      if (factEl) {
        factEl.value = (factCost == null || factCost === "") ? "" : String(factCost);
        try {
          factEl.style.transition = "none";
          factEl.style.background = "#143d24";
          setTimeout(function () {
            factEl.style.transition = "background .6s";
            factEl.style.background = "";
          }, 40);
        } catch (eFlash) {}
      }
      if (hint && hintText) hint.textContent = hintText;
    }

    function applyLocalPpFact_(costSum, coef, n, packagesByn, fracTotal, packHint, listOpt) {
      costSum = Number(costSum) || 0;
      var scheme = subDetailSchemeValue_();
      coef = Number(coef) || (scheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
      n = Math.max(1, Number(n) || 1);
      packagesByn = Number(packagesByn) || 0;
      fracTotal = Number(fracTotal) || 0;
      var total;
      var hintCore;
      if (scheme === "RAW26") {
        var recover = recoverBynFromBasketLocal_(listOpt || subDetailBasketPayload_());
        var delivery = PP_RAW26_DELIVERY_PER * n;
        total = Math.round((costSum * coef + recover + delivery + packagesByn + fracTotal) * 100) / 100;
        hintCore = "себест " + costSum + " ×" + coef + " +recover " + recover + " +9×" + n;
      } else {
        total = Math.round((costSum * coef + 11 + 6 * n + packagesByn + fracTotal) * 100) / 100;
        hintCore = "себест " + costSum + " ×" + coef + " +11 +6×" + n;
      }
      applySubDetailFact_(total,
        hintCore +
        (packagesByn ? (" +пакеты " + packagesByn + (packHint ? " [" + packHint + "]" : "")) : "") +
        (fracTotal ? (" +фракт " + fracTotal) : "") +
        " → " + total + " BYN");
      return total;
    }

    function packagesBynFromUCountsLocal_(pc) {
      pc = pc || {};
      return Math.round(
        ((Number(pc.u1) || 0) * 0.34 +
          (Number(pc.u2) || 0) * 0.56 +
          (Number(pc.u3) || 0) * 0.80 +
          (Number(pc.up4) || 0) * 1.40) * 100
      ) / 100;
    }

    function packHintFromU_(pc) {
      pc = pc || {};
      var parts = [];
      if (pc.u1) parts.push("У1×" + pc.u1);
      if (pc.u2) parts.push("У2×" + pc.u2);
      if (pc.u3) parts.push("У3×" + pc.u3);
      if (pc.up4) parts.push("УП4×" + pc.up4);
      return parts.join(" ");
    }

    function resolveSubDetailPackagesByn_(fp) {

      if (subDetailPacksManual) {
        return {
          packagesByn: packagesBynFromUCountsLocal_(subDetailPackCounts),
          hint: packHintFromU_(subDetailPackCounts),
          fromSheet: false,
          fromManual: true
        };
      }

      try {
        // состав изменился, но пакеты не manual — авто; иначе не force-сбрасывать
        if (!_subDetailOpenedFp || (fp && fp !== _subDetailOpenedFp)) {
          if (!subDetailPacksManual) syncSubDetailPacksFromBasket_();
          return {
            packagesByn: packagesBynFromUCountsLocal_(subDetailPackCounts),
            hint: packHintFromU_(subDetailPackCounts),
            fromSheet: false,
            fromManual: !!subDetailPacksManual
          };
        }
      } catch (eAuto) {}
      try {
        if (currentSubDetail && currentSubDetail.packCounts &&
            _subDetailOpenedFp && fp && fp === _subDetailOpenedFp) {
          var byn = packagesBynFromUCountsLocal_(currentSubDetail.packCounts);
          return {
            packagesByn: byn,
            hint: packHintFromU_(currentSubDetail.packCounts),
            fromSheet: true
          };
        }
      } catch (eP) {}
      return {
        packagesByn: packagesBynFromUCountsLocal_(subDetailPackCounts) ||
          (Number(_subDetailCostCache.packagesByn) || 0),
        hint: packHintFromU_(subDetailPackCounts),
        fromSheet: false
      };
    }

    function extractRawPpCost_(pr, list) {
      if (!pr) return null;
      var raw = null;
      if (pr.rawCost != null && pr.rawCost !== "") raw = Number(pr.rawCost);
      else if (pr.cost != null && pr.cost !== "") raw = Number(pr.cost);
      else raw = recalcPpCostSum(pr, list);
      if (raw == null || !isFinite(raw)) return null;
      var tot = (pr.total != null) ? Number(pr.total) : NaN;
      var mk = Number(pr.markup);
      if (!isFinite(mk) || mk <= 1) mk = 2.3;

      if (isFinite(tot) && tot > 0 && Math.abs(raw - tot) < 0.05) {
        raw = Math.round((tot / mk) * 100) / 100;
      }

      if (pr.factCost != null && Math.abs(raw - Number(pr.factCost)) < 0.05 && Number(pr.factCost) > raw * 1.2) {
        raw = Math.round((Number(pr.factCost) - 11) / mk * 100) / 100;
      }
      return Math.round(raw * 100) / 100;
    }

    async function recalcSubDetailFactCost_() {
      var sheet = (document.getElementById("subDetailSheet") && document.getElementById("subDetailSheet").value) || "";
      if (sheet !== "ПП") return;
      var list = subDetailBasketPayload_();
      if (!list.length) {
        _subDetailCostCache = { fp: "", cost: null, packagesByn: 0 };
        applySubDetailFact_("", "Состав пуст — стоимость 0");
        return;
      }
      var n = Math.max(1, Number(document.getElementById("subDetailDeliveries") && document.getElementById("subDetailDeliveries").value) || 1);
      var coef = subDetailCoefValue_();
      var seq = ++_subDetailFactSeq;
      var hint = document.getElementById("subDetailFactHint");
      var frac = calcDressuraFractionMarkup(list, getSubDetailFracRates_());
      var fracTotal = (frac && frac.total) || 0;
      var fp = "";
      try { fp = basketFingerprint_(list); } catch (eFp) { fp = String(list.length); }

      var sheetPacks = resolveSubDetailPackagesByn_(fp);
      if (_subDetailCostCache.fp === fp && _subDetailCostCache.cost != null) {
        var packsCached = (sheetPacks.fromManual || sheetPacks.fromSheet)
          ? sheetPacks.packagesByn
          : (Number(_subDetailCostCache.packagesByn) || sheetPacks.packagesByn || 0);
        applyLocalPpFact_(_subDetailCostCache.cost, coef, n, packsCached, fracTotal, sheetPacks.hint, list);
        return;
      }

      if (hint) hint.textContent = "Считаю сырую себест… затем ×" + coef + " · N=" + n + " · " + subDetailSchemeValue_();
      try {
        var slim = list.map(function (it) {
          return {
            name: it.name || it.main || "",
            main: it.main || it.name || "",
            sub: it.sub || "",
            val: it.val != null ? it.val : it.value,
            cat: it.cat || ""
          };
        });
        var basketJson = JSON.stringify(slim);
        var costSum = null;
        var packagesByn = sheetPacks.packagesByn || 0;
        var packHint = sheetPacks.hint || "";

        var pr = null;
        try {
          pr = await fetchPpCalcPrice_(slim, { timeoutMs: 28000 });
        } catch (e0) { pr = null; }
        if (seq !== _subDetailFactSeq) return;

        if (pr && pr.status === "success") {
          costSum = extractRawPpCost_(pr, list);
        }

        if (!sheetPacks.fromManual && !sheetPacks.fromSheet && basketJson.length < 1600) {
          try {
            var pfPayload = {
              action: "calcPpFact",
              deliveriesN: String(n),
              coef: String(coef),
              scheme: subDetailSchemeValue_(),
              basket: basketJson,
              _: String(Date.now())
            };
            var pf = await apiGet(pfPayload, { timeoutMs: 20000, cacheTtlMs: 0 });
            if (seq !== _subDetailFactSeq) return;
            if (pf && pf.status === "success") {
              if (costSum == null && pf.rawCost != null) costSum = Number(pf.rawCost);
              else if (costSum == null && pf.cost != null) costSum = extractRawPpCost_(pf, list);
              if (pf.packagesByn != null) packagesByn = Number(pf.packagesByn) || 0;
              if (pf.packCounts) {
                packHint = packHintFromU_(pf.packCounts);
                if (!subDetailPacksManual) setSubDetailPackCounts_(pf.packCounts, { resetManual: true });
              }
              if (pf.fractionMarkup != null && !fracTotal) fracTotal = Number(pf.fractionMarkup) || 0;
              if (pf.factCost != null && isFinite(Number(pf.factCost))) {
                _subDetailCostCache = { fp: fp, cost: costSum, packagesByn: packagesByn };
                if (seq !== _subDetailFactSeq) return;
                var schHint = (pf.scheme === "RAW26")
                  ? ("RAW26 · recover " + (pf.recoverByn || 0) + " · 9×" + n)
                  : ("LEGACY · +11 +6×" + n);
                applySubDetailFact_(
                  Math.round(Number(pf.factCost) * 100) / 100,
                  "себест " + (costSum != null ? costSum : "?") + " ×" + coef + " · " + schHint +
                  (packagesByn ? (" +пакеты " + packagesByn) : "") +
                  (fracTotal ? (" +фракт " + fracTotal) : "") +
                  " → " + pf.factCost + " BYN"
                );
                return;
              }
            }
          } catch (e1) {}
        }

        if (costSum == null || !isFinite(costSum)) {
          if (hint) hint.textContent = "Не удалось посчитать себест — проверь сеть";
          return;
        }
        _subDetailCostCache = { fp: fp, cost: costSum, packagesByn: packagesByn };
        if (seq !== _subDetailFactSeq) return;
        applyLocalPpFact_(costSum, coef, n, packagesByn, fracTotal, packHint, list);
      } catch (e) {
        if (seq !== _subDetailFactSeq) return;
        if (hint) hint.textContent = "Ошибка пересчёта: " + (e.message || e);
      }
    }
    window.recalcSubDetailFactCost_ = recalcSubDetailFactCost_;

    function deleteSubDetailBasketItem(idx) {
      idx = Number(idx);
      if (isNaN(idx) || idx < 0 || idx >= subDetailBasket.length) return;
      subDetailBasket.splice(idx, 1);
      renderSubDetailBasket();
      scheduleSubDetailFactRecalc_();
    }
    window.deleteSubDetailBasketItem = deleteSubDetailBasketItem;

    async function clearSubDetailBasket() {
      if (!subDetailBasket.length) { showToast("Уже пусто"); return; }
      var ok = await uiConfirmAsync("Очистить состав (" + subDetailBasket.length + " поз.)?");
      if (!ok) return;
      subDetailBasket = [];
      renderSubDetailBasket();
      scheduleSubDetailFactRecalc_();
    }
    window.clearSubDetailBasket = clearSubDetailBasket;

    function toggleSubDetailManualEntry() {
      var panel = document.getElementById("subDetailManualPanel");
      if (!panel) return;
      var open = panel.style.display === "none" || !panel.style.display;
      panel.style.display = open ? "block" : "none";
      if (!open) {
        var sel = document.getElementById("subDetailSelectorCard");
        if (sel) sel.style.display = "none";
      }
    }
    window.toggleSubDetailManualEntry = toggleSubDetailManualEntry;

    function openSubDetailProductSelector(catKey) {
      subDetailManualCategory = catKey;
      var cat = catalog[catKey];
      if (!cat) return;
      document.getElementById("subDetailSelectorTitle").innerText = cat.title || catKey;
      document.getElementById("subDetailMainSelect").innerHTML =
        (cat.items || []).map(function (n) {
          return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + "</option>";
        }).join("");
      document.getElementById("subDetailSelectorCard").style.display = "block";
      document.getElementById("subDetailVolumeInput").value = "";
      onSubDetailProductChange();
    }
    window.openSubDetailProductSelector = openSubDetailProductSelector;

    function onSubDetailProductChange() {
      var mainVal = document.getElementById("subDetailMainSelect").value;
      var cat = catalog[subDetailManualCategory];
      document.getElementById("subDetailValueLabel").innerText =
        unitForItem(subDetailManualCategory, mainVal) === "шт" ? "Количество (шт)" : "Вес (гр)";
      if (cat && cat.fractions && cat.fractions[mainVal]) {
        document.getElementById("subDetailFractionGroup").style.display = "block";
        document.getElementById("subDetailFractionSelect").innerHTML =
          cat.fractions[mainVal].map(function (f) {
            return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + "</option>";
          }).join("");
      } else {
        document.getElementById("subDetailFractionGroup").style.display = "none";
        document.getElementById("subDetailFractionSelect").innerHTML = "";
      }
    }
    window.onSubDetailProductChange = onSubDetailProductChange;

    async function addItemToSubDetailBasket() {
      var mainVal = document.getElementById("subDetailMainSelect").value;
      var fracVal = document.getElementById("subDetailFractionSelect").value || "";
      var inputVal = Number(document.getElementById("subDetailVolumeInput").value) || 0;
      if (!mainVal) { await uiAlertAsync("Выберите наименование"); return; }
      if (inputVal <= 0) { await uiAlertAsync("Укажите количество больше нуля"); return; }
      var cat = catalog[subDetailManualCategory];
      var needFrac = cat && cat.fractions && cat.fractions[mainVal] && cat.fractions[mainVal].length;
      if (needFrac && !fracVal) {
        await uiAlertAsync("Выберите фракцию / тип");
        return;
      }
      if (needFrac && cat.fractions[mainVal].indexOf(fracVal) < 0) {
        await uiAlertAsync("Такой фракции нет для «" + mainVal + "»");
        return;
      }
      subDetailBasket.push({
        id: Date.now() + Math.random(),
        cat: subDetailManualCategory,
        main: mainVal,
        name: mainVal,
        sub: fracVal,
        value: inputVal,
        val: inputVal
      });
      document.getElementById("subDetailSelectorCard").style.display = "none";
      document.getElementById("subDetailVolumeInput").value = "";
      renderSubDetailBasket();
      scheduleSubDetailFactRecalc_();
      showToast("Добавлено");
    }
    window.addItemToSubDetailBasket = addItemToSubDetailBasket;

    function subDetailBasketPayload_() {
      return (subDetailBasket || []).map(function (x) {
        var main = canonicalProductMain_(x.main || x.name);
        return {
          cat: x.cat,
          main: main,
          name: main,
          sub: x.sub || "",
          value: x.val != null ? x.val : x.value,
          val: x.val != null ? x.val : x.value
        };
      });
    }

    /** Нормализация позиции для сверки после save (alias, Ё→Е, округление). */
    function basketItemKeyParts_(it) {
      var name = String(it.main || it.name || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      try {
        if (typeof igAliasResolve === "function") {
          name = String(igAliasResolve(name) || name).toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
        }
      } catch (eAl) {}
      var sub = String(it.sub || "").toUpperCase().replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
      // алиасы фракций листа ↔ UI
      if (/^КРУПН/.test(sub) || /^БОЛЬШ/.test(sub)) sub = "КРУПНОЕ";
      else if (/^МЕЛК/.test(sub)) sub = "МЕЛКОЕ";
      else if (/^СРЕД/.test(sub)) sub = "СРЕДНЕЕ";
      else if (/^ЦЕЛ/.test(sub)) sub = "ЦЕЛОЕ";
      else if (/^ПЛАСТ/.test(sub)) sub = "ПЛАСТ";
      else if (/^ПАЛК/.test(sub)) sub = "ПАЛК";
      else if (/^ОЧ\s*МАЛ|^ОЧЕНЬ\s*МАЛ/.test(sub)) sub = "ОЧ МАЛ";
      var val = Number(it.val != null ? it.val : it.value) || 0;
      val = Math.round(val * 1000) / 1000;
      return { name: name, sub: sub, val: val };
    }

    function basketFingerprint_(list) {
      return (list || []).map(function (it) {
        var p = basketItemKeyParts_(it);
        return [p.name, p.sub, p.val].join("|");
      }).sort().join(";");
    }

    /**
     * Сверка want↔got после записи в лист ПП.
     * GAS soft-match пишет пустую фракцию в колонку «Мелкое»/дефолт — read-back
     * возвращает sub, хотя отправили "". Строгий fingerprint тогда ложно орёт.
     * Совместимы: одинаковый sub ИЛИ пустой sub с одной стороны.
     * Лишние позиции в got (хвост листа) не валят сверку, если все want найдены.
     */
    function basketsMatchAfterSave_(want, got) {
      if (basketFingerprint_(want) === basketFingerprint_(got)) return true;
      var A = (want || []).map(basketItemKeyParts_);
      var B = (got || []).map(basketItemKeyParts_).slice();
      if (!A.length && !B.length) return true;
      if (!A.length) return false;
      for (var i = 0; i < A.length; i++) {
        var a = A[i];
        var found = -1;
        for (var j = 0; j < B.length; j++) {
          var b = B[j];
          if (a.name !== b.name) continue;
          if (Math.abs(a.val - b.val) > 1.01) continue;
          if (a.sub && b.sub && a.sub !== b.sub) continue;
          found = j;
          break;
        }
        if (found < 0) return false;
        B.splice(found, 1);
      }
      return true;
    }

    async function openSubDetail(index) {
      if (!isSubsUnlocked()) {
        switchTab("subsScreen");
        return;
      }
      var list = window._subsListCache || [];
      var s = list[index];
      if (!s) return;
      switchTab("subDetailScreen");
      var sheet = s.sheet || subsSegment || "ПП";
      document.getElementById("subDetailTitle").textContent = (s.nick || s.label || "Подписка") + " · " + sheet;
      document.getElementById("subDetailNick").value = s.nick || "";
      document.getElementById("subDetailSheet").value = sheet;
      document.getElementById("subDetailLabel").value = s.label || s.nick || "";
      document.getElementById("subDetailSubId").value = s.subId || "";
      document.getElementById("subDetailDeliveries").value = s.deliveries || "";
      document.getElementById("subDetailStatus").value = s.status || "";
      applyBpStatusUi_(sheet, s.status || "");
      var wishesRaw0 = s.wishes || "";
      var coef0 = parsePpCoefFromWishes_(wishesRaw0);
      var sch0 = parsePpSchemeFromWishes_(wishesRaw0) || "LEGACY";
      var dog0 = parseDogFromWishes_(wishesRaw0);
      document.getElementById("subDetailWishes").value = stripDogFromWishes_(stripPpMetaFromWishes_(wishesRaw0));
      fillSubDetailDogFields_(dog0);
      document.getElementById("subDetailAddress").value = "";
      document.getElementById("subDetailPhone").value = "";
      document.getElementById("subDetailFact").value = "";
      setSubDetailStatedPrice_("");
      _subDetailStatedTouched = false;
      syncSubDetailPpPriceUi_(sheet);
      var coefEl0 = document.getElementById("subDetailCoef");
      if (coefEl0) {
        coefEl0.value = (coef0 != null)
          ? String(coef0)
          : String(sch0 === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
      }
      _subDetailCostCache = { fp: "", cost: null, packagesByn: 0 };
      _subDetailOpenedFp = "";
      _subDetailFactSeq++;
      subDetailBasket = [];
      subDetailBasketBp1 = [];
      subDetailBasketBp2 = [];
      bpBasketTab = 1;
      setSubDetailPackCounts_({ u1: 0, u2: 0, u3: 0, up4: 0 }, { resetManual: true });
      toggleSubDetailDeepEditor_(false);
      renderSubDetailBasket();
      var bpMap0 = document.getElementById("subDetailBpMap");
      if (bpMap0) bpMap0.style.display = (sheet === "БП") ? "block" : "none";
      var panel = document.getElementById("subDetailManualPanel");
      if (panel) panel.style.display = "none";
      var selCard = document.getElementById("subDetailSelectorCard");
      if (selCard) selCard.style.display = "none";
      syncSubDetailActions(sheet);
      currentSubDetail = { nick: s.nick, label: s.label, subId: s.subId, sheet: sheet, wishes: s.wishes || "", ppScheme: sch0, scheme: sch0 };
      try { syncSubDetailSchemeUi_(); } catch (eSch0) {}
      try {
        var res = await apiGet({
          action: "getSubscription",
          nick: s.nick || s.label || "",
          subId: s.subId || "",
          segment: sheet,
          sheet: sheet,
          _: String(Date.now())
        }, { timeoutMs: 25000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          document.getElementById("subDetailBasket").innerHTML = '<p class="muted">Состав не загрузился</p>';
          return;
        }
        if (res.found === false) {
          document.getElementById("subDetailBasket").innerHTML = '<p class="muted">Нет в CRM</p>';
        }
        currentSubDetail = res;
        document.getElementById("subDetailTitle").textContent = (res.nick || s.nick || "Подписка") + " · " + (res.sheet || sheet);
        document.getElementById("subDetailNick").value = res.nick || s.nick || "";
        document.getElementById("subDetailSheet").value = res.sheet || sheet;
        document.getElementById("subDetailLabel").value = res.label || res.nick || "";
        document.getElementById("subDetailSubId").value = res.subId || "";
        document.getElementById("subDetailDeliveries").value = res.deliveries || s.deliveries || "";
        document.getElementById("subDetailStatus").value = res.ppStatus || s.status || "";
        applyBpStatusUi_(res.sheet || sheet, res.ppStatus || s.status || "");
        var wishesRaw = res.wishes || s.wishes || "";
        var cParsed = (res.coef != null && res.coef !== "") ? Number(res.coef) : parsePpCoefFromWishes_(wishesRaw);
        if (!(isFinite(cParsed) && cParsed > 0)) cParsed = parsePpCoefFromWishes_(wishesRaw);
        var schParsed = normalizePpSchemeLocal_(res.ppScheme || res.scheme) ||
          parsePpSchemeFromWishes_(wishesRaw) || "LEGACY";
        currentSubDetail.ppScheme = schParsed;
        currentSubDetail.scheme = schParsed;
        var dogParsed = (res.dogName != null || res.dogBreed != null || res.dogWeight != null)
          ? { name: res.dogName || "", breed: res.dogBreed || "", weight: res.dogWeight || "" }
          : parseDogFromWishes_(wishesRaw);
        document.getElementById("subDetailWishes").value = stripDogFromWishes_(stripPpMetaFromWishes_(wishesRaw));
        fillSubDetailDogFields_(dogParsed);
        document.getElementById("subDetailAddress").value = res.address || "";
        document.getElementById("subDetailPhone").value = res.phone || "";
        if (!res.address || !res.phone) {
          try {
            var profRes = await apiGet({ action: "listClientProfiles", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
            var profs = (profRes && profRes.clients) || [];
            var wantNick = String(res.nick || s.nick || "").trim().toLowerCase().replace(/^@/, "");
            for (var pi = 0; pi < profs.length; pi++) {
              var pn = String(profs[pi].nick || "").trim().toLowerCase().replace(/^@/, "");
              if (!pn || pn !== wantNick) continue;
              if (!res.address && profs[pi].address) {
                document.getElementById("subDetailAddress").value = profs[pi].address;
                res.address = profs[pi].address;
              }
              if (!res.phone && profs[pi].phone) {
                document.getElementById("subDetailPhone").value = profs[pi].phone;
                res.phone = profs[pi].phone;
              }
              break;
            }
          } catch (eProf) {}
        }

        var statedFromSheet = (res.statedCost != null && res.statedCost !== "")
          ? res.statedCost
          : (res.factCost != null && res.factCost !== "" ? res.factCost : "");
        setSubDetailStatedPrice_(statedFromSheet);
        document.getElementById("subDetailFact").value = "";
        var sheetNow = res.sheet || sheet;
        syncSubDetailPpPriceUi_(sheetNow);
        var coefEl = document.getElementById("subDetailCoef");
        if (coefEl && sheetNow === "ПП") {
          coefEl.value = (cParsed != null && isFinite(cParsed) && cParsed > 0)
            ? String(cParsed)
            : String(schParsed === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT);
        }
        try { syncSubDetailSchemeUi_(); } catch (eSch) {}
        subDetailBasket = mapApiBasketToLocal(res.basket || []);
        if (!subDetailBasket.length && sheetNow !== "БП") {
          var emptyHint = document.getElementById("subDetailBasket");
          if (emptyHint && !(res.basket && res.basket.length)) {
            emptyHint.innerHTML = '<p class="muted">В CRM состав пустой</p>';
          }
        }
        try {
          _subDetailOpenedFp = basketFingerprint_(subDetailBasketPayload_());
        } catch (eOfp) {
          _subDetailOpenedFp = "";
        }

        if (res.packCounts && sheetNow === "ПП") {
          var pc0 = res.packCounts;
          var hasSheetPacks = (Number(pc0.u1) || 0) + (Number(pc0.u2) || 0) +
            (Number(pc0.u3) || 0) + (Number(pc0.up4) || 0) > 0;
          if (hasSheetPacks) {
            // пакеты с листа = ручные: не затирать автопри правке состава
            setSubDetailPackCounts_(pc0, { manual: true });
            _subDetailCostCache.packagesByn = packagesBynFromUCountsLocal_(pc0);
          } else {
            syncSubDetailPacksFromBasket_({ force: true });
            _subDetailCostCache.packagesByn = packagesBynFromUCountsLocal_(subDetailPackCounts);
          }
        } else if (sheetNow === "ПП") {
          syncSubDetailPacksFromBasket_({ force: true });
        }
        var isBp = String(res.sheet || sheet) === "БП";
        var bpMap = document.getElementById("subDetailBpMap");
        if (bpMap) bpMap.style.display = isBp ? "block" : "none";
        if (isBp) {
          subDetailBasketBp1 = mapApiBasketToLocal(res.basketBp1 || ((/БП1/.test(String(res.ppStatus || s.status || ""))) ? (res.basket || []) : []));
          subDetailBasketBp2 = mapApiBasketToLocal(res.basketBp2 || ((/БП2/.test(String(res.ppStatus || s.status || ""))) ? (res.basket || []) : []));
          if (!subDetailBasketBp1.length && !subDetailBasketBp2.length) {
            subDetailBasketBp1 = subDetailBasket.slice();
          }
          var d2 = document.getElementById("subDetailSurveyBp2");
          var df = document.getElementById("subDetailSurveyFinal");
          if (d2) d2.value = (res.surveyBp2Due || s.surveyBp2Due || "").toString().slice(0, 10);
          if (df) df.value = (res.surveyFinalDue || s.surveyFinalDue || "").toString().slice(0, 10);
          try {
            await fillOwnerSelect_("subDetailOwner", res.ownerTelegramId || s.ownerTelegramId || "");
          } catch (eOwn) {}
          onBpCardStageChange_();
          var mapTxt = document.getElementById("subDetailBpMapText");
          if (mapTxt) {
            var stNorm = normalizeBpStage_(res.ppStatus || s.status || "");
            var ownLabel = res.ownerName || s.ownerName || "";
            mapTxt.textContent = "Этап: " + stNorm +
              " · БП1 поз: " + subDetailBasketBp1.length +
              " · БП2 поз: " + subDetailBasketBp2.length +
              (ownLabel ? (" · отв: " + ownLabel) : "");
          }
          bpBasketTab = /БП2|ФИНАЛ/.test(String(normalizeBpStage_(res.ppStatus || s.status || ""))) ? 2 : 1;
          setBpBasketTab(bpBasketTab);
        } else {
          subDetailBasketBp1 = [];
          subDetailBasketBp2 = [];
          renderSubDetailBasket();
          if (sheetNow === "ПП") scheduleSubDetailFactRecalc_();
        }
        syncSubDetailActions(res.sheet || sheet);
      } catch (e) {
        document.getElementById("subDetailBasket").innerHTML = '<p class="muted">Ошибка состава</p>';
        showToast(e.message || "Ошибка сети");
      }
    }
    window.openSubDetail = openSubDetail;

    function syncSubDetailActions(sheet) {
      var sh = String(sheet || "").trim();
      var toAfk = document.getElementById("subBtnToAfk");
      var toPp = document.getElementById("subBtnToPp");
      var del = document.getElementById("subBtnDelete");
      var bpToPp = document.getElementById("btnBpToPp");
      var bpIdle = document.getElementById("btnBpIdleNote");
      var msgBtn = document.getElementById("btnSubClientMsg");
      if (toAfk) toAfk.style.display = (sh === "ПП") ? "" : "none";
      if (toPp) toPp.style.display = (sh === "АФК") ? "" : "none";
      if (del) del.style.display = (sh === "ПП" || sh === "АФК" || sh === "БП") ? "" : "none";
      if (bpToPp) bpToPp.style.display = (sh === "БП") ? "" : "none";
      if (bpIdle) bpIdle.style.display = (sh === "БП") ? "" : "none";
      if (msgBtn) msgBtn.style.display = (sh === "ПП" || sh === "АФК") ? "" : "none";
      var bpMap = document.getElementById("subDetailBpMap");
      if (bpMap && sh !== "БП") bpMap.style.display = "none";
    }

    function igHandleFromSubNick_(raw) {
      var s = String(raw || "").trim();
      if (!s) return "";
      var m = s.match(/@([A-Za-z0-9._]{2,30})/);
      if (m) return m[1];
      s = s.replace(/^@+/, "").trim();

      if (/^[A-Za-z0-9._]{2,30}$/.test(s)) return s;
      return "";
    }

    function buildSubDetailClientMessageText_() {
      var list = (typeof subDetailBasketPayload_ === "function" ? subDetailBasketPayload_() : []).map(function (x) {
        return {
          cat: x.cat || "other",
          main: x.main || x.name || "",
          name: x.name || x.main || "",
          sub: x.sub || "",
          val: x.val != null ? x.val : x.value,
          value: x.val != null ? x.val : x.value
        };
      }).filter(function (it) { return (Number(it.val) || 0) > 0 && (it.main || it.name); });
      if (!list.length) return "";
      var n = Math.max(1, Number((document.getElementById("subDetailDeliveries") || {}).value) || 1);
      var stated = Number((document.getElementById("subDetailStatedPrice") || {}).value);
      var fact = Number((document.getElementById("subDetailFact") || {}).value);
      var subTotal = (isFinite(stated) && stated > 0) ? stated : ((isFinite(fact) && fact > 0) ? fact : 0);
      var retail = { total: 0 };
      try {
        retail = calcRetailBasketTotal(list, { deliveriesN: n }) || { total: 0 };
      } catch (eR) { retail = { total: 0 }; }
      if (!(subTotal > 0)) subTotal = Number(retail.total) || 0;

      return composePpClientMessage(list, n, "", retail.total, subTotal);
    }

    async function openSubDetailClientMessage_() {
      var text = buildSubDetailClientMessageText_();
      if (!text) {
        showToast("Сначала состав в карточке");
        return;
      }
      var label = String((document.getElementById("subDetailLabel") || {}).value || "").trim();
      var nick = String((document.getElementById("subDetailNick") || {}).value || "").trim();
      var ig = igHandleFromSubNick_(label) || igHandleFromSubNick_(nick);
      var igUrl = ig ? ("https://instagram.com/" + encodeURIComponent(ig)) : "";
      if (!igUrl) {
        showToast("Нет Instagram-ника в карточке");
        return;
      }
      var p = openModal(
        '<div class="modal-title">Сообщение клиенту</div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:8px;">@' + escapeHtml(ig) +
          " — скопировать и открыть Instagram</div>" +
        '<div class="card" style="white-space:pre-wrap;font-size:13px;line-height:1.4;max-height:45vh;overflow:auto;">' +
          escapeHtml(text) +
        "</div>" +
        '<div class="modal-actions" style="margin-top:10px;">' +
          '<button type="button" class="btn-action btn-green" id="subMsgCopyOpen" style="width:100%;">Копировать и открыть Instagram</button>' +
        "</div>"
      );
      setTimeout(function () {
        var both = document.getElementById("subMsgCopyOpen");
        if (!both) return;
        both.onclick = async function () {
          var ok = await copyText(text);
          showToast(ok ? "Скопировано — вставь в Direct" : "Не скопировалось");
          try {
            if (typeof openExternalLink === "function") openExternalLink(igUrl);
            else if (window.Telegram && Telegram.WebApp && typeof Telegram.WebApp.openLink === "function") {
              Telegram.WebApp.openLink(igUrl, { try_instant_view: false });
            } else {
              window.open(igUrl, "_blank");
            }
          } catch (eO) {
            try { location.href = igUrl; } catch (e2) {}
          }
          closeModal(true);
        };
      }, 0);
      await p;
      recoverUiFocus();
    }
    window.openSubDetailClientMessage_ = openSubDetailClientMessage_;
    window.buildSubDetailClientMessageText_ = buildSubDetailClientMessageText_;

    async function moveSubDetailTo(toSheet) {
      var nick = (document.getElementById("subDetailNick").value || document.getElementById("subDetailLabel").value || "").trim();
      var label = (document.getElementById("subDetailLabel").value || nick || "").trim();
      var subId = (document.getElementById("subDetailSubId").value || "").trim();
      var fromSheet = (document.getElementById("subDetailSheet").value || "").trim() || subsSegment || "ПП";
      if (!nick && !subId) {
        showToast("Нет ника");
        return;
      }
      var ok = await uiConfirmAsync(
        toSheet === "АФК"
          ? ("Перенести «" + (label || nick || subId) + "» в АФК?")
          : ("Вернуть «" + (label || nick || subId) + "» в ПП?")
      );
      if (!ok) return;
      try {
        showToast("Переношу…");
        var res = await apiGet({
          action: "moveSubscription",
          nick: label || nick,
          subId: subId,
          fromSheet: fromSheet,
          toSheet: toSheet,
          sheet: fromSheet,
          _: String(Date.now())
        }, { timeoutMs: 30000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          var msg = (res && res.message) || "ошибка";
          if (msg === "unknown_action") {
            await uiAlertAsync("Нужен Deploy Code.gs (moveSubscription)");
            return;
          }
          showToast("Не перенеслось: " + msg);
          return;
        }
        try { apiCacheBustMem_(); } catch (eClr) {}

        setSubsSegment(toSheet, { skipLoad: true });
        window._subsListFull = [{
          nick: res.nick || nick,
          label: res.label || label || nick,
          subId: res.subId || subId,
          deliveries: res.deliveries || 0,
          status: res.statusText || "",
          wishes: res.wishes || "",
          sheet: toSheet
        }];
        window._subsListCache = window._subsListFull.slice();
        window._subsSkipNextEnterLoad = true;
        switchTab("subsScreen");
        renderSubsList();
        showToast("Готово → " + toSheet + (res.surveysMoved ? (" · опросников: " + res.surveysMoved) : ""));
        await loadSubscriptions();
      } catch (e) {
        showToast(e.message || "Ошибка");
      }
    }
    window.moveSubDetailTo = moveSubDetailTo;

    async function deleteSubDetail() {
      var nick = (document.getElementById("subDetailNick").value || document.getElementById("subDetailLabel").value || "").trim();
      var label = (document.getElementById("subDetailLabel").value || nick || "").trim();
      var subId = (document.getElementById("subDetailSubId").value || "").trim();
      var sheet = (document.getElementById("subDetailSheet").value || "").trim() || subsSegment || "ПП";
      if (!nick && !subId) {
        showToast("Нет ника");
        return;
      }
      var ok = await uiConfirmAsync("Удалить «" + (label || nick || subId) + "» из " + sheet + "?\nСтрока в CRM будет удалена.");
      if (!ok) return;
      try {
        showToast("Удаляю…");
        var res = await apiGet({
          action: "deleteSubscription",
          nick: label || nick,
          subId: subId,
          sheet: sheet,
          segment: sheet,
          _: String(Date.now())
        }, { timeoutMs: 35000, cacheTtlMs: 0 });
        if (!res || res.status !== "success" || !(res.deletedCount > 0 || res.deletedRow)) {

          if (nick && nick !== label) {
            res = await apiGet({
              action: "deleteSubscription",
              nick: nick,
              subId: subId,
              sheet: sheet,
              segment: sheet,
              _: String(Date.now()) + "_2"
            }, { timeoutMs: 35000, cacheTtlMs: 0 });
          }
        }
        if (!res || res.status !== "success" || !(res.deletedCount > 0 || res.deletedRow)) {
          var msg = (res && res.message) || "ошибка";
          if (msg === "unknown_action") {
            await uiAlertAsync("Нужен Deploy Code.gs (deleteSubscription)");
            return;
          }
          await uiAlertAsync("Не удалилось: " + msg + "\nDeploy Code.gs v7.11.23");
          return;
        }
        try { apiCacheBustMem_(); } catch (eClr) {}
        showToast("Удалено" + (res.deletedCount > 1 ? (" (" + res.deletedCount + ")") : ""));
        switchTab("subsScreen");
        await loadSubscriptions();
      } catch (e) {
        showToast(e.message || "Ошибка");
      }
    }
    window.deleteSubDetail = deleteSubDetail;

    function closeSubDetail() {
      currentSubDetail = null;
      subDetailBasket = [];
      subDetailDeepOpen = false;
      subDetailPacksManual = false;
      toggleSubDetailDeepEditor_(false);
      switchTab("subsScreen");
    }
    window.closeSubDetail = closeSubDetail;

    async function saveSubDetail() {
      var nick = (document.getElementById("subDetailNick").value || "").trim();
      var label = (document.getElementById("subDetailLabel").value || "").trim();
      var sheet = (document.getElementById("subDetailSheet").value || "").trim() || "ПП";
      if (!nick && !label) {
        showToast("Нет ника");
        return;
      }
      if (sheet === "БП") syncBpBasketFromTab_();
      var basketPayload = subDetailBasketPayload_();
      var wantFp = basketFingerprint_(basketPayload);
      var ppStatusSave = (document.getElementById("subDetailStatus").value || "").trim();
      if (sheet === "БП") {
        var stageSel = document.getElementById("subDetailStatusSelect");
        ppStatusSave = normalizeBpStage_(stageSel ? stageSel.value : ppStatusSave);
        if (stageSel) stageSel.value = ppStatusSave;
        document.getElementById("subDetailStatus").value = ppStatusSave;
        var d2pre = document.getElementById("subDetailSurveyBp2");
        var dfpre = document.getElementById("subDetailSurveyFinal");
        if (ppStatusSave === "ФИНАЛ") {
          if (dfpre && !dfpre.value) dfpre.value = ymdPlusDaysLocal_("", 4);
        } else {
          if (d2pre && !d2pre.value) d2pre.value = ymdPlusDaysLocal_("", 4);
        }
      }
      try {
        showToast("Сохраняю…");
        if (sheet === "ПП") {
          try { await recalcSubDetailFactCost_(); } catch (eRec) {}
        }
        var wishesSave = (document.getElementById("subDetailWishes").value || "").trim();
        wishesSave = stampDogIntoWishes_(wishesSave, readSubDetailDogFields_());
        if (sheet === "ПП") {
          wishesSave = stampPpCoefIntoWishes_(wishesSave, subDetailCoefValue_());
          var schSave = subDetailSchemeValue_();
          // не вешаем [SCHEME:LEGACY] на старые карточки без тега — только RAW26 или уже был тег
          if (schSave === "RAW26" || parsePpSchemeFromWishes_((currentSubDetail && currentSubDetail.wishes) || "")) {
            wishesSave = stampPpSchemeIntoWishes_(wishesSave, schSave);
          }
          var wEl = document.getElementById("subDetailWishes");
          if (wEl) wEl.value = stripDogFromWishes_(stripPpMetaFromWishes_(wishesSave));
        }
        var dogSave = readSubDetailDogFields_();
        var statedSave = "";
        if (sheet === "ПП") {
          var stEl = document.getElementById("subDetailStatedPrice");
          statedSave = stEl ? String(stEl.value || "").trim() : "";
        }
        var saveBody = {
          action: "saveSubscription",
          nick: nick || label,
          label: label || nick,
          subId: (document.getElementById("subDetailSubId").value || "").trim(),
          sheet: sheet,
          segment: sheet,
          deliveries: document.getElementById("subDetailDeliveries").value || "",
          ppStatus: ppStatusSave,
          wishes: wishesSave,
          address: (document.getElementById("subDetailAddress").value || "").trim(),
          phone: (document.getElementById("subDetailPhone").value || "").trim(),
          note: wishesSave,

          factCost: sheet === "ПП" ? statedSave : (document.getElementById("subDetailFact").value || ""),
          statedCost: sheet === "ПП" ? statedSave : "",
          calcFactCost: sheet === "ПП" ? (document.getElementById("subDetailFact").value || "") : "",
          basket: basketPayload,
          coef: sheet === "ПП" ? String(subDetailCoefValue_()) : "",
          scheme: sheet === "ПП" ? subDetailSchemeValue_() : "",
          dogName: dogSave.name,
          dogBreed: dogSave.breed,
          dogWeight: dogSave.weight,
          packCounts: sheet === "ПП" ? {
            u1: subDetailPackCounts.u1 || 0,
            u2: subDetailPackCounts.u2 || 0,
            u3: subDetailPackCounts.u3 || 0,
            up4: subDetailPackCounts.up4 || 0
          } : null
        };
        if (sheet === "БП") {
          var d2s = document.getElementById("subDetailSurveyBp2");
          var dfs = document.getElementById("subDetailSurveyFinal");
          saveBody.surveyBp2Due = d2s ? d2s.value : "";
          saveBody.surveyFinalDue = dfs ? dfs.value : "";
          var own = ownerFromSelect_("subDetailOwner");
          saveBody.ownerTelegramId = own.telegramId;
          saveBody.ownerName = own.name;
          saveBody.basketBp1 = subDetailBasketBp1;
          saveBody.basketBp2 = subDetailBasketBp2;
        }
        if (sheet === "ПП" && window._enrollFromBp) {
          saveBody.fromBp = "1";
          saveBody.fromBpCard = "1";
          saveBody.recordBpConversion = "1";
        }
        var postRes = await apiPost(saveBody);
        if (!postRes || postRes.status !== "success") {
          showToast(
            postRes && postRes.message === "sandbox_no_write"
              ? "Не LIVE — лист ПП не меняется. Открой с cutover=1"
              : ((postRes && postRes.message) || "ошибка записи")
          );
          return;
        }
        try { apiCacheBustMem_(); } catch (eClr) {}

        var missedSave = (postRes && postRes.missed) || [];
        var ok = false;
        var last = null;
        for (var attempt = 0; attempt < 4; attempt++) {
          await new Promise(function (r) { setTimeout(r, attempt === 0 ? 400 : 700); });
          try {
            last = await apiGet({
              action: "getSubscription",
              nick: nick || label,
              subId: (document.getElementById("subDetailSubId").value || "").trim(),
              segment: sheet,
              sheet: sheet,
              force: "1",
              _: String(Date.now())
            }, { timeoutMs: 22000, cacheTtlMs: 0 });
          } catch (eG) { last = null; }
          if (last && last.status === "success") {
            if (basketsMatchAfterSave_(basketPayload, last.basket || [])) { ok = true; break; }
            var wishNeedle = String(wishesSave || "").replace(/\s+/g, " ").trim().slice(0, 16);
            if (wishNeedle && String(last.wishes || "").indexOf(wishNeedle.slice(0, 12)) >= 0) {
              ok = true; break;
            }
            if ((last.basket || []).length > 0 && (basketPayload || []).length > 0) {
              var wantNames = {};
              (basketPayload || []).forEach(function (it) {
                var p = basketItemKeyParts_(it);
                if (p.name) wantNames[p.name] = true;
              });
              var hit = 0;
              (last.basket || []).forEach(function (it) {
                var p = basketItemKeyParts_(it);
                if (wantNames[p.name]) hit++;
              });
              if (hit > 0 && hit >= Math.min(2, (basketPayload || []).length)) {
                ok = true; break;
              }
            }
          }
          if (last && last.message === "sandbox_no_write") {
            showToast("Не LIVE — в лист ПП не пишет. Открой с cutover=1");
            return;
          }
        }
        if (last && last.status === "success" && (last.basket || []).length) {
          subDetailBasket = mapApiBasketToLocal(last.basket);
        } else {
          subDetailBasket = mapApiBasketToLocal(basketPayload);
        }
        renderSubDetailBasket();
        try { if (sheet === "ПП") recalcSubDetailFactCost_(); } catch (eRec2) {}
        if (missedSave.length) {
          var missNames = missedSave.map(function (m) {
            return String((m && (m.main || m.name)) || "?").slice(0, 24);
          }).join(", ");
          showToast("Сохранено, без колонки в листе: " + missNames + " (в XTRA)");
        } else {
          showToast("Сохранено в лист " + sheet + " (" + subDetailBasket.length + " поз.)");
        }
      } catch (e) {
        showToast(e.message || "Ошибка");
      }
    }
    window.saveSubDetail = saveSubDetail;

    async function migrateSubDetailToRaw26_() {
      var nick = (document.getElementById("subDetailNick").value || "").trim();
      var label = (document.getElementById("subDetailLabel").value || "").trim();
      var subId = (document.getElementById("subDetailSubId").value || "").trim();
      var sheet = (document.getElementById("subDetailSheet").value || "").trim();
      if (sheet !== "ПП") {
        showToast("Только для ПП");
        return;
      }
      if (!nick && !label && !subId) {
        showToast("Нет ника");
        return;
      }
      var ok = await uiConfirmAsync(
        "Перевести на схему сырьё×2.6 + recover + 9×N?\n\n" +
        "Указанная цена на карточке пересчитается.\n" +
        "Уже стоящие доставки в календаре не меняются."
      );
      if (!ok) return;
      try {
        showToast("Перевожу…");
        var tid = "";
        try { tid = myTelegramId || readTelegramIdFromTg() || loadStoredTelegramId() || ""; } catch (eT) {}
        var res = await apiGet({
          action: "migratePpToRaw26Scheme",
          nick: nick || label,
          subId: subId,
          telegramId: tid,
          applyStated: "1",
          _: String(Date.now())
        }, { timeoutMs: 28000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast((res && res.message) || "Не удалось — нужен Deploy Code.gs");
          return;
        }
        if (currentSubDetail) {
          currentSubDetail.ppScheme = "RAW26";
          currentSubDetail.scheme = "RAW26";
          currentSubDetail.wishes = stampPpSchemeIntoWishes_(
            stampPpCoefIntoWishes_(stripPpMetaFromWishes_(currentSubDetail.wishes || ""), PP_RAW26_COEF_DEFAULT),
            "RAW26"
          );
        }
        var coefEl = document.getElementById("subDetailCoef");
        if (coefEl) coefEl.value = String(res.coef || PP_RAW26_COEF_DEFAULT);
        if (res.factCost != null) {
          setSubDetailStatedPrice_(res.factCost);
          applySubDetailFact_(res.factCost, "новая схема · " + res.factCost + " BYN");
        }
        syncSubDetailSchemeUi_();
        _subDetailCostCache = { fp: "", cost: null, packagesByn: 0 };
        try { await recalcSubDetailFactCost_(); } catch (eR) {}
        showToast("Переведено · " + (res.factCost != null ? res.factCost + " BYN" : "ок"));
      } catch (e) {
        showToast("Ошибка сети / Deploy Code.gs");
      }
    }
    window.migrateSubDetailToRaw26_ = migrateSubDetailToRaw26_;

    async function openSubDetailInOrder() {
      var nick = (document.getElementById("subDetailNick").value || document.getElementById("subDetailLabel").value || "").trim();
      if (!nick) return;
      await openSubInOrder(nick);
    }
    window.openSubDetailInOrder = openSubDetailInOrder;

    async function openSubInOrder(nick) {
      try {
        setOrderType("pp");
        document.getElementById("client").value = nick;
        var day = (document.getElementById("day") && document.getElementById("day").value) || "";
        var date = (document.getElementById("deliveryDate") && document.getElementById("deliveryDate").value) || "";
        var res = await apiGet({ action: "getPpOrderSuggest", nick: nick, day: day, date: date });
        if (res && res.address) fillAddressFieldsFromStored_(res.address);
        if (res && (res.wishes || res.note)) loadOrderNotesFromRaw([res.wishes, res.note].filter(Boolean).join(" "));
        basket = mapApiBasketToLocal((res && res.proposedBasket) || []);
        renderBasket();
        switchTab("orderScreen");
        try { refreshPpFactPrice(); } catch (e0) {}
        showToast((res && res.hint) || "Состав загружен в заказ");
      } catch (e) {
        showToast("Не удалось открыть подписку");
      }
    }
    window.openSubInOrder = openSubInOrder;

    var priceLastMessage = "";
    var pricePpApiCache = null;
    var priceLiveTimer = null;

    /** ПП: LEGACY сырьё×coef+11+6N · RAW26 сырьё×coef+recover+9N (с 2026-08-31 для новых) */
    var PRICE_PP_FIXED_BYN = 11;
    var PRICE_PP_DELIVERY_PER = 6;
    var PRICE_PP_COEF_DEFAULT = 2.3;
    var pricePpScheme = "LEGACY";

    var PRICE_PACK_UNIT = { small: 0.34, medium: 0.56, large: 0.80, legs: 1.40 };
    var pricePackCounts = { small: 0, medium: 0, large: 0, legs: 0 };
    var pricePacksManual = false;

    function priceBasketFingerprint(list) {
      return (list || []).map(function (it) {
        return [
          it.dog || 1,
          it.cat || "",
          it.main || it.name || "",
          it.sub || "",
          it.val != null ? it.val : it.value
        ].join("|");
      }).join(";");
    }

    function getPricePpCoef() {
      var el = document.getElementById("pricePpCoef");
      var def = pricePpScheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PRICE_PP_COEF_DEFAULT;
      var v = el ? Number(el.value) : def;
      if (!isFinite(v) || v <= 0) v = def;
      return v;
    }

    function syncPricePpSchemeDefaults_() {
      pricePpScheme = defaultPpSchemeForNewLocal_();
      var hint = document.getElementById("pricePpSchemeHint");
      if (hint) {
        hint.textContent = pricePpScheme === "RAW26"
          ? "· новые: сырьё×2.6 + recover + 9×N"
          : "· пока старая схема (с " + PP_SCHEME_CUTOFF_YMD + " — новая)";
      }
      var cEl = document.getElementById("pricePpCoef");
      if (cEl && !cEl.dataset.manual) {
        cEl.value = String(pricePpScheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PRICE_PP_COEF_DEFAULT);
      }
      PRICE_PP_FIXED_BYN = pricePpScheme === "RAW26" ? 0 : 11;
      PRICE_PP_DELIVERY_PER = pricePpScheme === "RAW26" ? PP_RAW26_DELIVERY_PER : PP_LEGACY_DELIVERY_PER;
      PRICE_PP_COEF_DEFAULT = pricePpScheme === "RAW26" ? PP_RAW26_COEF_DEFAULT : PP_LEGACY_COEF_DEFAULT;
    }

    function updatePricePackModeHint_() {
      var hint = document.getElementById("pricePackModeHint");
      if (hint) hint.textContent = pricePacksManual ? "· вручную" : "· авто из состава";
      var btn = document.getElementById("btnPricePacksAuto");
      if (btn) btn.style.opacity = pricePacksManual ? "1" : "0.55";
    }

    function renderPricePackCounters() {
      var map = {
        small: "pricePackSmall",
        medium: "pricePackMedium",
        large: "pricePackLarge",
        legs: "pricePackLegs"
      };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k]);
        if (el) el.textContent = String(pricePackCounts[k] || 0);
      });
      var tot = calcPricePacksByn();
      var lab = document.getElementById("pricePackTotalLabel");
      if (lab) lab.textContent = "(" + (Math.round(tot * 100) / 100) + " BYN)";
      updatePricePackModeHint_();
    }

    function syncPricePacksFromBasket_(opts) {
      opts = opts || {};
      if (priceMode !== "pp") return;
      if (pricePacksManual && !opts.force) return;
      var list = [];
      try { list = allPriceItems(); } catch (eL) { list = []; }
      var pc = packCountsFromBasketLocal_(list);
      pricePackCounts = {
        small: pc.small || 0,
        medium: pc.medium || 0,
        large: pc.large || 0,
        legs: pc.legs || 0
      };
      if (opts.force) pricePacksManual = false;
      renderPricePackCounters();
    }

    function resetPricePacksAuto_() {
      pricePacksManual = false;
      syncPricePacksFromBasket_({ force: true });
      schedulePriceLiveUpdate();
      showToast("Пакеты пересчитаны из состава");
    }
    window.resetPricePacksAuto_ = resetPricePacksAuto_;

    function bumpPricePack(kind, delta) {
      if (!pricePackCounts.hasOwnProperty(kind)) return;
      var next = (Number(pricePackCounts[kind]) || 0) + (Number(delta) || 0);
      if (next < 0) next = 0;
      if (next > 99) next = 99;
      pricePackCounts[kind] = next;
      pricePacksManual = true;
      renderPricePackCounters();
      schedulePriceLiveUpdate();
    }
    window.bumpPricePack = bumpPricePack;

    function calcPricePacksByn() {
      var sum = 0;
      Object.keys(PRICE_PACK_UNIT).forEach(function (k) {
        sum += (Number(pricePackCounts[k]) || 0) * (Number(PRICE_PACK_UNIT[k]) || 0);
      });
      return Math.round(sum * 100) / 100;
    }

    function pricePacksSummary() {
      var parts = [];
      if (pricePackCounts.small) parts.push("мал×" + pricePackCounts.small);
      if (pricePackCounts.medium) parts.push("ср×" + pricePackCounts.medium);
      if (pricePackCounts.large) parts.push("бол×" + pricePackCounts.large);
      if (pricePackCounts.legs) parts.push("ножк×" + pricePackCounts.legs);
      return parts.join(" ");
    }

    function schedulePriceLiveUpdate() {
      clearTimeout(priceLiveTimer);
      priceLiveTimer = setTimeout(function () {
        refreshPriceLive();
      }, 120);
    }
    window.schedulePriceLiveUpdate = schedulePriceLiveUpdate;

    function refreshPriceLive() {
      var list = allPriceItems();
      if (!list.length) return;
      if (priceMode === "retail") {
        calcPriceFromBasket({ silent: true });
        return;
      }
      syncPricePacksFromBasket_();
      var nEl = document.getElementById("priceDeliveriesN");
      var deliveriesN = Math.max(1, Number(nEl && nEl.value) || 1);
      syncPricePpSchemeDefaults_();
      var fp = priceBasketFingerprint(list) + "|N" + deliveriesN + "|S" + pricePpScheme;
      if (pricePpApiCache && pricePpApiCache.fingerprint === fp && pricePpApiCache.res) {
        renderPpResultFromApi(pricePpApiCache.res, list, null);
        return;
      }
      calcPriceFromBasket({ silent: true });
    }
    window.refreshPriceLive = refreshPriceLive;

    function renderPpResultFromApi(res, list, retailCached) {
      var nEl = document.getElementById("priceDeliveriesN");
      var deliveriesN = Math.max(1, Number(nEl && nEl.value) || 1);
      syncPricePpSchemeDefaults_();
      var coef = getPricePpCoef();
      var packagesByn = calcPricePacksByn();
      var packHint = pricePacksSummary();
      var noteEl = document.getElementById("priceClientNote");
      var clientNote = noteEl ? noteEl.value : "";
      var retail = retailCached || calcRetailBasketTotal(list, { deliveriesN: deliveriesN });

      if (!retailCached || Number(retail.deliveriesN) !== deliveriesN || retail.goods == null) {
        retail = calcRetailBasketTotal(list, { deliveriesN: deliveriesN });
      }
      var costSum = recalcPpCostSum(res, list);
      var fracMark = calcDressuraFractionMarkup(list, getPriceFracRates());
      var subTotal;
      var formulaHint;
      if (pricePpScheme === "RAW26") {
        var recover = recoverBynFromBasketLocal_(list);
        var deliveryByn = PP_RAW26_DELIVERY_PER * deliveriesN;
        subTotal = costSum * coef + recover + deliveryByn + packagesByn + fracMark.total;
        formulaHint = "сырьё " + costSum + " × " + coef +
          " + recover " + recover +
          " + 9×" + deliveriesN + "(" + deliveryByn + ")" +
          (packagesByn ? (" + пакеты " + packagesByn + (packHint ? " [" + packHint + "]" : "")) : "") +
          (fracMark.total ? (" + фракции " + fracMark.total) : "");
      } else {
        var deliveryL = PP_LEGACY_DELIVERY_PER * deliveriesN;
        subTotal = costSum * coef + PP_LEGACY_FIXED + deliveryL + packagesByn + fracMark.total;
        formulaHint = "себест. " + costSum + " × " + coef +
          " + " + PP_LEGACY_FIXED +
          " + 6×" + deliveriesN + "(" + deliveryL + ")" +
          (packagesByn ? (" + пакеты " + packagesByn + (packHint ? " [" + packHint + "]" : "")) : "") +
          (fracMark.total ? (" + фракции " + fracMark.total) : "");
      }
      var msg = composePpClientMessage(list, deliveriesN, clientNote, retail.total, subTotal);
      if (Number(costSum) > 0 || !(list || []).length) {
        pricePpApiCache = {
          fingerprint: priceBasketFingerprint(list) + "|N" + deliveriesN + "|S" + pricePpScheme,
          res: res,
          retail: retail
        };
      } else {
        pricePpApiCache = null;
      }
      var dogsHint = priceDogCount >= 2 ? " · 2 собаки, свет/доставка×1" : "";
      var retailHint = "товар " + roundRub(retail.goods) +
        (retail.delivery
          ? (" + дост. " + retail.deliveryTimes + "×" + (retail.deliveryFee || 5) +
            " (доля " + roundRub(retail.perDelivery) + "<" + (retail.freeFrom || 50) + ")")
          : " · дост. 0 (доля ≥" + (retail.freeFrom || 50) + ")") +
        " = <b>" + roundRub(retail.total) + " BYN</b>";
      renderPriceMessageBox(msg,
        '<div class="card" style="margin-bottom:8px;font-size:13px;"><b>ПП</b>' +
        (pricePpScheme === "RAW26" ? " · новая" : " · старая") + dogsHint + '<br>' +
        formulaHint +
        " → <b>" + roundRub(subTotal) + " BYN/мес</b>" +
        (fracMark.details.length
          ? ('<div class="muted" style="margin-top:4px;font-size:12px;">' +
            escapeHtml(fracMark.details.join("; ")) + "</div>")
          : "") +
        "<br>розница " + retailHint + "</div>");
      return {
        pp: res, retail: retail, subTotal: subTotal, coef: coef,
        costSum: costSum, fracMark: fracMark, packagesByn: packagesByn,
        scheme: pricePpScheme, message: msg
      };
    }

    function getPriceFracRates() {
      function num(id, def) {
        var el = document.getElementById(id);
        var v = el ? Number(el.value) : def;
        return isFinite(v) ? v : def;
      }
      return {
        whole: num("priceFracWhole", 0),
        large: num("priceFracLarge", 1),
        medium: num("priceFracMedium", 2),
        small: num("priceFracSmall", 3)
      };
    }

    function dressuraFractionSizeKey(sub) {
      var fu = String(sub || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (!fu) return "";
      if (/^ЦЕЛ/.test(fu)) return "whole";
      if (/^БОЛЬ|^КРУП|^БОЛ\b/.test(fu) || fu === "БОЛ") return "large";
      if (/^СРЕД/.test(fu)) return "medium";
      if (/^МЕЛК|^МАЛ/.test(fu) && !/ОЧ/.test(fu)) return "small";
      if (/КУБИК/.test(fu) && /МЕЛК/.test(fu)) return "small";
      if (/КУБИК/.test(fu) && /КРУП/.test(fu)) return "large";
      return "";
    }

    function calcDressuraFractionMarkup(list, rates) {
      var r = rates || getPriceFracRates();
      var sum = 0;
      var details = [];
      (list || []).forEach(function (it) {
        if ((it.cat || "") !== "dressura") return;
        var main = it.main || it.name || "";
        var sub = it.sub || "";
        var size = dressuraFractionSizeKey(sub);
        if (!size) return;
        var rate = r[size];
        if (!isFinite(rate)) rate = 0;
        var grams = Number(it.val != null ? it.val : it.value) || 0;
        if (grams <= 0) return;
        var add = (grams / 100) * rate;
        sum += add;
        if (add !== 0) {
          details.push(prettyProductName(main) + " " + (humanFraction(main, sub) || sub) +
            ": " + grams + "г → +" + (Math.round(add * 100) / 100));
        }
      });
      return { total: Math.round(sum * 100) / 100, details: details };
    }

    function recalcPpCostSum(res, list) {
      var meta = {};
      (list || []).forEach(function (it) {
        var n = String(it.name || it.main || "").trim();
        var s = String(it.sub || "").trim();
        meta[n + "|" + s] = it;
        meta[n] = it;
      });
      var sum = 0;
      var used = false;
      (res && res.lines ? res.lines : []).forEach(function (L) {
        var it = meta[L.name + "|" + (L.sub || "")] || meta[L.name] || {};
        var cat = it.cat || "";
        var piece = L.piece === true ||
          cat === "chew" || cat === "chews" ||
          /шт/i.test(String(L.name || "")) ||
          unitForItem(cat, L.name) === "шт";
        var unit = Number(L.unitPrice != null ? L.unitPrice : L.per100) || 0;
        var val = Number(L.val) || 0;
        sum += piece ? (unit * val) : ((val / 100) * unit);
        used = true;
      });
      if (used) return Math.round(sum * 100) / 100;
      return Number(res && res.cost) || 0;
    }

    function prettyProductName(name) {
      var s = String(name || "").trim().replace(/\s+/g, " ");
      if (!s) return "";
      var u = s.toUpperCase();
      var special = {
        "ЛЁГКОЕ": "Лёгкое",
        "ЛЕГКОЕ": "Лёгкое",
        "БАРАНЬЕ ЛЁГКОЕ": "Баранье лёгкое",
        "БАРАНЬЕ ЛЕГКОЕ": "Баранье лёгкое",
        "РУБЕЦ Т": "Рубец Т",
        "БЫЧИЙ КОРЕНЬ": "Бычий корень",
        "СТАНОВАЯ ЖИЛА": "Становая жила",
        "УХО Г": "Ухо Г",
        "НОСЫ ШТ.": "Носы",
        "КОЛЕНИ ШТ.": "Колени",
        "КОПЫТО ШТ.": "Копыто",
        "ПЕРЕПЁЛКИ ШТ.": "Перепёлки",
        "ПЕРЕПЕЛКИ ШТ.": "Перепёлки",
        "ЛОП ХРЯЩ ШТ.": "Лоп. хрящ",
        "УТИНЫЕ ШЕИ ШТ.": "Утиные шеи",
        "ГУБЫ ШТ.": "Губы",
        "СВЕТЛЫЙ РУБЕЦ": "Светлый рубец",
        "МЯСНЫЕ ЛОМТИКИ": "Мясные ломтики",
        "ПИКАЛЬНОЕ МЯСО": "Пикальное мясо",
        "БАРАНЬЯ ПЕЧЕНЬ": "Баранья печень",
        "КРОШКА РУБЕЦ": "Крошка рубец",
        "КРОШКА ЛЁГКОГО": "Крошка лёгкого",
        "КРОШКА ЛЕГКОГО": "Крошка лёгкого",
        "КРОШКА ПОЧЕК": "Крошка почек",
        "КРОШКА СЕРДЦА": "Крошка сердца",
        "КРОШКА МИКС": "Крошка микс"
      };
      if (special[u]) return special[u];
      var clean = s.replace(/\s*шт\.?$/i, "").trim();
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }

    function humanFraction(main, sub) {
      var f = String(sub || "").trim();
      if (!f) return "";
      var m = String(main || "").toUpperCase();
      var fu = f.toUpperCase().replace(/\s+/g, " ");
      if (/Л[ЁЕ]ГК/.test(m) && /^МЕЛК/.test(fu)) return "мелкий кубик";
      if (fu === "ПЛАСТ") return "пластинки";
      if (/ПОЛОВИН/.test(fu)) return "половинки";
      if (/ПАЛК/.test(fu)) return "палочки";
      if (/^ОЧ/.test(fu) || fu === "ОЧ МАЛ") return "очень маленькие";
      if (fu === "МАЛ" || fu === "ОЧ МАЛ") return "маленькие";
      if (fu === "СРЕД") return "средние";
      if (fu === "БОЛ") return "большие";
      if (fu === "ОГР") return "огромные";
      if (/^МЕЛК/.test(fu)) return "мелкое";
      if (/^СРЕД/.test(fu)) return "среднее";
      if (/^БОЛЬ|^КРУП/.test(fu)) return "крупное";
      if (/^ЦЕЛ/.test(fu)) return "целое";
      if (/ОБЫЧН/.test(fu)) return "";
      return f.toLowerCase();
    }

    function priceUnitLabel(cat, main) {
      return unitForItem(cat, main) === "шт" ? "шт" : "г";
    }

    function formatPriceCompositionLine(it) {
      var main = it.main || it.name || "";
      var sub = it.sub || "";
      var val = it.val != null ? it.val : it.value;
      var unit = priceUnitLabel(it.cat, main);
      var frac = humanFraction(main, sub);
      var line = prettyProductName(main) + " - " + (Number(val) || 0) + " " + unit;
      if (frac) line += " (" + frac + ")";
      return line;
    }

    function buildPriceCompositionBlocks(list) {
      var order = ["dressura", "chew", "other", "powder", "veg"];
      var titles = {
        dressura: "Дрессура",
        chew: "Жевалки",
        other: "Другое",
        powder: "Присыпки",
        veg: "Овощи/фрукты"
      };
      var byCat = {};
      (list || []).forEach(function (it) {
        var c = it.cat || "other";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(it);
      });
      var parts = [];
      order.forEach(function (c) {
        if (!byCat[c] || !byCat[c].length) return;
        parts.push(titles[c] + " :\n\n" + byCat[c].map(formatPriceCompositionLine).join("\n"));
      });
      Object.keys(byCat).forEach(function (c) {
        if (order.indexOf(c) >= 0) return;
        parts.push((catalog[c] && catalog[c].title ? catalog[c].title : c) + " :\n\n" +
          byCat[c].map(formatPriceCompositionLine).join("\n"));
      });
      return parts.join("\n\n");
    }

    function buildPriceCompositionForMessage(list) {
      var items = list || [];
      if (priceDogCount < 2) return buildPriceCompositionBlocks(items);
      var d1 = items.filter(function (it) { return Number(it.dog) !== 2; });
      var d2 = items.filter(function (it) { return Number(it.dog) === 2; });
      var parts = [];
      if (d1.length) parts.push(priceDogLabel_(1) + ":\n\n" + buildPriceCompositionBlocks(d1));
      if (d2.length) parts.push(priceDogLabel_(2) + ":\n\n" + buildPriceCompositionBlocks(d2));
      return parts.join("\n\n");
    }

    function roundRub(n) {
      return Math.round(Number(n) || 0);
    }

    function composePpClientMessage(list, deliveriesN, clientNote, retailTotal, subTotal) {
      var n = Math.max(1, Number(deliveriesN) || 1);
      var blocks = buildPriceCompositionForMessage(list);
      var note = String(clientNote || "").trim();
      var msg = "Ваш состав на месяц получается\n\n" + blocks +
        "\n\nКоличество доставок в месяц - " + n;
      if (note) msg += "\n\n" + note;
      msg += "\n\nЦена за этот состав в розницу выходит - " + roundRub(retailTotal) + " рублей";
      msg += "\n\nВ подписке с учётом доставок, поддержки 24/7 и партнёрской программы со скидками для наших клиентов\n" +
        "стоимость выходит - " + roundRub(subTotal) + " рублей за месяц";
      msg += "\n\nКак вам наше предложение?)\nГотовы продолжать😁";
      return msg;
    }

    function composeRetailClientMessage(list, retailTotal, clientNote) {
      var blocks = buildPriceCompositionForMessage(list);
      var note = String(clientNote || "").trim();
      var msg = "Давайте подытожим ваш заказ 📜\n\n" + blocks;
      if (note) msg += "\n\n" + note;
      msg += "\n\nЦена за этот набор составит - " + roundRub(retailTotal) + " рублей";
      msg += "\n\nВсё подходит?)";
      return msg;
    }

    function renderPriceMessageBox(text, metaHtml) {
      priceLastMessage = text || "";
      var box = document.getElementById("priceResult");
      if (!box) return;
      box.innerHTML =
        (metaHtml || "") +
        '<div class="card" style="white-space:pre-wrap;font-size:14px;line-height:1.45;">' +
        escapeHtml(text) + "</div>" +
        '<button type="button" class="btn-action btn-blue" style="margin-top:8px;" onclick="copyPriceMessage()">Копировать сообщение</button>';
    }

    async function copyPriceMessage() {
      if (!priceLastMessage) { showToast("Сначала собери сообщение"); return; }
      var ok = await copyText(priceLastMessage);
      showToast(ok ? "Скопировано" : "Не удалось скопировать");
    }
    window.copyPriceMessage = copyPriceMessage;

    function priceModeKey(mode) {
      return (mode === "retail") ? "retail" : "pp";
    }

    function stashPriceModeState(mode) {
      stashPriceActiveBasket();
      var key = priceModeKey(mode != null ? mode : priceMode);
      if (!priceByMode[key]) priceByMode[key] = makeEmptyPriceModeStore();
      var s = priceByMode[key];
      s.baskets = {
        1: priceBaskets[1] || [],
        2: priceBaskets[2] || []
      };
      s.dogCount = priceDogCount;
      s.activeDog = priceActiveDog;
      s.dogNames = {
        1: String((priceDogNames && priceDogNames[1]) || ""),
        2: String((priceDogNames && priceDogNames[2]) || "")
      };
      s.lastMessage = priceLastMessage || "";
      s.apiCache = pricePpApiCache;
      s.packCounts = {
        small: pricePackCounts.small || 0,
        medium: pricePackCounts.medium || 0,
        large: pricePackCounts.large || 0,
        legs: pricePackCounts.legs || 0
      };
      s.packsManual = !!pricePacksManual;
      var noteEl = document.getElementById("priceClientNote");
      s.note = noteEl ? String(noteEl.value || "") : (s.note || "");
    }

    function loadPriceModeState(mode) {
      var key = priceModeKey(mode);
      if (!priceByMode[key]) priceByMode[key] = makeEmptyPriceModeStore();
      var s = priceByMode[key];
      priceBaskets = {
        1: (s.baskets && s.baskets[1]) ? s.baskets[1] : [],
        2: (s.baskets && s.baskets[2]) ? s.baskets[2] : []
      };
      s.baskets = priceBaskets;
      priceDogCount = s.dogCount === 2 ? 2 : 1;
      priceActiveDog = (priceDogCount >= 2 && s.activeDog === 2) ? 2 : 1;
      priceDogNames = {
        1: String((s.dogNames && s.dogNames[1]) || ""),
        2: String((s.dogNames && s.dogNames[2]) || "")
      };
      priceLastMessage = s.lastMessage || "";
      pricePpApiCache = s.apiCache || null;
      pricePacksManual = !!s.packsManual;
      pricePackCounts = s.packCounts || { small: 0, medium: 0, large: 0, legs: 0 };
      if (!pricePackCounts.small && pricePackCounts.small !== 0) {
        pricePackCounts = { small: 0, medium: 0, large: 0, legs: 0 };
      }
      var noteEl = document.getElementById("priceClientNote");
      if (noteEl) noteEl.value = s.note || "";
      loadPriceActiveBasket();
      if (mode !== "retail" && !pricePacksManual) {
        try { syncPricePacksFromBasket_({ force: true }); } catch (eSync) {}
      } else {
        try { renderPricePackCounters(); } catch (e0) {}
      }
      updatePriceDogUi();
    }

    function setPriceMode(mode) {
      if (mode === "bp") mode = "pp";
      if (mode !== "retail") mode = "pp";
      if (mode === priceMode) {

      } else {
        stashPriceModeState(priceMode);
        priceMode = mode;
        loadPriceModeState(mode);
      }
      var pp = document.getElementById("priceModePp");
      var bp = document.getElementById("priceModeBp");
      var ret = document.getElementById("priceModeRet");
      var extras = document.getElementById("pricePpExtras");
      if (pp) pp.classList.toggle("active", mode === "pp" || mode === "subscription");
      if (bp) bp.style.display = "none";
      if (ret) ret.classList.toggle("active", mode === "retail");
      if (extras) extras.style.display = mode === "retail" ? "none" : "";
      if (mode !== "retail") {
        try { syncPricePpSchemeDefaults_(); } catch (eSchP) {}
      }
      var toPpBtn = document.getElementById("btnPriceToPp");
      if (toPpBtn && !window._enrollDeferredId && !window._enrollDirect) {
        toPpBtn.style.display = mode === "retail" ? "none" : "";
      }
      try { renderPriceBasket(); } catch (e) {}
      if (priceLastMessage) {

        var box = document.getElementById("priceResult");
        if (box && allPriceItems().length) {
          refreshPriceLive();
        } else if (box) {
          box.innerHTML =
            '<div class="card" style="white-space:pre-wrap;font-size:14px;line-height:1.45;">' +
            escapeHtml(priceLastMessage) + "</div>" +
            '<button type="button" class="btn-action btn-blue" style="margin-top:8px;" onclick="copyPriceMessage()">Копировать сообщение</button>';
        }
      } else if (allPriceItems().length) {
        refreshPriceLive();
      } else {
        var emptyBox = document.getElementById("priceResult");
        if (emptyBox) emptyBox.innerHTML = '<p class="muted">Набери состав и нажми «Собрать сообщение»</p>';
      }
    }
    window.setPriceMode = setPriceMode;

    async function fetchPpCalcPrice_(slim, extra) {
      extra = extra || {};
      var mode = extra.mode || "pp";
      var res = null;
      try {
        res = await apiPost({
          action: "calcPrice",
          mode: mode,
          basket: slim
        });
      } catch (eP) { res = null; }
      var ok = res && res.status === "success" && !res.empty;
      if (!ok) {
        try {
          res = await apiGet({
            action: "calcPrice",
            mode: mode,
            basket: JSON.stringify(slim || []),
            _: String(Date.now())
          }, { timeoutMs: extra.timeoutMs || 25000, cacheTtlMs: 0 });
        } catch (eG) { res = null; }
      }
      if (!res || res.status !== "success" || res.empty) return null;
      var hasCost = (Number(res.cost) || Number(res.rawCost) || 0) > 0 ||
        (res.lines && res.lines.length);
      if (!hasCost && (slim || []).length) return null;
      return res;
    }

    async function calcPriceFromBasket(opts) {
      opts = opts || {};
      var silent = !!opts.silent;
      stashPriceActiveBasket();
      var list = allPriceItems();
      var box = document.getElementById("priceResult");
      if (!list.length) {
        if (box) box.innerHTML = '<p class="muted">Состав пуст — добавь позиции</p>';
        if (!silent) showToast("Сначала набери состав");
        return null;
      }
      var noteEl = document.getElementById("priceClientNote");
      var clientNote = noteEl ? noteEl.value : "";
      if (priceMode === "retail") {
        var local = calcRetailBasketTotal(list, { deliveriesN: 1 });
        var rMsg = composeRetailClientMessage(list, local.total, clientNote);
        var miss = (local.lines || []).filter(function (L) { return !L.found; }).length;
        renderPriceMessageBox(rMsg,
          '<div class="card" style="margin-bottom:8px;"><b>Розница</b> · товар ' +
          roundRub(local.goods) +
          (local.delivery ? (" + дост. " + local.delivery) : "") +
          " = <b>" + roundRub(local.total) + " BYN</b>" +
          (priceDogCount >= 2
            ? (" · " + priceDogLabel_(1) + ( (priceBaskets[2] || []).length ? (" + " + priceDogLabel_(2)) : "") )
            : "") +
          (miss ? ' · <span style="color:#ff9f0a;">без прайса: ' + miss + "</span>" : "") +
          "</div>");
        return local;
      }
      try {
        var slim = list.map(function (it) {
          return {
            name: it.name || it.main || "",
            main: it.main || it.name || "",
            sub: it.sub || "",
            val: it.val != null ? it.val : it.value,
            cat: it.cat || ""
          };
        });
        var nElPp = document.getElementById("priceDeliveriesN");
        var nPp = Math.max(1, Number(nElPp && nElPp.value) || 1);
        syncPricePacksFromBasket_();
        var retail = calcRetailBasketTotal(list, { deliveriesN: nPp });
        var res = await fetchPpCalcPrice_(slim);
        if (!res) {
          if (box) box.innerHTML = '<p class="muted">Ошибка расчёта подписки — себест не пришла. Нажми «Собрать сообщение» ещё раз.</p>';
          return null;
        }
        return renderPpResultFromApi(res, list, retail);
      } catch (e) {
        if (box) box.innerHTML = '<p class="muted">Ошибка сети</p>';
        return null;
      }
    }
    window.calcPriceFromBasket = calcPriceFromBasket;

    function canUseTasksMenu() {
      if (APP_ROLE === "manager" || APP_ROLE === "owner" || APP_ROLE === "all" || APP_ROLE === "courier" || APP_ROLE === "logistics") return true;
      // cutover / кэш роли ещё не подтянулся — не прячем ☰
      if (window.__BOINYA_C_CUTOVER__) return true;
      if ((deferredCache && deferredCache.length) || deferredOpenCount > 0) return true;
      return false;
    }

    function updateTasksBadge() {
      var btn = document.getElementById("tasksMenuBtn");
      var badge = document.getElementById("tasksBadge");
      if (!btn) return;
      if (canUseTasksMenu()) btn.classList.add("show");
      else btn.classList.remove("show");
      var n = Number(deferredOpenCount) || 0;

      if (badge) {
        if (n > 0 && canUseTasksMenu()) {
          badge.hidden = false;
          badge.textContent = n > 99 ? "99+" : String(n);
        } else {
          badge.hidden = true;
        }
      }
      var title = document.getElementById("tasksSectionPpTitle");
      if (title) title.classList.toggle("has-open", n > 0);
    }

    function updateDeferredPill() { updateTasksBadge(); }

    function closeTasksDrawer() {
      var ov = document.getElementById("tasksDrawerOverlay");
      var dr = document.getElementById("tasksDrawer");
      if (ov) {
        ov.classList.remove("open");
        ov.style.display = "none";
        ov.style.pointerEvents = "none";
      }
      if (dr) {
        dr.classList.remove("open");
        dr.setAttribute("aria-hidden", "true");
      }
      try { document.body.classList.remove("tasks-open"); } catch (eBody) {}
    }
    window.closeTasksDrawer = closeTasksDrawer;

    function deferredItemMode_(it) {
      var m = String((it && it.mode) || "").trim().toLowerCase();
      if (m) return m;
      m = String((it && it.payload && it.payload.mode) || "").trim().toLowerCase();
      if (m) return m;
      var title = String((it && it.title) || "");
      if (/^перенос/i.test(title)) return "transfer";
      return "pp";
    }

    function pickBestTasksTab_(xferN, buyN, orderN, ppN, remindN) {
      var counts = {
        xfer: Number(xferN) || 0,
        buy: Number(buyN) || 0,
        orders: Number(orderN) || 0,
        remind: Number(remindN) || 0,
        pp: Number(ppN) || 0
      };
      if (counts.xfer > 0) return "xfer";
      if (counts[_tasksTab] > 0) return _tasksTab;
      var prefer = ["xfer", "buy", "orders", "remind", "pp"];
      for (var i = 0; i < prefer.length; i++) {
        if (counts[prefer[i]] > 0) return prefer[i];
      }
      return _tasksTab || "xfer";
    }

    var _tasksAutoPickOnOpen = false;
    var _tasksTab = "xfer";

    function openTasksDrawer() {
      if (!canUseTasksMenu()) return;
      _tasksAutoPickOnOpen = true;
      var ov = document.getElementById("tasksDrawerOverlay");
      var dr = document.getElementById("tasksDrawer");
      if (ov) {
        ov.style.display = "block";
        ov.style.pointerEvents = "auto";
        ov.classList.add("open");
      }
      if (dr) {
        dr.classList.add("open");
        dr.setAttribute("aria-hidden", "false");
      }
      try { document.body.classList.add("tasks-open"); } catch (eBody2) {}
      try { loadReminderPeople_(); } catch (ePeop) {}
      renderTasksDrawer(false);
      // всегда force при открытии — подтянуть/восстановить transfer после D1/GAS рассинхрона
      try { deferredCacheAt = 0; } catch (eStale) {}
      renderTasksDrawer(true);

      setTimeout(function () {
        try {
          loadBpIdleIntoDeferred_().then(function () {
            try { renderTasksDrawer(false); updateTasksBadge(); } catch (eR) {}
          });
        } catch (eBp) {}
      }, 50);
    }
    window.openTasksDrawer = openTasksDrawer;

    function toggleTasksDrawer() {
      var dr = document.getElementById("tasksDrawer");
      if (dr && dr.classList.contains("open")) closeTasksDrawer();
      else openTasksDrawer();
    }
    window.toggleTasksDrawer = toggleTasksDrawer;

    async function refreshDeferredBadge(force) {
      var tid = myTelegramId || readTelegramIdFromTg() || loadStoredTelegramId();
      if (tid) storeTelegramId(tid);
      if (!tid) {
        // не затираем кэш — иначе ☰ «пустеет» при кратком отсутствии tid
        try {
          deferredOpenCount = (deferredCache || []).filter(function (it) {
            return String(it.status || "open").toLowerCase() === "open";
          }).length;
        } catch (eKeep) {}
        updateTasksBadge();
        return;
      }
      if (!force && deferredCacheAt && (Date.now() - deferredCacheAt) < 12000 && deferredCache.length) {
          deferredOpenCount = deferredCache.filter(function (it) {
            return String(it.status || "open").toLowerCase() === "open";
          }).length;
        updateTasksBadge();
        return;
      }
      if (deferredFetchInFlight) return deferredFetchInFlight;
      deferredFetchInFlight = (async function () {
        try {
          var res = await apiGet({
            action: "listDeferred",
            telegramId: tid,
            status: "open",
            light: "1",
            force: force ? "1" : undefined,
            _: force ? String(Date.now()) : undefined
          }, { timeoutMs: 12000, cacheTtlMs: force ? 0 : 15000, retries: force ? 1 : 0 });
          if (res && Array.isArray(res.items)) {
            deferredCache = res.items;
            deferredCacheAt = Date.now();
          }

          if (force) {
            try { await loadBpIdleIntoDeferred_(); } catch (eBpIdle) {}
          }
          deferredOpenCount = deferredCache.filter(function (it) {
            return String(it.status || "open").toLowerCase() === "open";
          }).length;
          updateTasksBadge();
        } catch (e) {

        } finally {
          deferredFetchInFlight = null;
        }
      })();
      return deferredFetchInFlight;
    }
    window.refreshDeferredBadge = refreshDeferredBadge;

    function openDeferredScreen() {
      openTasksDrawer();
    }
    window.openDeferredScreen = openDeferredScreen;

    function buildPriceDeferredSnapshot() {
      stashPriceModeState(priceMode);
      var key = priceModeKey(priceMode);
      var s = priceByMode[key] || makeEmptyPriceModeStore();
      var list = allPriceItems();
      var subHint = null;
      try {
        if (priceMode === "pp" && pricePpApiCache && pricePpApiCache.res) {
          var costSum = recalcPpCostSum(pricePpApiCache.res, list);
          var coef = getPricePpCoef();
          var nEl = document.getElementById("priceDeliveriesN");
          var deliveriesN = Math.max(1, Number(nEl && nEl.value) || Number(s.deliveriesN) || 1);
          var packagesByn = calcPricePacksByn();
          var fracMark = calcDressuraFractionMarkup(list, getPriceFracRates());
          subHint = costSum * coef + PRICE_PP_FIXED_BYN + PRICE_PP_DELIVERY_PER * deliveriesN +
            packagesByn + fracMark.total;
        } else if (priceMode === "retail") {
          subHint = calcRetailBasketTotal(list, { deliveriesN: 1 }).total;
        }
      } catch (eH) {}
      var nSnap = Number((document.getElementById("priceDeliveriesN") || {}).value) || 1;
      return {
        mode: priceMode,
        baskets: JSON.parse(JSON.stringify(s.baskets || { 1: [], 2: [] })),
        dogCount: s.dogCount || 1,
        activeDog: s.activeDog || 1,
        packCounts: Object.assign({}, s.packCounts || pricePackCounts),
        note: s.note || "",
        lastMessage: s.lastMessage || priceLastMessage || "",
        deliveriesN: nSnap,
        coef: getPricePpCoef(),
        fracRates: getPriceFracRates(),
        subTotal: subHint,
        retailTotal: calcRetailBasketTotal(list, {
          deliveriesN: priceMode === "pp" ? nSnap : 1
        }).total
      };
    }

    async function saveCurrentCalcToDeferred() {
      var tid = await ensureTelegramId();
      if (!tid) return;
      stashPriceActiveBasket();
      if (!allPriceItems().length) { showToast("Сначала набери состав"); return; }
      if (!priceLastMessage) {
        await calcPriceFromBasket({ silent: true });
      }
      var nick = await uiPromptAsync("Ник клиента (можно пусто)", "");
      if (nick === null) return;
      nick = String(nick || "").trim();
      var whenOrNone = await pickRemindWhenAsync_({ allowNone: true });
      if (whenOrNone === undefined) return; // отмена
      var payload = buildPriceDeferredSnapshot();
      var title = (priceMode === "retail" ? "Розница" : "ПП") +
        (nick ? (" · " + nick) : "") +
        (payload.subTotal != null ? (" · " + roundRub(payload.subTotal) + " BYN") : "");
      var id = String(window._editingDeferredId || ("def_" + Date.now().toString(36)));
      var remindAtMs = whenOrNone ? whenOrNone.getTime() : 0;
      var remindAt = whenOrNone ? toUtcIso_(whenOrNone) : "";
      if (whenOrNone) {
        payload.remindAtMs = remindAtMs;
        payload.remindAt = remindAt;
        payload.remindSent = false;
        payload.targetTelegramId = tid;
        payload.forTelegramId = tid;
        payload.createdBy = tid;
      }
      var body = {
        action: "saveDeferred",
        telegramId: tid,
        id: id,
        mode: priceMode,
        title: title,
        clientNick: nick,
        payload: payload,
        _: String(Date.now())
      };
      if (remindAtMs) {
        body.remindAtMs = String(remindAtMs);
        body.remindAt = remindAt;
      }
      try {
        var res = null;
        var payloadStr = JSON.stringify(payload);
        if (payloadStr.length < 1400) {
          body.payload = payloadStr;
          res = await apiGet(body, { timeoutMs: 25000, cacheTtlMs: 0 });
        } else {
          await apiPost({
            action: "saveDeferred",
            telegramId: tid,
            id: id,
            mode: priceMode,
            title: title,
            clientNick: nick,
            payload: payload,
            remindAtMs: remindAtMs || "",
            remindAt: remindAt || ""
          });
          res = { status: "success", id: id };
          if (remindAtMs) {
            try {
              await apiGet({
                action: "setDeferredReminder",
                telegramId: tid,
                id: id,
                remindAtMs: String(remindAtMs),
                remindAt: remindAt,
                _: String(Date.now())
              }, { timeoutMs: 20000, cacheTtlMs: 0 });
            } catch (eRem) {}
          }
        }
        if (!res || (res.status !== "success" && res.status !== "sent" && res.status !== "sent_opaque")) {
          var why = (res && (res.message || res.status)) || "нет ответа";
          if (why === "unknown_action") why = "нужен Deploy Code.gs (saveDeferred)";
          showToast("Не сохранилось: " + why);
          return;
        }
        window._editingDeferredId = "";
        deferredCacheAt = 0;
        try { apiCacheBustDeferred_(); } catch (eClr) {}
        showToast(whenOrNone
          ? ("В задачах · напомню " + formatDeferredRemindAt_(remindAtMs))
          : "В задачах (☰)");
        await refreshDeferredBadge(true);
        try { setTasksTab("pp"); } catch (eTab) {}
        var dr = document.getElementById("tasksDrawer");
        if (dr && dr.classList.contains("open")) renderTasksDrawer(false);
      } catch (e) {
        showToast("Не удалось сохранить");
      }
    }
    window.saveCurrentCalcToDeferred = saveCurrentCalcToDeferred;

    function buildOrderDeferredSnapshot_() {
      try { syncOrderBasketFromActive_(); } catch (eSync) {}
      var coupons = {};
      try { coupons = readPartnerCouponsPayload_() || {}; } catch (eC) {}
      var slot = {};
      try { slot = currentPpSlotPayload_() || {}; } catch (eS) {}
      return {
        mode: "order",
        orderType: orderType,
        client: String((document.getElementById("client") || {}).value || "").trim(),
        phone: String((document.getElementById("phoneInput") || {}).value || "").trim(),
        address: String((document.getElementById("addressInput") || {}).value || "").trim(),
        entrance: String((document.getElementById("entranceInput") || {}).value || "").trim(),
        floor: String((document.getElementById("floorInput") || {}).value || "").trim(),
        flat: String((document.getElementById("flatInput") || {}).value || "").trim(),
        deliveryDate: String((document.getElementById("deliveryDate") || {}).value || "").trim(),
        deliveryAfter: String((document.getElementById("deliveryAfterInput") || {}).value || "").trim(),
        deliveryBefore: String((document.getElementById("deliveryBeforeInput") || {}).value || "").trim(),
        day: String((document.getElementById("day") || {}).value || "").trim(),
        orderPrice: String((document.getElementById("orderPriceInput") || {}).value || "").trim(),
        ppPartner: String((document.getElementById("ppPartnerSelect") || {}).value || "").trim(),
        noteRaw: serializeOrderNotes(orderNotes),
        notes: JSON.parse(JSON.stringify(orderNotes || [])),
        baskets: JSON.parse(JSON.stringify(orderBaskets || { 1: [], 2: [] })),
        dogCount: orderDogCount >= 2 ? 2 : 1,
        activeDog: orderActiveDog === 2 ? 2 : 1,
        deliveryMethod: selectedDeliveryMethod || null,
        postOffice: String((document.getElementById("postOfficeInput") || {}).value || "").trim(),
        geo: selectedAddressGeo ? {
          lat: selectedAddressGeo.lat,
          lon: selectedAddressGeo.lon,
          yandexUrl: selectedAddressGeo.yandexUrl || ""
        } : null,
        retailPaidDelivery: !!retailPaidDelivery,
        partnerCouponsEnabled: !!partnerCouponsEnabled,
        couponsQty: coupons.couponsQty || 0,
        couponPrice: coupons.couponPrice || 0,
        deliverySlot: slot.deliverySlot || "",
        ppSlot: slot.ppSlot || "",
        ppDeliverySlotManual: ppDeliverySlotManual,
        igPaste: String((document.getElementById("igChecklistPaste") || {}).value || ""),
        isEdit: String((document.getElementById("isEditMode") || {}).value || "") === "true",
        editOriginalClient: editOriginalClient || "",
        editOriginalDay: editOriginalDay || "",
        editOriginalMatchKey: editOriginalMatchKey || ""
      };
    }

    function applyOrderDeferredSnapshot_(payload) {
      if (!payload) return;
      resetOrderScreen();
      try { setOrderType(payload.orderType || "pp"); } catch (eT) {}
      var setVal = function (id, v) {
        var el = document.getElementById(id);
        if (el && v != null) el.value = v;
      };
      setVal("client", payload.client || "");
      setVal("phoneInput", payload.phone || "");
      setVal("addressInput", payload.address || "");
      setVal("entranceInput", payload.entrance || "");
      setVal("floorInput", payload.floor || "");
      setVal("flatInput", payload.flat || "");
      setVal("deliveryDate", payload.deliveryDate || "");
      setVal("deliveryAfterInput", payload.deliveryAfter || "");
      setVal("deliveryBeforeInput", payload.deliveryBefore || "");
      setVal("day", payload.day || "");
      setVal("orderPriceInput", payload.orderPrice || "");
      setVal("igChecklistPaste", payload.igPaste || "");
      if (payload.ppPartner) {
        try {
          var sel = document.getElementById("ppPartnerSelect");
          if (sel) sel.value = payload.ppPartner;
        } catch (eP) {}
      }
      if (payload.notes && payload.notes.length) {
        orderNotes = JSON.parse(JSON.stringify(payload.notes));
        try { renderOrderNotes(); updateNotesSummary(); } catch (eN) {}
      } else if (payload.noteRaw) {
        try { loadOrderNotesFromRaw(payload.noteRaw); } catch (eNr) {}
      }
      orderDogCount = payload.dogCount === 2 ? 2 : 1;
      orderActiveDog = payload.activeDog === 2 ? 2 : 1;
      orderBaskets = {
        1: (payload.baskets && payload.baskets["1"]) ? payload.baskets["1"].slice() : [],
        2: (payload.baskets && payload.baskets["2"]) ? payload.baskets["2"].slice() : []
      };
      try { setOrderDogCount(orderDogCount); } catch (eD) {}
      try { setOrderActiveDog(orderActiveDog); } catch (eA) {}
      try { loadOrderBasketToActive_(); renderBasket(); } catch (eB) {}
      if (payload.geo && payload.geo.lat != null) {
        selectedAddressGeo = {
          lat: payload.geo.lat,
          lon: payload.geo.lon,
          yandexUrl: payload.geo.yandexUrl || ""
        };
        setAddressPickedHint(true);
      }
      if (payload.deliveryMethod) {
        selectedDeliveryMethod = payload.deliveryMethod;
        var dmg = document.getElementById("deliveryMethodGroup");
        if (dmg) dmg.style.display = "block";
        try { setOrderFoldOpen_("details", true); } catch (eF) {}
        try { setDeliveryMethod(payload.deliveryMethod); } catch (eDm) {}
      }
      setVal("postOfficeInput", payload.postOffice || "");
      try { setRetailPaidDelivery(!!payload.retailPaidDelivery); } catch (eRd) {}
      try { setPartnerCouponsEnabled(!!payload.partnerCouponsEnabled); } catch (ePc) {}
      if (payload.partnerCouponsEnabled) {
        setVal("couponsQtyInput", payload.couponsQty || "");
        setVal("couponPriceInput", payload.couponPrice || "");
      }
      if (payload.ppDeliverySlotManual === 1 || payload.ppDeliverySlotManual === 2) {
        try { setPpDeliverySlot(payload.ppDeliverySlotManual); } catch (eSl) {}
      }
      if (payload.isEdit) {
        document.getElementById("isEditMode").value = "true";
        editOriginalClient = payload.editOriginalClient || payload.client || "";
        editOriginalDay = payload.editOriginalDay || payload.day || "";
        editOriginalMatchKey = payload.editOriginalMatchKey || "";
        var saveBtn = document.getElementById("btnMainSave");
        if (saveBtn) saveBtn.innerText = "Обновить заказ";
      }
      var needDetails = !!(payload.entrance || payload.floor || payload.flat || payload.deliveryMethod || payload.postOffice);
      var needMore = !!(payload.noteRaw || (payload.notes && payload.notes.some(function (n) { return String(n.text || "").trim(); })) || payload.igPaste);
      try {
        if (needDetails) setOrderFoldOpen_("details", true);
        if (needMore) setOrderFoldOpen_("more", true);
      } catch (eFold) {}
    }

    async function saveOrderToDeferred() {
      var tid = await ensureTelegramId();
      if (!tid) return;
      try { syncOrderBasketFromActive_(); } catch (e0) {}
      var nick = String((document.getElementById("client") || {}).value || "").trim();
      var hasBasket = false;
      try { hasBasket = !!(buildOrderSaveBasket_() || []).length; } catch (eB) {}
      if (!nick && !hasBasket) {
        showToast("Укажи ник или корзину");
        return;
      }
      var whenOrNone = await pickRemindWhenAsync_({ allowNone: true });
      if (whenOrNone === undefined) return; // отмена
      var payload = buildOrderDeferredSnapshot_();
      var typeLab = ({ pp: "ПП", bp: "БП", retail: "Р", partner: "Партнёр" })[orderType] || "Заказ";
      var title = "Заказ · " + typeLab + (nick ? (" · " + nick) : "") +
        (payload.deliveryDate ? (" · " + payload.deliveryDate) : "");
      var id = String(window._orderDeferredId || ("ord_" + Date.now().toString(36)));
      var remindAtMs = whenOrNone ? whenOrNone.getTime() : 0;
      var remindAt = whenOrNone ? toUtcIso_(whenOrNone) : "";
      if (whenOrNone) {
        payload.remindAtMs = remindAtMs;
        payload.remindAt = remindAt;
        payload.remindSent = false;
        payload.targetTelegramId = tid;
        payload.forTelegramId = tid;
        payload.createdBy = tid;
      }
      var payloadStr = JSON.stringify(payload);
      try {
        var res = null;
        var params = {
          action: "saveDeferred",
          telegramId: tid,
          id: id,
          mode: "order",
          title: title,
          clientNick: nick,
          _: String(Date.now())
        };
        if (remindAtMs) {
          params.remindAtMs = String(remindAtMs);
          params.remindAt = remindAt;
        }
        if (payloadStr.length < 1400) {
          params.payload = payloadStr;
          res = await apiGet(params, { timeoutMs: 25000, cacheTtlMs: 0 });
        } else {
          await apiPost({
            action: "saveDeferred",
            telegramId: tid,
            id: id,
            mode: "order",
            title: title,
            clientNick: nick,
            payload: payload,
            remindAtMs: remindAtMs || "",
            remindAt: remindAt || ""
          });
          res = { status: "success", id: id };
          if (remindAtMs) {
            try {
              await apiGet({
                action: "setDeferredReminder",
                telegramId: tid,
                id: id,
                remindAtMs: String(remindAtMs),
                remindAt: remindAt,
                _: String(Date.now())
              }, { timeoutMs: 20000, cacheTtlMs: 0 });
            } catch (eRem) {}
          }
        }
        if (!res || (res.status !== "success" && res.status !== "sent" && res.status !== "sent_opaque")) {
          var why = (res && (res.message || res.status)) || "нет ответа";
          if (why === "unknown_action") why = "нужен Deploy Code.gs (saveDeferred order)";
          showToast("Не сохранилось: " + why);
          return;
        }
        window._orderDeferredId = (res && res.id) || id;
        deferredCacheAt = 0;
        try { apiCacheBustDeferred_(); } catch (eClr) {}
        showToast(whenOrNone
          ? ("В задачах · напомню " + formatDeferredRemindAt_(remindAtMs))
          : "В задачах · Заказы");
        await refreshDeferredBadge(true);
        try { setTasksTab("orders"); } catch (eTab) {}
        var dr = document.getElementById("tasksDrawer");
        if (dr && dr.classList.contains("open")) renderTasksDrawer(false);
      } catch (e) {
        showToast("Не удалось отложить");
      }
    }
    window.saveOrderToDeferred = saveOrderToDeferred;

    async function resumeOrderDeferred_(id) {
      var it = findDeferredCached(id);
      if (!it || !it.payload) { showToast("Нет данных"); return; }
      applyOrderDeferredSnapshot_(it.payload);
      window._orderDeferredId = id;
      closeTasksDrawer();
      switchTab("orderScreen");
      showToast("Черновик открыт — допиши и сохрани");
    }
    window.resumeOrderDeferred_ = resumeOrderDeferred_;

    function formatDeferredRemindAt_(isoOrMs) {
      try {
        var d = null;
        if (typeof isoOrMs === "number" && isFinite(isoOrMs)) d = new Date(isoOrMs);
        else if (isoOrMs) d = new Date(isoOrMs);
        if (!d || isNaN(d.getTime())) return isoOrMs ? String(isoOrMs).slice(0, 16) : "";
        return d.toLocaleString("ru-RU", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
        });
      } catch (e) { return ""; }
    }

    function deferredRemindAtOf_(it) {
      if (!it) return "";
      var ms = Number(it.remindAtMs || (it.payload && it.payload.remindAtMs) || 0);
      if (ms > 0) return ms;
      if (it.remindAt) return String(it.remindAt);
      if (it.payload && it.payload.remindAt) return String(it.payload.remindAt);
      return "";
    }

    function toUtcIso_(d) {
      return new Date(d.getTime()).toISOString();
    }

    function isDeferredRemindMode_(it) {
      return String((it && it.mode) || "").toLowerCase() === "remind";
    }

    function pickRemindWhenAsync_(opts) {
      opts = opts || {};
      var allowNone = !!opts.allowNone;
      return (async function () {
        var buttons = [];
        if (allowNone) {
          buttons.push({ label: "Без напоминания", value: "none", cls: "" });
        }
        buttons.push(
          { label: "Через 1 час", value: "1h", cls: "btn-blue" },
          { label: "Через 3 часа", value: "3h", cls: "btn-blue" },
          { label: "Завтра в 10:00", value: "tomorrow10", cls: "btn-blue" },
          { label: "Указать дату и время…", value: "custom", cls: "btn-orange" }
        );
        var choice = await uiChoiceAsync(
          "Когда напомнить?",
          allowNone
            ? "Задача будет в ☰. Напоминание — по желанию, в TG в выбранное время."
            : "Время по твоим часам. Другим в других поясах придёт в тот же момент.",
          buttons
        );
        if (choice == null) return undefined; // отмена всего действия
        if (choice === "none") return null; // без напоминания
        var when = null;
        if (choice === "custom") {
          var picked = await uiDatetimeAsync(
            "Когда напомнить",
            "Дата и время по часам телефона."
          );
          if (!picked) return undefined;
          when = new Date(picked);
        } else if (choice === "1h") {
          when = new Date(Date.now() + 60 * 60 * 1000);
        } else if (choice === "3h") {
          when = new Date(Date.now() + 3 * 60 * 60 * 1000);
        } else if (choice === "tomorrow10") {
          when = new Date();
          when.setDate(when.getDate() + 1);
          when.setHours(10, 0, 0, 0);
        }
        if (!when || isNaN(when.getTime())) {
          showToast("Неверное время");
          return undefined;
        }
        if (when.getTime() < Date.now() - 30000) {
          showToast("Время уже прошло");
          return undefined;
        }
        return when;
      })();
    }

    async function uiDatetimeAsync(title, message, defLocal) {
      var def = defLocal || "";
      if (!def) {
        var d0 = new Date(Date.now() + 60 * 60 * 1000);
        d0.setSeconds(0, 0);
        function p(n) { return (n < 10 ? "0" : "") + n; }
        def = d0.getFullYear() + "-" + p(d0.getMonth() + 1) + "-" + p(d0.getDate()) +
          "T" + p(d0.getHours()) + ":" + p(d0.getMinutes());
      }
      var pModal = openModal(
        '<div class="modal-title">' + escapeHtml(title || "Когда") + "</div>" +
        '<div class="modal-text">' + escapeHtml(String(message || "")) + "</div>" +
        '<div class="form-group" style="margin-top:10px;">' +
        '<input type="datetime-local" id="modalDtInput" value="' + escapeHtml(def) + '" style="width:100%;">' +
        "</div>" +
        '<div class="modal-actions row">' +
          '<button class="btn-action" type="button" id="modalCancel" style="background:#3a3a3c;">Отмена</button>' +
          '<button class="btn-action btn-blue" type="button" id="modalOk">OK</button>' +
        "</div>"
      );
      setTimeout(function () {
        var inp = document.getElementById("modalDtInput");
        var ok = document.getElementById("modalOk");
        var cancel = document.getElementById("modalCancel");
        if (ok) ok.onclick = function () {
          closeModal(inp ? inp.value : null);
        };
        if (cancel) cancel.onclick = function () { closeModal(null); };
      }, 0);
      var res = await pModal;
      recoverUiFocus();
      return res;
    }

    function renderTasksOrderCards(items) {
      var html;
      if (!items.length) {
        html = '<p class="muted">Заявки партнёров и «На потом» появятся здесь.</p>';
      } else {
        html = items.map(function (it) {
          var safeId = String(it.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          var when = it.at ? String(it.at).slice(0, 19) : "";
          var pl = it.payload || {};
          var isPartner = String(it.mode || pl.mode || "").toLowerCase() === "partner" ||
            String(pl.orderType || "") === "partner";
          if (isPartner) {
            var lines = (pl.basket || []).map(function (b) {
              return escapeHtml(b.name || b.id) + " × " + escapeHtml(String(b.qty)) +
                (b.unit && b.unit !== "г" ? (" " + escapeHtml(b.unit)) : "");
            }).join("<br>");
            var eta = [pl.deliverDateLabel, pl.deliverTimeLabel].filter(Boolean).join(", ");
            var st = String(pl.orderStatus || "new").toLowerCase();
            var stRu = st === "in_transit" ? "в пути" : (st === "delivered" ? "доставлено" : "принят");
            var poId = String(pl.partnerOrderId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            return '<div class="tasks-item is-hot" style="border:1px solid rgba(245,154,46,0.45);">' +
              '<div><b>🛍 ' + escapeHtml(it.title || pl.locationName || "Партнёр") + '</b>' +
              '<div class="muted" style="font-size:12px;margin-top:4px;">' +
              escapeHtml(stRu) +
              (pl.partnerName || pl.partnerUsername ? (" · " + escapeHtml(pl.partnerName || ("@" + pl.partnerUsername))) : "") +
              (eta ? (" · " + escapeHtml(eta)) : "") +
              "</div>" +
              (lines ? ('<div class="muted" style="white-space:normal;font-size:12px;margin-top:8px;">' + lines + "</div>") : "") +
              "</div>" +
              '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
              (st !== "in_transit" && st !== "delivered"
                ? '<button type="button" class="seg-btn" style="background:#64d2ff;border-color:#64d2ff;color:#111;" onclick="partnerMarkInTransit_(\'' + safeId + '\',\'' + poId + '\')">В пути</button>'
                : "") +
              (st !== "delivered"
                ? '<button type="button" class="seg-btn" style="background:#30d158;border-color:#30d158;color:#111;" onclick="partnerMarkDelivered_(\'' + safeId + '\',\'' + poId + '\')">Доставлено</button>'
                : "") +
              '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Скрыть</button>' +
              "</div></div>";
          }
          var typeLab = ({ pp: "ПП", bp: "БП", retail: "Р", partner: "Партнёр" })[pl.orderType || ""] || "Заказ";
          var dateLab = pl.deliveryDate || "";
          var itemsN = 0;
          try {
            var b1 = (pl.baskets && pl.baskets["1"]) || [];
            var b2 = (pl.baskets && pl.baskets["2"]) || [];
            itemsN = b1.length + ((pl.dogCount >= 2) ? b2.length : 0);
          } catch (eN) {}
          var rem = deferredRemindAtOf_(it);
          var remTxt = rem ? formatDeferredRemindAt_(rem) : "";
          var remSent = !!(it.remindSent || (it.payload && it.payload.remindSent));
          return '<div class="tasks-item is-hot">' +
            '<div><b>' + escapeHtml(it.title || ("Заказ · " + typeLab)) + '</b>' +
            '<div class="muted" style="font-size:12px;margin-top:4px;">' +
            escapeHtml(typeLab) +
            (it.clientNick ? (" · " + escapeHtml(it.clientNick)) : "") +
            (dateLab ? (" · " + escapeHtml(dateLab)) : "") +
            (itemsN ? (" · " + itemsN + " поз.") : "") +
            (when ? (" · " + escapeHtml(when)) : "") +
            "</div>" +
            (remTxt ? ('<div style="font-size:12px;margin-top:4px;color:#ffd60a;">⏰ ' +
              escapeHtml(remTxt) + (remSent ? " · отправлено" : "") + "</div>") : "") +
            "</div>" +
            '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
            '<button type="button" class="seg-btn" style="background:#30d158;border-color:#30d158;color:#111;" onclick="resumeOrderDeferred_(\'' + safeId + '\')">Открыть</button>' +
            '<button type="button" class="seg-btn" style="background:#ffd60a;border-color:#ffd60a;color:#111;" onclick="setReminderOnDeferred_(\'' + safeId + '\')">⏰</button>' +
            '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Отменить</button>' +
            "</div></div>";
        }).join("");
      }
      var box = document.getElementById("tasksOrderList");
      if (box) box.innerHTML = html;
    }

    async function partnerSetOrderStatusUi_(deferredId, partnerOrderId, status) {
      var tid = await ensureTelegramId();
      if (!tid) {
        showToast("Нужен Telegram");
        return;
      }
      try {
        var res = await apiGet({
          action: "partnerSetOrderStatus",
          telegramId: tid,
          deferredId: deferredId || "",
          partnerOrderId: partnerOrderId || "",
          id: partnerOrderId || deferredId || "",
          orderStatus: status,
          status: status,
          _: String(Date.now())
        }, { timeoutMs: 25000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast((res && res.message) || "Не обновилось · Deploy Code.gs?");
          return;
        }
        deferredCacheAt = 0;
        try { apiCacheBustDeferred_(); } catch (eClr) {}
        showToast(status === "delivered" ? "Доставлено · партнёру ушло" : "В пути · партнёру ушло");
        await refreshDeferredBadge(true);
        var dr = document.getElementById("tasksDrawer");
        if (dr && dr.classList.contains("open")) renderTasksDrawer(false);
      } catch (e) {
        showToast("Сеть / Deploy Code.gs");
      }
    }
    async function partnerMarkInTransit_(deferredId, partnerOrderId) {
      await partnerSetOrderStatusUi_(deferredId, partnerOrderId, "in_transit");
    }
    async function partnerMarkDelivered_(deferredId, partnerOrderId) {
      await partnerSetOrderStatusUi_(deferredId, partnerOrderId, "delivered");
    }
    window.partnerMarkInTransit_ = partnerMarkInTransit_;
    window.partnerMarkDelivered_ = partnerMarkDelivered_;

    function setTasksTab(tab) {
      _tasksTab = (tab === "pp" || tab === "remind" || tab === "orders" || tab === "buy") ? tab : "xfer";
      var map = {
        xfer: { btn: "tasksTabXfer", pane: "tasksPaneXfer" },
        buy: { btn: "tasksTabBuy", pane: "tasksPaneBuy" },
        orders: { btn: "tasksTabOrders", pane: "tasksPaneOrders" },
        pp: { btn: "tasksTabPp", pane: "tasksPanePp" },
        remind: { btn: "tasksTabRemind", pane: "tasksPaneRemind" }
      };
      Object.keys(map).forEach(function (k) {
        var btn = document.getElementById(map[k].btn);
        var pane = document.getElementById(map[k].pane);
        if (btn) btn.classList.toggle("active", k === _tasksTab);
        if (pane) pane.style.display = k === _tasksTab ? "" : "none";
      });
    }
    window.setTasksTab = setTasksTab;

    function updateTasksTabCounts_(xferN, buyN, orderN, ppN, remindN) {
      function paint(id, n) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(n || 0);
        el.classList.toggle("is-hot", (n || 0) > 0);
      }
      paint("tasksCountXfer", xferN);
      paint("tasksCountBuy", buyN);
      paint("tasksCountOrders", orderN);
      paint("tasksCountPp", ppN);
      paint("tasksCountRemind", remindN);
    }

    function renderTasksBuyCards(items) {
      var box = document.getElementById("tasksBuyList");
      if (!box) return;
      if (!items.length) {
        box.innerHTML = '<p class="muted">Дефицита нет — план недели покрыт остатком F+B.</p>';
        return;
      }
      box.innerHTML = items.map(function (it) {
        var p = it.payload || {};
        var safeId = String(it.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        var unit = p.unit || "кг";
        return '<div class="tasks-item is-hot" style="border:1px solid rgba(255,69,58,0.45);background:rgba(255,69,58,0.12);">' +
          '<div><b style="color:#ff6961;">СРОЧНО · ' + escapeHtml(p.name || it.clientNick || it.title || "SKU") + '</b>' +
          '<div style="font-size:13px;margin-top:6px;">нужно <b>' + escapeHtml(String(p.needRaw != null ? p.needRaw : "—")) +
          "</b> " + escapeHtml(unit) + " · есть <b>" + escapeHtml(String(p.available != null ? p.available : "—")) +
          "</b></div>" +
          "</div>" +
          '<div class="seg-row" style="margin-top:10px;">' +
          '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Закрыть</button>' +
          "</div></div>";
      }).join("");
    }

    async function refreshWarehouseBuyTasksUi() {
      var box = document.getElementById("tasksBuyList");
      if (box) box.innerHTML = '<p class="muted">Считаю дефицит…</p>';
      try {
        await apiGet({ action: "warehousePreview", _: String(Date.now()) }, { timeoutMs: 45000, cacheTtlMs: 0 });
        await refreshDeferredBadge(true);
        await renderTasksDrawer(false);
      } catch (e) {
        if (box) box.innerHTML = '<p class="muted">Не удалось обновить</p>';
      }
    }
    window.refreshWarehouseBuyTasksUi = refreshWarehouseBuyTasksUi;

    async function composeWarehouseBuyMessageUi() {
      showToast("Собираю сообщение…");
      try {
        var dates = (typeof getWarehouseDeficitDates_ === "function") ? getWarehouseDeficitDates_() : { dateFrom: "", dateTo: "" };
        var today = warehouseTodayIso_();
        var viewPrev = window._whView || "asOf";
        var params = {
          action: "composeWarehouseBuyMessage",
          force: "1",
          asOf: viewPrev === "weekStart" ? mondayIsoFromIsoDate_(today) : today,
          _: String(Date.now())
        };
        if (dates.dateFrom) params.dateFrom = dates.dateFrom;
        if (dates.dateTo) params.dateTo = dates.dateTo;
        var res = await apiGet(params, { timeoutMs: 45000, cacheTtlMs: 0 });
        var text = (res && res.text) ? String(res.text) : "";
        if (!text) {
          showToast("Пусто");
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast("Скопировано · " + ((res && res.count) || 0) + " поз.");
          } else {
            throw new Error("no_clipboard");
          }
        } catch (eClip) {
          await uiAlertAsync(text);
        }
        try { await refreshDeferredBadge(true); renderTasksDrawer(false); } catch (eR) {}
      } catch (e) {
        showToast("Не собралось — Deploy Code.gs?");
      }
    }
    window.composeWarehouseBuyMessageUi = composeWarehouseBuyMessageUi;

    function renderTasksXferCards(items) {
      var box = document.getElementById("tasksXferList");
      if (!box) return;
      if (!items.length) {
        box.innerHTML = '<p class="muted">Нет переносов. Курьер жмёт «Не получил» — задача появится здесь.</p>';
        return;
      }
      box.innerHTML = items.map(function (it) {
        var p = it.payload || {};
        var safeId = String(it.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        var isDone = String(it.status || "open").toLowerCase() === "done" || !!(it.placed || p.placed);
        var placedDay = String(it.placedDay || p.placedDay || p.day || "").trim();
        var placedDate = String(it.placedDate || p.placedDate || p.date || "").trim();
        var basket = Array.isArray(p.basket) ? p.basket : [];
        var preview = basket.slice(0, 6).map(function (x) {
          return String(x.name || x.main || "").trim();
        }).filter(Boolean).join(", ");
        if (isDone) {
          var goDay = placedDay.replace(/'/g, "\\'");
          return '<div class="tasks-item" style="border:1px solid rgba(48,209,88,0.35);background:rgba(48,209,88,0.08);">' +
            '<div><b style="color:#30d158;">✓ ' + escapeHtml(it.title || "Перенесён") + '</b>' +
            '<div class="muted" style="font-size:12px;margin-top:4px;">' +
            escapeHtml(it.clientNick || p.client || "—") +
            (placedDay ? (" · " + escapeHtml(placedDay)) : "") +
            (placedDate ? (" · " + escapeHtml(placedDate)) : "") +
            "</div></div>" +
            (placedDay ? ('<div class="seg-row" style="margin-top:10px;">' +
              '<button type="button" class="seg-btn" style="background:#30d158;border-color:#30d158;color:#111;" onclick="goToDayFromXfer_(\'' + goDay + '\')">Открыть день</button>' +
              "</div>") : "") +
            "</div>";
        }
        return '<div class="tasks-item is-hot">' +
          '<div><b>' + escapeHtml(it.title || "Перенос") + '</b>' +
          '<div class="muted" style="font-size:12px;margin-top:4px;">' +
          escapeHtml(it.clientNick || p.client || "—") +
          (p.segment ? (" · " + escapeHtml(p.segment)) : "") +
          (p.date || p.day ? (" · " + escapeHtml(p.date || p.day)) : "") +
          "</div>" +
          (p.reason ? ('<div style="font-size:12px;margin-top:4px;color:#ff9f0a;">Причина: ' +
            escapeHtml(p.reason) + "</div>") : "") +
          (p.parked ? '<div class="muted" style="font-size:12px;margin-top:4px;">Снят с дня · ждёт новую дату</div>' : "") +
          (preview ? ('<div class="muted" style="font-size:12px;margin-top:6px;">Состав: ' +
            escapeHtml(preview) + (basket.length > 6 ? "…" : "") + "</div>") : "") +
          (p.createdByName ? ('<div class="muted" style="font-size:11px;margin-top:4px;">от ' +
            escapeHtml(p.createdByName) + "</div>") : "") +
          "</div>" +
          '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
          '<button type="button" class="seg-btn" style="background:#30d158;border-color:#30d158;color:#111;" onclick="openTransferTask_(\'' + safeId + '\')">Перенести</button>' +
          '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Закрыть</button>' +
          "</div></div>";
      }).join("");
    }

    function goToDayFromXfer_(dayName) {
      dayName = String(dayName || "").trim();
      if (!dayName) return;
      try { closeTasksDrawer(); } catch (eC) {}
      try {
        var sel = document.getElementById("viewDaySelect");
        if (sel) {
          sel.value = dayName;
          sel.dispatchEvent(new Event("change"));
        }
      } catch (eS) {}
      try { switchTab("clientsScreen"); } catch (eT) {}
      try { loadClientsForDay(); } catch (eL) {}
    }
    window.goToDayFromXfer_ = goToDayFromXfer_;

    function renderTasksPpCards(items) {
      var html;
      if (!items.length) {
        html = '<p class="muted">Нет отложенных ПП. Из Расчёта — «В отложенное».</p>';
      } else {
        html = items.map(function (it) {
          var when = it.at ? String(it.at).slice(0, 19) : "";
          var safeId = String(it.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          var isBpIdle = String(it.mode || "").toLowerCase() === "bp_idle" || String(it.id || "").indexOf("bpidle:") === 0;
          if (isBpIdle) {
            var nickIdle = String(it.nick || it.clientNick || it.label || "").replace(/ · БП2.*/, "");
            var safeNick = nickIdle.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            return '<div class="tasks-item is-hot">' +
              '<div><b>' + escapeHtml(it.title || "БП2 простой >7д") + '</b>' +
              '<div class="muted" style="font-size:12px;margin-top:4px;">' +
              escapeHtml(nickIdle || "без ника") + " · нет контакта >7 дней</div></div>" +
              '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
              '<button type="button" class="seg-btn" style="background:#ff9f0a;border-color:#ff9f0a;color:#111;" onclick="openBpIdleFromTasks_(\'' + safeNick + '\')">Открыть БП</button>' +
              '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="dismissBpIdleTask_(\'' + safeId + '\')">Скрыть</button>' +
              "</div></div>";
          }
          var preview = (it.payload && it.payload.lastMessage)
            ? String(it.payload.lastMessage).slice(0, 120)
            : "";
          var sum = (it.payload && it.payload.subTotal != null)
            ? (Math.round(Number(it.payload.subTotal) * 100) / 100 + " BYN")
            : "";
          var remPp = deferredRemindAtOf_(it);
          var remPpTxt = remPp ? formatDeferredRemindAt_(remPp) : "";
          var remPpSent = !!(it.remindSent || (it.payload && it.payload.remindSent));
          return '<div class="tasks-item is-hot">' +
            '<div><b>' + escapeHtml(it.title || "ПП") + '</b>' +
            '<div class="muted" style="font-size:12px;margin-top:4px;">' +
            (it.clientNick ? escapeHtml(it.clientNick) : "без ника") +
            (sum ? (" · " + sum) : "") +
            (when ? (" · " + escapeHtml(when)) : "") + "</div>" +
            (remPpTxt ? ('<div style="font-size:12px;margin-top:4px;color:#ffd60a;">⏰ ' +
              escapeHtml(remPpTxt) + (remPpSent ? " · отправлено" : "") + "</div>") : "") +
            "</div>" +
            (preview ? ('<div class="muted" style="white-space:pre-wrap;font-size:12px;margin-top:8px;max-height:56px;overflow:hidden;">' +
              escapeHtml(preview) + (String(it.payload.lastMessage).length > 120 ? "…" : "") + "</div>") : "") +
            '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
            '<button type="button" class="seg-btn" onclick="editDeferredItem(\'' + safeId + '\')">Править</button>' +
            '<button type="button" class="seg-btn" style="background:#30d158;border-color:#30d158;color:#111;" onclick="openDeferredEnroll(\'' + safeId + '\')">Внести</button>' +
            '<button type="button" class="seg-btn" style="background:#ffd60a;border-color:#ffd60a;color:#111;" onclick="setReminderOnDeferred_(\'' + safeId + '\')">⏰</button>' +
            '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Отменить</button>' +
            "</div></div>";
        }).join("");
      }
      var box = document.getElementById("tasksPpList");
      if (box) box.innerHTML = html;
      var screenBox = document.getElementById("deferredScreenList");
      if (screenBox) screenBox.innerHTML = html;
    }

    function renderTasksRemindCards(items) {
      var html;
      var myTid = String(myTelegramId || "").trim();
      if (!items.length) {
        html = '<p class="muted">Пока пусто. Кнопка «Напоминалка» сверху.</p>';
      } else {
        html = items.map(function (it) {
          var safeId = String(it.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          var rem = deferredRemindAtOf_(it);
          var remTxt = rem ? formatDeferredRemindAt_(rem) : "время не задано";
          var remSent = !!(it.remindSent || (it.payload && it.payload.remindSent));
          var targetId = String(it.targetTelegramId || (it.payload && (it.payload.targetTelegramId || it.payload.forTelegramId)) || "").trim();
          var targetName = String(it.targetName || (it.payload && it.payload.targetName) || "").trim();
          var createdBy = String(it.createdBy || (it.payload && it.payload.createdBy) || it.telegramId || "").trim();
          var createdByName = String(it.createdByName || (it.payload && it.payload.createdByName) || "").trim();
          var whoLine = "";
          var fromLab = createdByName || createdBy || "";
          var toLab = targetName || targetId || "";
          if (toLab === "себе") toLab = "себе";
          if (targetId && createdBy && targetId !== createdBy) {
            if (createdBy === myTid) whoLine = "от меня → " + (toLab || targetId);
            else if (targetId === myTid) whoLine = "от " + (fromLab || createdBy) + " → мне";
            else whoLine = "от " + (fromLab || createdBy) + " → " + (toLab || targetId);
          } else {
            whoLine = "себе";
          }
          return '<div class="tasks-item">' +
            '<div><b>⏰ ' + escapeHtml(it.title || "Напоминание") + '</b>' +
            '<div style="font-size:12px;margin-top:4px;color:#ffd60a;">' +
            escapeHtml(remTxt) + (remSent ? " · отправили, завтра снимется само" : "") +
            "</div>" +
            (whoLine ? ('<div class="muted" style="font-size:12px;margin-top:2px;">' + escapeHtml(whoLine) + "</div>") : "") +
            "</div>" +
            '<div class="seg-row" style="margin-top:10px;flex-wrap:wrap;">' +
            '<button type="button" class="seg-btn" style="background:#3a3a3c;" onclick="cancelDeferredItem(\'' + safeId + '\')">Готово</button>' +
            "</div></div>";
        }).join("");
      }
      var box = document.getElementById("tasksRemindList");
      if (box) box.innerHTML = html;
      var screenBox = document.getElementById("deferredScreenRemindList");
      if (screenBox) screenBox.innerHTML = html;
    }

    var _reminderPeopleCache = null;
    var _reminderPeopleCacheAt = 0;

    async function loadReminderPeople_() {
      if (_reminderPeopleCache && (Date.now() - _reminderPeopleCacheAt) < 60000) {
        return _reminderPeopleCache;
      }
      var tid = await ensureTelegramId();
      if (!tid) return [];
      try {
        var res = await apiGet({
          action: "listReminderPeople",
          telegramId: tid
        }, { timeoutMs: 12000, cacheTtlMs: 30000 });
        var list = (res && res.status === "success" && res.people) ? res.people : [];
        _reminderPeopleCache = list;
        _reminderPeopleCacheAt = Date.now();
        return list;
      } catch (e) {
        return _reminderPeopleCache || [];
      }
    }

    async function pickReminderTargetAsync_() {
      var people = await loadReminderPeople_();
      var myTid = String(myTelegramId || "").trim();
      var nameById = Object.create(null);
      var choices = [{ label: "Себе", value: "self", cls: "btn-blue" }];
      for (var i = 0; i < people.length; i++) {
        var p = people[i] || {};
        var id = String(p.telegramId || "").trim();
        if (!id || id === myTid) continue;
        var label = (p.name || p.username || id);
        if (p.role) label += " · " + p.role;
        nameById[id] = p.name || p.username || id;
        choices.push({ label: label, value: id, cls: "btn-orange" });
      }
      if (choices.length === 1) {
        return { telegramId: myTid, name: "себе" };
      }
      var picked = await uiChoiceAsync("Кому напомнить?", "Уведомление уйдёт в Telegram выбранному", choices);
      if (picked == null) return null;
      if (picked === "self") return { telegramId: myTid, name: "себе" };
      return { telegramId: String(picked), name: nameById[picked] || String(picked) };
    }

    async function setReminderOnDeferred_(id) {
      id = String(id || "").trim();
      if (!id) return;
      var when = await pickRemindWhenAsync_({ allowNone: false });
      if (!when) return;
      var tid = await ensureTelegramId();
      if (!tid) return;
      var remindAtMs = when.getTime();
      var remindAt = toUtcIso_(when);
      try {
        var res = await apiGet({
          action: "setDeferredReminder",
          telegramId: tid,
          id: id,
          remindAtMs: String(remindAtMs),
          remindAt: remindAt,
          _: String(Date.now())
        }, { timeoutMs: 20000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          var why = (res && res.message) || "ошибка";
          if (why === "unknown_action") why = "нужен Deploy Code.gs";
          showToast("Не поставилось: " + why);
          return;
        }
        deferredCacheAt = 0;
        try { apiCacheBustDeferred_(); } catch (eClr) {}
        showToast("Напомню " + formatDeferredRemindAt_(remindAtMs));
        await refreshDeferredBadge(true);
        var dr = document.getElementById("tasksDrawer");
        if (dr && dr.classList.contains("open")) renderTasksDrawer(false);
      } catch (e) {
        showToast("Сеть / Deploy");
      }
    }
    window.setReminderOnDeferred_ = setReminderOnDeferred_;

    async function createStandaloneReminder() {
      var text = await uiPromptAsync("О чём напомнить? (написать кому / что сделать)", "");
      if (text === null) return;
      text = String(text || "").trim();
      if (!text) {
        showToast("Нужен текст");
        return;
      }

      var target = await pickReminderTargetAsync_();
      if (!target) return;
      var when = await pickRemindWhenAsync_();
      if (when == null) return;
      var tid = await ensureTelegramId();
      if (!tid) return;
      var remindAtMs = when.getTime();
      var remindAt = toUtcIso_(when);
      var myName = "";
      try {
        var u = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) || null;
        if (u) myName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "";
      } catch (eN) {}
      var localId = "local_" + Date.now();
      var optimistic = {
        id: localId,
        mode: "remind",
        status: "open",
        title: text,
        telegramId: tid,
        remindAt: remindAt,
        remindAtMs: remindAtMs,
        targetTelegramId: target.telegramId || tid,
        targetName: target.name || "",
        createdBy: tid,
        createdByName: myName,
        payload: {
          remindAt: remindAt,
          remindAtMs: remindAtMs,
          remindSent: false,
          targetTelegramId: target.telegramId || tid,
          targetName: target.name || "",
          createdBy: tid,
          createdByName: myName
        }
      };
      deferredCache = [optimistic].concat(deferredCache || []);
      deferredCacheAt = Date.now();
      try { renderTasksDrawer(false); } catch (ePaint) {}
      var whom = (String(target.telegramId) === String(tid)) ? "себе" : ("для " + (target.name || target.telegramId));
      showToast("Ставлю: " + whom + " · " + formatDeferredRemindAt_(remindAtMs));
      try {

        var saveRes = await apiGet({
          action: "saveDeferred",
          telegramId: tid,
          mode: "remind",
          title: text,
          clientNick: "",
          remindAt: remindAt,
          remindAtMs: String(remindAtMs),
          targetTelegramId: target.telegramId || tid,
          targetName: target.name || "",
          createdByName: myName,
          payload: JSON.stringify(optimistic.payload),
          _: String(Date.now())
        }, { timeoutMs: 25000, cacheTtlMs: 0 });
        if (!saveRes || saveRes.status !== "success") {
          var why = (saveRes && (saveRes.message || saveRes.status)) || "нет ответа";
          if (why === "unknown_action") why = "нужен Deploy Code.gs (saveDeferred)";
          showToast("Не сохранилось: " + why);
          deferredCacheAt = 0;
          try { renderTasksDrawer(true); } catch (eR) {}
          return;
        }
        if (saveRes.id) {
          optimistic.id = saveRes.id;
          deferredCache = [optimistic].concat((deferredCache || []).filter(function (it) {
            return String(it.id) !== localId;
          }));
        }
        showToast("Готово · " + whom);

        setTimeout(function () {
          deferredCacheAt = 0;
          try { apiCacheBustMem_(); } catch (eClr) {}
          renderTasksDrawer(true);
        }, 1200);
      } catch (e) {
        showToast("Не удалось сохранить напоминание");
        deferredCacheAt = 0;
        renderTasksDrawer(true);
      }
    }
    window.createStandaloneReminder = createStandaloneReminder;

    async function renderTasksDrawer(doFetch) {
      var paint = function () {
        var openItems = (deferredCache || []).filter(function (it) {
          return String(it.status || "open").toLowerCase() === "open";
        });
        var xferItems = openItems.filter(function (it) {
          return deferredItemMode_(it) === "transfer";
        });
        var doneXferItems = (deferredCache || []).filter(function (it) {
          if (deferredItemMode_(it) !== "transfer") return false;
          var st = String(it.status || "open").toLowerCase();
          return st === "done" || !!(it.placed || (it.payload && it.payload.placed));
        });
        var xferPaint = xferItems.concat(doneXferItems);
        var buyItems = openItems.filter(function (it) {
          return deferredItemMode_(it) === "buy";
        });
        var orderItems = openItems.filter(function (it) {
          var m = deferredItemMode_(it);
          return m === "order" || m === "partner";
        });
        var remindItems = openItems.filter(function (it) {
          if (!isDeferredRemindMode_(it)) return false;
          if (deferredItemMode_(it) === "transfer") return false;
          if (!it.remindSent && !(it.payload && it.payload.remindSent)) return true;
          var sentAt = (it.payload && it.payload.remindSentAt) || "";
          var sentMs = Date.parse(String(sentAt)) || Number(it.remindAtMs || (it.payload && it.payload.remindAtMs) || 0) || 0;
          if (!sentMs) return true;
          return (Date.now() - sentMs) < 86400000;
        });
        var ppItems = openItems.filter(function (it) {
          var m = deferredItemMode_(it);
          return m !== "remind" && m !== "order" && m !== "transfer" && m !== "buy" && m !== "bp_idle" && m !== "partner";
        });
        var idleItems = openItems.filter(function (it) {
          return String(it.mode || "").toLowerCase() === "bp_idle";
        });
        // bp_idle показываем во вкладке ПП/БП
        ppItems = ppItems.concat(idleItems);
        deferredOpenCount = xferItems.length + buyItems.length + orderItems.length + remindItems.length + ppItems.length;
        updateTasksBadge();
        updateTasksTabCounts_(xferPaint.length, buyItems.length, orderItems.length, ppItems.length, remindItems.length);
        renderTasksXferCards(xferPaint);
        renderTasksBuyCards(buyItems);
        renderTasksOrderCards(orderItems);
        renderTasksRemindCards(remindItems);
        renderTasksPpCards(ppItems);
        try {
          if (_tasksAutoPickOnOpen) {
            setTasksTab(pickBestTasksTab_(
              xferPaint.length, buyItems.length, orderItems.length, ppItems.length, remindItems.length
            ));
            if (deferredOpenCount > 0) _tasksAutoPickOnOpen = false;
          } else {
            setTasksTab(_tasksTab || "xfer");
          }
        } catch (eTab) {}
      };
      paint();
      if (doFetch === false) return;
      var box = document.getElementById("tasksBuyList") || document.getElementById("tasksXferList") || document.getElementById("tasksOrderList") || document.getElementById("tasksPpList");
      if (box && !deferredCache.length) box.innerHTML = '<p class="muted">Загрузка…</p>';
      var screenBox = document.getElementById("deferredScreenList");
      if (screenBox && !deferredCache.length) screenBox.innerHTML = '<p class="muted">Загрузка…</p>';
      await refreshDeferredBadge(true);
      paint();
      _tasksAutoPickOnOpen = false;
    }
    window.renderTasksDrawer = renderTasksDrawer;

    async function loadDeferredList() {

      await renderTasksDrawer(true);
    }
    window.loadDeferredList = loadDeferredList;

    function findDeferredCached(id) {
      for (var i = 0; i < deferredCache.length; i++) {
        if (String(deferredCache[i].id) === String(id)) return deferredCache[i];
      }
      return null;
    }

    function applyDeferredSnapshotToPrice(payload) {
      if (!payload) return;
      var mode = payload.mode === "retail" ? "retail" : "pp";
      if (!priceByMode[mode]) priceByMode[mode] = makeEmptyPriceModeStore();
      var s = priceByMode[mode];
      s.baskets = {
        1: (payload.baskets && payload.baskets["1"]) ? payload.baskets["1"].slice() : [],
        2: (payload.baskets && payload.baskets["2"]) ? payload.baskets["2"].slice() : []
      };
      s.dogCount = payload.dogCount === 2 ? 2 : 1;
      s.activeDog = payload.activeDog === 2 ? 2 : 1;
      s.packCounts = Object.assign({ small: 0, medium: 0, large: 0, legs: 0 }, payload.packCounts || {});
      s.note = payload.note || "";
      s.lastMessage = payload.lastMessage || "";
      s.apiCache = null;
      priceMode = mode;
      loadPriceModeState(mode);
      var nEl = document.getElementById("priceDeliveriesN");
      if (nEl && payload.deliveriesN) nEl.value = payload.deliveriesN;
      var cEl = document.getElementById("pricePpCoef");
      if (cEl && payload.coef) cEl.value = payload.coef;
      var fr = payload.fracRates || {};
      var map = {
        priceFracWhole: fr.whole,
        priceFracLarge: fr.large,
        priceFracMedium: fr.medium,
        priceFracSmall: fr.small
      };
      Object.keys(map).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && map[id] != null && isFinite(Number(map[id]))) el.value = map[id];
      });
      setPriceMode(mode);
    }

    async function editDeferredItem(id) {
      var it = findDeferredCached(id);
      if (!it || !it.payload) { showToast("Нет данных"); return; }
      if (String(it.mode || "").toLowerCase() === "order") {
        return resumeOrderDeferred_(id);
      }
      applyDeferredSnapshotToPrice(it.payload);
      window._editingDeferredId = id;
      closeTasksDrawer();
      switchTab("priceScreen");
      showToast("Открыто в Расчёте — после правок снова «В отложенное»");
      try { await calcPriceFromBasket({ silent: true }); } catch (e) {}
    }
    window.editDeferredItem = editDeferredItem;

    async function cancelDeferredSilent_(id) {
      id = String(id || "").trim();
      if (!id || String(id).indexOf("local_") === 0 || String(id).indexOf("bpidle:") === 0) return;
      deferredCache = (deferredCache || []).filter(function (it) {
        return String(it.id) !== id;
      });
      deferredCacheAt = Date.now();
      try { renderTasksDrawer(false); } catch (e0) {}
      var tid = myTelegramId || readTelegramIdFromTg() || loadStoredTelegramId();
      if (!tid) return;
      try {
        await apiGet({
          action: "cancelDeferred",
          telegramId: tid,
          id: id,
          _: String(Date.now())
        }, { timeoutMs: 20000, cacheTtlMs: 0 });
        try { apiCacheBustDeferred_(); } catch (eClr) {}
        deferredCacheAt = 0;
        try { refreshDeferredBadge(true); } catch (eB) {}
      } catch (e) { /* silent */ }
    }

    async function cancelDeferredItem(id) {
      id = String(id || "").trim();
      if (!id) return;
      var ok = await uiConfirmAsync("Убрать из задач?");
      if (!ok) return;
      if (String(window._orderDeferredId || "") === id) window._orderDeferredId = "";
      var tid = await ensureTelegramId();
      if (!tid) return;

      deferredCache = (deferredCache || []).filter(function (it) {
        if (!it) return false;
        if (String(it.id) === id) return false;
        return true;
      });
      deferredCacheAt = Date.now();
      try { renderTasksDrawer(false); } catch (e0) {}
      showToast("Убираю…");
      try {
        var res = await apiGet({
          action: "cancelDeferred",
          telegramId: tid,
          id: id,
          _: String(Date.now())
        }, { timeoutMs: 20000, cacheTtlMs: 0 });
        try { apiCacheBustMem_(); } catch (eClr) {}
        if (res && res.status === "not_found") {

          showToast("Убрано");
          return;
        }
        if (res && res.status && res.status !== "success") {
          showToast("Не удалилось: " + (res.message || res.status) + " — нужен Deploy Code.gs");
          deferredCacheAt = 0;
          await renderTasksDrawer(true);
          return;
        }
        showToast("Убрано");

        deferredCacheAt = 0;
        setTimeout(function () {
          try { _apiGetMem = Object.create(null); } catch (e2) {}
          renderTasksDrawer(true);
        }, 500);
      } catch (e) {
        try {
          await apiPost({ action: "cancelDeferred", telegramId: tid, id: id, status: "cancelled" });
          showToast("Убрано (отправка)");
          deferredCacheAt = 0;
          setTimeout(function () { renderTasksDrawer(true); }, 1200);
        } catch (e2) {
          showToast("Не удалось отменить — Deploy Code.gs");
          deferredCacheAt = 0;
          await renderTasksDrawer(true);
        }
      }
    }
    window.cancelDeferredItem = cancelDeferredItem;

    function syncPriceEnrollUi() {
      var card = document.getElementById("priceEnrollCard");
      var on = !!window._enrollDeferredId || !!window._enrollDirect;
      if (card) card.style.display = on ? "block" : "none";
      var saveBtn = document.getElementById("btnPriceToDeferred") ||
        document.querySelector('#priceScreen button[onclick="saveCurrentCalcToDeferred()"]');
      if (saveBtn) saveBtn.style.display = on ? "none" : "";
      var toPpBtn = document.getElementById("btnPriceToPp");
      if (toPpBtn) toPpBtn.style.display = on ? "none" : "";
      if (on) {
        try {
          var screen = document.getElementById("priceScreen");
          if (screen) screen.scrollTop = 0;
          var wrap = document.querySelector(".app-scroll") || document.scrollingElement;
          if (wrap) wrap.scrollTop = 0;
          window.scrollTo(0, 0);
        } catch (eSc) {}
      }
    }

    function exitPriceEnrollMode() {
      window._enrollDeferredId = "";
      window._enrollDirect = false;
      var hid = document.getElementById("deferredEnrollId");
      if (hid) hid.value = "";
      syncPriceEnrollUi();
    }
    window.exitPriceEnrollMode = exitPriceEnrollMode;
    window.closeDeferredEnroll = exitPriceEnrollMode;

    async function openDirectPpEnrollFromPrice() {
      if (priceMode === "retail") {
        showToast("Сначала режим «Подписка ПП»");
        return;
      }
      stashPriceActiveBasket();
      if (!allPriceItems().length) {
        showToast("Сначала набери состав");
        return;
      }
      if (!priceLastMessage) {
        try { await calcPriceFromBasket({ silent: true }); } catch (e0) {}
      }
      window._enrollDirect = true;
      window._enrollDeferredId = "";
      window._editingDeferredId = "";
      var hid = document.getElementById("deferredEnrollId");
      if (hid) hid.value = "";
      var nameEl = document.getElementById("enrollDisplayName");
      var nickEl = document.getElementById("enrollInstNick");
      var noteEl = document.getElementById("enrollNote");
      var addrEl = document.getElementById("enrollAddress");
      var phoneEl = document.getElementById("enrollPhone");
      var nEl = document.getElementById("enrollDeliveriesN");
      var factEl = document.getElementById("enrollFactCost");
      var priceNote = document.getElementById("priceClientNote");
      if (nameEl && !nameEl.value) nameEl.value = "";
      if (nickEl && !nickEl.value) nickEl.value = "";
      if (noteEl) {
        var note = (priceNote && priceNote.value) ? String(priceNote.value).trim() : "";
        if (!noteEl.value && note) noteEl.value = note;
      }
      if (nEl) nEl.value = (document.getElementById("priceDeliveriesN") || {}).value || 1;
      if (factEl) {
        try {
          var snap0 = buildPriceDeferredSnapshot();
          if (snap0.subTotal != null) factEl.value = Math.round(Number(snap0.subTotal) * 100) / 100;
        } catch (eF) {}
      }
      syncPriceEnrollUi();
      try {
        if (nickEl) nickEl.focus();
        else if (nameEl) nameEl.focus();
      } catch (eFocus) {}
      showToast("Заполни данные и нажми «Внести в лист ПП»");
    }
    window.openDirectPpEnrollFromPrice = openDirectPpEnrollFromPrice;

    async function openDeferredEnroll(id) {
      var it = findDeferredCached(id);
      if (!it) { showToast("Не найдено"); return; }
      if (it.payload) applyDeferredSnapshotToPrice(it.payload);
      window._enrollDeferredId = id;
      window._enrollDirect = false;
      window._editingDeferredId = "";
      var hid = document.getElementById("deferredEnrollId");
      if (hid) hid.value = id;
      var pl = it.payload || {};
      var nameEl = document.getElementById("enrollDisplayName");
      var nickEl = document.getElementById("enrollInstNick");
      var noteEl = document.getElementById("enrollNote");
      var addrEl = document.getElementById("enrollAddress");
      var phoneEl = document.getElementById("enrollPhone");
      var nEl = document.getElementById("enrollDeliveriesN");
      var factEl = document.getElementById("enrollFactCost");
      if (nameEl) nameEl.value = pl.displayName || pl.clientName || "";
      if (nickEl) nickEl.value = it.clientNick || pl.clientNick || "";
      if (noteEl) noteEl.value = pl.note || "";
      if (addrEl) addrEl.value = pl.address || "";
      if (phoneEl) phoneEl.value = pl.phone || "";
      if (nEl) nEl.value = pl.deliveriesN || (document.getElementById("priceDeliveriesN") || {}).value || 1;
      if (factEl) {
        factEl.value = pl.subTotal != null ? Math.round(Number(pl.subTotal) * 100) / 100 : "";
      }

      var priceN = document.getElementById("priceDeliveriesN");
      if (priceN && nEl) priceN.value = nEl.value;
      closeTasksDrawer();
      switchTab("priceScreen");
      syncPriceEnrollUi();
      try {
        if (nameEl) nameEl.focus();
      } catch (eF) {}
      try { await calcPriceFromBasket({ silent: true }); } catch (e) {}
      if (factEl && !factEl.value) {
        try {
          var snap = buildPriceDeferredSnapshot();
          if (snap.subTotal != null) factEl.value = Math.round(Number(snap.subTotal) * 100) / 100;
        } catch (e2) {}
      }
      showToast("Проверь состав и заполни данные для ПП");
    }
    window.openDeferredEnroll = openDeferredEnroll;

    async function confirmEnrollDeferredToPp() {
      var id = window._enrollDeferredId || (document.getElementById("deferredEnrollId") || {}).value || "";
      if (id === "__direct__") id = "";
      var nick = String((document.getElementById("enrollInstNick") || {}).value || "").trim();
      var displayName = String((document.getElementById("enrollDisplayName") || {}).value || "").trim();
      if (!nick) { showToast("Укажи ник Instagram"); return; }
      nick = nick.replace(/^@+/, "").trim();
      if (!nick) { showToast("Укажи ник Instagram"); return; }
      var tid = await ensureTelegramId();
      if (!tid) return;
      if (priceMode === "retail") {
        showToast("Для внесения в ПП нужен режим «Подписка ПП»");
        return;
      }
      stashPriceActiveBasket();
      if (!allPriceItems().length) {
        showToast("Состав пуст");
        return;
      }
      var ok = await uiConfirmAsync("Внести " + nick + (displayName ? (" (" + displayName + ")") : "") + " в лист ПП?");
      if (!ok) return;
      var it = id ? findDeferredCached(id) : null;
      var pl = (it && it.payload) || {};
      var snap = buildPriceDeferredSnapshot();
      var items = [];
      if (snap.baskets) {
        items = (snap.baskets["1"] || []).concat(snap.dogCount >= 2 ? (snap.baskets["2"] || []) : []);
      } else if (pl.baskets) {
        items = (pl.baskets["1"] || []).concat(pl.dogCount >= 2 ? (pl.baskets["2"] || []) : []);
      }
      if (!items.length) {
        showToast("Состав пуст");
        return;
      }
      var wishes = String((document.getElementById("enrollNote") || {}).value || "").trim();
      var fact = (document.getElementById("enrollFactCost") || {}).value;
      if (fact === "" || fact == null) fact = snap.subTotal != null ? snap.subTotal : pl.subTotal;
      var deliveriesN = Number((document.getElementById("enrollDeliveriesN") || {}).value) ||
        Number((document.getElementById("priceDeliveriesN") || {}).value) || 1;
      try {
        syncPricePpSchemeDefaults_();
        var enrollScheme = pricePpScheme || defaultPpSchemeForNewLocal_();
        var enrollCoef = getPricePpCoef();
        wishes = stampPpSchemeIntoWishes_(stampPpCoefIntoWishes_(wishes, enrollCoef), enrollScheme);
        var body = {
          action: "enrollDeferredToPp",
          telegramId: tid,
          clientNick: nick,
          displayName: displayName,
          deliveriesN: deliveriesN,
          wishes: wishes,
          note: wishes,
          scheme: enrollScheme,
          coef: String(enrollCoef),
          address: (document.getElementById("enrollAddress") || {}).value || "",
          phone: (document.getElementById("enrollPhone") || {}).value || "",
          factCost: fact,
          basket: items
        };
        if (id) body.id = id;
        await apiPost(body);
        showToast(id ? "Отправлено в ПП" : "Внесено в ПП");
        exitPriceEnrollMode();
        deferredCacheAt = 0;
        try { apiCacheBustMem_(); } catch (eClr) {}
        setTimeout(function () { refreshDeferredBadge(true); }, 600);
      } catch (e) {
        showToast("Ошибка сети / Deploy");
      }
    }
    window.confirmEnrollDeferredToPp = confirmEnrollDeferredToPp;

    async function loadPeople(opts) {
      opts = opts || {};
      var box = document.getElementById("peopleContainer");
      if (opts.soft && window._peopleCacheHtml) {
        box.innerHTML = window._peopleCacheHtml;
        return;
      }
      if (!opts.soft) box.innerHTML = '<p class="muted">Загрузка…</p>';
      else if (!window._peopleCacheHtml) box.innerHTML = '<p class="muted">Загрузка…</p>';
      try {
        var params = { action: "listAccess", telegramId: myTelegramId };
        if (!opts.soft) params._ = String(Date.now());
        var res = await apiGet(params, {
          timeoutMs: opts.soft ? 15000 : 20000,
          retries: opts.soft ? 0 : 1,
          cacheTtlMs: opts.soft ? undefined : 0
        });
        if (!res || res.status !== "success") {
          box.innerHTML = '<p class="muted">Только владелец. Задайте OWNER_TELEGRAM_IDS в Script Properties.</p>';
          return;
        }
        var roles = ["manager", "cutter", "courier", "logistics", "owner", "denied"];
        var zones = (res.timezones && res.timezones.length) ? res.timezones : [
          "Europe/Minsk", "Europe/Moscow", "Europe/Kaliningrad", "Europe/Kiev",
          "Europe/Warsaw", "Europe/Berlin", "Asia/Yekaterinburg", "Asia/Novosibirsk",
          "Asia/Vladivostok", "UTC"
        ];
        var html = (res.people || []).map(function (p) {
          var curTz = p.timezone || "Europe/Minsk";
          var optsR = roles.map(function (r) {
            return '<option value="' + r + '"' + (p.role === r ? " selected" : "") + ">" + r + "</option>";
          }).join("");
          var optsTz = zones.map(function (z) {
            return '<option value="' + z + '"' + (curTz === z ? " selected" : "") + ">" + z + "</option>";
          }).join("");
          if (zones.indexOf(curTz) < 0) {
            optsTz = '<option value="' + escapeHtml(curTz) + '" selected>' + escapeHtml(curTz) + "</option>" + optsTz;
          }
          var tid = String(p.telegramId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          return '<div class="card" style="margin-bottom:8px;">' +
            '<b>' + escapeHtml(p.name || p.telegramId) + '</b> <span class="muted">@' + escapeHtml(p.username || "") + ' · ' + escapeHtml(String(p.telegramId)) + '</span>' +
            '<div class="muted" style="font-size:12px;">сейчас: ' + escapeHtml(p.role) + ' / ' + escapeHtml(p.status) + '</div>' +
            '<div class="seg-row" style="margin-top:8px;">' +
            '<select id="role_' + p.telegramId + '" style="flex:1;height:40px;border-radius:8px;background:#111;color:#fff;border:1px solid var(--border-color);">' + optsR + '</select>' +
            '<button type="button" class="seg-btn" onclick="assignRole(\'' + tid + '\')">Роль</button>' +
            '</div>' +
            '<div class="seg-row" style="margin-top:8px;">' +
            '<select id="tz_' + p.telegramId + '" style="flex:1;height:40px;border-radius:8px;background:#111;color:#fff;border:1px solid var(--border-color);">' + optsTz + '</select>' +
            '<button type="button" class="seg-btn" onclick="assignTimezone(\'' + tid + '\')">TZ</button>' +
            '</div></div>';
        }).join("") || '<p class="muted">Пока никого нет — пусть люди нажмут «Запросить доступ»</p>';
        window._peopleCacheHtml = html;
        window._peopleCacheAt = Date.now();
        box.innerHTML = html;
      } catch (e) {
        box.innerHTML = '<p class="muted">Ошибка</p>';
      }
    }
    window.loadPeople = loadPeople;

    var partnersCacheList_ = null;
    async function fetchPartnersList_(force) {
      if (!force && partnersCacheList_ && partnersCacheList_.length) return partnersCacheList_;
      try {
        var params = {
          action: "listPartners",
          all: "1",
          telegramId: myTelegramId
        };
        if (force) params._ = String(Date.now());
        var res = await apiGet(params, {
          timeoutMs: 20000,
          retries: force ? 1 : 0,
          cacheTtlMs: force ? 0 : undefined
        });
        if (res && res.status === "success") {
          partnersCacheList_ = res.partners || [];
          return partnersCacheList_;
        }
      } catch (e) {}
      return partnersCacheList_ || [];
    }

    async function ensurePpPartnerOptions_(selected) {
      var sel = document.getElementById("ppPartnerSelect");
      if (!sel) return;
      var list = await fetchPartnersList_(false);
      var active = (list || []).filter(function (p) { return p.active !== false; });
      var cur = selected != null ? String(selected) : String(sel.value || "");
      sel.innerHTML = '<option value="">— выберите партнёра —</option>' +
        active.map(function (p) {
          return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + "</option>";
        }).join("") +
        '<option value="Другое">Другое</option>';
      if (cur) sel.value = cur;
    }

    async function loadPartnersUi_(opts) {
      opts = opts || {};
      var box = document.getElementById("partnersContainer");
      if (!box) return;
      if (opts.soft && window._partnersUiHtml) {
        box.innerHTML = window._partnersUiHtml;
        return;
      }
      if (!opts.soft || !window._partnersUiHtml) box.innerHTML = '<p class="muted">Загрузка…</p>';
      var list = await fetchPartnersList_(!opts.soft);
      if (!list.length) {
        var empty = '<p class="muted">Пока пусто — добавьте первого партнёра выше</p>';
        window._partnersUiHtml = empty;
        box.innerHTML = empty;
        return;
      }
      var html = list.map(function (p) {
        var idEsc = String(p.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        var nameEsc = String(p.name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return '<div class="card" style="margin-bottom:8px;padding:10px;">' +
          '<b>' + escapeHtml(p.name) + '</b>' +
          (p.active ? '' : ' <span class="muted">(выкл)</span>') +
          (p.paysCost ? ' <span class="client-badge" style="background:rgba(48,209,88,0.25);color:#30d158;">платит себест</span>' : "") +
          (p.note ? ('<div class="muted" style="font-size:12px;">' + escapeHtml(p.note) + "</div>") : "") +
          '<div class="seg-row" style="margin-top:8px;flex-wrap:wrap;">' +
          '<button type="button" class="seg-btn" onclick="editPartnerUi_(\'' + idEsc + '\')">Изменить</button>' +
          '<button type="button" class="seg-btn" onclick="togglePartnerActive_(\'' + idEsc + '\',' + (p.active ? "false" : "true") + ')">' +
          (p.active ? "Выключить" : "Включить") + "</button>" +
          '<button type="button" class="seg-btn" style="color:#ff453a;" onclick="deletePartnerUi_(\'' + idEsc + '\',\'' + nameEsc + '\')">Удалить</button>' +
          "</div></div>";
      }).join("");
      window._partnersUiHtml = html;
      box.innerHTML = html;
      try { ensurePpPartnerOptions_(); } catch (e2) {}
    }

    function setPartnerEditMode_(on, partner) {
      var idEl = document.getElementById("partnerEditId");
      var nameEl = document.getElementById("partnerNameInput");
      var noteEl = document.getElementById("partnerNoteInput");
      var paysEl = document.getElementById("partnerPaysCostInput");
      var saveBtn = document.getElementById("btnPartnerSave");
      var cancelBtn = document.getElementById("btnPartnerEditCancel");
      if (on && partner) {
        if (idEl) idEl.value = partner.id || "";
        if (nameEl) nameEl.value = partner.name || "";
        if (noteEl) noteEl.value = partner.note || "";
        if (paysEl) paysEl.checked = !!partner.paysCost;
        if (saveBtn) saveBtn.textContent = "Сохранить";
        if (cancelBtn) cancelBtn.style.display = "";
        try {
          if (nameEl) {
            nameEl.focus();
            nameEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } catch (eF) {}
      } else {
        if (idEl) idEl.value = "";
        if (nameEl) nameEl.value = "";
        if (noteEl) noteEl.value = "";
        if (paysEl) paysEl.checked = false;
        if (saveBtn) saveBtn.textContent = "Добавить";
        if (cancelBtn) cancelBtn.style.display = "none";
      }
    }

    function editPartnerUi_(id) {
      id = String(id || "").trim();
      if (!id) return;
      var list = partnersCacheList_ || [];
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].id) === id) { hit = list[i]; break; }
      }
      if (!hit) {
        showToast("Не найден — обновите список");
        return;
      }
      setPartnerEditMode_(true, hit);
      showToast("Редактирование: " + (hit.name || ""));
    }

    function cancelPartnerEdit_() {
      setPartnerEditMode_(false, null);
    }

    async function savePartnerFromUi() {
      var name = String((document.getElementById("partnerNameInput") || {}).value || "").trim();
      var note = String((document.getElementById("partnerNoteInput") || {}).value || "").trim();
      var editId = String((document.getElementById("partnerEditId") || {}).value || "").trim();
      var paysCost = !!(document.getElementById("partnerPaysCostInput") || {}).checked;
      if (!name) { showToast("Укажите имя партнёра"); return; }
      try {
        var body = {
          action: "savePartner",
          name: name,
          note: note,
          paysCost: paysCost ? "yes" : "no",
          active: "yes",
          telegramId: myTelegramId,
          _: String(Date.now())
        };
        if (editId) body.id = editId;

        if (editId && partnersCacheList_) {
          for (var i = 0; i < partnersCacheList_.length; i++) {
            if (String(partnersCacheList_[i].id) === editId) {
              body.active = partnersCacheList_[i].active === false ? "no" : "yes";
              break;
            }
          }
        }
        var res = await apiGet(body, { timeoutMs: 20000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          showToast((res && res.message) || "Не сохранилось — Deploy Code.gs");
          return;
        }
        setPartnerEditMode_(false, null);
        partnersCacheList_ = null;
        window._partnersUiHtml = "";
        try { apiCacheBustMem_("listPartners"); } catch (eB) {}
        await loadPartnersUi_({});
        showToast(editId ? "Партнёр обновлён" : "Партнёр добавлен");
      } catch (e) {
        showToast("Ошибка сети / Deploy");
      }
    }

    async function togglePartnerActive_(id, makeActive) {
      var list = await fetchPartnersList_(false);
      var hit = (list || []).filter(function (p) { return p.id === id; })[0];
      if (!hit) return;
      try {
        await apiGet({
          action: "savePartner",
          id: id,
          name: hit.name,
          note: hit.note || "",
          paysCost: hit.paysCost ? "yes" : "no",
          active: makeActive ? "yes" : "no",
          telegramId: myTelegramId,
          _: String(Date.now())
        }, { timeoutMs: 15000, cacheTtlMs: 0 });
        partnersCacheList_ = null;
        window._partnersUiHtml = "";
        try { apiCacheBustMem_("listPartners"); } catch (eB) {}
        await loadPartnersUi_({});
      } catch (e) { showToast("Не обновилось"); }
    }

    async function deletePartnerUi_(id, name) {
      var ok = await uiConfirmAsync("Убрать партнёра «" + name + "» из списка?");
      if (!ok) return;
      try {
        await apiGet({
          action: "deletePartner",
          id: id,
          name: name,
          telegramId: myTelegramId,
          _: String(Date.now())
        }, { timeoutMs: 15000, cacheTtlMs: 0 });
        var editId = String((document.getElementById("partnerEditId") || {}).value || "");
        if (editId && editId === id) setPartnerEditMode_(false, null);
        partnersCacheList_ = null;
        window._partnersUiHtml = "";
        try { apiCacheBustMem_("listPartners"); } catch (eB) {}
        await loadPartnersUi_({});
      } catch (e) { showToast("Не удалилось"); }
    }
    window.savePartnerFromUi = savePartnerFromUi;
    window.editPartnerUi_ = editPartnerUi_;
    window.cancelPartnerEdit_ = cancelPartnerEdit_;
    window.togglePartnerActive_ = togglePartnerActive_;
    window.deletePartnerUi_ = deletePartnerUi_;
    window.ensurePpPartnerOptions_ = ensurePpPartnerOptions_;

    var partnerHubCache_ = null;
    var partnerHubTab_ = "people";

    function setPartnerHubTab_(tab) {
      partnerHubTab_ = tab === "points" || tab === "nets" || tab === "notify" ? tab : "people";
      var map = {
        people: "phPanelPeople",
        points: "phPanelPoints",
        nets: "phPanelNets",
        notify: "phPanelNotify"
      };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k]);
        if (el) el.style.display = k === partnerHubTab_ ? "" : "none";
      });
      document.querySelectorAll("#phSubTabs [data-ph-tab]").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-ph-tab") === partnerHubTab_);
      });
    }
    window.setPartnerHubTab_ = setPartnerHubTab_;

    function partnerHubToggleForm_(kind) {
      var id = kind === "point" ? "phPointForm" : (kind === "net" ? "phNetForm" : "phAccForm");
      var el = document.getElementById(id);
      if (!el) return;
      if (el.style.display !== "none") {
        partnerHubCancelForm_(kind);
        return;
      }
      if (kind === "net") {
        document.getElementById("phNetEditId").value = "";
        document.getElementById("phNetName").value = "";
        document.getElementById("phNetLogo").value = "";
      } else if (kind === "point") {
        document.getElementById("phPointEditId").value = "";
        document.getElementById("phPointName").value = "";
        document.getElementById("phPointAddr").value = "";
      } else {
        document.getElementById("phAccEditId").value = "";
        document.getElementById("phAccUser").value = "";
        document.getElementById("phAccTid").value = "";
        document.getElementById("phAccName").value = "";
        partnerHubRenderPointChecks_();
      }
      el.style.display = "block";
      if (kind === "acc") {
        try { document.getElementById("phAccUser").focus(); } catch (eF) {}
      }
    }
    window.partnerHubToggleForm_ = partnerHubToggleForm_;

    function partnerHubCancelForm_(kind) {
      if (kind === "net") {
        document.getElementById("phNetEditId").value = "";
        document.getElementById("phNetName").value = "";
        document.getElementById("phNetLogo").value = "";
        var nf = document.getElementById("phNetForm");
        if (nf) nf.style.display = "none";
      } else if (kind === "point") {
        document.getElementById("phPointEditId").value = "";
        document.getElementById("phPointName").value = "";
        document.getElementById("phPointAddr").value = "";
        var pf = document.getElementById("phPointForm");
        if (pf) pf.style.display = "none";
      } else {
        document.getElementById("phAccEditId").value = "";
        document.getElementById("phAccUser").value = "";
        document.getElementById("phAccTid").value = "";
        document.getElementById("phAccName").value = "";
        var af = document.getElementById("phAccForm");
        if (af) af.style.display = "none";
      }
    }
    window.partnerHubCancelForm_ = partnerHubCancelForm_;

    function partnerHubOpenForm_(kind) {
      var id = kind === "point" ? "phPointForm" : (kind === "net" ? "phNetForm" : "phAccForm");
      var el = document.getElementById(id);
      if (el) el.style.display = "block";
      if (kind === "point") setPartnerHubTab_("points");
      else if (kind === "net") setPartnerHubTab_("nets");
      else setPartnerHubTab_("people");
    }

    async function loadPartnerHubUi_(opts) {
      opts = opts || {};
      var boxA = document.getElementById("phAccessList");
      if (!document.getElementById("phNetworksList")) return;
      if (opts.soft && partnerHubCache_ && !opts.force) {
        partnerHubPaint_(partnerHubCache_);
        setPartnerHubTab_(partnerHubTab_);
        return;
      }
      if (!opts.soft && boxA) boxA.innerHTML = '<p class="muted">Загрузка…</p>';
      try {
        var res = await apiGet({
          action: "partnerListAdmin",
          telegramId: myTelegramId,
          _: String(Date.now())
        }, { timeoutMs: 35000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          var msg = (res && res.message) || "нет ответа — Deploy Code.gs?";
          if (boxA) boxA.innerHTML = '<p class="muted">' + escapeHtml(msg) + "</p>";
          return;
        }
        partnerHubCache_ = res;
        partnerHubPaint_(res);
        setPartnerHubTab_(partnerHubTab_);
      } catch (e) {
        if (boxA) boxA.innerHTML = '<p class="muted">Ошибка загрузки</p>';
      }
    }

    function partnerHubPaint_(res) {
      var nets = res.networks || [];
      var pts = res.points || [];
      var acc = res.access || [];
      var link = document.getElementById("partnerHubOpenLink");
      if (link && res.miniAppUrl) link.href = res.miniAppUrl;

      function fillNetSelect(selId, prefer) {
        var sel = document.getElementById(selId);
        if (!sel) return;
        var cur = prefer || sel.value || "";
        sel.innerHTML = nets.filter(function (n) { return n.active !== false; }).map(function (n) {
          return '<option value="' + escapeHtml(n.id) + '">' + escapeHtml(n.name) + "</option>";
        }).join("");
        if (cur) sel.value = cur;
      }
      fillNetSelect("phPointNetwork");
      fillNetSelect("phAccNetwork");

      var selectedNotify = {};
      (res.notifyRecipients || []).forEach(function (r) {
        var id = String((r && r.telegramId) || r || "").trim();
        if (id) selectedNotify[id] = true;
      });
      var cands = res.notifyCandidates || [];
      var boxNotify = document.getElementById("phNotifyPeople");
      if (boxNotify) {
        if (!cands.length) {
          boxNotify.innerHTML = '<p class="muted">Нет сотрудников — сначала роли в «Доступах»</p>';
        } else {
          boxNotify.innerHTML = cands.map(function (p) {
            var tid = String(p.telegramId || "");
            var label = (p.name || p.username || tid);
            var meta = [];
            if (p.username) meta.push("@" + p.username);
            if (p.role) meta.push(p.role);
            return '<label style="display:flex;align-items:center;gap:10px;margin:6px 0;padding:8px 10px;background:#111;border:1px solid var(--border-color);border-radius:10px;">' +
              '<input type="checkbox" class="ph-notify-check" value="' + escapeHtml(tid) + '"' +
              (selectedNotify[tid] ? " checked" : "") + '>' +
              '<span style="min-width:0;"><b>' + escapeHtml(label) + "</b>" +
              (meta.length ? '<span class="muted" style="font-size:12px;"> · ' + escapeHtml(meta.join(" · ")) + "</span>" : "") +
              "</span></label>";
          }).join("");
        }
      }

      var boxN = document.getElementById("phNetworksList");
      if (boxN) {
        boxN.innerHTML = nets.length ? nets.map(function (n) {
          var idEsc = String(n.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #222;">' +
            '<div style="min-width:0;"><b>' + escapeHtml(n.name) + "</b>" +
            (n.active === false ? ' <span class="muted">(выкл)</span>' : "") + "</div>" +
            '<button type="button" class="seg-btn" style="margin:0;flex-shrink:0;" onclick="partnerHubEditNetwork_(\'' + idEsc + '\')">Изменить</button>' +
            "</div>";
        }).join("") : '<p class="muted">Пусто — «Демо» или «+ Сеть»</p>';
      }

      var boxP = document.getElementById("phPointsList");
      if (boxP) {
        boxP.innerHTML = pts.length ? pts.map(function (p) {
          var idEsc = String(p.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          var net = nets.filter(function (n) { return n.id === p.networkId; })[0];
          return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #222;">' +
            '<div style="min-width:0;"><b>' + escapeHtml(p.name) + "</b>" +
            '<div class="muted" style="font-size:12px;margin-top:2px;">' + escapeHtml((net && net.name) || p.networkId) +
            (p.address ? (" · " + escapeHtml(p.address)) : "") + "</div></div>" +
            '<button type="button" class="seg-btn" style="margin:0;flex-shrink:0;" onclick="partnerHubEditPoint_(\'' + idEsc + '\')">Изменить</button>' +
            "</div>";
        }).join("") : '<p class="muted">Нет точек</p>';
      }

      partnerHubRenderPointChecks_();

      var boxA = document.getElementById("phAccessList");
      if (boxA) {
        var openAcc = acc.filter(function (a) { return String(a.status || "") === "active"; });
        boxA.innerHTML = openAcc.length ? openAcc.map(function (a) {
          var idEsc = String(a.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          var ptsLab = (a.pointIds || []).map(function (pid) {
            var hit = pts.filter(function (p) { return p.id === pid; })[0];
            return hit ? hit.name : pid;
          }).join(", ");
          return '<div style="padding:10px 0;border-bottom:1px solid #222;">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
            '<div style="min-width:0;"><b>@' + escapeHtml(a.username || "—") + "</b>" +
            (a.name ? (' <span class="muted">' + escapeHtml(a.name) + "</span>") : "") +
            '<div class="muted" style="font-size:12px;margin-top:3px;">' + escapeHtml(ptsLab || "нет точек") + "</div></div>" +
            '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">' +
            '<button type="button" class="seg-btn" style="margin:0;" onclick="partnerHubEditAccess_(\'' + idEsc + '\')">Править</button>' +
            '<button type="button" class="seg-btn" style="margin:0;color:#ff453a;" onclick="partnerHubRevokeAccess_(\'' + idEsc + '\')">✕</button>' +
            "</div></div></div>";
        }).join("") : '<p class="muted">Никого нет — «+ Выдать»</p>';
      }
    }

    function partnerHubRenderPointChecks_() {
      var box = document.getElementById("phAccPoints");
      if (!box || !partnerHubCache_) return;

      var pts = (partnerHubCache_.points || []).filter(function (p) {
        return p.active !== false;
      });
      if (!pts.length) {
        box.innerHTML = '<span class="muted">Нет точек</span>';
        return;
      }
      var nets = partnerHubCache_.networks || [];
      box.innerHTML = pts.map(function (p) {
        var net = nets.filter(function (n) { return n.id === p.networkId; })[0];
        var lab = (net && net.name ? (net.name + " · ") : "") + (p.name || p.id);
        return '<label style="display:flex;align-items:center;gap:8px;margin:6px 0;">' +
          '<input type="checkbox" class="ph-pt-check" value="' + escapeHtml(p.id) + '">' +
          '<span>' + escapeHtml(lab) + "</span></label>";
      }).join("");
    }

    function partnerHubEditNetwork_(id) {
      var n = (partnerHubCache_.networks || []).filter(function (x) { return x.id === id; })[0];
      if (!n) return;
      document.getElementById("phNetEditId").value = n.id;
      document.getElementById("phNetName").value = n.name || "";
      document.getElementById("phNetLogo").value = n.logo || "";
      partnerHubOpenForm_("net");
      showToast("Правка сети");
    }

    function partnerHubEditPoint_(id) {
      var p = (partnerHubCache_.points || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      document.getElementById("phPointEditId").value = p.id;
      document.getElementById("phPointNetwork").value = p.networkId || "";
      document.getElementById("phPointName").value = p.name || "";
      document.getElementById("phPointAddr").value = p.address || "";
      partnerHubOpenForm_("point");
      showToast("Правка точки");
    }

    function partnerHubEditAccess_(id) {
      var a = (partnerHubCache_.access || []).filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      document.getElementById("phAccEditId").value = a.id;
      document.getElementById("phAccUser").value = a.username || "";
      document.getElementById("phAccTid").value = a.telegramId || "";
      document.getElementById("phAccName").value = a.name || "";
      if (a.networkId) document.getElementById("phAccNetwork").value = a.networkId;
      partnerHubOpenForm_("acc");
      partnerHubRenderPointChecks_();
      var want = {};
      (a.pointIds || []).forEach(function (pid) { want[pid] = true; });
      document.querySelectorAll(".ph-pt-check").forEach(function (el) {
        el.checked = !!want[el.value];
      });
      showToast("Правка доступа");
    }

    async function partnerHubSaveNetwork_() {
      var name = String((document.getElementById("phNetName") || {}).value || "").trim();
      if (!name) { showToast("Имя сети"); return; }
      var body = {
        action: "partnerSaveNetwork",
        telegramId: myTelegramId,
        id: String((document.getElementById("phNetEditId") || {}).value || ""),
        name: name,
        logo: String((document.getElementById("phNetLogo") || {}).value || ""),
        _: String(Date.now())
      };
      var res = await apiGet(body, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не сохранилось — Deploy?");
        return;
      }
      document.getElementById("phNetEditId").value = "";
      document.getElementById("phNetName").value = "";
      document.getElementById("phNetLogo").value = "";
      partnerHubCancelForm_("net");
      partnerHubCache_ = null;
      await loadPartnerHubUi_({ force: 1 });
      showToast("Сеть сохранена");
    }

    async function partnerHubSavePoint_() {
      var name = String((document.getElementById("phPointName") || {}).value || "").trim();
      var networkId = String((document.getElementById("phPointNetwork") || {}).value || "");
      if (!name || !networkId) { showToast("Сеть и название"); return; }
      var body = {
        action: "partnerSavePoint",
        telegramId: myTelegramId,
        id: String((document.getElementById("phPointEditId") || {}).value || ""),
        networkId: networkId,
        name: name,
        address: String((document.getElementById("phPointAddr") || {}).value || ""),
        _: String(Date.now())
      };
      var res = await apiGet(body, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не сохранилось — Deploy?");
        return;
      }
      document.getElementById("phPointEditId").value = "";
      document.getElementById("phPointName").value = "";
      document.getElementById("phPointAddr").value = "";
      partnerHubCancelForm_("point");
      partnerHubCache_ = null;
      await loadPartnerHubUi_({ force: 1 });
      showToast("Точка сохранена");
    }

    async function partnerHubSaveAccess_() {
      var username = String((document.getElementById("phAccUser") || {}).value || "").replace(/^@/, "").trim();
      var tid = String((document.getElementById("phAccTid") || {}).value || "").trim();
      var ids = [];
      document.querySelectorAll(".ph-pt-check:checked").forEach(function (el) { ids.push(el.value); });
      if (!username && !tid) { showToast("Нужен @username или Telegram ID"); return; }
      if (!ids.length) { showToast("Выберите точки"); return; }
      var body = {
        action: "partnerSaveAccess",
        telegramId: myTelegramId,
        id: String((document.getElementById("phAccEditId") || {}).value || ""),
        username: username,
        targetTelegramId: tid,
        name: String((document.getElementById("phAccName") || {}).value || ""),
        networkId: String((document.getElementById("phAccNetwork") || {}).value || ""),
        pointIds: JSON.stringify(ids),
        role: "partner",
        status: "active",
        _: String(Date.now())
      };
      var res = await apiGet(body, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не выдалось — Deploy?");
        return;
      }
      document.getElementById("phAccEditId").value = "";
      document.getElementById("phAccUser").value = "";
      document.getElementById("phAccTid").value = "";
      document.getElementById("phAccName").value = "";
      partnerHubCancelForm_("acc");
      partnerHubCache_ = null;
      await loadPartnerHubUi_({ force: 1 });
      showToast("Доступ выдан");
    }

    async function partnerHubRevokeAccess_(id) {
      var ok = await uiConfirmAsync("Отозвать доступ?");
      if (!ok) return;
      var res = await apiGet({
        action: "partnerRevokeAccess",
        telegramId: myTelegramId,
        id: id,
        _: String(Date.now())
      }, { timeoutMs: 15000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не отозвалось");
        return;
      }
      partnerHubCache_ = null;
      await loadPartnerHubUi_({ force: 1 });
      showToast("Отозвано");
    }

    async function partnerHubSeedDefaults_() {
      var ok = await uiConfirmAsync("Залить демо-сети/точки/доступы из varka? Существующие перезапишутся только если листы пустые (force — отдельно).");
      if (!ok) return;
      var res = await apiGet({
        action: "partnerSeedDefaults",
        telegramId: myTelegramId,
        force: "0",
        _: String(Date.now())
      }, { timeoutMs: 45000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не залилось — Deploy Code.gs");
        return;
      }
      partnerHubCache_ = null;
      await loadPartnerHubUi_({ force: 1 });
      showToast(res.result && res.result.seeded ? "Демо залито" : "Уже было — ничего не трогал");
    }

    async function partnerHubSaveNotify_() {
      var recipients = [];
      document.querySelectorAll(".ph-notify-check:checked").forEach(function (el) {
        var tid = String(el.value || "").trim();
        if (!tid) return;
        var name = "";
        try {
          var b = el.parentElement && el.parentElement.querySelector("b");
          if (b) name = String(b.textContent || "").trim();
        } catch (eN) {}
        recipients.push({ telegramId: tid, name: name });
      });
      showToast("Сохраняю…");
      var res = await apiGet({
        action: "partnerSetNotifyRecipients",
        telegramId: myTelegramId,
        recipients: JSON.stringify(recipients),
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        showToast((res && res.message) || "Не сохранилось — Deploy Code.gs?");
        return;
      }
      if (partnerHubCache_) partnerHubCache_.notifyRecipients = res.notifyRecipients || recipients;
      showToast("Ответственных: " + (res.count != null ? res.count : recipients.length));
    }

    window.partnerHubCancelForm_ = partnerHubCancelForm_;
    window.partnerHubToggleForm_ = partnerHubToggleForm_;
    window.setPartnerHubTab_ = setPartnerHubTab_;
    window.loadPartnerHubUi_ = loadPartnerHubUi_;
    window.partnerHubRenderPointChecks_ = partnerHubRenderPointChecks_;
    window.partnerHubEditNetwork_ = partnerHubEditNetwork_;
    window.partnerHubEditPoint_ = partnerHubEditPoint_;
    window.partnerHubEditAccess_ = partnerHubEditAccess_;
    window.partnerHubSaveNetwork_ = partnerHubSaveNetwork_;
    window.partnerHubSavePoint_ = partnerHubSavePoint_;
    window.partnerHubSaveAccess_ = partnerHubSaveAccess_;
    window.partnerHubRevokeAccess_ = partnerHubRevokeAccess_;
    window.partnerHubSeedDefaults_ = partnerHubSeedDefaults_;
    window.partnerHubSaveNotify_ = partnerHubSaveNotify_;

    async function assignRole(targetId) {
      var sel = document.getElementById("role_" + targetId);
      var role = sel ? sel.value : "denied";
      var tzEl = document.getElementById("tz_" + targetId);
      var tz = tzEl ? tzEl.value : "";
      await apiPost({
        action: "setAccessRole",
        actorId: myTelegramId,
        targetId: targetId,
        role: role,
        timezone: tz
      });
      showToast("Роль " + role);
      window._peopleCacheHtml = "";
      loadPeople();
    }
    window.assignRole = assignRole;

    async function assignTimezone(targetId) {
      var tzEl = document.getElementById("tz_" + targetId);
      var tz = tzEl ? tzEl.value : "Europe/Minsk";
      try {
        var res = await apiGet({
          action: "setAccessTimezone",
          actorId: myTelegramId,
          targetId: targetId,
          timezone: tz,
          _: String(Date.now())
        }, { timeoutMs: 15000, cacheTtlMs: 0 });
        if (!res || res.status !== "success") {
          await apiPost({
            action: "setAccessTimezone",
            actorId: myTelegramId,
            targetId: targetId,
            timezone: tz
          });
        }
        showToast("Часовой пояс: " + tz);
      } catch (e) {
        showToast("Не сохранилось — нужен Deploy Code.gs");
      }
      window._peopleCacheHtml = "";
      loadPeople();
    }
    window.assignTimezone = assignTimezone;

    function syncAppTopSpacer() {
      var top = document.getElementById("appTopBar");
      var sp = document.getElementById("appTopSpacer");
      if (!top || !sp) return;
      var h = Math.ceil(top.getBoundingClientRect().height || top.offsetHeight || 0);
      if (h > 0) sp.style.height = h + "px";
    }
    window.syncAppTopSpacer = syncAppTopSpacer;

    try { loadDepotAddress(); } catch (e) {}

    try {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          try { renderBasket(); } catch (e0) {}
          try { renderOrderNotes(); } catch (e1) {}
        });
      } else {
        setTimeout(function () {
          try { renderBasket(); } catch (e0) {}
          try { renderOrderNotes(); } catch (e1) {}
        }, 0);
      }
    } catch (eBootUi) {}
    try { bindOrderLongPress(); } catch (e) {}
    try { bindCourierLongPress(); } catch (e) {}
    try { setOrderType(orderType || 'pp'); updateNotesSummary(); } catch (e) {}
    try { bootstrapAccess(); } catch (e) { try { applyRoleTabs({ skipNetwork: true }); } catch (e2) {} }
    try { updateTasksBadge(); } catch (eTb0) {}
    try { setTimeout(function () { try { consumeXferDeepLink_(); } catch (eXf) {} }, 900); } catch (eXf2) {}
    try { applyTelegramSafeArea(); } catch (e) {}
    try { syncAppTopSpacer(); } catch (e) {}
    try {
      window.addEventListener("resize", syncAppTopSpacer);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", syncAppTopSpacer);
      setTimeout(syncAppTopSpacer, 50);
      setTimeout(syncAppTopSpacer, 400);
    } catch (eR) {}
    clearBlockingOverlays();

    function bootIdleWork_() {
      try { registerMeAsCourier(); } catch (e) {}
      try {
        if (document.getElementById("departHourCol") && !window._timeWheelsBuilt) {
          buildTimeWheels();
          window._timeWheelsBuilt = true;
        }
      } catch (eW) {}
      if (window.__BOINYA_C_TURBO__) return;
      try {
        var dayEl = document.getElementById("day");
        var dayName = dayEl && dayEl.value ? String(dayEl.value) : "";
        if (dayName) {
          apiGet({ action: "getClients", day: dayName }, { retries: 0, cacheTtlMs: 20000 }).catch(function () {});
        }
        apiGet({ action: "getWeekDayCounts" }, { retries: 0, cacheTtlMs: 30000 }).catch(function () {});
        apiGet({ action: "getWeekBannerState" }, { retries: 0, cacheTtlMs: 30000 }).catch(function () {});
        apiGet({ action: "getStats", period: "month" }, { retries: 0, cacheTtlMs: 120000 }).catch(function () {});
        apiGet({ action: "listSubscriptions" }, { retries: 0, cacheTtlMs: 60000 }).catch(function () {});
        if (APP_ROLE === "cutter" || APP_ROLE === "owner" || APP_ROLE === "all" || APP_ROLE === "courier") {
          var cutSel = document.getElementById("cuttingDaySelect");
          var cutDay = (cutSel && cutSel.value) || dayName;
          if (cutDay) apiGet({ action: "getCutting", day: cutDay }, { retries: 0, cacheTtlMs: 20000 }).catch(function () {});
          var courSel = document.getElementById("courierDaySelect");
          var courDay = (courSel && courSel.value) || dayName;
          if (courDay) apiGet({ action: "getCourier", day: courDay }, { retries: 0, cacheTtlMs: 20000 }).catch(function () {});
        }
      } catch (ePf) {}
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(bootIdleWork_, { timeout: window.__BOINYA_C_TURBO__ ? 8000 : 1800 });
    } else {
      setTimeout(bootIdleWork_, window.__BOINYA_C_TURBO__ ? 5000 : 800);
    }
  