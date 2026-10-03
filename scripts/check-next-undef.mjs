#!/usr/bin/env node
/**
 * no-undef для boinya-c/next/*.js.
 * Падение на лайве было ReferenceError: action is not defined внутри apiGet.
 * node --check такое не видит.
 *
 * Зависимости: npm install --prefix scripts/next-lint
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const lintDir = path.join(here, "next-lint");
const eslintPkg = path.join(lintDir, "node_modules/eslint/package.json");
if (!fs.existsSync(eslintPkg)) {
  console.error("Нет eslint. Запусти: npm install --prefix scripts/next-lint");
  process.exit(1);
}

const require = createRequire(eslintPkg);
const { ESLint } = require("eslint");
const globals = require("globals");
const dir = path.join(root, "boinya-c/next");

const eslint = new ESLint({
  cwd: dir,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.js"],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "script",
        globals: {
          ...globals.browser,
          ...globals.worker,
          // UMD: typeof module / require("./…") в обёртках, в браузере не вызываются
          module: "readonly",
          require: "readonly",
          exports: "readonly"
        }
      },
      rules: {
        "no-undef": "error"
      }
    }
  ]
});

const probe = await eslint.lintText('"use strict";\nfunction apiGet(){ return action; }\n', {
  filePath: path.join(dir, "_undef_probe.js")
});
const probeHit = (probe[0].messages || []).some(function (m) {
  return m.severity === 2 && /action/.test(m.message);
});
if (!probeHit) {
  console.error("no-undef не поймал необъявленный action — проверка сломана");
  process.exit(1);
}

const results = await eslint.lintFiles(["**/*.js"]);
const errors = results.flatMap(function (r) {
  return (r.messages || []).filter(function (m) { return m.severity === 2; }).map(function (m) {
    return path.relative(root, r.filePath) + ":" + m.line + " " + m.message;
  });
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("next/*.js no-undef ok (" + results.length + " files)");
