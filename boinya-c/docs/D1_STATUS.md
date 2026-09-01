# D1 Status — что где живёт (2026-08-31)

**Коротко:** мини-апп **Бойня C** (`?cutover=1`) читает и пишет через **Cloudflare Worker + D1**. Google Sheets — **зеркало** и **недельные batch-операции**, не источник правды для UI.

Проверка: `?action=ping&cutover=1` → все `*Canon: d1-primary` (кроме `warehouseCloseCanon: sheets`).

## D1 = источник правды (UI мгновенно)

| Область | Read | Write | Sheets |
|---------|------|-------|--------|
| Люди / неделя / календарь | D1 | D1 → mirror | фон |
| Off-week календарь | D1 live | saveBooking / removeCalendar | фон |
| Нарезка / курьер / сборка (флаги) | D1 | D1 → mirror | фон |
| Структура нарезки (items) | D1 rebuild | finish → rebuild | row-map GAS |
| Подписки ПП/АФК/БП | D1 | D1 → mirror | фон |
| Отложенные / переносы | D1 | D1 → mirror | фон |
| Склад arrival/ревизия | D1 | D1 → mirror | фон |
| Склад preview/check/compose | D1 compute | — | cold → GAS |
| Прайс / calcPrice / calcPpFact | D1 | D1 → mirror | warm GAS |
| Доступы / шаблоны / опросники | D1 | D1 → mirror | фон |
| Partner (Varka) / Goodboy gb* | D1/snap | D1 → mirror | фон |
| Telegram send | Worker+D1 | dedupe D1 | fallback GAS |

## Ещё на GAS / Sheets (не «всё в D1»)

| Операция | Почему |
|----------|--------|
| **finishFullWeek** / materialize / repair | сдвигает даты листа, materialize, очистка; Worker потом **d1-sync** |
| **Week-close slot sync** | `WEEK_D1_SYNC=gas-authoritative` — после закрытия D1 слоты = GAS (с guards) |
| **Warehouse close apply** | F/B формулы листа; preview из D1, apply через GAS (`warehouseCloseCanon: sheets`) |
| **ПП колонки на листе** | D1 ok, запись в ячейки ПП — Code.gs |
| **Статистика export** | часть из snap/D1, тяжёлые отчёты — GAS |
| **Cold miss** | пустой D1 кэш → one-shot GAS warm |

## Откат

Worker env `PEOPLE_CANON=sheets-confirm-bg` — старый sheets-first (не включать без причины).

См. [PEOPLE_CANON.md](./PEOPLE_CANON.md), [CUTOVER.md](./CUTOVER.md), [WEEK_CALENDAR_CANON.md](./WEEK_CALENDAR_CANON.md).
