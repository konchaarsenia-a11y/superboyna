# Week ↔ Calendar Canon (почему ломалось)

Незакрытая неделя = **две физические системы** + быстрый кэш. Косяки лезут, когда хоть один слой забывает правило маршрутизации.

## Три слоя

| Слой | Что хранит | Когда |
|------|------------|--------|
| **Лист недели** (`Прием` Пн–Вс + `Будущая`) | колонки людей на **8 датах** слотов | дата ∈ слотов недели |
| **Календарь** (`Календарь_Дат` + брони) | люди на **любой** date_iso | дата **вне** 8 слотов |
| **D1** (`orders`) | кэш UI (`day_name` или `date_iso`+пустой day) | всегда после accept |

Канон подтверждения записи людей: **D1** (`d1Verified`). Sheets — фоновое зеркало; toast «лист догонит» если mirror отстаёт.

## Одно правило маршрута

```
resolveDayForDate(date) → onWeek?
  YES → weekDayToSave = dayName; calendarOnly = 0; saveBooking(+alsoSaveOrder) / saveOrder
  NO  → weekDayToSave = "";   calendarOnly = 1; ТОЛЬКО saveBooking / removeCalendar / move calendarOnly
```

**Запрещено** для даты вне слотов:

1. Писать `saveOrder` с day из селекта (Пн/Вт…) — попадёт в **старый** слот незакрытой недели.
2. Считать `accepted` ошибкой (batch раньше смотрел только `success`).
3. Toast «неделя ещё не закрыта» как fail — это **успех календаря**.
4. После save обновлять Просмотр по `#day=Пн`, а не по `deliveryDate`.
5. Не авто-`switchTab` в Просмотр после calendar-save (путаница + пустой force view). Toast «Точно в календаре» + остаться на Заказе.
6. Calendar save обязан снять `delTomb:CAL:dateIso` — иначе Просмотр force прячет человека при живом D1.
7. `reconcileMonthOverview` / view-snap **не** обнуляют бейдж, если D1/календарь уже больше.

## Почему баги повторяются

Каждый «фикс» часто чинил **один hop** (toast / tombstone / scrub / resolve), а другой hop жил по старому контракту:

- UI: `#day` без пустого option → всегда Пн
- Worker: `accepted` + фон, UI batch ждал `success`
- GAS: `saveOrder` → `beyond_week` (правильно), Worker считал fail
- afterWrite / scrub: чистили «сирот» по чужим правилам

## Контракт для агентов

1. Перед people-write: один раз решить `onWeek` vs `calendarOnly` (UI + Worker + GAS одинаково).
2. Вне недели → только `saveBooking` / `removeCalendarClient` / `moveClient?calendarOnly=1`.
3. Любой UI-вход (форма, Просмотр, **batch**) → `isPeopleWriteAccepted_` (`success|accepted|writeId`).
4. «Точно …» при `d1Verified` (D1-primary); Sheets mirror — фон, не блок UI.
5. Не чинить гонку fake-success — чинить маршрут.

См. также `PEOPLE_CANON.md`, `CUTOVER.md`.
