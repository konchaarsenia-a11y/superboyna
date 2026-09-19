# Week ↔ Calendar Canon (почему ломалось)

Незакрытая неделя = **две физические системы** + быстрый кэш. Косяки лезут, когда хоть один слой забывает правило маршрутизации.

## Три слоя

| Слой | Что хранит | Когда |
|------|------------|--------|
| **Лист недели** (`Прием` Пн–Вс + `Будущая`) | колонки людей на **8 датах** слотов | дата ∈ слотов недели |
| **Календарь** (`Календарь_Дат` + брони) | люди на **любой** date_iso | дата **вне** 8 слотов |
| **D1** (`orders`) | кэш UI (`day_name` или `date_iso`+пустой day) | всегда после accept |

Канон подтверждения записи людей: **D1** (`d1Verified`). Sheets — фоновое зеркало; toast «лист догонит» если mirror отстаёт.

## Закрытие недели

`finishFullWeek` двигает **указатель недели** (A1 / слоты Пн–Вс на +7) и чистит колонки.  
Строки `Календарь_Дат` и D1 `date_iso` **остаются на своих датах**. Worker после close: detach `day_name` у старых дат **и** rekey `Понедельник:MK` → `CAL:MK:date` (иначе upsert тем же id штампует +7). Слоты новой недели = лист (Future→Пн + materialize **новых** дат). Запрещено `UPDATE date_iso = wantIso` при смене слота.  
После detach/ошибочного +7-repair люди на **новых** датах слота должны снова получить `day_name` (`repairDetachedWeekSlots` / `forceWeekD1Resync`); иначе неделя их не видит, хотя `date_iso` верный.  
`upsertMissing` / materialize **не копируют** людей Пн–Вс на «Будущую» / date+7. Клоны 21.09 на 28.09 — `repairFutureWeekDupes` (soft-delete + tomb; Ba2ra / Maria и GAS Future не трогать). `forceWeekD1Resync` Future не сжимает D1 до GAS-only.  
Пустой GAS/partial save **не** затирает непустые address/phone/состав в D1. `dedupe_calendar` не удаляет полный calendar-only ради пустого слота (`snowygodness` 14.09 → promote cal). Красная карточка только если данных реально нет.  
Перенос внутри недели: `day_name` нового слота + `date_iso` этой даты. Same-week mismatch на колонке **штампует** дату слота, не прячет человека из Просмотра. Calendar-only save не сносит week-ряд той же даты.  
После переноса дня D1-строка источника часто `status=deleted`. Live upsert **обязан** воскресить active (incoming non-deleted побеждает); иначе `getClients` (только `status=active`) молчит, хотя лист живой. Repair: `undeleteWeekFromSheet` (не полный `forceWeekD1Resync`).

## Одно правило маршрута

```
resolveDayForDate(date) → onWeek?
  YES → weekDayToSave = dayName; calendarOnly = 0; saveBooking(+alsoSaveOrder) / saveOrder
  NO  → weekDayToSave = "";   calendarOnly = 1; ТОЛЬКО saveBooking / removeCalendar / move calendarOnly
```

**Запрещено** для даты **на** слоте недели:

1. `calendarOnly=1` / `alsoSaveOrder=0` — человек должен попасть в колонку «Приём заказов» и D1 `day_name`.
2. `handleMoveClient` calendar-only (clear колонки + только бронь) — даже если UI прислал флаг.

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
