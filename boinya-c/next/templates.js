/* Шаблоны текстов и карточки лакомств. Запросы и тексты — как в app.main.js. */
(function (root) {
  "use strict";

  var access = null;
  var items = [];
  var view = "list";
  var form = null;
  var catKey = "";
  var sku = "";

  function sh() { return root.BoinyaShell; }
  function api() { return root.BoinyaApi; }
  function eng() { return root.BoinyaOrderEngine; }
  function esc(s) { return sh().esc(s); }
  function copy() { return root.BoinyaCardCopy || { info: {}, notes: {} }; }

  function tid() {
    try {
      var u = api().telegramUser();
      return String((u && u.id) || "");
    } catch (e) { return ""; }
  }

  function b64(s) {
    try { return btoa(unescape(encodeURIComponent(String(s || "")))); } catch (e) { return ""; }
  }

  function kindLabel(kind, id) {
    var k = String(kind || "").toLowerCase();
    var i = String(id || "").toLowerCase();
    if (k === "survey" || i.indexOf("survey_") === 0) return "Опросник";
    if (k === "product" || i.indexOf("prod_") === 0) return "Карточка позиции";
    if (k === "text" || k === "msg" || k === "reply") return "Текст";
    return kind || "текст";
  }

  function isProduct(it) {
    var k = String((it && it.kind) || "").toLowerCase();
    var i = String((it && it.id) || "").toLowerCase();
    return k === "product" || i.indexOf("prod_") === 0;
  }

  function slug(name) {
    return "prod_" + String(name || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/[^A-ZА-Я0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  function override(name) {
    var want = String(name || "").trim().toUpperCase().replace(/Ё/g, "Е");
    var id = slug(name).toLowerCase();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!isProduct(it)) continue;
      var title = String(it.title || "").trim().toUpperCase().replace(/Ё/g, "Е");
      var iid = String(it.id || "").toLowerCase();
      if (title === want || iid === id || iid.indexOf(id) === 0) return it;
    }
    return null;
  }

  function noteOf(name) {
    var notes = copy().notes || {};
    var key = String(name || "").trim();
    if (notes[key]) return notes[key];
    var alt = key.replace(/Ё/g, "Е");
    var ks = Object.keys(notes);
    for (var i = 0; i < ks.length; i++) {
      if (String(ks[i]).replace(/Ё/g, "Е") === alt) return notes[ks[i]];
    }
    if (/УТИН.*ШЕ/i.test(key)) return notes["УТИНЫЕ ШЕИ шт."] || "";
    if (/ТРАХЕ/i.test(key)) return notes["ТРАХЕЯ"] || "";
    return "";
  }

  function blurb(name) {
    var ov = override(name);
    if (ov && String(ov.body || "").trim()) return String(ov.body).trim();
    var info = copy().info || {};
    var key = String(name || "").trim();
    if (info[key]) return info[key];
    var alt = key.replace(/Ё/g, "Е");
    var ks = Object.keys(info);
    for (var i = 0; i < ks.length; i++) {
      if (String(ks[i]).replace(/Ё/g, "Е") === alt) return info[ks[i]];
    }
    return "Натуральное сушёное лакомство из ассортимента Бойни. Уточни фракцию/размер под собаку.";
  }

  function cardText(name, title, fractions) {
    var fr = (fractions || []).length ? ("Фракции/размеры: " + fractions.join(", ")) : "";
    return name + "\n" + (title ? ("Категория: " + title + "\n") : "") + (fr ? fr + "\n" : "") + "\n" + blurb(name);
  }

  async function copyText(text, ok) {
    text = String(text || "");
    if (!text) { sh().toast("Пусто"); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        sh().toast(ok || "Скопировано");
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
      sh().toast(ok || "Скопировано");
    } catch (e2) {
      sh().toast("Не скопировалось");
    }
  }

  async function load(force) {
    var params = { action: "listTemplates" };
    if (force) params._ = String(Date.now());
    var res = await api().apiGet(params, { timeoutMs: force ? 25000 : 18000, cacheTtlMs: force ? 0 : 180000 });
    items = (res && (res.templates || res.items)) || [];
    return res;
  }

  function paintList() {
    var rows = items.filter(function (it) { return !isProduct(it); });
    var html = '<button type="button" class="nx-link" data-act="more-back">← Ещё</button>';
    html += '<div class="nx-actions" style="margin:12px 0">' +
      '<button type="button" class="b-btn b-btn--main" data-act="tpl-add">+ Шаблон</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="tpl-reload">Обновить</button></div>';
    html += '<button type="button" class="b-li" data-act="tpl-cards"><span class="b-li__body"><span class="b-li__title">Карточка лакомств</span>' +
      '<span class="b-li__sub">Все позиции ассортимента → краткое описание, копировать клиенту</span></span><span class="b-li__chev">›</span></button>';
    if (form) html += formHtml();
    if (!rows.length) html += '<p class="b-note">Текстовых шаблонов пока нет — нажми «+ Шаблон».</p>';
    rows.forEach(function (it) {
      var idx = items.indexOf(it);
      var body = String(it.body || "");
      var preview = body.length > 140 ? body.slice(0, 140) + "…" : body;
      html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">' + esc(it.title || it.id || "Без названия") + "</p>" +
        '<p class="b-note">' + esc(kindLabel(it.kind, it.id) + (it.id ? " · " + it.id : "")) + "</p>" +
        (preview ? '<p style="white-space:pre-wrap;margin:8px 0">' + esc(preview) + "</p>" : "") +
        '<div class="nx-actions"><button type="button" class="b-btn b-btn--sec" data-act="tpl-copy" data-i="' + idx + '">Копировать</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="tpl-edit" data-i="' + idx + '">Изменить</button>' +
        '<button type="button" class="b-btn b-btn--sec" data-act="tpl-del" data-i="' + idx + '">Удалить</button></div></article>';
    });
    sh().dock("");
    sh().main(html);
  }

  function formHtml() {
    var f = form || {};
    var kind = f.kind === "survey" ? "survey" : "text";
    return '<article class="b-card" style="margin-top:12px"><p class="b-lbl">' + (f.id ? "Изменить шаблон" : "Новый шаблон") + "</p>" +
      '<label class="b-field"><span class="b-note">Название</span><input class="b-field__input" id="tplTitle" value="' + esc(f.title || "") + '"></label>' +
      '<label class="b-field" style="margin-top:8px"><span class="b-note">Тип</span><select class="b-field__input" id="tplKind">' +
      '<option value="text"' + (kind === "text" ? " selected" : "") + ">Текст клиенту</option>" +
      '<option value="survey"' + (kind === "survey" ? " selected" : "") + ">Опросник</option></select></label>" +
      '<label class="b-field b-field--area" style="margin-top:8px"><span class="b-note">Текст</span><textarea class="b-field__input" id="tplBody">' + esc(f.body || "") + "</textarea></label>" +
      '<div class="nx-actions" style="margin-top:8px"><button type="button" class="b-btn b-btn--main" data-act="tpl-save">Сохранить</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="tpl-cancel">Отмена</button></div></article>';
  }

  function cats() {
    var cat = eng() && eng().catalog;
    return cat || {};
  }

  function paintCards() {
    var html = '<button type="button" class="nx-link" data-act="tpl-back-list">← К шаблонам</button>';
    html += '<p class="b-note">Выбери категорию, затем позицию — откроется краткая карточка.</p>';
    var all = cats();
    Object.keys(all).forEach(function (key) {
      var c = all[key];
      if (!c || key === "powder") return;
      var n = (c.items || []).length;
      if (!n && key === "crumb") return;
      html += '<button type="button" class="b-li" data-act="tpl-cat" data-cat="' + esc(key) + '"><span class="b-li__body"><span class="b-li__title">' +
        esc(c.title || key) + '</span><span class="b-li__sub">' + n + " поз.</span></span><span class=\"b-li__chev\">›</span></button>";
    });
    sh().main(html);
  }

  function paintCat() {
    var c = cats()[catKey] || {};
    var html = '<button type="button" class="nx-link" data-act="tpl-cards">← Категории</button>';
    html += '<p class="b-lbl">' + esc(c.title || catKey) + "</p>";
    (c.items || []).forEach(function (name) {
      var fr = (c.fractions && c.fractions[name]) || [];
      var ov = override(name);
      html += '<button type="button" class="b-li" data-act="tpl-sku" data-name="' + esc(name) + '"><span class="b-li__body"><span class="b-li__title">' +
        esc(name) + (ov ? " · свой текст" : "") + "</span>" +
        (fr.length ? '<span class="b-li__sub">' + esc(fr.join(" · ")) + "</span>" : "") +
        "</span><span class=\"b-li__chev\">›</span></button>";
    });
    sh().main(html);
  }

  function paintSku() {
    var c = cats()[catKey] || {};
    var fr = (c.fractions && c.fractions[sku]) || [];
    var note = noteOf(sku);
    var html = '<button type="button" class="nx-link" data-act="tpl-cat" data-cat="' + esc(catKey) + '">← ' + esc(c.title || "Назад") + "</button>";
    html += '<article class="b-card" style="margin-top:12px"><p class="b-li__title" style="margin:0">' + esc(sku) + "</p>" +
      '<p class="b-note">' + esc(c.title || "") + (fr.length ? " · " + fr.join(", ") : "") + "</p>" +
      '<p style="white-space:pre-wrap">' + esc(blurb(sku)) + "</p>" +
      '<div class="nx-actions"><button type="button" class="b-btn b-btn--main" data-act="tpl-copy-card">Копировать</button>' +
      '<button type="button" class="b-btn b-btn--sec" data-act="tpl-edit-card">Текст</button>' +
      (note ? '<button type="button" class="b-btn b-btn--sec" data-act="tpl-copy-note">Примечание</button>' : "") +
      "</div>" +
      (note ? '<p class="b-note">«Примечание» копирует отдельный текст для клиента (не входит в основное описание).</p>' : "") +
      "</article>";
    sh().main(html);
  }

  function paint() {
    sh().dock("");
    if (view === "cards") return paintCards();
    if (view === "cat") return paintCat();
    if (view === "sku") return paintSku();
    paintList();
  }

  async function show() {
    view = "list";
    form = null;
    sh().main(sh().skeleton(3));
    try { await load(false); } catch (e) { items = []; }
    paint();
  }

  async function save() {
    var title = (document.getElementById("tplTitle") || {}).value || "";
    var kind = (document.getElementById("tplKind") || {}).value || "text";
    var body = (document.getElementById("tplBody") || {}).value || "";
    title = String(title).trim();
    body = String(body).trim();
    if (!title && !body) { sh().toast("Укажи название или текст"); return; }
    if (!title) title = "Без названия";
    var id = (form && form.id) || "";
    var titleB64 = b64(title);
    var bodyB64 = b64(body);
    var payload = {
      action: "saveTemplate",
      id: id,
      kind: kind,
      titleB64: titleB64,
      bodyB64: bodyB64,
      telegramId: tid(),
      _: String(Date.now())
    };
    if (!titleB64) payload.title = title;
    if (!bodyB64) payload.body = body;
    sh().toast("Сохраняю…");
    var qApprox = Object.keys(payload).reduce(function (n, k) {
      return n + encodeURIComponent(String(payload[k] == null ? "" : payload[k])).length + 2;
    }, 0);
    var res = null;
    if (qApprox < 7000) {
      res = await api().apiGet(payload, { timeoutMs: 45000, cacheTtlMs: 0 });
    } else {
      await api().apiPost({
        action: "saveTemplate", id: id, kind: kind, title: title, body: body,
        titleB64: titleB64, bodyB64: bodyB64, telegramId: tid()
      });
      await new Promise(function (r) { setTimeout(r, 900); });
      var list = await api().apiGet({ action: "listTemplates", _: String(Date.now()) }, { timeoutMs: 30000, cacheTtlMs: 0 });
      var found = ((list && (list.templates || list.items)) || []).filter(function (t) {
        return id ? String(t.id || "").toLowerCase() === id.toLowerCase() : (String(t.title || "") === title && String(t.body || "") === body);
      })[0];
      res = found ? { status: "success", id: found.id, title: found.title, body: found.body, kind: found.kind } : { status: "error", message: "not_confirmed" };
    }
    if (!res || res.status !== "success") {
      var why = (res && res.message) || "ошибка";
      if (why === "owner_only" || why === "forbidden") why = "нет доступа";
      sh().toast("Не сохранилось: " + why);
      return;
    }
    form = null;
    sh().toast("Сохранено");
    try { await load(true); } catch (e) {}
    paint();
  }

  async function del(i) {
    var it = items[i];
    if (!it || !it.id) return;
    var ok = await sh().confirm({ title: "Удалить шаблон", text: "Удалить шаблон «" + (it.title || it.id) + "»?", ok: "Удалить", cancel: "Отмена" });
    if (!ok) return;
    sh().toast("Удаляю…");
    var res = await api().apiGet({ action: "deleteTemplate", id: String(it.id), telegramId: tid(), _: String(Date.now()) }, { timeoutMs: 35000, cacheTtlMs: 0 });
    if (res && res.status !== "success" && (res.message === "forbidden" || res.message === "owner_only") && tid()) {
      res = await api().apiGet({ action: "deleteTemplate", id: String(it.id), _: String(Date.now()) }, { timeoutMs: 35000, cacheTtlMs: 0 });
    }
    if (!res || res.status !== "success") {
      var why = (res && res.message) || "ошибка";
      if (why === "canonical_owner_only") why = "канон опросника — только владелец";
      sh().toast("Не удалилось: " + why);
      return;
    }
    sh().toast("Удалено");
    try { await load(true); } catch (e) {}
    paint();
  }

  async function saveCardText() {
    var next = await sh().prompt({ title: "Текст карточки «" + sku + "»", value: blurb(sku), ok: "Сохранить" });
    if (next == null) return;
    next = String(next).trim();
    if (!next) { sh().toast("Пусто — не сохраняю"); return; }
    var id = slug(sku);
    sh().toast("Сохраняю текст…");
    var res = await api().apiGet({
      action: "saveTemplate",
      id: id,
      kind: "product",
      title: sku,
      titleB64: b64(sku),
      bodyB64: b64(next),
      telegramId: tid(),
      _: String(Date.now())
    }, { timeoutMs: 45000, cacheTtlMs: 0 });
    if (!res || res.status !== "success") { sh().toast("Не сохранилось"); return; }
    var found = false;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id || "").toLowerCase() === id.toLowerCase()) {
        items[i] = { id: id, kind: "product", title: sku, body: next };
        found = true;
        break;
      }
    }
    if (!found) items = [{ id: id, kind: "product", title: sku, body: next }].concat(items);
    sh().toast("Текст карточки сохранён");
    paint();
  }

  function onAct(act, node) {
    if (!act || String(act).indexOf("tpl-") !== 0) return false;
    if (act === "tpl-add") { view = "list"; form = { id: "", title: "", kind: "text", body: "" }; paint(); return true; }
    if (act === "tpl-cancel") { form = null; paint(); return true; }
    if (act === "tpl-reload") { load(true).then(paint).catch(function () { sh().toast("Не загрузилось"); }); return true; }
    if (act === "tpl-save") { save(); return true; }
    if (act === "tpl-copy") { var it = items[Number(node.getAttribute("data-i"))]; copyText(it && (it.body || it.title), "Скопировано"); return true; }
    if (act === "tpl-edit") {
      var row = items[Number(node.getAttribute("data-i"))];
      if (!row) return true;
      var kind = String(row.kind || "text");
      if (/^survey_/i.test(row.id || "")) kind = "survey";
      if (kind !== "survey" && kind !== "text") kind = "text";
      form = { id: row.id, title: row.title || "", kind: kind, body: row.body || "" };
      view = "list";
      paint();
      return true;
    }
    if (act === "tpl-del") { del(Number(node.getAttribute("data-i"))); return true; }
    if (act === "tpl-cards") { view = "cards"; paint(); return true; }
    if (act === "tpl-back-list") { view = "list"; paint(); return true; }
    if (act === "tpl-cat") { catKey = node.getAttribute("data-cat") || catKey; view = "cat"; paint(); return true; }
    if (act === "tpl-sku") { sku = node.getAttribute("data-name") || ""; view = "sku"; paint(); return true; }
    if (act === "tpl-copy-card") {
      var c = cats()[catKey] || {};
      var fr = (c.fractions && c.fractions[sku]) || [];
      copyText(cardText(sku, c.title || "", fr), "Описание скопировано");
      return true;
    }
    if (act === "tpl-copy-note") { copyText(noteOf(sku), "Примечание скопировано"); return true; }
    if (act === "tpl-edit-card") { saveCardText(); return true; }
    return false;
  }

  root.BoinyaTemplates = { bind: function (a) { access = a; }, show: show, onAct: onAct, blurb: blurb, noteOf: noteOf, cardText: cardText };
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).BoinyaTemplates;
}
