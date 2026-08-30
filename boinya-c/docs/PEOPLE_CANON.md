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
| склад arrival/ревизия (`setWarehouseArrival`, `applyWarehouseRevision`, `zeroWarehouse`) | **D1 сразу** → Sheets зеркало; preview/compose/finish F/B — GAS | `warehouseCanon: d1-primary` |
| доступы / шаблоны / опросники CRUD | **D1 сразу** → Sheets зеркало; `forceSurveyRemind`/TG — GAS | `metaCanon: d1-primary` |
| структура нарезки (план items) | **D1 fromOrders** / rebuild; флаги — ops; finish → rebuild + row-map GAS | `cuttingStructCanon: d1-primary` |

**Запрещено** без явного отката (`PEOPLE_CANON=sheets-confirm-bg`):

1. Ждать `sheetsVerified` для UI success при живом D1.
2. `cutoverAfterWrite_` / `upsertMissingClientsFromGas_` — перезаписывают D1 из GAS.
3. `sheetsFirst` для move/delete.
4. Off-week через `saveOrder` (только `saveBooking`).

Откат на Sheets-канон: Worker env `PEOPLE_CANON=sheets-confirm-bg`.

Маркер: `peopleCanon: "d1-primary"` в `?action=ping`.

См. `CUTOVER.md`, `WEEK_CALENDAR_CANON.md`.
