/* Партнёры: те же запросы, что partner hub. Сид сетей не переносим. */
(function (root) {
  "use strict";

  var access = null;
  var tab = "orders";
  var hub = null;
  var suggests = [];
  var requests = [];
  var deferred = [];
  var cardId = "";
  var bpList = [];
  var prompted = false;
  var VARKa = "https://konchaarsenia-a11y.github.io/superboyna/varka/";

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function ax() { return root.BoinyaAccess; }
  function L() { return root.BoinyaPartnersLogic; }
  function esc(s) { return sh().esc(s); }

  function tid() {
    var u = api().telegramUser() || {};
    return String((access && access.telegramId) || u.id || "");
  }

  function tabs() {
    var labels = { orders: "Заказы", points: "Точки" };
    var legacy = ["people", "nets", "notify", "bp"];
    function allowed(id) {
      if (!access || access.role === "owner") return true;
      if (ax().tabHas(access, "partnerHubScreen")) return true;
      if (ax().tabHas(access, "partnerHubScreen." + id)) return true;
      for (var i = 0; i < legacy.length; i++) {
        if (ax().tabHas(access, "partnerHubScreen." + legacy[i])) return true;
      }
      return false;
    }
    var list = [];
    ["orders", "points"].forEach(function (id) {
      if (allowed(id)) list.push({ id: id, label: labels[id] });
    });
    if (!list.length) {
      list = [{ id: "orders", label: "Заказы" }, { id: "points", label: "Точки" }];
    }
    return list;
  }

  function segBar() {
    return '<div class="b-seg" style="margin-top:12px">' + tabs().map(function (s) {
      return '<button type="button" class="b-seg__item' + (s.id === tab ? " b-seg__item--on" : "") + '" data-act="ph-tab" data-seg="' + s.id + '">' + esc(s.label) + "</button>";
    }).join("") + "</div>";
  }

  function shortDm(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3 || !p[2]) return "";
    return p[2] + "." + p[1];
  }

  function miniHref() {
    return (hub && hub.miniAppUrl) || VARKa;
  }

  function paintChrome() {
    sh().dock("");
    sh().main(
      '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>' +
      '<article class="b-card">' +
        '<div class="nx-cut-head" style="justify-content:space-between">' +
          '<p class="b-lbl" style="margin:0">Партнёры</p>' +
          '<div class="nx-actions" style="margin:0">' +
            '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-reload" aria-label="Обновить">↻</button>' +
            '<a class="b-btn b-btn--main b-btn--sm" id="partnerHubOpenLink" href="' + esc(miniHref()) + '" target="_blank" rel="noopener">Мини-апп</a>' +
          "</div></div>" +
        segBar() +
      "</article>" +
      '<div id="phBody"></div>'
    );
    paintBody();
  }

  function paintSuggest() {
    var box = document.getElementById("phSuggestList");
    var badge = document.getElementById("phSuggestBadge");
    if (!box) return;
    var fresh = 0;
    suggests.forEach(function (it) { if (it && String(it.status || "") === "новое") fresh++; });
    if (badge) badge.textContent = String(fresh);
    if (!suggests.length) { box.innerHTML = '<p class="b-note">Предложений пока нет</p>'; return; }
    box.innerHTML = suggests.map(function (it) {
      var st = L().partnerSuggestStatusRu_(it.status);
      var who = it.authorNick ? ("@" + String(it.authorNick).replace(/^@/, "")) : (it.authorName || it.authorTid || "");
      var where = [it.pointName, it.networkName].filter(Boolean).join(", ");
      return '<article class="b-card" style="margin-top:8px' + (st === "отклонено" ? ";opacity:.55" : "") + '">' +
        "<b>" + esc(it.typeLabel || it.type || "Предложение") + "</b>, " + esc(it.name || "") +
        '<p class="b-note">' + esc(it.cityAddress || "") + (it.contact ? (", " + esc(it.contact)) : "") + "</p>" +
        (it.comment ? ('<p>' + esc(it.comment) + "</p>") : "") +
        '<p class="b-note">от ' + esc(who) + (where ? (", " + esc(where)) : "") + ", " + esc(st) + "</p>" +
        '<div class="nx-actions">' +
        ["просмотрено", "в работе", "отклонено"].map(function (s) {
          return '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-st" data-id="' + esc(it.id) + '" data-st="' + esc(s) + '"' +
            (st === s ? ' aria-pressed="true"' : "") + ">" + esc(s) + "</button>";
        }).join("") + "</div></article>";
    }).join("");
  }

  function netOptions(prefer) {
    var nets = ((hub && hub.networks) || []).filter(function (n) { return n.active !== false; });
    return nets.map(function (n) {
      return '<option value="' + esc(n.id) + '"' + (prefer && prefer === n.id ? " selected" : "") + ">" + esc(n.name) + "</option>";
    }).join("");
  }

  function paintOrders() {
    var items = L().partnerHubOrders_(deferred);
    if (!items.length) return '<p class="b-note">Заявок пока нет</p>';
    return items.map(function (it) {
      var pl = it.payload || {};
      var dateIso = String(pl.deliverDateIso || "").trim();
      var need = !dateIso;
      var lines = (pl.basket || []).map(function (b) {
        return esc(b.name || b.id) + " × " + esc(String(b.qty)) + (b.unit && b.unit !== "г" ? (" " + esc(b.unit)) : "");
      }).join("<br>");
      var st = String(pl.orderStatus || "new").toLowerCase();
      var stRu = st === "in_transit" ? "в пути" : (st === "delivered" ? "доставлено" : (need ? "нужна дата" : "дата есть"));
      var html = '<article class="b-card" style="margin-top:8px"><b>' + esc(it.title || pl.locationName || "Партнёр") + "</b>" +
        '<p class="b-note">' + esc(stRu) +
        (pl.partnerName || pl.partnerUsername ? (", " + esc(pl.partnerName || ("@" + pl.partnerUsername))) : "") + "</p>" +
        (lines ? ('<p class="b-note">' + lines + "</p>") : "") +
        (String(pl.note || pl.partnerNote || "").trim() ? ('<p>' + esc(String(pl.note || pl.partnerNote)) + "</p>") : "");
      if (need && st !== "delivered") {
        html += '<div class="nx-actions" style="margin-top:8px">' +
          '<button type="button" class="b-btn b-btn--main" data-act="ph-slot" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '" data-title="' + esc(it.title || pl.locationName || "Заявка партнёра") + '">Назначить дату</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="ph-del" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '">Удалить</button></div>';
      } else if (st !== "delivered") {
        html += '<p class="b-note">Дата ' + esc(shortDm(pl.deliverDateIso)) + "</p>";
        html += '<div class="nx-actions" style="margin-top:8px">';
        html += '<button type="button" class="b-btn b-btn--sec" data-act="ph-move" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '" data-date="' + esc(pl.deliverDateIso || "") + '" data-title="' + esc(it.title || pl.locationName || "Заявка партнёра") + '">Перенести</button>';
        if (st !== "in_transit") html += '<button type="button" class="b-btn b-btn--sec" data-act="ph-transit" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '">В пути</button>';
        html += '<button type="button" class="b-btn b-btn--sec" data-act="ph-done" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '">Доставлено</button>' +
          '<button type="button" class="b-btn b-btn--sec" data-act="ph-del" data-id="' + esc(it.id) + '" data-po="' + esc(pl.partnerOrderId || "") + '">Удалить</button></div>';
      }
      return html + "</article>";
    }).join("");
  }

  function paintPeople() {
    var acc = ((hub && hub.access) || []).filter(L().partnerAccessOpen_);
    var pts = (hub && hub.points) || [];
    var list = acc.length ? acc.map(function (a) {
      var ptsLab = (a.pointIds || []).map(function (pid) {
        var hit = pts.filter(function (p) { return p.id === pid; })[0];
        return hit ? L().partnerPointFace_(hit).name : pid;
      }).join(", ");
      return '<div class="nx-line"><div class="b-grow"><b>@' + esc(a.username || "—") + "</b>" +
        (a.name ? (' <span class="b-note">' + esc(a.name) + "</span>") : "") +
        '<div class="b-note">' + esc(ptsLab || "нет точек") + "</div></div>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-acc-edit" data-id="' + esc(a.id) + '">Править</button>' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-acc-x" data-id="' + esc(a.id) + '" data-user="' + esc(String(a.username || "").replace(/^@/, "")) + '" data-tid="' + esc(a.telegramId || "") + '">✕</button></div>';
    }).join("") : '<p class="b-note">Никого нет — «+ Выдать»</p>';
    var checks = ((hub && hub.points) || []).filter(function (p) { return p && p.active !== false && !L().partnerPointHidden_(p); });
    var box = checks.length ? checks.map(function (p) {
      var net = ((hub && hub.networks) || []).filter(function (n) { return n.id === p.networkId; })[0];
      var face = L().partnerPointFace_(p);
      var lab = (net && net.name ? (net.name + ", ") : "") + face.name;
      return '<label class="nx-check"><input type="checkbox" class="ph-pt-check" value="' + esc(p.id) + '"><span>' + esc(lab) + "</span></label>";
    }).join("") : '<span class="b-note">Нет точек</span>';
    return '<div class="nx-cut-head" style="justify-content:space-between"><p class="b-note" style="margin:0">@username → точки мини-аппа</p>' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-acc-toggle">+ Выдать</button></div>' +
      '<div id="phAccForm" hidden style="margin-top:8px">' +
        '<label class="b-field"><span class="b-note">@username</span><input class="b-field__input" id="phAccUser" autocomplete="off"></label>' +
        '<label class="b-field" style="margin-top:8px"><span class="b-note">Имя</span><input class="b-field__input" id="phAccName"></label>' +
        '<label class="b-field" style="margin-top:8px"><span class="b-note">Telegram ID</span><input class="b-field__input" id="phAccTid" inputmode="numeric"></label>' +
        '<label class="b-field" style="margin-top:8px"><span class="b-note">Сеть</span><select class="b-field__input" id="phAccNetwork">' + netOptions() + "</select></label>" +
        '<div id="phAccPoints" style="margin-top:8px">' + box + "</div>" +
        '<input type="hidden" id="phAccEditId" value="">' +
        '<div class="nx-actions" style="margin-top:8px"><button type="button" class="b-btn b-btn--main" data-act="ph-acc-save">Сохранить</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="ph-acc-cancel">Отмена</button></div></div>' + list;
  }

  function pointById(id) {
    return ((hub && hub.points) || []).filter(function (p) { return p && p.id === id; })[0] || null;
  }

  function accessOnPoint(pid, role) {
    return ((hub && hub.access) || []).filter(function (a) {
      if (!a || a.status === "revoked" || a.active === false) return false;
      if (String(a.role || "partner") !== role) return false;
      return (a.pointIds || []).indexOf(pid) >= 0;
    });
  }

  function paintPointList() {
    var pts = ((hub && hub.points) || []).filter(function (p) { return p && !L().partnerPointHidden_(p); });
    var nets = (hub && hub.networks) || [];
    var list = pts.length ? pts.map(function (p) {
      var face = L().partnerPointFace_(p);
      var net = nets.filter(function (n) { return n.id === p.networkId; })[0];
      var inactive = p.active === false;
      return '<button type="button" class="nx-line" data-act="ph-pt-open" data-id="' + esc(p.id) + '" style="width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:8px 0">' +
        '<div class="b-grow"><b>' + esc(face.name) + "</b>" + (inactive ? ' <span class="b-note">(выкл)</span>' : "") +
        '<div class="b-note">' + esc((net && net.name) || "") + (face.address ? (", " + esc(face.address)) : "") + "</div></div></button>";
    }).join("") : '<p class="b-note">Нет точек</p>';
    return '<div class="nx-cut-head" style="justify-content:space-between"><p class="b-note" style="margin:0">Точки</p>' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-pt-new">+ Точка</button></div>' + list;
  }

  function paintPointCard() {
    var p = cardId && cardId !== "new" ? pointById(cardId) : null;
    var face = p ? L().partnerPointFace_(p) : { name: "", address: "" };
    var netId = p ? (p.networkId || "") : "";
    var net = ((hub && hub.networks) || []).filter(function (n) { return n.id === netId; })[0];
    var owner = p ? (accessOnPoint(p.id, "partner")[0] || null) : null;
    var staff = p ? accessOnPoint(p.id, "staff") : [];
    var consent = String((p && p.paidConsent) || "pending");
    var inactive = !!(p && p.active === false);
    var staffHtml = staff.length ? staff.map(function (a) {
      var who = a.username ? ("@" + String(a.username).replace(/^@/, "")) : (a.name || a.telegramId || a.id);
      return '<div class="nx-line"><div class="b-grow"><b>' + esc(who) + "</b>" +
        (a.name ? (' <span class="b-note">' + esc(a.name) + "</span>") : "") +
        (a.telegramId ? ('<div class="b-note">' + esc(a.telegramId) + "</div>") : "") +
        "</div>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-staff-x" data-id="' + esc(a.id) + '" data-user="' + esc(String(a.username || "").replace(/^@/, "")) + '" data-tid="' + esc(a.telegramId || "") + '">Убрать</button></div>';
    }).join("") : '<p class="b-note">Сотрудников точки нет</p>';
    return '<button type="button" class="nx-link" data-act="ph-pt-list">← К точкам</button>' +
      '<p class="b-lbl">' + (p ? "Точка" : "Новая точка") + "</p>" +
      '<input type="hidden" id="phCardId" value="' + esc(p ? p.id : "") + '">' +
      '<label class="b-field"><span class="b-note">Название</span><input class="b-field__input" id="phCardName" value="' + esc(face.name || "") + '"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Адрес</span><input class="b-field__input" id="phCardAddr" value="' + esc(face.address || "") + '"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Сеть</span><select class="b-field__input" id="phCardNet">' +
        netOptions(netId) +
        '<option value="__new"' + (!netId ? " selected" : "") + ">+ новая сеть</option></select></label>" +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Название сети</span><input class="b-field__input" id="phCardNetName" value="' + esc((net && net.name) || "") + '" placeholder="для новой или переименования"></label>' +
      '<p class="b-lbl" style="margin-top:14px">Хозяин точки</p>' +
      '<input type="hidden" id="phOwnId" value="' + esc(owner ? (owner.id || "") : "") + '">' +
      '<label class="b-field"><span class="b-note">@username</span><input class="b-field__input" id="phOwnUser" value="' + esc(owner ? (owner.username || "") : "") + '" autocomplete="off"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Имя</span><input class="b-field__input" id="phOwnName" value="' + esc(owner ? (owner.name || "") : "") + '"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Telegram ID</span><input class="b-field__input" id="phOwnTid" inputmode="numeric" value="' + esc(owner ? (owner.telegramId || "") : "") + '"></label>' +
      '<p class="b-lbl" style="margin-top:14px">Сотрудники точки</p>' + staffHtml +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Новый сотрудник, @username</span><input class="b-field__input" id="phStaffUser" autocomplete="off"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Имя</span><input class="b-field__input" id="phStaffName"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Telegram ID</span><input class="b-field__input" id="phStaffTid" inputmode="numeric"></label>' +
      '<label class="b-field" style="margin-top:14px"><span class="b-note">Согласие на платные лакомства</span><select class="b-field__input" id="phCardConsent">' +
        '<option value="pending"' + (consent === "pending" ? " selected" : "") + ">Ещё не ответили</option>" +
        '<option value="accepted"' + (consent === "accepted" ? " selected" : "") + ">Согласны</option>" +
        '<option value="declined"' + (consent === "declined" ? " selected" : "") + ">Отказались</option></select></label>" +
      '<div class="nx-actions" style="margin-top:12px">' +
        '<button type="button" class="b-btn b-btn--main" data-act="ph-card-save">Сохранить</button>' +
        (p && inactive ? '<button type="button" class="b-btn b-btn--sec" data-act="ph-pt-back" data-id="' + esc(p.id) + '">Вернуть</button>' : "") +
        (p && !inactive ? '<button type="button" class="b-btn b-btn--sec" data-act="ph-pt-del" data-id="' + esc(p.id) + '">Удалить</button>' : "") +
      "</div>";
  }

  function paintRequests() {
    var rows = (requests || []).filter(function (r) {
      var st = String((r && r.status) || "new");
      return st === "new" || st === "pending";
    });
    if (!rows.length) return '<p class="b-note">Новых запросов нет</p>';
    return rows.map(function (r) {
      var who = r.username ? ("@" + String(r.username).replace(/^@/, "")) : (r.name || r.telegramId || "");
      return '<article class="b-card" style="margin-top:8px"><b>' + esc(r.venueName || "Точка") + "</b>" +
        '<p class="b-note">' + esc(r.address || "") + "</p>" +
        '<p class="b-note">' + esc(who) + (r.name ? (", " + esc(r.name)) : "") + (r.phone ? (", " + esc(r.phone)) : "") + "</p>" +
        '<div class="nx-actions">' +
          '<button type="button" class="b-btn b-btn--main b-btn--sm" data-act="ph-req-ok" data-id="' + esc(r.id) + '">Подключить</button>' +
          '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-req-no" data-id="' + esc(r.id) + '">Отклонить</button>' +
        "</div></article>";
    }).join("");
  }

  function paintNets() {
    var nets = (hub && hub.networks) || [];
    var list = nets.length ? nets.map(function (n) {
      return '<div class="nx-line"><div class="b-grow"><b>' + esc(n.name) + "</b>" + (n.active === false ? ' <span class="b-note">(выкл)</span>' : "") + "</div>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-net-edit" data-id="' + esc(n.id) + '">Изменить</button></div>';
    }).join("") : '<p class="b-note">Пусто — «+ Сеть»</p>';
    return '<div class="nx-cut-head" style="justify-content:space-between"><p class="b-note" style="margin:0">Сети (бренд)</p>' +
      '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-net-toggle">+ Сеть</button></div>' +
      '<div id="phNetForm" hidden style="margin-top:8px">' +
        '<label class="b-field"><span class="b-note">Название</span><input class="b-field__input" id="phNetName"></label>' +
        '<input type="hidden" id="phNetLogo" value=""><input type="hidden" id="phNetEditId" value="">' +
        '<div class="nx-actions" style="margin-top:8px"><button type="button" class="b-btn b-btn--main" data-act="ph-net-save">Сохранить</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="ph-net-cancel">Отмена</button></div></div>' + list;
  }

  function paintNotify() {
    var selected = {};
    ((hub && hub.notifyRecipients) || []).forEach(function (r) {
      var id = String((r && r.telegramId) || r || "").trim();
      if (id) selected[id] = true;
    });
    var cands = (hub && hub.notifyCandidates) || [];
    var list = cands.length ? cands.map(function (p) {
      var id = String(p.telegramId || "");
      var label = p.name || p.username || id;
      var meta = [];
      if (p.username) meta.push("@" + p.username);
      if (p.role) meta.push(p.role);
      return '<label class="nx-check"><input type="checkbox" class="ph-notify-check" value="' + esc(id) + '"' + (selected[id] ? " checked" : "") + ">" +
        "<span><b>" + esc(label) + "</b>" + (meta.length ? (' <span class="b-note">' + esc(meta.join(", ")) + "</span>") : "") + "</span></label>";
    }).join("") : '<p class="b-note">Нет сотрудников — сначала роли в «Доступах»</p>';
    return '<p class="b-note">Кому слать заявки из мини-аппа. Тот же ключ «Новая заявка партнёра», что в Доступах. Владельцы включены по умолчанию.</p>' +
      list;
  }

  function paintBp() {
    var list = bpList.length ? bpList.map(function (p) {
      return '<article class="b-card" style="margin-top:8px"><b>' + esc(p.name) + "</b>" +
        (p.active === false ? ' <span class="b-note">(выкл)</span>' : "") +
        (p.note ? ('<p class="b-note">' + esc(p.note) + "</p>") : "") +
        '<div class="nx-actions">' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-bp-edit" data-id="' + esc(p.id) + '">Изменить</button>' +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-bp-toggle" data-id="' + esc(p.id) + '" data-on="' + (p.active === false ? "1" : "0") + '">' +
        (p.active === false ? "Включить" : "Выключить") + "</button>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-bp-del" data-id="' + esc(p.id) + '" data-name="' + esc(p.name || "") + '">Удалить</button></div></article>';
    }).join("") : '<p class="b-note">Пока пусто — добавьте первого партнёра выше</p>';
    return '<p class="b-lbl">Партнёры (источник БП)</p>' +
      '<p class="b-note">При заказе БП обязательно указать, кто привёл. Здесь список для выбора (+ «Другое» в заказе).</p>' +
      '<label class="b-field"><span class="b-note">Имя</span><input class="b-field__input" id="partnerNameInput"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Заметка</span><input class="b-field__input" id="partnerNoteInput"></label>' +
      '<input type="hidden" id="partnerEditId" value="">' + list;
  }

  function paintBody() {
    var box = document.getElementById("phBody");
    if (!box) return;
    var inner = "";
    if (tab === "points") {
      inner = cardId ? paintPointCard() : paintPointList();
    } else {
      var fresh = 0;
      suggests.forEach(function (it) { if (it && String(it.status || "") === "новое") fresh++; });
      inner = '<p class="b-lbl">Заявки</p>' + paintOrders() +
        '<p class="b-lbl" style="margin-top:16px">Запросы на подключение</p>' + paintRequests() +
        '<div class="nx-cut-head" style="justify-content:space-between;margin-top:16px"><p class="b-lbl" style="margin:0">Предложения <b id="phSuggestBadge">' + fresh + "</b></p>" +
        '<button type="button" class="b-btn b-btn--sec b-btn--sm" data-act="ph-sug" aria-label="Обновить предложения">↻</button></div>' +
        '<div id="phSuggestList"></div>';
    }
    box.innerHTML = '<article class="b-card" style="margin-top:12px">' + inner + "</article>";
    if (tab !== "points") paintSuggest();
    sh().dock("");
  }

  async function loadHub(opts) {
    opts = opts || {};
    try {
      var res = await api().apiGet({
        action: "partnerListAdmin",
        telegramId: tid(),
        force: opts.force ? "1" : undefined,
        _: String(Date.now())
      }, { timeoutMs: 35000, cacheTtlMs: 0 });
      if (res && res.status === "success") hub = res;
    } catch (e) {}
    if (document.getElementById("phBody")) {
      var link = document.getElementById("partnerHubOpenLink");
      if (link) link.href = miniHref();
      paintBody();
    }
  }

  async function loadSuggest(opts) {
    opts = opts || {};
    var box = document.getElementById("phSuggestList");
    if (box && !opts.soft && !suggests.length) box.innerHTML = '<p class="b-note">Загрузка…</p>';
    try {
      var res = await api().apiGet({
        action: "partnerListSuggestions",
        telegramId: tid(),
        force: opts.force ? "1" : undefined,
        _: String(Date.now())
      }, { timeoutMs: 25000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        if (box && !suggests.length) box.innerHTML = '<p class="b-note">' + esc((res && res.message) || "Не загрузилось") + "</p>";
        return;
      }
      suggests = res.suggestions || [];
      paintSuggest();
    } catch (e) {
      if (box && !suggests.length) box.innerHTML = '<p class="b-note">Ошибка загрузки</p>';
    }
  }

  async function loadRequests(opts) {
    opts = opts || {};
    try {
      var res = await api().apiGet({
        action: "partnerAccessRequestList",
        telegramId: tid(),
        force: opts.force ? "1" : undefined,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (res && res.status === "success") requests = res.rows || res.requests || [];
    } catch (e) {}
    if (tab === "orders" && document.getElementById("phBody")) paintBody();
  }

  function fieldVal(id) {
    return String((document.getElementById(id) || {}).value || "").trim();
  }

  async function saveCard() {
    var name = fieldVal("phCardName");
    var address = fieldVal("phCardAddr");
    var netSel = fieldVal("phCardNet");
    var netName = fieldVal("phCardNetName");
    if (!name) { sh().toast("Название точки"); return; }
    var networkId = netSel;
    if (!networkId || networkId === "__new") {
      if (!netName) { sh().toast("Название сети"); return; }
      var made = await api().apiGet({
        action: "partnerSaveNetwork",
        telegramId: tid(),
        name: netName,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!made || made.status !== "success" || !made.id) {
        sh().toast((made && made.message) || "Сеть не сохранилась");
        return;
      }
      networkId = made.id;
    } else if (netName) {
      var cur = ((hub && hub.networks) || []).filter(function (n) { return n.id === networkId; })[0];
      if (!cur || String(cur.name || "") !== netName) {
        await api().apiGet({
          action: "partnerSaveNetwork",
          telegramId: tid(),
          id: networkId,
          name: netName,
          _: String(Date.now())
        }, { timeoutMs: 20000, cacheTtlMs: 0 });
      }
    }
    var pointRes = await api().apiGet({
      action: "partnerSavePoint",
      telegramId: tid(),
      id: fieldVal("phCardId"),
      networkId: networkId,
      name: name,
      address: address,
      paidConsent: fieldVal("phCardConsent") || "pending",
      active: "yes",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!pointRes || pointRes.status !== "success") {
      sh().toast((pointRes && pointRes.message) || "Точка не сохранилась");
      return;
    }
    var pointId = pointRes.id || fieldVal("phCardId");
    var ownUser = fieldVal("phOwnUser").replace(/^@/, "");
    var ownTid = fieldVal("phOwnTid");
    var ownName = fieldVal("phOwnName");
    if (ownUser || ownTid) {
      var ownRes = await api().apiGet({
        action: "partnerSaveAccess",
        telegramId: tid(),
        id: fieldVal("phOwnId"),
        username: ownUser,
        targetTelegramId: ownTid,
        name: ownName,
        networkId: networkId,
        pointIds: JSON.stringify([pointId]),
        role: "partner",
        status: "active",
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!ownRes || ownRes.status !== "success") {
        sh().toast((ownRes && ownRes.message) || "Хозяин не сохранился");
      }
    }
    var staffUser = fieldVal("phStaffUser").replace(/^@/, "");
    var staffTid = fieldVal("phStaffTid");
    if (staffUser || staffTid) {
      var staffRes = await api().apiGet({
        action: "partnerSaveAccess",
        telegramId: tid(),
        username: staffUser,
        targetTelegramId: staffTid,
        name: fieldVal("phStaffName"),
        networkId: networkId,
        pointIds: JSON.stringify([pointId]),
        role: "staff",
        status: "active",
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!staffRes || staffRes.status !== "success") {
        sh().toast((staffRes && staffRes.message) || "Сотрудник не сохранился");
      }
    }
    sh().toast("Точка сохранена");
    cardId = pointId || cardId;
    hub = null;
    await loadHub({ force: 1 });
    if (cardId) paintBody();
  }

  async function declineRequest(id) {
    var ok = await sh().confirm({ title: "Запрос", text: "Отклонить запрос на подключение?", ok: "Отклонить" });
    if (!ok) return;
    var res = await api().apiGet({
      action: "partnerAccessRequestResolve",
      telegramId: tid(),
      id: id,
      decision: "decline",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не отклонилось"); return; }
    sh().toast("Отклонено");
    await loadRequests({ force: 1 });
  }

  async function connectRequest(id) {
    var req = (requests || []).filter(function (r) { return r && String(r.id) === String(id); })[0];
    if (!req) return;
    var nets = ((hub && hub.networks) || []).filter(function (n) { return n && n.active !== false; });
    var opts = nets.map(function (n) {
      return '<option value="' + esc(n.id) + '">' + esc(n.name) + "</option>";
    }).join("") + '<option value="__new">+ новая сеть</option>';
    sh().openSheet({
      title: "Подключить точку",
      html: '<p class="b-note">' + esc(req.venueName || "") + ", " + esc(req.address || "") + "</p>" +
        '<label class="b-field"><span class="b-note">Сеть</span><select class="b-field__input" id="phReqNet">' + opts + "</select></label>" +
        '<label class="b-field" style="margin-top:8px"><span class="b-note">Новая сеть</span><input class="b-field__input" id="phReqNetName" placeholder="если выбрана новая"></label>' +
        '<input type="hidden" id="phReqId" value="' + esc(req.id) + '">',
      foot: '<button type="button" class="b-btn b-btn--main" data-act="ph-req-go">Создать точку</button>'
    });
  }

  async function finishConnect() {
    var id = fieldVal("phReqId");
    var req = (requests || []).filter(function (r) { return r && String(r.id) === String(id); })[0];
    if (!req) { sh().toast("Запрос не найден"); return; }
    var netSel = fieldVal("phReqNet");
    var netName = fieldVal("phReqNetName");
    var networkId = netSel;
    if (!networkId || networkId === "__new") {
      if (!netName) { sh().toast("Название сети"); return; }
      var made = await api().apiGet({
        action: "partnerSaveNetwork",
        telegramId: tid(),
        name: netName,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      if (!made || made.status !== "success" || !made.id) {
        sh().toast((made && made.message) || "Сеть не сохранилась");
        return;
      }
      networkId = made.id;
    }
    var pointRes = await api().apiGet({
      action: "partnerSavePoint",
      telegramId: tid(),
      networkId: networkId,
      name: req.venueName || "Точка",
      address: req.address || "",
      active: "yes",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!pointRes || pointRes.status !== "success" || !pointRes.id) {
      sh().toast((pointRes && pointRes.message) || "Точка не создалась");
      return;
    }
    var accRes = await api().apiGet({
      action: "partnerSaveAccess",
      telegramId: tid(),
      username: String(req.username || "").replace(/^@/, ""),
      targetTelegramId: req.telegramId || "",
      name: req.name || "",
      networkId: networkId,
      pointIds: JSON.stringify([pointRes.id]),
      role: "partner",
      status: "active",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!accRes || accRes.status !== "success") {
      sh().toast((accRes && accRes.message) || "Доступ не выдан");
      return;
    }
    var done = await api().apiGet({
      action: "partnerAccessRequestResolve",
      telegramId: tid(),
      id: id,
      decision: "connect",
      networkId: networkId,
      pointId: pointRes.id,
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!done || done.status !== "success") {
      sh().toast((done && done.message) || "Статус запроса не обновился");
      return;
    }
    try { sh().closeTop("ok"); } catch (e) {}
    sh().toast("Точка подключена");
    hub = null;
    await loadHub({ force: 1 });
    await loadRequests({ force: 1 });
  }

  async function loadOrders(opts) {
    opts = opts || {};
    try {
      var res = await api().apiGet({
        action: "listDeferred",
        telegramId: tid(),
        status: "open",
        light: "1",
        force: opts.force ? "1" : undefined,
        _: String(Date.now())
      }, { timeoutMs: 20000, cacheTtlMs: 0 });
      deferred = (res && (res.items || res.deferred)) || [];
    } catch (e) { deferred = []; }
    if (tab === "orders") paintBody();
    if (access && !prompted && (access.role === "owner" || access.role === "manager" || access.role === "all")) {
      var pending = L().partnerHubOrders_(deferred).filter(L().partnerOrderNeedsDate_);
      if (pending.length) {
        prompted = true;
        var pl = (pending[0] && pending[0].payload) || {};
        sh().toast("Заявка от " + (pl.locationName || pending[0].title || "партнёра") + " — назначьте дату");
      }
    }
  }

  async function loadBp(opts) {
    opts = opts || {};
    try {
      var q = { action: "listPartners", all: "1", telegramId: tid() };
      if (opts.force) { q.force = "1"; q._ = String(Date.now()); }
      var res = await api().apiGet(q, { timeoutMs: 20000, cacheTtlMs: opts.force ? 0 : 15000 });
      if (res && res.status === "success") bpList = res.partners || [];
    } catch (e) {}
    if (tab === "bp" && document.getElementById("phBody")) paintBody();
  }

  function show(nextTab) {
    var allowed = tabs();
    if (nextTab && allowed.some(function (s) { return s.id === nextTab; })) tab = nextTab;
    if (!allowed.some(function (s) { return s.id === tab; })) tab = (allowed[0] && allowed[0].id) || "orders";
    paintChrome();
    loadHub({ soft: true });
    loadSuggest({ soft: true });
    loadRequests({});
    if (tab === "orders") loadOrders({});
  }

  function setTab(next) {
    tab = next;
    if (tab !== "points") cardId = "";
    paintChrome();
    if (tab === "orders") {
      loadOrders({ soft: true });
      loadSuggest({ soft: true });
      loadRequests({});
    }
    if (tab === "points") loadHub({ soft: true });
  }

  function showForm(id, on) {
    var el = document.getElementById(id);
    if (el) el.hidden = !on;
  }

  async function setSuggest(id, status) {
    if (!tid()) { sh().toast("Нужен Telegram"); return; }
    var prev = suggests.slice();
    suggests = suggests.map(function (it) {
      if (!it || String(it.id) !== String(id)) return it;
      var copy = {};
      Object.keys(it).forEach(function (k) { copy[k] = it[k]; });
      copy.status = status;
      return copy;
    });
    paintSuggest();
    try {
      var res = await api().apiGet({ action: "partnerSetSuggestionStatus", telegramId: tid(), id: id, status: status, _: String(Date.now()) }, { timeoutMs: 25000, cacheTtlMs: 0 });
      if (!res || res.status !== "success") {
        suggests = prev;
        paintSuggest();
        sh().toast((res && res.message) || "Не сохранился статус");
        return;
      }
      sh().toast(status === "отклонено" ? "Отклонено" : (status === "в работе" ? "В работе" : "Просмотрено"));
    } catch (e) {
      suggests = prev;
      paintSuggest();
      sh().toast("Сеть / Deploy Code.gs");
    }
  }

  async function assignSlot(id, po, opts) {
    opts = opts || {};
    var dateIso = await sh().pickDate({
      title: "Дата",
      lead: opts.lead || "Заявка партнёра",
      value: opts.value || "",
      verb: opts.verb || "Назначить",
      loadMonth: function (key) {
        return api().apiGet({ action: "getMonthOverview", month: key }, { timeoutMs: 15000, cacheTtlMs: 20000 });
      }
    });
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
    if (!tid()) { sh().toast("Нужен Telegram"); return; }
    var res = await api().apiGet({
      action: "partnerSetOrderSlot",
      telegramId: tid(),
      deferredId: id || "",
      partnerOrderId: po || "",
      id: po || id || "",
      deliverDateIso: dateIso,
      deliverTimeFrom: "19:00",
      deliverTimeTo: "22:00",
      _: String(Date.now())
    }, { timeoutMs: 25000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилась дата, Deploy Code.gs?"); return; }
    sh().toast("Дата назначена, партнёру ушло уведомление");
    loadOrders({ force: true });
    try { if (root.BoinyaTasks && root.BoinyaTasks.refresh) await root.BoinyaTasks.refresh(); } catch (e) {}
  }

  async function orderStatus(id, po, status) {
    if (status === "cancelled") {
      var ok = await sh().confirm({ title: "Заявка", text: "Удалить партнёрскую заявку?", ok: "Удалить" });
      if (!ok) return;
    }
    if (!tid()) { sh().toast("Нужен Telegram"); return; }
    var res = await api().apiGet({
      action: "partnerSetOrderStatus",
      telegramId: tid(),
      deferredId: id || "",
      partnerOrderId: po || "",
      id: po || id || "",
      orderStatus: status,
      status: status,
      _: String(Date.now())
    }, { timeoutMs: 25000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не обновилось, Deploy Code.gs?"); return; }
    sh().toast(status === "cancelled" ? "Заявка удалена" : (status === "delivered" ? "Доставлено, партнёру ушло" : "В пути, партнёру ушло"));
    loadOrders({ force: true });
  }

  async function saveNet() {
    var name = String((document.getElementById("phNetName") || {}).value || "").trim();
    if (!name) { sh().toast("Имя сети"); return; }
    var res = await api().apiGet({
      action: "partnerSaveNetwork",
      telegramId: tid(),
      id: String((document.getElementById("phNetEditId") || {}).value || ""),
      name: name,
      logo: String((document.getElementById("phNetLogo") || {}).value || ""),
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось — Deploy?"); return; }
    sh().toast("Сеть сохранена");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function savePoint() {
    var name = String((document.getElementById("phPointName") || {}).value || "").trim();
    var networkId = String((document.getElementById("phPointNetwork") || {}).value || "");
    if (!name || !networkId) { sh().toast("Сеть и название"); return; }
    var res = await api().apiGet({
      action: "partnerSavePoint",
      telegramId: tid(),
      id: String((document.getElementById("phPointEditId") || {}).value || ""),
      networkId: networkId,
      name: name,
      address: String((document.getElementById("phPointAddr") || {}).value || ""),
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось — Deploy?"); return; }
    sh().toast("Точка сохранена");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function saveAccess() {
    var username = String((document.getElementById("phAccUser") || {}).value || "").replace(/^@/, "").trim();
    var target = String((document.getElementById("phAccTid") || {}).value || "").trim();
    var ids = [];
    document.querySelectorAll(".ph-pt-check:checked").forEach(function (el) { ids.push(el.value); });
    if (!username && !target) { sh().toast("Нужен @username или Telegram ID"); return; }
    if (!ids.length) { sh().toast("Выберите точки"); return; }
    var res = await api().apiGet({
      action: "partnerSaveAccess",
      telegramId: tid(),
      id: String((document.getElementById("phAccEditId") || {}).value || ""),
      username: username,
      targetTelegramId: target,
      name: String((document.getElementById("phAccName") || {}).value || ""),
      networkId: String((document.getElementById("phAccNetwork") || {}).value || ""),
      pointIds: JSON.stringify(ids),
      role: "partner",
      status: "active",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не выдалось — Deploy?"); return; }
    sh().toast("Доступ выдан");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function revoke(node) {
    var ok = await sh().confirm({ title: "Доступ", text: "Отозвать доступ?", ok: "Отозвать" });
    if (!ok) return;
    var res = await api().apiGet({
      action: "partnerRevokeAccess",
      telegramId: tid(),
      id: node.getAttribute("data-id") || "",
      username: node.getAttribute("data-user") || "",
      targetTelegramId: node.getAttribute("data-tid") || "",
      _: String(Date.now())
    }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не отозвалось"); return; }
    sh().toast("Отозвано");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function deletePoint(id) {
    var p = ((hub && hub.points) || []).filter(function (x) { return x.id === id; })[0];
    var ok = await sh().confirm({ title: "Точка", text: "Удалить точку «" + ((p && p.name) || id) + "»? Из мини-аппа пропадёт (можно вернуть).", ok: "Удалить" });
    if (!ok) return;
    var res = await api().apiGet({ action: "partnerDeletePoint", telegramId: tid(), id: id, _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не удалилось — Deploy Code.gs?"); return; }
    sh().toast("Точка удалена");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function restorePoint(id) {
    var p = ((hub && hub.points) || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var res = await api().apiGet({
      action: "partnerSavePoint",
      telegramId: tid(),
      id: p.id,
      networkId: p.networkId || "",
      name: p.name || "",
      address: p.address || "",
      active: "yes",
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не вернулось — Deploy?"); return; }
    sh().toast("Точка возвращена");
    hub = null;
    await loadHub({ force: 1 });
  }

  async function saveNotify() {
    var recipients = [];
    document.querySelectorAll(".ph-notify-check:checked").forEach(function (el) {
      var id = String(el.value || "").trim();
      if (!id) return;
      var b = el.parentElement && el.parentElement.querySelector("b");
      recipients.push({ telegramId: id, name: b ? String(b.textContent || "").trim() : "" });
    });
    sh().toast("Сохраняю…");
    var res = await api().apiGet({
      action: "partnerSetNotifyRecipients",
      telegramId: tid(),
      recipients: JSON.stringify(recipients),
      _: String(Date.now())
    }, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось — Deploy Code.gs?"); return; }
    if (hub) hub.notifyRecipients = res.notifyRecipients || recipients;
    sh().toast("Ответственных: " + (res.count != null ? res.count : recipients.length));
  }

  async function saveBp() {
    var name = String((document.getElementById("partnerNameInput") || {}).value || "").trim();
    var note = String((document.getElementById("partnerNoteInput") || {}).value || "").trim();
    var editId = String((document.getElementById("partnerEditId") || {}).value || "").trim();
    if (!name) { sh().toast("Укажите имя партнёра"); return; }
    var active = "yes";
    if (editId) {
      bpList.forEach(function (p) { if (String(p.id) === editId && p.active === false) active = "no"; });
    }
    var body = { action: "savePartner", name: name, note: note, active: active, telegramId: tid(), force: "1", _: String(Date.now()) };
    if (editId) body.id = editId;
    var res = await api().apiGet(body, { timeoutMs: 20000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не сохранилось — Deploy Code.gs"); return; }
    sh().toast(editId ? "Партнёр обновлён" : "Партнёр добавлен");
    if (Array.isArray(res.partners)) bpList = res.partners;
    await loadBp({ force: 1 });
  }

  async function toggleBp(id, makeActive) {
    var hit = bpList.filter(function (p) { return String(p.id) === String(id); })[0];
    if (!hit) return;
    var res = await api().apiGet({
      action: "savePartner",
      id: id,
      name: hit.name,
      note: hit.note || "",
      active: makeActive ? "yes" : "no",
      telegramId: tid(),
      force: "1",
      _: String(Date.now())
    }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (res && Array.isArray(res.partners)) bpList = res.partners;
    await loadBp({ force: 1 });
  }

  async function deleteBp(id, name) {
    var ok = await sh().confirm({ title: "Партнёр", text: "Убрать партнёра «" + name + "» из списка?", ok: "Убрать" });
    if (!ok) return;
    var res = await api().apiGet({ action: "deletePartner", id: id, name: name, telegramId: tid(), force: "1", _: String(Date.now()) }, { timeoutMs: 15000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast((res && res.message) || "Не удалилось"); await loadBp({ force: 1 }); return; }
    if (Array.isArray(res.partners)) bpList = res.partners;
    await loadBp({ force: 1 });
  }

  function editBp(id) {
    var hit = bpList.filter(function (p) { return String(p.id) === String(id); })[0];
    if (!hit) { sh().toast("Не найден — обновите список"); return; }
    document.getElementById("partnerEditId").value = hit.id || "";
    document.getElementById("partnerNameInput").value = hit.name || "";
    document.getElementById("partnerNoteInput").value = hit.note || "";
    var save = document.getElementById("btnPartnerSave");
    var cancel = document.getElementById("btnPartnerEditCancel");
    if (save) save.textContent = "Сохранить";
    if (cancel) cancel.hidden = false;
    sh().toast("Редактирование: " + (hit.name || ""));
  }

  function onAct(act, node) {
    if (act === "ph-tab") { setTab(node.getAttribute("data-seg")); return true; }
    if (act === "ph-reload") {
      loadHub({ force: 1 });
      if (tab === "orders") { loadOrders({ force: 1 }); loadSuggest({ force: 1 }); loadRequests({ force: 1 }); }
      return true;
    }
    if (act === "ph-sug") { loadSuggest({ force: 1 }); return true; }
    if (act === "ph-st") { setSuggest(node.getAttribute("data-id"), node.getAttribute("data-st")); return true; }
    if (act === "ph-slot" || act === "ph-move") {
      assignSlot(node.getAttribute("data-id"), node.getAttribute("data-po"), {
        lead: node.getAttribute("data-title") || "Заявка партнёра",
        value: node.getAttribute("data-date") || "",
        verb: act === "ph-move" ? "Перенести" : "Назначить"
      });
      return true;
    }
    if (act === "ph-del") { orderStatus(node.getAttribute("data-id"), node.getAttribute("data-po"), "cancelled"); return true; }
    if (act === "ph-transit") { orderStatus(node.getAttribute("data-id"), node.getAttribute("data-po"), "in_transit"); return true; }
    if (act === "ph-done") { orderStatus(node.getAttribute("data-id"), node.getAttribute("data-po"), "delivered"); return true; }
    if (act === "ph-acc-toggle") { showForm("phAccForm", document.getElementById("phAccForm").hidden); return true; }
    if (act === "ph-acc-cancel") { showForm("phAccForm", false); return true; }
    if (act === "ph-acc-save") { saveAccess(); return true; }
    if (act === "ph-acc-edit") {
      var a = ((hub && hub.access) || []).filter(function (x) { return x.id === node.getAttribute("data-id"); })[0];
      if (!a) return true;
      showForm("phAccForm", true);
      document.getElementById("phAccEditId").value = a.id || "";
      document.getElementById("phAccUser").value = a.username || "";
      document.getElementById("phAccTid").value = a.telegramId || "";
      document.getElementById("phAccName").value = a.name || "";
      if (a.networkId && document.getElementById("phAccNetwork")) document.getElementById("phAccNetwork").value = a.networkId;
      var want = {};
      (a.pointIds || []).forEach(function (pid) { want[pid] = true; });
      document.querySelectorAll(".ph-pt-check").forEach(function (el) { el.checked = !!want[el.value]; });
      sh().toast("Правка доступа");
      return true;
    }
    if (act === "ph-acc-x") { revoke(node); return true; }
    if (act === "ph-pt-new") { cardId = "new"; paintBody(); return true; }
    if (act === "ph-pt-list") { cardId = ""; paintBody(); return true; }
    if (act === "ph-pt-open") { cardId = node.getAttribute("data-id") || ""; paintBody(); return true; }
    if (act === "ph-card-save") { saveCard(); return true; }
    if (act === "ph-staff-x") { revoke(node); return true; }
    if (act === "ph-req-ok") { connectRequest(node.getAttribute("data-id")); return true; }
    if (act === "ph-req-no") { declineRequest(node.getAttribute("data-id")); return true; }
    if (act === "ph-req-go") { finishConnect(); return true; }
    if (act === "ph-pt-toggle") { cardId = "new"; paintBody(); return true; }
    if (act === "ph-pt-cancel") { showForm("phPointForm", false); return true; }
    if (act === "ph-pt-save") { savePoint(); return true; }
    if (act === "ph-pt-edit") {
      var p = ((hub && hub.points) || []).filter(function (x) { return x.id === node.getAttribute("data-id"); })[0];
      if (!p) return true;
      showForm("phPointForm", true);
      document.getElementById("phPointEditId").value = p.id;
      document.getElementById("phPointNetwork").value = p.networkId || "";
      document.getElementById("phPointName").value = p.name || "";
      document.getElementById("phPointAddr").value = p.address || "";
      sh().toast("Правка точки");
      return true;
    }
    if (act === "ph-pt-del") { deletePoint(node.getAttribute("data-id")); return true; }
    if (act === "ph-pt-back") { restorePoint(node.getAttribute("data-id")); return true; }
    if (act === "ph-net-toggle") { showForm("phNetForm", document.getElementById("phNetForm").hidden); return true; }
    if (act === "ph-net-cancel") { showForm("phNetForm", false); return true; }
    if (act === "ph-net-save") { saveNet(); return true; }
    if (act === "ph-net-edit") {
      var n = ((hub && hub.networks) || []).filter(function (x) { return x.id === node.getAttribute("data-id"); })[0];
      if (!n) return true;
      showForm("phNetForm", true);
      document.getElementById("phNetEditId").value = n.id;
      document.getElementById("phNetName").value = n.name || "";
      document.getElementById("phNetLogo").value = n.logo || "";
      sh().toast("Правка сети");
      return true;
    }
    if (act === "ph-notify-save") { saveNotify(); return true; }
    if (act === "ph-bp-save") { saveBp(); return true; }
    if (act === "ph-bp-edit") { editBp(node.getAttribute("data-id")); return true; }
    if (act === "ph-bp-cancel") {
      document.getElementById("partnerEditId").value = "";
      document.getElementById("partnerNameInput").value = "";
      document.getElementById("partnerNoteInput").value = "";
      document.getElementById("btnPartnerSave").textContent = "Добавить";
      document.getElementById("btnPartnerEditCancel").hidden = true;
      return true;
    }
    if (act === "ph-bp-toggle") { toggleBp(node.getAttribute("data-id"), node.getAttribute("data-on") === "1"); return true; }
    if (act === "ph-bp-del") { deleteBp(node.getAttribute("data-id"), node.getAttribute("data-name")); return true; }
    return false;
  }

  function refreshQuiet() {
    if (!document.getElementById("phBody")) return;
    var a = document.activeElement;
    var box = document.getElementById("phBody");
    if (a && box.contains(a)) return;
    loadHub({ force: true });
    loadSuggest({ force: true });
    loadRequests({ force: true });
    if (tab === "orders") loadOrders({ force: true });
  }

  root.BoinyaPartners = {
    bind: function (a) { access = a; },
    show: show,
    refreshQuiet: refreshQuiet,
    onAct: onAct
  };
})(typeof window !== "undefined" ? window : globalThis);
