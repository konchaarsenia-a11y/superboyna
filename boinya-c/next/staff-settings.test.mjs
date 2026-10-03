import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(dir, "app.js"), "utf8");
const peopleSrc = fs.readFileSync(path.join(dir, "people.js"), "utf8");
const tasksSrc = fs.readFileSync(path.join(dir, "tasks.js"), "utf8");
const formulasSrc = fs.readFileSync(path.join(dir, "formulas.js"), "utf8");

test("Ещё: Сотрудники и Настройки, доступы не отдельной кнопкой", () => {
  assert.match(appSrc, /data-act="more-staff"/);
  assert.match(appSrc, /data-act="more-settings"/);
  assert.match(appSrc, />Сотрудники</);
  assert.match(appSrc, />Настройки</);
  assert.doesNotMatch(appSrc, /data-act="more-people"><span class="b-li__body"><span class="b-li__title">Доступы</);
  assert.match(appSrc, /moreView === "settings"/);
  assert.match(appSrc, /people\(\)\.show\(\{ view: "staff" \}\)/);
  assert.match(appSrc, /people\(\)\.show\(\{ view: "settings" \}\)/);
});

test("зарплата берётся из formulaParts_, кнопку месяца нет", () => {
  assert.match(peopleSrc, /formulaParts_\(\{ S: roll\.S, G: roll\.G, P: roll\.P, N: roll\.N \}\)/);
  assert.doesNotMatch(peopleSrc, /2\.5\s*\*/);
  assert.doesNotMatch(peopleSrc, /2,50/);
  assert.doesNotMatch(peopleSrc, /0\.50/);
  assert.doesNotMatch(peopleSrc, /3\.00/);
  assert.doesNotMatch(peopleSrc, /Показать месяц/);
  assert.match(peopleSrc, /id="nxRoleMonth"/);
  assert.match(peopleSrc, /Сообщение складу/);
  assert.match(peopleSrc, /forRole: "logistics"/);
  assert.match(peopleSrc, /mode: "remind"/);
  assert.doesNotMatch(peopleSrc, /telegramSend|sendMessage/);
  assert.match(peopleSrc, /screen === "settings"/);
  assert.match(tasksSrc, /pl\.text/);
});

test("назначенному нарезчику сумма месяца, остальным ноль", () => {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    document: { getElementById() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    Object, Array, String, Number, Math, Date, JSON, isFinite, Promise
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(formulasSrc, sandbox, { filename: "formulas.js" });
  const parts = sandbox.BoinyaFormulas.formulaParts_({ S: 0, G: 1000, P: 4, N: 2 });
  assert.equal(parts.wage, 2.5 * 10 + 0.5 * 4 + 3 * 2);
  vm.runInContext(peopleSrc, sandbox, { filename: "people.js" });
  assert.equal(typeof sandbox.BoinyaPeople.show, "function");
  assert.match(peopleSrc, /String\(p\.telegramId\) === String\(cutterId\)/);
  assert.match(peopleSrc, /sh\(\)\.money\(0\)/);
});
