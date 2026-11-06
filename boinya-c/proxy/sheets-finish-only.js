/**
 * Sheets только при явном «Завершить неделю».
 * Чтения GAS/Sheets и любые записи вне finishFullWeek* запрещены.
 * Откат: SHEETS_MODE=mirror|on|write или SHEETS_FINISH_ONLY=0|off|false.
 */

/** @param {object|null|undefined} env */
export function isSheetsFinishOnly_(env) {
  const mode = env && env.SHEETS_MODE ? String(env.SHEETS_MODE).trim().toLowerCase() : "";
  if (mode === "mirror" || mode === "on" || mode === "write" || mode === "legacy") return false;
  if (mode === "finish-only" || mode === "finish" || mode === "off") return true;
  const flag = env && env.SHEETS_FINISH_ONLY != null ? String(env.SHEETS_FINISH_ONLY).trim().toLowerCase() : "";
  if (flag === "0" || flag === "off" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "on" || flag === "true" || flag === "yes") return true;
  return true; // default: finish-only
}

/**
 * Единственный разрешённый семейный action для Sheets — finishFullWeek*.
 * materializeWeek / repair / get* / people-write — нет.
 * @param {string} action
 */
export function sheetsGasAllowed_(action) {
  return /^finishFullWeek([A-Za-z]*)?$/i.test(String(action || ""));
}

/** @param {string} action */
export function sheetsFinishOnlySkip_(action) {
  return {
    status: "skipped",
    sheetsFinishOnly: true,
    sheetsReadonly: true,
    message: "sheets_finish_only",
    action: String(action || "")
  };
}

/** @param {object|null|undefined} env */
export function sheetsModeLabel_(env) {
  return isSheetsFinishOnly_(env) ? "finish-only" : "legacy-mirror";
}
