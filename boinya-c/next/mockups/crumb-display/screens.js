/* Статичная сборка экранов. Данные выдуманы. */
(function () {
  var GROUPS = [
    {
      title: "Мясо",
      rows: [
        { name: "Лёгкое среднее", qty: "200 г" },
        { name: "Сердце полоски", qty: "80 г" }
      ]
    },
    {
      title: "Крошка",
      rows: [
        { name: "Крошка лёгкого", qty: "100 г" },
        {
          name: "Крошка микс",
          qty: "100 г",
          mix: true,
          parts: [
            { name: "лёгкое", qty: "50 г" },
            { name: "сердце", qty: "25 г" },
            { name: "почки", qty: "25 г" }
          ]
        }
      ]
    },
    {
      title: "Жевалки",
      rows: [
        { name: "Трахея мал", qty: "1 шт" },
        { name: "Ухо Г обычное", qty: "1 шт" }
      ]
    }
  ];

  var VARIANTS = [
    {
      id: "v1",
      title: "1. Линия и колонка",
      lead: "Состав микса с отступом и тонкой вертикальной линией. Граммы справа одной колонкой. Итог микса жирный. Группы Мясо, Крошка и Жевалки разделены подписью и чертой."
    },
    {
      id: "v2",
      title: "2. Состав тише",
      lead: "Та же колонка граммов и те же группы. Строки состава микса мельче и светлее, без линии. Итог микса остаётся жирным и в размер обычной позиции."
    },
    {
      id: "v3",
      title: "3. Тире",
      lead: "Граммы в той же строке через тире: Крошка лёгкого — 100 г, лёгкое — 50 г. Состав микса с отступом. Группы те же."
    },
    {
      id: "v4",
      title: "4. Полосы групп",
      lead: "Группы плашками-разделителями, не чипами на строке. Состав микса с линией, граммы справа, итог жирный."
    }
  ];

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ico(name) {
    var paths = {
      info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
      dots: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
      orders: '<path d="M6 7h12M6 12h12M6 17h8"/>',
      clients: '<circle cx="12" cy="9" r="3"/><path d="M6 18c1.2-2.4 3.2-3.5 6-3.5s4.8 1.1 6 3.5"/>',
      shop: '<path d="M7 8h10l-1 11H8L7 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
      box: '<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>',
      more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + "</svg>";
  }

  function lineHtml(row, dash) {
    var name = dash ? (row.name + " — " + row.qty) : row.name;
    var cls = "line" + (row.mix ? " line--mix" : "");
    return '<div class="' + cls + '"><span>' + esc(name) + '</span><span class="qty">' + esc(row.qty) + "</span></div>";
  }

  function composition() {
    return GROUPS.map(function (g) {
      var rows = g.rows.map(function (row) {
        var html = lineHtml(row, false);
        if (row.parts) {
          html += '<div class="parts">' + row.parts.map(function (p) {
            return lineHtml(p, false);
          }).join("") + "</div>";
        }
        return html;
      }).join("");
      return '<div class="grp">' + esc(g.title) + "</div>" + rows;
    }).join("");
  }

  function chrome() {
    var tabs = [
      ["orders", "Заказы", true],
      ["clients", "Клиенты", false],
      ["shop", "Цех", false],
      ["box", "Склад", false],
      ["more", "Ещё", false]
    ];
    return '<header class="top"><h1>Заказ</h1><div class="top-actions">' +
      '<button class="icon-btn" type="button" aria-label="Справка">' + ico("info") + "</button>" +
      '<button class="icon-btn" type="button" aria-label="Меню">' + ico("dots") + "</button>" +
      "</div></header>" +
      '<div class="body">' +
      '<p class="kicker">В заказе</p>' +
      '<article class="card"><div class="who"><b>Рекс</b><span class="meta">mira_lab, ПП, 30.09</span></div>' +
      '<div class="comp">' + composition() + "</div></article>" +
      '<p class="kicker">В сборке</p>' +
      '<article class="card"><div class="asm-head"><span class="check" aria-hidden="true"></span><b>Рекс, mira_lab</b><span class="plaque plaque--bad">не собран</span></div>' +
      '<div class="comp">' + composition() + "</div>" +
      '<p class="pack">Пакеты 1 средний, 1 большой</p></article>' +
      '<p class="kicker">У курьера</p>' +
      '<article class="card cour"><div class="stop-top"><span class="stop-no">1</span><div><b>Рекс</b><span class="meta">ПП, 48 BYN</span></div><span class="plaque plaque--bad">не собран</span></div>' +
      '<div class="comp">' + composition() + "</div>" +
      '<p class="addr">ул. Кальварийская, 21</p></article>' +
      "</div>" +
      '<nav class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (t[2] ? " tab--on" : "") + '" type="button">' + ico(t[0]) + "<span>" + esc(t[1]) + "</span></button>";
      }).join("") + "</nav>";
  }

  function phone(variant, scheme) {
    var light = scheme === "b";
    var id = "crumb-" + variant.id + "-" + scheme;
    return '<article class="phone ' + variant.id + (light ? " phone--light" : "") + '" id="' + id + '" data-variant="' + variant.id + '">' +
      chrome() + "</article>";
  }

  var root = document.getElementById("root");
  root.innerHTML = VARIANTS.map(function (v) {
    return '<section class="band"><h2>' + esc(v.title) + '</h2><p class="lead">' + esc(v.lead) + "</p>" +
      '<div class="board">' + phone(v, "a") + phone(v, "b") + "</div></section>";
  }).join("");

  document.querySelectorAll(".phone.v3").forEach(function (phoneEl) {
    phoneEl.querySelectorAll(".line").forEach(function (line) {
      var name = line.querySelector("span");
      var qty = line.querySelector(".qty");
      if (!name || !qty) return;
      if (name.textContent.indexOf("—") >= 0) return;
      name.textContent = name.textContent + " — " + qty.textContent;
    });
  });
})();
