import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const svg = (inner, w = 20) =>
  `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const I = {
  orders: svg(`<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9 3.8h6v2.2H9zM9 11h6M9 15h4"/>`),
  clients: svg(`<circle cx="12" cy="8" r="3.1"/><path d="M5.2 19.2c.9-3.3 3.2-4.9 6.8-4.9s5.9 1.6 6.8 4.9"/>`),
  shop: svg(`<path d="M5 9h14M5 13h14M5 17h9"/>`),
  stock: svg(`<path d="M4 8.5 12 4.5l8 4-8 4-8-4z"/><path d="M4 8.5v7.5l8 4 8-4V8.5"/><path d="M12 12.5v7.5"/>`),
  dots: svg(`<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/>`),
  bell: svg(`<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 6.2 2.4 6.6 2.4 8.2H3.8c0-1.6 2.4-2 2.4-8.2"/><path d="M10 20.2a2 2 0 0 0 4 0"/>`, 22),
  info: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/>`),
  calc: svg(`<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7.2h8M8 11.5h2M12 11.5h2M16 11.5h.01M8 15.8h2M12 15.8h2M16 15.8h.01"/>`),
  pick: svg(`<path d="M9 6h10M9 12h10M9 18h10"/><path d="m4.2 6.2 1.1 1.1 1.8-2M4.2 12.2l1.1 1.1 1.8-2M4.2 18.2l1.1 1.1 1.8-2"/>`),
  chev: svg(`<path d="M9 6.5 14.5 12 9 17.5"/>`, 18),
  phone: svg(`<path d="M8 4.5h2.2l1.2 3-1.6 1a12 12 0 0 0 5.5 5.5l1-1.6 3 1.2V16a2 2 0 0 1-2.2 2A14.5 14.5 0 0 1 6 6.7 2 2 0 0 1 8 4.5z"/>`, 18),
  close: svg(`<path d="M7 7 17 17M17 7 7 17"/>`),
  left: svg(`<path d="M15 6.5 9.5 12 15 17.5"/>`, 22),
  right: svg(`<path d="M9 6.5 14.5 12 9 17.5"/>`, 22),
  search: svg(`<circle cx="11" cy="11" r="6"/><path d="m16 16 3.5 3.5"/>`, 18)
};

function nav(active) {
  const items = [
    ["orders", "Заказы", I.orders],
    ["clients", "Клиенты", I.clients],
    ["shop", "Цех", I.shop],
    ["stock", "Склад", I.stock],
    ["more", "Ещё", I.dots]
  ];
  return `<nav class="tabs" aria-label="Разделы">${items.map(([id, label, icon]) =>
    `<a href="#${id}"${id === active ? ` aria-current="page"` : ""}>${icon}<span>${label}</span></a>`
  ).join("")}</nav>`;
}

function top(opts) {
  const tools = opts.tools || "none";
  let mid = "";
  if (tools === "one") mid = `<button class="icon-btn" type="button" aria-label="Расчёт и подбор">${I.calc}</button>`;
  if (tools === "two") mid = `<button class="icon-btn" type="button" aria-label="Расчёт">${I.calc}</button><button class="icon-btn" type="button" aria-label="Подбор">${I.pick}</button>`;
  const sub = opts.sub ? `<p class="top-sub">${opts.sub}</p>` : "";
  const fit = opts.fit ? " top--fit" : "";
  return `<header class="top${fit}"><div class="top-ctx"><h1>${opts.title}</h1>${sub}</div>` +
    `<button class="icon-btn" type="button" aria-label="Справка">${I.info}</button>${mid}` +
    `<button class="icon-btn" type="button" aria-label="Меню">${I.dots}</button>` +
    `<button class="icon-btn" type="button" aria-label="Задачи, 3">${I.bell}<span class="badge">3</span></button></header>`;
}

function segs(list, on, label) {
  return `<div class="segs" role="group" aria-label="${label || "Раздел"}">${list.map((s) =>
    `<button type="button" aria-pressed="${s === on ? "true" : "false"}">${s}</button>`
  ).join("")}</div>`;
}

function dock(label) {
  return `<div class="dock"><button class="mainbtn" type="button">${label}</button></div>`;
}

const CLIENT_SEGS = ["ПП", "АФК", "БП", "Опросник"];

function searchBox() {
  return `<label class="search">${I.search}<span class="sr">Поиск по нику</span><input placeholder="Поиск по нику" /></label>`;
}

function clientRows() {
  const rows = [
    ["Р", "Рекс", "Мира", "рекс", "+375 29 100 20 01", "активна", "pill--ok"],
    ["Б", "Барс", "Олег", "bars", "+375 33 200 10 02", "пауза", "pill--warn"],
    ["Л", "Луна", "Катя", "luna", "+375 29 300 10 03", "активна", "pill--ok"],
    ["Н", "Нора", "Алина", "nora", "+375 44 400 10 04", "активна", "pill--ok"],
    ["Г", "Граф", "Нина", "graf", "+375 29 500 10 05", "активна", "pill--ok"]
  ];
  return rows.map(([av, dog, person, handle, tel, st, pill]) =>
    `<button class="row" type="button"><span class="avatar" aria-hidden="true"><span class="av">${av}</span></span><span><span class="name">${dog}</span><span class="sub">${person}</span><span class="sub">${handle}<br>${tel}</span></span><span class="pill ${pill}">${st}</span></button>`
  ).join("");
}

function clientsBody(tools) {
  return top({ title: "Клиенты", sub: "ПП", tools }) +
    segs(CLIENT_SEGS, "ПП", "Списки клиентов") +
    `<div class="scroll">${searchBox()}${clientRows()}</div>` +
    nav("clients");
}

function moreItems(withPick) {
  const items = [
    ["Доступы", "Роли, вкладки, уведомления"],
    ["Шаблоны", "Тексты и карточки"],
    ["Прайс", "Цены розницы"],
    ["Статистика", "Месяц и воронка"],
    ["Партнёры", "Заявки и точки"],
    ["Цели", "Раздел владельца"]
  ];
  if (withPick) items.splice(1, 0, ["Подбор", "Подбор по анкете"]);
  return items.map(([t, s]) =>
    `<button class="row" type="button"><span class="avatar" aria-hidden="true"><span class="av">${t.slice(0, 1)}</span></span><span><span class="name">${t}</span><span class="sub">${s}</span></span>${I.chev}</button>`
  ).join("");
}

function moreBody(tools) {
  return top({ title: "Ещё", sub: "Арсений, владелец", tools }) +
    `<div class="scroll">${moreItems(false)}</div>` +
    nav("more");
}

function orderBits() {
  return `<div class="tray" role="group" aria-label="Тип заказа"><button type="button" aria-pressed="true">ПП</button><button type="button" aria-pressed="false">БП</button><button type="button" aria-pressed="false">Розница</button><button type="button" aria-pressed="false">Партнёр</button></div>` +
    `<div class="field"><span class="lbl">Ник</span><div class="box"><span class="name">Рекс</span><span class="sub">Мира</span></div></div>` +
    `<div class="field"><span class="lbl">День</span><button class="box" type="button"><span class="name">Вт 30 сен</span><span class="sub">7 чел.</span></button></div>`;
}

function ordersBody(tools, title) {
  const fit = title === "Правка заказа";
  return top({ title: title || "Заказы", sub: fit ? "Рекс, 30 сен" : "Новый заказ", tools, fit }) +
    segs(["Заказ", "Месяц"], "Заказ") +
    `<div class="scroll">${orderBits()}</div>` +
    dock("Сохранить заказ") +
    nav("orders");
}

function shopBody(tools) {
  return top({ title: "Цех", sub: "Нарезка", tools }) +
    segs(["Нарезка", "Сборка", "Маршрут"], "Нарезка") +
    `<div class="scroll"><article class="cut"><h3>Лёгкое</h3><p class="sub">Нужно 800 г. сухого</p></article><article class="cut"><h3>Трахея</h3><p class="sub">Нужно 10 шт.</p></article></div>` +
    nav("shop");
}

function whBody(tools) {
  return top({ title: "Склад", sub: "30 сен", tools }) +
    `<div class="scroll"><button class="row" type="button"><span><span class="name">Лёгкое</span><span class="sub">закупить</span></span><span class="num num--lg">1,4</span></button><button class="row" type="button"><span><span class="name">Сердце</span><span class="sub">хватит</span></span><span class="num num--lg">0,6</span></button></div>` +
    dock("Дозакуп") +
    nav("stock");
}

function toolSheet() {
  return `<div class="veil"></div><div class="sheet" role="dialog" aria-label="Расчёт и подбор"><div class="grab"></div><div class="sheet-top"><h2>Расчёт и подбор</h2><button class="icon-btn" type="button" aria-label="Закрыть">${I.close}</button></div><button class="sheet-act" type="button">Расчёт ${I.chev}</button><button class="sheet-act" type="button">Подбор ${I.chev}</button></div>`;
}

function calcBody(tools) {
  return top({ title: "Расчёт", sub: "подписка", tools }) +
    `<div class="scroll"><button class="back" type="button">← Назад</button>` +
    `<p class="lbl">Режим</p><div class="tray"><button type="button" aria-pressed="true">Подписка</button><button type="button" aria-pressed="false">Розница</button></div>` +
    `<p class="lbl">Собаки</p><div class="tray"><button type="button" aria-pressed="true">1</button><button type="button" aria-pressed="false">2</button></div>` +
    `<p class="lbl">Кличка</p><input class="inbox" value="Рекс" />` +
    `<p class="lbl">N доставок</p><input class="inbox" value="2" />` +
    `<p class="lbl">Состав</p><div class="box"><span class="name">Лёгкое</span><span class="num num--md">200<small> г.</small></span></div>` +
    `</div>` + dock("Собрать сообщение") + nav("clients");
}

function pickBody(tools) {
  return top({ title: "Подбор", sub: "по анкете", tools }) +
    `<div class="scroll"><button class="back" type="button">← Назад</button>` +
    `<p class="lbl">Тип</p><div class="tray"><button type="button" aria-pressed="false">БП1</button><button type="button" aria-pressed="false">БП2</button><button type="button" aria-pressed="false">Розница</button><button type="button" aria-pressed="true">Подписка</button></div>` +
    `<p class="lbl">Анкета</p><textarea class="inbox">Рекс, лабрадор, 28 кг, мельче обычного</textarea>` +
    `</div>` + dock("Подобрать") + nav("clients");
}

function basket() {
  return `<section class="group"><h2>Состав и цена</h2>` +
    `<div class="line"><div><div class="name">Лёгкое</div><div class="sub">ломтики</div></div><div class="num num--lg">200<small> г.</small></div></div>` +
    `<div class="line"><div><div class="name">Трахея</div><div class="sub">шт.</div></div><div class="num num--lg">2<small> шт.</small></div></div>` +
    `<p class="price-line"><span class="num num--lg">43</span> BYN</p></section>`;
}

function cardRead(kind) {
  const bp = kind === "bp";
  return `<button class="back" type="button">← К списку</button>` +
    `<section class="group"><div class="group-head"><h2>Клиент</h2><button class="textbtn" type="button">Править</button></div>` +
    `<p class="hero-name">${bp ? "Олег" : "Мира"}</p><p class="sub">${bp ? "bars" : "рекс"}</p>` +
    `<div class="call"><span>${bp ? "+375 33 200 10 02" : "+375 29 100 20 01"}</span><button class="icon-btn" type="button" aria-label="Позвонить">${I.phone}</button></div>` +
    `<p class="addr">${bp ? "проспект Победителей, 9, подъезд 1, этаж 6, кв. 42" : "ул. Кальварийская, 21, подъезд 2, этаж 4, кв. 18"}</p>` +
    (bp ? `<p class="sub">менеджер Мария</p>` : "") +
    `</section>` +
    `<section class="group"><div class="group-head"><h2>Собака</h2><button class="textbtn" type="button">Править</button></div>` +
    `<p class="name">${bp ? "Барс" : "Рекс"}</p><p class="sub">${bp ? "овчарка, 32 кг" : "лабрадор, 28 кг"}</p></section>` +
    `<section class="group"><div class="group-head"><h2>Подписка</h2><button class="textbtn" type="button">Править</button></div>` +
    `<p>лист ${bp ? "БП" : "ПП"}</p><p class="sub">статус ${bp ? "БП2" : "активна"}</p>` +
    `<p class="sub">${bp ? "4 доставки" : "8 доставок"}</p><p class="sub">ID ${bp ? "БП-204" : "ПП-118"}</p>` +
    (bp ? `<p class="sub">опросник БП2 12.11</p><p class="sub">финал 03.12</p>` : "") +
    `<p class="sub">${bp ? "без печени" : "мельче обычного"}</p></section>` +
    basket();
}

function cardScreen(kind) {
  return top({ title: "Клиенты", sub: kind === "bp" ? "БП" : "ПП", tools: "one" }) +
    segs(CLIENT_SEGS, kind === "bp" ? "БП" : "ПП") +
    `<div class="scroll">${cardRead(kind)}</div>` +
    dock("Сохранить") + nav("clients");
}

function editSheet(kind) {
  const bp = kind === "bp";
  return `<div class="veil"></div><div class="sheet" role="dialog" aria-label="Клиент"><div class="grab"></div>` +
    `<div class="sheet-top"><h2>Клиент</h2><button class="icon-btn" type="button" aria-label="Закрыть">${I.close}</button></div>` +
    `<p class="lbl">Имя</p><input class="inbox" value="${bp ? "Олег" : "Мира"}" />` +
    `<p class="lbl">Ник</p><input class="inbox" value="${bp ? "bars" : "рекс"}" />` +
    `<p class="lbl">Телефон</p><input class="inbox" value="${bp ? "+375 33 200 10 02" : "+375 29 100 20 01"}" />` +
    `<p class="lbl">Адрес</p><input class="inbox" value="${bp ? "проспект Победителей, 9" : "ул. Кальварийская, 21"}" />` +
    `<div class="pair" style="margin-top:0"><input class="inbox" value="${bp ? "подъезд 1" : "подъезд 2"}" aria-label="Подъезд" /><input class="inbox" value="${bp ? "этаж 6" : "этаж 4"}" aria-label="Этаж" /><input class="inbox" value="${bp ? "кв. 42" : "кв. 18"}" aria-label="Квартира" /></div>` +
    (bp ? `<p class="lbl">Менеджер</p><select class="inbox"><option>Мария</option><option>Илья</option></select>` : "") +
    `<button class="mainbtn" type="button">Готово</button></div>`;
}

function fieldRow(label, value) {
  return `<p class="lbl">${label}</p><input class="inbox" value="${value}" />`;
}

function cardEditInline(kind) {
  const bp = kind === "bp";
  return top({ title: "Клиенты", sub: bp ? "БП" : "ПП", tools: "one" }) +
    segs(CLIENT_SEGS, bp ? "БП" : "ПП") +
    `<div class="scroll"><button class="back" type="button">← К списку</button>` +
    `<section class="group"><h2>Клиент</h2>${fieldRow("Имя", bp ? "Олег" : "Мира")}${fieldRow("Ник", bp ? "bars" : "рекс")}${fieldRow("Телефон", bp ? "+375 33 200 10 02" : "+375 29 100 20 01")}${fieldRow("Адрес", bp ? "проспект Победителей, 9" : "ул. Кальварийская, 21")}${fieldRow("Подъезд", bp ? "1" : "2")}${fieldRow("Этаж", bp ? "6" : "4")}${fieldRow("Квартира", bp ? "42" : "18")}` +
    (bp ? fieldRow("Менеджер", "Мария") : "") +
    `</section><section class="group"><h2>Собака</h2>${fieldRow("Кличка", bp ? "Барс" : "Рекс")}${fieldRow("Порода", bp ? "овчарка" : "лабрадор")}${fieldRow("Вес, кг", bp ? "32" : "28")}</section>` +
    `<section class="group"><h2>Подписка</h2><p class="lbl">Лист</p><div class="tray"><button type="button" aria-pressed="${bp ? "false" : "true"}">ПП</button><button type="button" aria-pressed="false">АФК</button><button type="button" aria-pressed="${bp ? "true" : "false"}">БП</button></div>` +
    fieldRow("Статус", bp ? "БП2" : "активна") + fieldRow("Доставок", bp ? "4" : "8") + fieldRow("ID", bp ? "БП-204" : "ПП-118") +
    (bp ? fieldRow("Опросник БП2", "12.11") + fieldRow("Финал", "03.12") : "") +
    `<p class="lbl">Пожелания</p><textarea class="inbox">${bp ? "без печени" : "мельче обычного"}</textarea></section>` +
    basket() + `</div>` + dock("Сохранить") + nav("clients");
}

const OCT = {
  1: { n: 6, dots: ["pp", "bp"] },
  2: { n: 9, dots: ["pp", "bp", "r"] },
  3: { n: 4, dots: ["pp"] },
  5: { n: 8, dots: ["pp", "bp"] },
  6: { n: 7, dots: ["pp", "bp"] },
  8: { n: 11, dots: ["pp", "bp", "r"] },
  9: { n: 12, dots: ["pp", "bp", "r", "p"], full: true },
  10: { n: 3, dots: ["r"] },
  13: { n: 5, dots: ["pp"] },
  15: { n: 8, dots: ["pp", "bp"] },
  16: { n: 2, dots: ["p"] },
  20: { n: 6, dots: ["pp", "bp"] },
  22: { n: 10, dots: ["pp", "r", "p"] },
  27: { n: 4, dots: ["bp"] },
  29: { n: 7, dots: ["pp", "bp"] },
  30: { n: 3, dots: ["pp"] }
};

function monthGrid(sel) {
  const start = (new Date(2026, 9, 1).getDay() + 6) % 7;
  const days = 31;
  let html = "";
  for (let i = 0; i < start; i++) html += `<span class="cell cell--pad"></span>`;
  for (let d = 1; d <= days; d++) {
    const hit = OCT[d];
    const on = d === sel;
    const cls = ["cell", hit ? "cell--busy" : "", hit && hit.full ? "is-full" : "", on ? "is-on" : ""].filter(Boolean).join(" ");
    const dots = hit ? `<span class="dots">${hit.dots.map((x) => `<i class="dot dot-${x}"></i>`).join("")}</span>` : "";
    html += `<button type="button" class="${cls}" aria-pressed="${on ? "true" : "false"}" aria-label="${d} октября"><span class="cell-date">${d}</span>${hit ? `<span class="cell-count">${hit.n}</span>` : ""}${dots}</button>`;
  }
  const tail = (start + days) % 7;
  if (tail) for (let i = tail; i < 7; i++) html += `<span class="cell cell--pad"></span>`;
  return html;
}

function calBlock(sel) {
  return `<div class="cal-head"><button class="icon-btn" type="button" aria-label="Сентябрь 2026">${I.left}</button><h2>октябрь 2026</h2><button class="icon-btn" type="button" aria-label="Ноябрь 2026">${I.right}</button></div>` +
    `<div class="wd" aria-hidden="true"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>` +
    `<div class="grid">${monthGrid(sel)}</div>`;
}

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function dayStrip(selected, open) {
  const start = new Date(2026, 8, 30);
  let html = "";
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const on = !open && iso === selected;
    html += `<button type="button" aria-pressed="${on ? "true" : "false"}"><span class="kicker">${WD[d.getDay()]}</span><span class="num">${d.getDate()}</span></button>`;
  }
  html += `<button type="button" class="other" aria-pressed="${open ? "true" : "false"}">Другая дата</button>`;
  return `<div class="daystrip">${html}</div>`;
}

function behindOrders() {
  return top({ title: "Заказы", sub: "Месяц", tools: "one" }) +
    segs(["Заказ", "Месяц"], "Месяц") +
    `<div class="scroll"><button class="row" type="button"><span class="avatar"><span class="av">Р</span></span><span><span class="name">Рекс</span><span class="sub">Мира</span><span class="sub">ул. Кальварийская, 21</span></span><span class="pill pill--ok">ПП</span></button>` +
    `<button class="row" type="button"><span class="avatar"><span class="av">Б</span></span><span><span class="name">Барс</span><span class="sub">Олег</span><span class="sub">проспект Победителей, 9</span></span><span class="pill pill--info">БП</span></button></div>` +
    nav("orders");
}

function moveSheet(opts) {
  const month = opts.mode !== "strip";
  const open = opts.mode === "open";
  const btn = opts.ok;
  return `<div class="veil"></div><div class="sheet" role="dialog" aria-label="${opts.title}"><div class="grab"></div>` +
    `<div class="sheet-top"><h2>${opts.title}</h2><button class="icon-btn" type="button" aria-label="Закрыть">${I.close}</button></div>` +
    `<p class="sheet-lead">${opts.lead}</p>` +
    (opts.mode === "month" ? "" : dayStrip(opts.sel || "2026-10-06", open)) +
    (month || open ? calBlock(opts.day || 29) : "") +
    `<button class="mainbtn" type="button" style="margin-top:12px">${btn}</button></div>`;
}

function behindTasks() {
  return top({ title: "Заказы", sub: "Задачи", tools: "one" }) +
    `<div class="scroll"><button class="row" type="button"><span><span class="name">На потом, Рекс</span><span class="sub">отложенный заказ</span></span>${I.chev}</button>` +
    `<button class="row" type="button"><span><span class="name">Заявка, Лапа</span><span class="sub">перенос партнёра</span></span>${I.chev}</button>` +
    `<button class="row" type="button"><span><span class="name">Напоминание, корм</span><span class="sub">Мария</span></span>${I.chev}</button></div>` +
    nav("orders");
}

function peopleHead() {
  return `<button class="back" type="button">← Ещё</button><button class="secbtn wide" type="button">Обновить список</button>` +
    `<p class="lbl">Заявки</p><article class="group"><p class="name">Гость</p><p class="sub">ожидает роль</p><div class="pair"><button class="mainbtn" type="button">Одобрить</button><button class="secbtn" type="button">Отклонить</button></div></article>` +
    `<p class="lbl">Сотрудники</p>` +
    `<button class="row" type="button"><span><span class="name">Мария</span><span class="sub">менеджер</span></span>${I.chev}</button>` +
    `<button class="row" type="button"><span><span class="name">Илья</span><span class="sub">нарезчик</span></span>${I.chev}</button>` +
    `<button class="row" type="button"><span><span class="name">Олег</span><span class="sub">курьер</span></span>${I.chev}</button>`;
}

function depotRows() {
  return `<article class="depot"><div class="grow"><div class="name">Север</div><div class="sub">ул. Притыцкого, 62</div></div><button class="ghost" type="button">Удалить</button></article>` +
    `<article class="depot"><div class="grow"><div class="name">Юг</div><div class="sub">ул. Чижевских, 8</div></div><button class="ghost" type="button">Удалить</button></article>` +
    `<button class="secbtn wide" type="button">+ Склад</button>`;
}

function accessV1() {
  return top({ title: "Ещё", sub: "Доступы", tools: "none" }) +
    `<div class="scroll">${peopleHead()}<p class="lbl">Склады</p>${depotRows()}<p class="mini-note">точка выезда курьера: название и адрес</p></div>` +
    nav("more");
}

function accessV2() {
  return top({ title: "Ещё", sub: "Доступы", tools: "none" }) +
    `<div class="scroll">${peopleHead()}<p class="lbl">Склады</p><button class="row" type="button"><span><span class="name">Склады</span><span class="sub">2 адреса выезда</span></span>${I.chev}</button></div>` +
    nav("more");
}

function depotListScreen() {
  return top({ title: "Склады", sub: "адреса выезда", tools: "none" }) +
    `<div class="scroll"><button class="back" type="button">← Доступы</button>${depotRows()}</div>` +
    nav("more");
}

function newDepotSheet() {
  return accessV1() + `<div class="veil"></div><div class="sheet" role="dialog" aria-label="Новый склад"><div class="grab"></div>` +
    `<div class="sheet-top"><h2>Новый склад</h2><button class="icon-btn" type="button" aria-label="Закрыть">${I.close}</button></div>` +
    `<p class="lbl">Название</p><input class="inbox" value="Центр" />` +
    `<p class="lbl">Адрес</p><input class="inbox" value="ул. Немига" />` +
    `<div class="suggest"><button type="button">ул. Немига, 5</button><button type="button">ул. Немига, 12</button></div>` +
    `<button class="mainbtn" type="button">Сохранить</button></div>`;
}

function delSheet() {
  return accessV1() + `<div class="veil"></div><div class="sheet" role="dialog" aria-label="Удалить склад"><div class="grab"></div>` +
    `<div class="sheet-top"><h2>Удалить склад</h2><button class="icon-btn" type="button" aria-label="Закрыть">${I.close}</button></div>` +
    `<p class="name">Юг</p><p class="sheet-lead">ул. Чижевских, 8</p><p class="mini-note">старые маршруты сохранят этот адрес</p>` +
    `<div class="pair"><button class="mainbtn mainbtn--bad" type="button">Удалить</button><button class="secbtn" type="button">Отмена</button></div></div>`;
}

function routeBody() {
  return top({ title: "Цех", sub: "Маршрут", tools: "one" }) +
    segs(["Нарезка", "Сборка", "Маршрут"], "Маршрут") +
    `<div class="scroll"><p class="lbl">Точка выезда</p><div class="chips">` +
    `<button class="chip" type="button" aria-pressed="true"><span>Север</span><span class="sub">ул. Притыцкого, 62</span></button>` +
    `<button class="chip" type="button" aria-pressed="false"><span>Юг</span><span class="sub">ул. Чижевских, 8</span></button>` +
    `<button class="chip" type="button" aria-pressed="false"><span>Свой адрес</span></button></div>` +
    `<p class="lbl">Курьеры</p><div class="tray"><button type="button" aria-pressed="true">1</button><button type="button" aria-pressed="false">2</button></div>` +
    `<article class="cut"><h3>1 Рекс</h3><p class="sub">ул. Кальварийская, 21, подъезд 2</p></article>` +
    `<article class="cut"><h3>2 Барс</h3><p class="sub">проспект Победителей, 9</p></article></div>` +
    dock("Собрать маршруты") + nav("shop");
}

function stockDepots() {
  return top({ title: "Склады", sub: "остатки", tools: "none" }) +
    `<div class="scroll"><button class="back" type="button">← Доступы</button>` +
    `<article class="depot"><div class="grow"><div class="name">Север</div><div class="sub">ул. Притыцкого, 62</div><div class="sub">14 позиций, хватит на 3 дн.</div></div><button class="ghost" type="button">Удалить</button></article>` +
    `<article class="depot"><div class="grow"><div class="name">Юг</div><div class="sub">ул. Чижевских, 8</div><div class="sub">9 позиций, закупить лёгкое</div></div><button class="ghost" type="button">Удалить</button></article>` +
    `<button class="secbtn wide" type="button">+ Склад</button>` +
    `<p class="mini-note">свой список остатков у каждого склада</p></div>` +
    nav("more");
}

const CUTS = {
  zero: [
    ["Лёгкое", "800 г.", false, false],
    ["Сердце", "600 г.", false, false],
    ["Печень", "280 г.", false, false],
    ["Рубец", "320 г.", false, false],
    ["Трахея", "10 шт.", false, false],
    ["Ухо", "8 шт.", false, false],
    ["Хрящ", "2 шт.", false, false]
  ],
  mid: [
    ["Сердце", "600 г.", true, true],
    ["Печень", "280 г.", true, false],
    ["Рубец", "320 г.", true, false],
    ["Лёгкое", "800 г.", false, false],
    ["Трахея", "10 шт.", true, false],
    ["Ухо", "8 шт.", true, false],
    ["Хрящ", "2 шт.", false, false]
  ],
  almost: [
    ["Лёгкое", "800 г.", true, true],
    ["Сердце", "600 г.", true, true],
    ["Печень", "280 г.", true, true],
    ["Рубец", "320 г.", true, true],
    ["Трахея", "10 шт.", true, true],
    ["Ухо", "8 шт.", true, true],
    ["Хрящ", "2 шт.", false, false]
  ],
  split: [
    ["Лёгкое", "800 г.", true, true],
    ["Сердце", "600 г.", true, false],
    ["Печень", "280 г.", true, false],
    ["Рубец", "320 г.", false, false],
    ["Трахея", "10 шт.", true, true],
    ["Ухо", "8 шт.", true, false],
    ["Хрящ", "2 шт.", false, false]
  ]
};

function cutRows(list) {
  return list.map(([name, need, laid, done]) =>
    `<article class="cut"><h3>${name}</h3><p class="sub">нужно ${need}</p>` +
    `<label class="check"><input type="checkbox"${laid ? " checked" : ""}> Выложено</label>` +
    `<label class="check"><input type="checkbox"${done ? " checked" : ""}> Нарезано</label></article>`
  ).join("");
}

function counters(list) {
  let toCut = 0;
  let laidOnly = 0;
  let both = 0;
  list.forEach(([, , laid, done]) => {
    if (!done) toCut++;
    if (laid && done) both++;
    else if (laid) laidOnly++;
  });
  return [toCut, laidOnly, both];
}

function stats(list) {
  const [a, b, c] = counters(list);
  return `<div class="stats"><div><b>${a}</b><span>осталось нарезать</span></div><div><b>${b}</b><span>выложено, не нарезано</span></div><div><b>${c}</b><span>выложено и нарезано</span></div></div>`;
}

function prog(pct, line, extra, rule) {
  return `<div class="prog"><div class="nx-bar" role="img" aria-label="${pct} процентов"><span style="width:${pct}%"></span></div>` +
    `<p class="prog-pct">${pct}%</p><p class="prog-line">${line}</p>${extra || ""}<p class="prog-rule">${rule}</p></div>`;
}

function thin(g, p) {
  return `<div class="thin-row"><span>граммы ${g}%</span><div class="nx-bar nx-bar--thin"><span style="width:${g}%"></span></div></div>` +
    `<div class="thin-row"><span>штуки ${p}%</span><div class="nx-bar nx-bar--thin"><span style="width:${p}%"></span></div></div>`;
}

function cutScreen(list, block) {
  return top({ title: "Цех", sub: "Нарезка", tools: "one" }) +
    segs(["Нарезка", "Сборка", "Маршрут"], "Нарезка") +
    `<div class="scroll">${stats(list)}<article class="timer"><b>12:34</b><p class="sub">идёт нарезка</p></article>${block}${cutRows(list)}</div>` +
    nav("shop");
}

const RULE_HALF = "выложено даёт половину веса, нарезано весь вес";
const RULE_CUT = "в процент входит только нарезано";

const shots = [];

function add(group, id, caption, inner) {
  for (const theme of ["a", "b"]) {
    shots.push({ group, theme, id: `${id}-${theme}`, caption, inner });
  }
}

add("6 Расчёт и подбор в шапке", "edits-b-6-v1", "v1 клиенты: одна кнопка, сегменты ПП АФК БП Опросник", clientsBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-sheet", "v1 лист по кнопке: Расчёт и Подбор", clientsBody("one") + toolSheet());
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-calc", "v1 расчёт из шапки, сверху назад", calcBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-pick", "v1 подбор из шапки, сверху назад", pickBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-more", "v1 ещё без пункта Подбор, кнопка в шапке", moreBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-title", "v1 длинный заголовок Правка заказа и одна кнопка 44", ordersBody("one", "Правка заказа"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-orders", "v1 кнопка на всех вкладках: Заказы", ordersBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-shop", "v1 кнопка на всех вкладках: Цех", shopBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v1-wh", "v1 кнопка на всех вкладках: Склад", whBody("one"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v2", "v2 клиенты: две иконки Расчёт и Подбор", clientsBody("two"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v2-title", "v2 длинный заголовок и две иконки 44", ordersBody("two", "Правка заказа"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v2-calc", "v2 иконка сразу открывает расчёт", calcBody("two"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v2-pick", "v2 иконка сразу открывает подбор", pickBody("two"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v2-more", "v2 ещё без Подбора, две иконки в шапке", moreBody("two"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v3-orders", "v3 кнопка только на Клиентах: Заказы без неё", ordersBody("none"));
add("6 Расчёт и подбор в шапке", "edits-b-6-v3-more", "v3 ещё без Подбора и без кнопки в шапке", moreBody("none"));

add("7 Карточка клиента", "edits-b-7-v1-pp", "v1 ПП чтение: клиент, собака, подписка рядом", cardScreen("pp"));
add("7 Карточка клиента", "edits-b-7-v1-pp-edit", "v1 ПП лист Правки клиента", cardScreen("pp") + editSheet("pp"));
add("7 Карточка клиента", "edits-b-7-v1-bp", "v1 БП чтение: менеджер и даты опросников", cardScreen("bp"));
add("7 Карточка клиента", "edits-b-7-v1-bp-edit", "v1 БП лист Правки, с менеджером", cardScreen("bp") + editSheet("bp"));
add("7 Карточка клиента", "edits-b-7-v2-pp", "v2 ПП поля сразу в группах", cardEditInline("pp"));
add("7 Карточка клиента", "edits-b-7-v2-bp", "v2 БП поля сразу, менеджер и даты в группах", cardEditInline("bp"));

add("12 Календарь даты", "edits-b-12-v1", "v1 перенос: сетка месяца, кнопка на 29.10", behindOrders() + moveSheet({ mode: "month", title: "Перенести", lead: "Рекс, Мира", ok: "Перенести на 29.10", day: 29 }));
add("12 Календарь даты", "edits-b-12-v1-tasks", "v1 задачи, отложенный заказ: та же сетка", behindTasks() + moveSheet({ mode: "month", title: "Дата", lead: "Отложенный заказ, Рекс", ok: "Назначить на 29.10", day: 29 }));
add("12 Календарь даты", "edits-b-12-v1-partner", "v1 задачи, перенос заявки партнёра", behindTasks() + moveSheet({ mode: "month", title: "Дата", lead: "Заявка партнёра, Лапа", ok: "Перенести на 29.10", day: 29 }));
add("12 Календарь даты", "edits-b-12-v2", "v2 полоска 14 дней, в конце Другая дата", behindOrders() + moveSheet({ mode: "strip", title: "Перенести", lead: "Рекс, Мира", ok: "Перенести на 06.10", sel: "2026-10-06" }));
add("12 Календарь даты", "edits-b-12-v2-open", "v2 Другая дата раскрыла сетку месяца", behindOrders() + moveSheet({ mode: "open", title: "Перенести", lead: "Рекс, Мира", ok: "Перенести на 29.10", day: 29 }));
add("12 Календарь даты", "edits-b-12-v2-tasks", "v2 задачи: полоска 14 дней", behindTasks() + moveSheet({ mode: "strip", title: "Дата", lead: "Отложенный заказ, Рекс", ok: "Назначить на 06.10", sel: "2026-10-06" }));

add("16 Склады", "edits-b-16-v1", "v1 блок Склады прямо в Доступах", accessV1());
add("16 Склады", "edits-b-16-v1-new", "v1 лист Новый склад, подсказки адреса", newDepotSheet());
add("16 Склады", "edits-b-16-v1-del", "v1 подтверждение удаления склада", delSheet());
add("16 Склады", "edits-b-16-v1-route", "маршрут: точка выезда из списка складов и свой адрес", routeBody());
add("16 Склады", "edits-b-16-v2", "v2 в Доступах пункт Склады", accessV2());
add("16 Склады", "edits-b-16-v2-list", "v2 отдельный экран, назад в Доступы", depotListScreen());
add("16 Склады", "edits-b-16-v3", "v3 другой смысл: склад со своими остатками", stockDepots());

add("18 Полоса нарезки", "edits-b-18-v1-0", "v1 одна полоса, 0 процентов, ничего не отмечено", cutScreen(CUTS.zero, prog(0, "0 из 2 000 г, 0 из 20 шт.", "", RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v1-45", "v1 одна полоса 45 процентов, отметки совпадают", cutScreen(CUTS.mid, prog(45, "900 из 2 000 г, 9 из 20 шт.", "", RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v1-95", "v1 одна полоса 95 процентов", cutScreen(CUTS.almost, prog(95, "2 000 из 2 000 г, 18 из 20 шт.", "", RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v2-0", "v2 общая полоса и две тонкие, 0", cutScreen(CUTS.zero, prog(0, "0 из 2 000 г, 0 из 20 шт.", thin(0, 0), RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v2-66", "v2 общая 66, граммы 62, штуки 70", cutScreen(CUTS.split, prog(66, "1 240 из 2 000 г, 14 из 20 шт.", thin(62, 70), RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v2-95", "v2 общая 95, граммы 100, штуки 90", cutScreen(CUTS.almost, prog(95, "2 000 из 2 000 г, 18 из 20 шт.", thin(100, 90), RULE_HALF)));
add("18 Полоса нарезки", "edits-b-18-v3", "v3 те же отметки, что у 45, но считается только нарезано: 15", cutScreen(CUTS.mid, prog(15, "600 из 2 000 г, 0 из 20 шт.", "", RULE_CUT)));

function board(theme) {
  const light = theme === "b" ? " sheet-board--light" : "";
  const title = theme === "a" ? "A тёмная" : "B светлая";
  let html = `<div class="sheet-board${light}" id="sheet-${theme}"><h2 class="sheet-h">${title}</h2>`;
  let last = "";
  for (const s of shots) {
    if (s.theme !== theme) continue;
    if (s.group !== last) {
      html += `<h2 class="sheet-h">${s.group}</h2>`;
      last = s.group;
    }
    const cls = theme === "b" ? "phone phone--light" : "phone";
    html += `<figure class="shot"><article class="${cls}" id="${s.id}">${s.inner}</article><figcaption>${s.caption}</figcaption></figure>`;
  }
  return html + "</div>";
}

const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Макеты Бойни, партия B</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="doc">
    <p class="doc-kicker">Бойня, партия B, 390 на 844</p>
    <h1>Правки 6, 7, 12, 16, 18</h1>
    <p>Статичные макеты. Код приложения не менялся. Имена, телефоны и адреса выдуманы. A тёмная, B светлая.</p>
  </header>
  ${board("a")}
  ${board("b")}
</body>
</html>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "index.html");
writeFileSync(out, doc);
const ids = shots.map((s) => s.id);
if (ids.length !== new Set(ids).size) throw new Error("duplicate id");
if (doc.includes("·") || doc.includes("•")) throw new Error("middot");
console.log("phones", ids.length, "bytes", doc.length);
