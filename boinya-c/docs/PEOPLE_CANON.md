# People Canon (LIVE) — Sheets first

**Канон людей (save / move / delete) = Google Sheets через GAS.**  
D1 — быстрый кэш UI, не источник истины для состава/присутствия.

## Жёсткое правило (агентам)

| Action | Порядок записи | UI success |
|--------|----------------|------------|
| `saveOrder` / `saveBooking` | 1) await GAS → 2) sync D1 → 3) afterWrite фон | только `status=success` + `sheetsVerified=true` |
| `deleteClient` / `removeCalendarClient` | то же | то же (+ verify списка) |
| `moveClient` | то же | то же (+ verify old/new) |
| `placeTransferTask` / `saveDeferred` / `notifyMissedDelivery` | D1-first OK (не колонки Приёма) | `d1Verified` |
| флаги нарезки/курьера | D1 сразу + GAS | как сейчас |

**Запрещено** без явного ОК владельца «полный D1-канон»:

1. Возвращать `status: success` / `optimistic: true` по people-write **до** ответа GAS.
2. Писать D1 → GAS в `waitUntil` для `saveOrder|saveBooking|deleteClient|removeCalendarClient|moveClient` как единственный путь записи.
3. В UI выдавать toast «Сохранено / Удалено / Перенесено» по одному `optimistic` / `timedOut` / `networkFallback` без `sheetsVerified` (или явного verify списка).
4. «Чинить» конфликты новым optimistic-обходом вместо починки GAS/маппинга колонок.

См. также `CUTOVER.md`. Маркер Worker: `deployMarker: people-canon-sheets-first` в `?action=ping`.

## Почему так

Dual-write D1-first (cutover ~17–24.08) давал гонки: tombstone, afterWrite съедал save, UI врал success. Sheets остаются бизнес-каноном (Приём / Будущая / Календарь_Дат / ПП).

## Полный перевод на D1

Отдельное решение владельца после стабилизации. Не начинать «по пути» в PR с багфиксами.
