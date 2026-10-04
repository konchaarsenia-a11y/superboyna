#!/usr/bin/env node
/**
 * Восстановление andreiprigunov. По умолчанию сухой прогон, сеть не трогает.
 * Запись только при RESTORE_CONFIRM=restore-andreiprigunov-oct5 и --allow-write.
 * Не поднимает дубль 2026-10-03 и не трогает другие ники.
 *
 * Карточка ПП: полного снимка нет (D1 listSubscriptions пуст, лист rowIndex 0,
 * надгробие хранит только личность «Андрей» / subId 53). Скрипт карточку не пишет.
 */
const CONFIRM = "restore-andreiprigunov-oct5";
const ORDER_ID = "Будущая неделя:ANDREIPRIGUNOV";
const DO_NOT_TOUCH_IDS = ["Суббота:ANDREIPRIGUNOV"];

const order = {
  id: ORDER_ID,
  date: "2026-10-05",
  day: "Будущая неделя",
  segment: "ПП",
  source: "transfer",
  deletedAt: "2026-10-04T07:45:46.930Z",
  note: "[ЕВРОПОЧТА] [ОТДЕЛЕНИЕ:ОПС 564] [NOTE:mgr,cour|perm] Пригунов Андрей Викторович",
  basket: ["ЛЁГКОЕ", "СЕРДЦЕ", "ПОЧКИ", "ПОЧКИ", "УХО Г", "СТАНОВАЯ ЖИЛА", "АОРТА"],
  ppSlot: "1",
  deliverySlot: 1,
  deliveriesN: 1,
  orderPrice: "61",
  ppHint: "ПП N=1",
  noCut: false
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function plan() {
  return {
    write: false,
    confirm: CONFIRM,
    order: {
      id: order.id,
      to: "active",
      date: order.date,
      day: order.day,
      price: order.orderPrice,
      ppSlot: order.ppSlot,
      deliverySlot: order.deliverySlot,
      deliveriesN: order.deliveriesN,
      ppHint: order.ppHint,
      basket: order.basket,
      note: order.note,
      backupFirst: "INSERT snap_cache restoreBackup:<iso> с JSON удалённой строки, потом один UPDATE",
      sql:
        "UPDATE orders SET status='active', updated_at=? WHERE id='Будущая неделя:ANDREIPRIGUNOV' AND status='deleted' AND match_key LIKE '%ANDREIPRIGUNOV%'"
    },
    doNotTouch: DO_NOT_TOUCH_IDS.concat(["Alinagidayathanova"]),
    card: {
      restore: false,
      reason:
        "Нет исходной строки карточки: D1 listSubscriptions без этого ника, лист ПП rowIndex 0, надгробие только nick/subId."
    }
  };
}

const args = process.argv.slice(2);
const allowWrite = args.indexOf("--allow-write") >= 0;
const confirm = String(process.env.RESTORE_CONFIRM || "");

assert(order.id !== "Суббота:ANDREIPRIGUNOV", "oct3 id is not the restore target");
assert(DO_NOT_TOUCH_IDS.indexOf(ORDER_ID) < 0, "restore id must not be blocked");
assert(!/Alina/i.test(ORDER_ID), "restore id is andreiprigunov only");

if (!allowWrite || confirm !== CONFIRM) {
  const body = plan();
  console.log(JSON.stringify(body, null, 2));
  console.log("dry-run: запись не выполнялась");
  process.exit(0);
}

console.error("confirm принят, но запись из этого прогона запрещена: не вызывать D1 без отдельного разрешения");
process.exit(2);
