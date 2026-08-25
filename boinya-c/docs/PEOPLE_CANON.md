# People Canon (LIVE) — быстрый accept + подтверждение Sheets

**Канон людей = Google Sheets.** D1 — быстрый кэш UI.

## Как работает запись (save / move / delete)

1. Worker сразу пишет **D1** → UI свободен (~1–2 с).
2. GAS/Sheets уходит **в фон** (`waitUntil`).
3. Ответ клиенту:
   - если GAS успел за ~2.2 с → `status=success`, `sheetsVerified=true` → toast «Точно внесено»;
   - иначе → `status=accepted`, `pendingSheets=true`, `writeId=…` → toast «Вношу в таблицу…».
4. UI поллит `pollPeopleWrite` → при успехе **«Точно внесено / перенесено / удалено»**.
5. При ошибке Sheets — честный fail toast (не врать success).

## Жёсткое правило (агентам)

| Action | Порядок | Финальный toast |
|--------|---------|-----------------|
| `saveOrder` / `saveBooking` / `deleteClient` / `removeCalendarClient` / `moveClient` | D1 accept → фон GAS → poll | только при `sheetsVerified` («Точно …») |
| `placeTransferTask` / `saveDeferred` / `notifyMissedDelivery` | D1-first OK | `d1Verified` |
| флаги нарезки/курьера | D1 + GAS | как сейчас |

**Запрещено** без явного ОК владельца «полный D1-канон»:

1. Показывать «Точно внесено / Сохранено / Удалено» **до** `sheetsVerified` (или явного verify списка).
2. Возвращать `status: success` + `optimistic: true` без Sheets как финальный канон.
3. Убирать `pollPeopleWrite` / `pendingSheets` и снова блокировать UI на 20–40 с await GAS.
4. «Чинить» гонки новым fake-success вместо фикса GAS/маппинга.

См. `CUTOVER.md`. Маркер: `peopleCanon: "sheets-confirm-bg"` в `?action=ping`.

## Полный перевод на D1

Отдельное решение владельца после стабилизации.
