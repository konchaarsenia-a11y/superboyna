# People Canon — D1-primary (LIVE)

**Канон людей = Cloudflare D1.** Google Sheets — **фоновое зеркало** (без обратного upsert в D1).

Неделя vs календарь: **`WEEK_CALENDAR_CANON.md`**.

## Как работает запись (save / move / delete)

1. Worker сразу пишет в **D1** и отвечает `accepted` + `d1Verified` + `writeId`.
2. В фоне: **D1 → GAS/Sheets** (зеркало). Ошибка листа **не откатывает** D1.
3. UI: poll `pollPeopleWrite` → **«Сохранено»** при `d1Verified` / `verified`.
4. Если зеркало Sheets не успело — toast «Лист Google догонит в фоне» (данные в приложении уже верные).
5. Дата **вне** слотов недели → только `saveBooking` / calendar move-remove.

## Жёсткое правило (агентам)

| Action | Порядок | Финальный toast |
|--------|---------|-----------------|
| `saveOrder` / `saveBooking` / `deleteClient` / `removeCalendarClient` / `moveClient` | **D1 сразу** → фон Sheets | при `d1Verified` («Сохранено») |
| batch move/delete | тот же accept | poll в фоне |
| `placeTransferTask` / `saveDeferred` / `notifyMissedDelivery` | D1-first | `d1Verified` |
| флаги нарезки/курьера/сборки | **D1 сразу** → Sheets зеркало | `d1Verified` / `opsCanon: d1-primary` |
| отложенные / переносы (`listDeferred`, notifyMissed, place, cancel) | **D1 сразу** → Sheets зеркало; GAS не затирает snap | `deferredCanon: d1-primary` |
| подписки ПП/АФК/БП (`list`/`get`/`save`/`move`/`delete`) | **D1 сразу** → Sheets зеркало; GAS не затирает snap | `subsCanon: d1-primary` |
| склад arrival/ревизия + **preview/check/compose** | **D1 compute** (stock+arrival, dry÷coef); finish F/B — GAS | `warehouseCanon: d1-primary` |
| `setWeekBannerState` / cutting sessions | **D1** + Sheets фон | ops/meta |
| `lookupBpPartner` | **D1** из подписок; miss → GAS | — |
| TG send (`sendCourierRoute` / `sendDeficit` / `forceSurveyRemind`) | **Worker** + D1 tickets/dedupe; secret `TELEGRAM_BOT_TOKEN`; нет секрета → GAS | `telegramCanon: worker\|sheets-fallback` |
| `finishFullWeek` / materialize / pull / repair | **GAS Sheets** (указатель недели A1+7 / очистка / materialize новых дат) → Worker D1 resync **без** штампа `date_iso+7` (detach `day_name` + rekey `Day:mk` → `CAL:mk:date`) | `weekCloseCanon: d1-sync` |
| склад F/B при закрытии недели | **preview** `previewWeekCloseWarehouse` всегда D1; apply при `WAREHOUSE_CLOSE_CANON=d1-compute` + Deploy Code.gs `skipWarehouseClose` + зеркало `applyWarehouseRevision` | `warehouseCloseCanon` |
| Goodboy `submitGoodboyTry` | **D1 snap** + TG Worker + Sheets зеркало | `gbCanon` |
| Varka `partner*` | **D1/snap сразу** → Sheets+TG/deferred зеркало GAS | `partnerCanon: d1-primary` |
| Goodboy `gb*` | **D1/snap сразу** → Sheets зеркало; CRM read-only (subs D1) | `gbCanon: d1-primary` |
| доступы / шаблоны / опросники CRUD | **D1 сразу** → Sheets зеркало; remind send — Worker TG | `metaCanon: d1-primary` |
| структура нарезки (план items) | **D1 fromOrders** / rebuild; флаги — ops; finish → rebuild + row-map GAS | `cuttingStructCanon: d1-primary` |
| розничный прайс + `calcPrice(retail)` + ПП `calcPpFact`/`calcPrice(pp)` | **D1** (ПП: кэш unit costs + формула; cold GAS warm) | `priceCanon: d1-primary` |
| `getPpFactCost` / `getPpOrderSuggest` (в т.ч. N≥2) / `migratePpToRaw26Scheme` | **D1** (слоты/half-basket из orders+якорь); cold miss/`force` → GAS; migrate Sheets в фоне | `priceCanon` / `subsCanon` |
| `warehousePreview` / `checkOrderWarehouse` / `composeWarehouseBuyMessage` | **D1 compute** (не формулы листа); cold empty warehouse → GAS | `warehouseCanon` |

**Запрещено** без явного отката (`PEOPLE_CANON=sheets-confirm-bg`):

1. Ждать `sheetsVerified` для UI success при живом D1.
2. `cutoverAfterWrite_` / полный day-replace из GAS на обычном revalidate (сжимает день).
3. `sheetsFirst` для move/delete.
4. Off-week через `saveOrder` (только `saveBooking`).
5. Soft-delete всего дня / scrub-delete по чужому `date_iso` (только UPDATE stamp).
6. Прятать **active** D1-строки tomb-фильтром в live `getClients`.

**Anti-wipe (Worker):**

- `replaceDayOrdersFromClients_`: abort если GAS пуст/partial при non-empty D1; soft-delete только mk∉merged; **нет** day-wide fallback.
- `getWeekDayCounts`: **не** зовёт full week-refresh; `weekDayCounts` = D1 counts + даты с листа (`weekDayCountsSheet`).
- Heal sparse: expect из D1 counts; partial day не clear-all tombs / не ignoreTombstones.
- `getViewCompare`: live `[]` важнее stale `view:` snap.
- `moveClient_`: resolve `newDate` до calendarOnly. Дата на слоте недели **игнорирует** `calendarOnly` (пишет `newDay`, не CAL).
- Save/move on-week: `alsoSaveOrder=1`, не rewrite `saveOrder→saveBooking` с пустым day. GAS `handleMoveClient` не чистит «Приём заказов», если `findDayNameForDate_` нашёл слот.
- Restore pulled-брони на колонку: `restoreWeekFromBookings` (owner, confirm=1). Хаб 15.09: `confettins97,Dnevnik.mv`.
- После day-move D1 может оставить `status=deleted`. Live upsert **не** держит `deleted` (`pickLiveOrderStatus_`: incoming active/non-deleted побеждает). Hard-delete zombie по id / day+matchKey. `forceWeekD1Resync` тот же upsert — не лечит зомби до фикса. One-shot: `undeleteWeekFromSheet?day=Вторник&date=2026-09-15&clients=confettins97,Dnevnik.mv&confirm=1` (owner; `all=1` extras дня).
- Week `deleteClient`: не сканирует все `day_name=''` без dateIso.
- `cutoverStoreRead_` revalidate: **только upsert** (replace dead path убран).
- Week-close resync: `gasN < d1Count` → upsert-only; aborted fallback без `ignoreTombstones`.
- После detach/`repairShiftedWeekClose`: `reattachWeekSlotDayNames_` + `getClients` по дню показывает active на `date_iso` слота даже с пустым `day_name`. Не прятать людей новой недели.
- **Same-week date mismatch** (перенос 14→15 оставил `date_iso=14` на `day_name=Вторник`): `weekSlotDateAction_` **stamp** слота только если **оба** iso в текущем `weekMap`. Off-week / close-week +7 → detach + rekey `CAL:mk:date` (id `Понедельник:MK` иначе upsert штампует новую дату).
- Close-week / `forceWeekD1Resync` / `upsertMissingClientsFromGas_` **никогда** не `UPDATE date_iso` у строки с другой непустой датой.
- Calendar-only save **не** soft-delete week-slot ряды той же `date_iso` (только `day_name=''`).
- Heal `force getClients`: upsert missing с GAS даже если D1 counts «не sparse» (лист впереди D1). Repair: `repairMissingWeekFromGas`. Lookup: `lookupClient`.
- UI смена дня в форме: **без** предварительного `deleteClient` (`_userDelete` afterWrite сносит новую строку). `saveOrder_` сам чистит другие слоты.
- **Не затирать** непустые `address` / `phone` / `basket` пустыми при `upsertOrderRow_` / `replaceDayOrdersFromClients_` / overlay save / GAS `handleSaveOrder`. Явный clear только `explicitClear=1` / `clearAddress` / `clearBasket`. Repair: `repairWipedClientFields`.
- **Не затирать цены** (`meta_json.orderPrice` / `couponPrice` / cost-ключи) при repair / reattach / refill / upsert / dedupe. `mergeOrderRowsKeepNonEmpty_` deep-merge meta; `persistOrderContactFields_` пишет merged `meta_json`; incoming `{}` не побеждает непустой `orderPrice`. Repair: `repairMissingOrderPrices`.
- **Не клонировать** людей текущей недели на Future/+7 (`upsertMissing` + `findActiveOrderByMatch_` → `continue`, не INSERT; после Future — `scrubFutureOverlapsFromCurrentWeek_`). Repair `repairFutureWeekDupes` снимает 21∩28, затем выравнивает Future под лист GAS (`alignToGas=1`). Не `deleteClient` без `strictDay`. Бейдж месяца не держит stale `viewDate` выше D1. `deleteClient` с явным `day` не ищет другие слоты.
- `repairDetachedWeekSlots` / `dedupe_calendar`: если calendar-only полнее слота — **promote** cal, удалить stub (`snowygodness` 14.09). Никогда не delete ряда с большим payload. Persist fail → abort, оба ряда живы.
- `moveEpoch` старше 7д не прячет клиента.
- Calendar month (D1-primary): без tomb-filter на live D1; **off-week month = только live D1** (snap не воскрешает delete).
- `refreshViewDateSnap_` на calendar save/delete до ответа UI.
- `notifyMissedDelivery` / `placeTransferTask`: **лёгкий D1 park/save** (без `invalidateDays_` на горячем пути) → UI `d1Verified`; courier/cut/month rebuild в `waitUntil`. Иначе CF рвёт и UI «Ошибка сети». D1 id (`xfer_*`) не подменять GAS `df_*`: штамп `payload.sheetId`. Тонкий park обогащать из deleted orders. `getTransferTask` только D1 (без GAS `buildWeekDayCounts`). One-shot: `healStuckTransfers` (owner, без auto-place). `noCut` из parked note не теряется, если `cutRaw` не задан явно.
- `moveClient` / `deleteClient` (accept): тоже **без** тяжёлого `invalidateDays_` на hot path (`_skipInvalidate`) — иначе ~28с и UI `network_waiting_sheets`. Rebuild дней в `waitUntil` / poll.

Откат на Sheets-канон: Worker env `PEOPLE_CANON=sheets-confirm-bg`.

Маркер: `peopleCanon: "d1-primary"` (+ `deployMarker` d1-final-h1).

Карта «что на D1 / что на Sheets»: **[D1_STATUS.md](./D1_STATUS.md)**.
