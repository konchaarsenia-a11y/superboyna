#!/usr/bin/env node
/**
 * PR-гейт Worker.
 * #479 влил const meta, потом присваивание. Сборка wrangler упала уже на main,
 * next-undef это не видит: он смотрит только next/*.js.
 * node --check ловит синтаксис. Присваивание const — не синтаксис, его ловит no-const-assign.
 * Секреты и wrangler deploy не нужны.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const worker = path.join(root, "boinya-c/proxy/worker.js");
const lintDir = path.join(here, "next-lint");
const eslintPkg = path.join(lintDir, "node_modules/eslint/package.json");

if (!fs.existsSync(worker)) {
  console.error("Нет " + worker);
  process.exit(1);
}
if (!fs.existsSync(eslintPkg)) {
  console.error("Нет eslint. Запусти: npm install --prefix scripts/next-lint");
  process.exit(1);
}

const syntax = spawnSync(process.execPath, ["--check", worker], { encoding: "utf8" });
if (syntax.status !== 0) {
  console.error(syntax.stderr || syntax.stdout || "node --check worker.js");
  process.exit(syntax.status || 1);
}

const require = createRequire(eslintPkg);
const { ESLint } = require("eslint");
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.js"],
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: { "no-const-assign": "error" }
    }
  ]
});

const probe = await eslint.lintText("function f(row) {\n  const meta = row;\n  meta = meta || {};\n}\n", {
  filePath: path.join(root, "boinya-c/proxy/_const_probe.js")
});
const probeHit = (probe[0].messages || []).some(function (m) {
  return m.severity === 2 && /const/i.test(m.message);
});
if (!probeHit) {
  console.error("no-const-assign не поймал const meta = … — проверка сломана");
  process.exit(1);
}

const results = await eslint.lintFiles([worker]);
const errors = results.flatMap(function (r) {
  return (r.messages || []).filter(function (m) { return m.severity === 2; }).map(function (m) {
    return path.relative(root, r.filePath) + ":" + m.line + " " + m.message;
  });
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("worker.js syntax and no-const-assign ok");
