/**
 * After D1 week close: build finishFullWeek* params for Sheets write-only.
 * Source of truth = D1 close result; no Sheet reads for the decision.
 */

/** @param {object} closed closeWeekInD1_ success body */
/** @param {object} params original finish params (auth fields) */
export function buildWeekCloseSheetsParams_(closed, params) {
  const src = closed || {};
  const p = params || {};
  const report = {
    message: "week_closed",
    prevMondayIso: String(src.prevMondayIso || ""),
    prevMondayDate: String(src.prevMondayDate || ""),
    mondayDate: String(src.mondayDate || ""),
    courierDate: String(src.courierDate || ""),
    materializeAdded: src.materializeAdded,
    futureMoved: src.futureMoved,
    archived: src.archived,
    backup: src.backup || "",
    warehouseClose: src.warehouseClose || null
  };
  return {
    confirm: "1",
    fromD1Close: "1",
    weekKey: String(src.prevMondayIso || p.weekKey || ""),
    prevMondayIso: report.prevMondayIso,
    mondayDate: report.mondayDate,
    telegramId: String(p.telegramId || p._actorTid || ""),
    initData: p.initData || "",
    tgLogin: p.tgLogin || "",
    desktopSession: p.desktopSession || "",
    skipWarehouseClose: "1",
    d1Report: report
  };
}

/** @param {object|null|undefined} sheetsRes gasProxy_ result */
export function summarizeWeekCloseSheets_(sheetsRes) {
  const res = sheetsRes || {};
  const stub = !!res.previewStub;
  const busy = /week_finish_busy|week_finish_started/i.test(String(res.message || ""));
  const ok =
    stub ||
    busy ||
    (res.status === "success" &&
      (/week_closed/i.test(String(res.message || "")) || res.sheetsWritten === true || res.fromD1Close === true)) ||
    (res.status === "accepted" && busy);
  return {
    ok: !!ok,
    stub: stub,
    busy: busy,
    status: res.status || "",
    message: String(res.message || ""),
    sheetsWritten: stub ? false : !!(res.sheetsWritten || (res.status === "success" && !busy)),
    external: res.external,
    previewStub: stub
  };
}
