/**
 * Пачка себес / цели / почта / доступы.
 * Выход склада — доля, себес × (старый / новый). Розница до «Обновить прайс» не двигается.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const worker = readFileSync(join(root, "boinya-c/proxy/worker.js"), "utf8");
const gas = readFileSync(join(root, "Code.gs"), "utf8");
const goals = require(join(root, "boinya-c/next/goals-logic.js"));
const formulas = require(join(root, "boinya-c/next/formulas.js"));
const payload = require(join(root, "boinya-c/next/order-payload.js"));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL", msg);
  } else {
    console.log("OK  ", msg);
  }
}

function sliceFn(src, name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const yieldSrc =
  "var RAW_YIELD_DEFAULT_ = 0.2;\n" +
  sliceFn(worker, "rawYieldNum_") +
  "\n" +
  sliceFn(worker, "rawYieldScale_");
const yieldApi = new Function(yieldSrc + "\nreturn { rawYieldScale_: rawYieldScale_ };")();

assert(yieldApi.rawYieldScale_(2.25, 0.2, 0.1) === 4.5, "выход 0.2→0.1 удваивает себес 2.25 → 4.5");
assert(yieldApi.rawYieldScale_(2.25, 0.2, 0.2) === 2.25, "тот же выход себес не двигает");
assert(worker.indexOf("себес × (выход старый / выход новый)") >= 0, "подсказка прайса про формулу выхода");
assert(worker.indexOf("retailFrozen: true") >= 0, "сохранение себеса не публикует розницу");
assert(worker.indexOf("cardsUntouched: true") >= 0, "карточки не переписываются");

const ids = goals.METRICS.map(function (m) { return m.id; });
assert(ids.join(",") === "turnover,clean,clients,newClients,ppClients,orders", "цели: шесть показателей");
assert(ids.indexOf("kg") < 0, "килограммы из целей убраны");
assert(goals.metricById("income").id === "clean", "старый id income читается как чистое");
assert(goals.metricById("kg") == null, "старая цель кг без показателя");
assert(goals.METRICS.filter(function (m) { return m.id === "ppClients"; })[0].label === "Подписки ПП", "подпись подписок");
assert(goals.METRICS.filter(function (m) { return m.id === "orders"; })[0].label === "Доставки", "доставки вместо кг");

const closed = formulas.formulaClose_({ revenue: 100, S: 0, G: 0, P: 0, N: 0, rows: [], repairs: [], monthKey: "2026-10" });
assert(closed.rent === 0, "аренда по умолчанию 0");
assert(closed.rentDefault === true, "пустая аренда не считается введённой");
assert(formulas.formulaMonth_({ revenue: 100, S: 0, G: 0, P: 0, N: 0 }).rent === 0, "месяц без аренды не пишет 900");

const euro = payload.mailTags_({
  deliveryMethod: "euro",
  mailFio: "Иванов Иван",
  postOffice: "Отд 12",
  mailPhone: "80290000000"
});
assert(euro.indexOf("[ЕВРОПОЧТА]") === 0, "европочта: тег");
assert(/\[ФИО:Иванов Иван\]/.test(euro) && /\[ОТДЕЛЕНИЕ:Отд 12\]/.test(euro) && /\[TEL:80290000000\]/.test(euro), "европочта: фио, отделение, телефон");
const bel = payload.mailTags_({
  deliveryMethod: "bel",
  mailFio: "Петров",
  mailPhone: "8033",
  mailHome: "ул Ленина 1",
  mailIndex: "220000",
  mailCity: "Минск",
  mailDistrict: "Центральный",
  mailRegion: "Минская"
});
assert(/\[БЕЛПОЧТА\]/.test(bel) && /\[ДОМ:ул Ленина 1\]/.test(bel) && /\[ИНДЕКС:220000\]/.test(bel), "белпочта: дом и индекс");
assert(/\[ГОРОД:Минск\]/.test(bel) && /\[РАЙОН:Центральный\]/.test(bel) && /\[ОБЛАСТЬ:Минская\]/.test(bel), "белпочта: город, район, область");
const other = payload.mailTags_({ deliveryMethod: "other", mailOther: "курьер СДЭК" });
assert(other === "[ПОЧТА] [ДРУГОЕ:курьер СДЭК]", "другое: одно поле");
const back = payload.mailFromNote_(euro);
assert(back.mailOn === true && back.deliveryMethod === "euro" && back.postOffice === "Отд 12", "разбор европочты из заметки");

assert(/keepTargetUser = \/\^\(partnerSaveAccess\|partnerRevokeAccess\)/.test(worker), "ник цели не затирается ником того, кто выдаёт");
assert(worker.indexOf("_actorRole: params && params._actorRole") >= 0, "роль менеджера доходит до выдачи доступа");
assert(worker.indexOf("byId[pointIds[p]] ||") >= 0, "точка вне каталога не гасит доступ");

assert(gas.indexOf('callback_data: "costpub"') >= 0, "кнопка обновить прайс в дайджесте");
assert(gas.indexOf('reason: "empty"') >= 0, "пустой месяц без сообщения");
assert(gas.indexOf('reason: "fetch"') >= 0, "сбой Worker не помечает месяц отправленным");
assert(gas.indexOf("maybeSendCostDigest_()") >= 0, "дайджест на утреннем тике 11:00");
assert(worker.indexOf("GOALS_TG_NOTIFY") >= 0, "флаг целей не включался этим патчем");
assert(!/GOALS_TG_NOTIFY["']?\s*[:=]\s*["']1["']/.test(worker), "GOALS_TG_NOTIFY не равен 1 в коде");

assert(worker.indexOf("Клиенту бот не пишет") >= 0, "трек клиенту бот не отправляет");
assert(worker.indexOf("Instagram клиента") >= 0, "кнопка Instagram менеджеру");
assert(worker.indexOf("mailPayCheck") >= 0, "через 2 дня вопрос об оплате");
assert(worker.indexOf("function telegramSendPhotoWorker_") >= 0, "фото трека уходит вложением");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("cost-pack ok");
