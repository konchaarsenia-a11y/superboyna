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
| `finishFullWeek` / materialize / pull / repair | **GAS Sheets** (даты/очистка/materialize) → Worker **ждёт** D1 resync (`WEEK_CLOSE_CANON=d1-sync`) | `weekCloseCanon: d1-sync` |
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
- `moveClient_`: resolve `newDate` до calendarOnly.
- Week `deleteClient`: не сканирует все `day_name=''` без dateIso.
- `cutoverStoreRead_` revalidate: **только upsert** (replace dead path убран).
- Week-close resync: `gasN < d1Count` → upsert-only; aborted fallback без `ignoreTombstones`.
- `moveEpoch` старше 7д не прячет клиента.
- Calendar month (D1-primary): без tomb-filter на live D1; **off-week month = только live D1** (snap не воскрешает delete).
- `refreshViewDateSnap_` на calendar save/delete до ответа UI.
- UI: `viewDateOffWeek` → `removeCalendarClient` вместо week delete.

Откат на Sheets-канон: Worker env `PEOPLE_CANON=sheets-confirm-bg`.

Маркер: `peopleCanon: "d1-primary"` (+ `deployMarker` cal-offweek-crud).

См. `CUTOVER.md`, `WEEK_CALENDAR_CANON.md`.
