import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientsSrc = fs.readFileSync(path.resolve(here, "clients.js"), "utf8");
const appSrc = fs.readFileSync(path.resolve(here, "app.js"), "utf8");
const htmlSrc = fs.readFileSync(path.resolve(here, "../next.html"), "utf8");
const accessSrc = fs.readFileSync(path.resolve(here, "access.js"), "utf8");

function boot() {
  const calls = [];
  const paints = [];
  const sandbox = {
    window: {},
    document: {
      querySelector: function () { return null; },
      getElementById: function () { return null; }
    }
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(accessSrc, sandbox);
  sandbox.window.BoinyaShell = {
    esc: function (s) { return String(s == null ? "" : s); },
    skeleton: function (n) { return "SKELETON" + n; },
    errorBox: function () { return "ERR"; },
    main: function (html) { paints.push(String(html)); },
    dock: function () {},
    toast: function () {}
  };
  sandbox.window.BoinyaApi = {
    apiGet: function (params) {
      const action = String((params && params.action) || "");
      calls.push(action);
      if (action === "listSubscriptions") {
        return Promise.resolve({
          status: "success",
          subscriptions: [
            { sheet: "ПП", nick: "reks", label: "Рекс", subId: "1" },
            { sheet: "АФК", nick: "bars", label: "Барс", subId: "2" },
            { sheet: "БП", nick: "luna", label: "Луна", subId: "3", status: "БП1" }
          ]
        });
      }
      if (action === "listSurvey") {
        return Promise.resolve({
          status: "success",
          items: [{ id: "s1", nick: "luna", dueDate: "2026-10-12", status: "new" }]
        });
      }
      if (action === "listAccess") return Promise.resolve({ status: "success", people: [] });
      return Promise.resolve({ status: "success" });
    }
  };
  vm.runInNewContext(clientsSrc, sandbox);
  return {
    C: sandbox.window.BoinyaClients,
    A: sandbox.window.BoinyaAccess,
    calls: calls,
    paints: paints
  };
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

test("в клиентах нет экрана пароля подписок", () => {
  assert.equal(clientsSrc.includes("paintGate"), false);
  assert.equal(clientsSrc.includes("cxPass"), false);
  assert.equal(clientsSrc.includes("cl-unlock"), false);
  assert.equal(clientsSrc.includes("cl-gate-cancel"), false);
  assert.equal(clientsSrc.includes("unlockSubs"), false);
  assert.equal(clientsSrc.includes("superboyna_subs_unlocked"), false);
  assert.equal(clientsSrc.includes("парол"), false);
  assert.equal(clientsSrc.includes("Парол"), false);
  assert.ok(clientsSrc.includes("function canSubs()"));
  assert.ok(clientsSrc.includes('tabHas(access, "subsScreen")'));
  assert.ok(clientsSrc.includes('tabHas(access, "subDetailScreen")'));
  assert.equal(appSrc.includes("пароль"), false);
  assert.ok(appSrc.includes("ПП, АФК, БП и опросник"));
  assert.equal(htmlSrc.includes("Пароль"), false);
  assert.equal(htmlSrc.includes("cxPass"), false);
});

test("ПП открывается сразу и сразу грузит список", async () => {
  const ctx = boot();
  const acc = ctx.A.normalize({ role: "owner" });
  ctx.C.bind(acc);
  const segs = ctx.C.segs(acc).map(function (s) { return s.id; });
  assert.equal(segs.join(","), "pp,afk,bp,survey");
  await ctx.C.show("pp");
  assert.ok(ctx.calls.includes("listSubscriptions"));
  assert.equal(ctx.calls.includes("unlockSubs"), false);
  assert.ok(ctx.paints[0].includes("SKELETON"));
  assert.equal(ctx.paints[0].includes("Пароль"), false);
  assert.equal(ctx.paints[0].includes("В этом списке пусто"), false);
  await flush();
  const last = ctx.paints[ctx.paints.length - 1];
  assert.ok(last.includes("Рекс"));
  assert.equal(last.includes("Пароль"), false);
  assert.equal(last.includes("SKELETON"), false);
});

test("АФК и БП тоже грузятся без разблокировки", async () => {
  for (const seg of ["afk", "bp"]) {
    const ctx = boot();
    ctx.C.bind(ctx.A.normalize({ role: "all" }));
    await ctx.C.show(seg);
    assert.ok(ctx.calls.includes("listSubscriptions"), seg);
    assert.equal(ctx.calls.includes("unlockSubs"), false);
    assert.ok(ctx.paints[0].includes("SKELETON"), seg);
    await flush();
    const last = ctx.paints[ctx.paints.length - 1];
    assert.ok(last.includes(seg === "afk" ? "Барс" : "Луна"), seg);
    assert.equal(last.includes("Пароль"), false);
  }
});

test("опросник грузится сразу, сначала каркас", async () => {
  const ctx = boot();
  ctx.C.bind(ctx.A.normalize({ role: "owner" }));
  await ctx.C.show("survey");
  assert.ok(ctx.calls.includes("listSurvey"));
  assert.equal(ctx.calls.includes("unlockSubs"), false);
  assert.ok(ctx.paints[0].includes("SKELETON"));
  assert.equal(ctx.paints[0].includes("Опросников нет"), false);
  const last = ctx.paints[ctx.paints.length - 1];
  assert.ok(last.includes("luna"));
  assert.equal(last.includes("Пароль"), false);
});

test("без вкладки подписок список не запрашивается", async () => {
  const hidden = ["manager", "cutter", "courier", "logistics", "partner"];
  for (const role of hidden) {
    const ctx = boot();
    const acc = ctx.A.normalize({ role: role });
    ctx.C.bind(acc);
    assert.equal(ctx.A.tabHas(acc, "subsScreen"), false, role);
    assert.equal(ctx.A.tabHas(acc, "subDetailScreen"), false, role);
    assert.equal(ctx.C.segs(acc).length, 0, role);
    await ctx.C.show("pp");
    assert.equal(ctx.calls.includes("listSubscriptions"), false, role);
    assert.equal(ctx.calls.includes("listSurvey"), false, role);
    assert.equal(ctx.paints.join("").includes("Пароль"), false, role);
  }
});

test("менеджеру с выданной вкладкой подписки открываются", async () => {
  const ctx = boot();
  const acc = ctx.A.normalize({ role: "manager", tabs: ["subsScreen"], customTabs: ["subsScreen"] });
  ctx.C.bind(acc);
  assert.equal(ctx.A.tabHas(acc, "subsScreen"), true);
  await ctx.C.show("pp");
  assert.ok(ctx.calls.includes("listSubscriptions"));
  await flush();
  assert.ok(ctx.paints[ctx.paints.length - 1].includes("Рекс"));
});
