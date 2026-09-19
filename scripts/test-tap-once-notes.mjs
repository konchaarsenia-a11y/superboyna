#!/usr/bin/env node
/**
 * After #325: tap single-path (no double-fire) + once notes actually delete.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ui = fs.readFileSync(path.join(root, "boinya-c/app.main.js"), "utf8");
const html = fs.readFileSync(path.join(root, "boinya-c/app.html"), "utf8");
const idx = fs.readFileSync(path.join(root, "boinya-c/index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "boinya-c/proxy/worker.js"), "utf8");
const tz = fs.readFileSync(path.join(root, "TZ.md"), "utf8");

assert(ui.includes("var TAP_DEBOUNCE_MS = 320"), "debounce 320ms");
assert(ui.includes("var RESCUE_WAIT_MS = 170"), "rescue 170ms");
assert(ui.includes("function createTapOnceGate_"), "tap gate helper");
assert(ui.includes("function isPackBumpButton_"), "pack button helper");
assert(ui.includes("gate.acceptRescue") && ui.includes("gate.acceptNative"), "IIFE uses single-path gate");
assert(ui.includes("injectingClick"), "rescue click marked to avoid self-swallow");
assert(html.includes('data-pack-bump="1"'), "pack +/- data-pack-bump");
assert(ui.includes("(now - _packBumpAt) < 320"), "pack bump debounce 320");
assert(!ui.includes("if (!orderNotes.length) orderNotes = [defaultOrderNote()];"), "empty notes stay empty");
assert(ui.includes('Нет примечаний'), "empty notes UI, not a fake row");
assert(/function removeOrderNote\(i\) \{[\s\S]{0,180}orderNotes\.splice/.test(ui), "remove splices");
assert(!/function removeOrderNote\(i\) \{[\s\S]{0,220}defaultOrderNote/.test(ui), "remove does not revive default note");
assert(!/parsed\[0\]\.permanent = true/.test(ui), "no untagged→perm fallback");
assert(ui.includes("note: permanentNotesRawOnly_("), "profile memory stores perm-only");
assert(ui.includes("var permanentNoteTagged"), "save snapshots tagged perm notes before reset");
assert(ui.includes('clearNote: noteCleared ? "1" : ""'), "save still sends clearNote");
assert(/upsertOrderRow_\([\s\S]{0,500}\{\s*params:\s*params\s*\}/.test(worker), "Worker save passes params to upsert");
assert(/v71115979/.test(html) && /v71115979/.test(ui) && /71115979/.test(idx), "Pages v71115979");
assert(/tap-once-notes-h1/.test(tz), "TZ marker");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const tapCtx = vm.createContext({ Date, Math, Number, String });
vm.runInContext(extractFn(ui, "createTapOnceGate_"), tapCtx);
const gate = tapCtx.createTapOnceGate_({ debounceMs: 320 });
const btn = { id: "pack-plus" };

gate.resetPointer();
assert(gate.shouldRescue(false) === true, "generic button may rescue");
assert(gate.shouldRescue(true) === false, "pack button never rescues");
assert(gate.acceptRescue(btn, true) === false, "pack rescue rejected");

gate.resetPointer();
assert(gate.acceptRescue(btn, false) === true, "rescue fires once");
assert(gate.acceptNative(btn) === false, "native after rescue is swallowed");
assert(gate.nativeAfterRescue() === true, "rescueFired sticky until next pointer");

gate.resetPointer();
const btn2 = { id: "save" };
assert(gate.acceptNative(btn2) === true, "native first wins");
assert(gate.acceptRescue(btn2, false) === false, "rescue after native skipped");
assert(gate.acceptNative(btn2) === false, "same-button debounce 320ms");

const noteCtx = vm.createContext({ Math, Number, String, Array, Object, Boolean });
vm.runInContext(
  [
    "function stripMetaFromNote(note) { return String(note || \"\"); }",
    "function parseNoteAudience() { return [\"cour\"]; }",
    extractFn(ui, "defaultOrderNote"),
    extractFn(ui, "sanitizeNoteItemKey_"),
    extractFn(ui, "serializeOrderNotes"),
    extractFn(ui, "parseOrderNotesFromRaw"),
    extractFn(ui, "permanentNotesRawOnly_")
  ].join("\n"),
  noteCtx
);

const onceRaw = "[NOTE:cour|once] позвони вечером";
const permRaw = "[NOTE:cour|perm] постоянный дворник";
const bothRaw = permRaw + " || " + onceRaw;
assert(noteCtx.parseOrderNotesFromRaw("").length === 0, "empty raw → empty list");
const onceParsed = noteCtx.parseOrderNotesFromRaw(onceRaw);
assert(onceParsed.length === 1 && onceParsed[0].permanent === false, "once stays once");
assert(noteCtx.permanentNotesRawOnly_(onceRaw) === "", "once dropped for next order");
assert(noteCtx.permanentNotesRawOnly_("позвони вечером") === "", "untagged disposable not re-imported as perm");
assert(noteCtx.permanentNotesRawOnly_(permRaw).indexOf("постоянный дворник") >= 0, "explicit perm kept");
assert(noteCtx.permanentNotesRawOnly_(bothRaw).indexOf("once") < 0, "mixed: once stripped");
assert(noteCtx.permanentNotesRawOnly_(bothRaw).indexOf("постоянный дворник") >= 0, "mixed: perm kept");
assert(noteCtx.serializeOrderNotes([]) === "", "empty list serializes to empty → clearNote");

console.log("tap-once-notes OK");
