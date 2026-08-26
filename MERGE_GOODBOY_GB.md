# Handoff: Goodboy GB_* → Code.gs Бойни

**Владельцу:** после merge в `main` достаточно вставить весь `Code.gs` из репо → Deploy.  
**Агенту Бойни:** если в Script уже есть правки поверх git — **не затирай файл целиком чужим куском**. Вливай только патч ниже.

Связано: [GOODBOY.md](./GOODBOY.md), сниппет [`goodboy/CODE_GS_GOODBOY.snippet.gs`](./goodboy/CODE_GS_GOODBOY.snippet.gs), API в [PROJECT.md](./PROJECT.md).

---

## Зачем

Клиентский кабинет Goodboy (`goodboy/`) должен:
1. хранить аккаунты / связки / питомцев в **отдельных** листах `GB_*`;
2. **читать** статус подписки из CRM (`ПП`/`АФК`/`БП`/`Контакты`) + ближайшую дату из `Календарь_Дат`;
3. **не писать** в операционные листы Бойни.

---

## Жёсткие запреты (не ломать Бойню)

| Нельзя | Почему |
|--------|--------|
| Править `saveOrder` / `moveClient` / `deleteClient` / materialize / week | Конфликты таблица↔сервер |
| Писать в `Прием заказов`, `Нарезка`, `Доставки`, `Склад`, `Брони_Заказов` | Операционка |
| Писать в CRM `ПП`/`АФК`/`БП`/`Контакты` из `gb*` | Источник истины менеджера |
| Трогать лист **Доступы** / `getMyAccess` | Это сотрудники, не клиенты |
| Откатывать `/start gbi_` / `getNativeLinkInfo` / `pollNativeAuth` | Натив GBI |
| Подменять весь `Code.gs` «версией только с Goodboy» | Потеряешь правки конвейера |

**Можно писать только в:** `GB_Пользователи`, `GB_Связки`, `GB_Питомцы`  
(создаются сами при `gbEnsureSheets` / любом `gb*`).

---

## Листы

| Лист | Колонки | Назначение |
|------|---------|------------|
| `GB_Пользователи` | userId, telegramId, name, username, phone, access, createdAt, lastLoginAt | Аккаунт кабинета |
| `GB_Связки` | userId, telegramId, matchKey, clientNick, subId, segment, status, linkedAt, verifyMethod, phone | Аккаунт → CRM |
| `GB_Питомцы` | id, ownerTelegramId, name, breed, weightKg, ageYears, sex, allergies, notes, updatedAt | Карточки |
| `Goodboy_Заявки` | уже есть через `submitGoodboyTry` | Анкета «попробовать» |

`access`: `full` если в связке сегмент ПП/АФК/БП; иначе `limited`. Гость `city` — только на фронте.

---

## Actions (allowlist)

`gbEnsureSheets` · `gbBootstrap` · `gbMe` · `gbRegister` · `gbLogin` · `gbLinkClient` · `gbSavePet`

Роутинг только через `isGoodboyAction_(action)` — **не** через `action.indexOf("gb")`.

---

## Как влить в актуальный Code.gs (агент Бойни)

### 1) В конец `doGet` — **перед** `return … unknown_action`

Сразу после блока `submitGoodboyTry` (если его ещё нет — не трогай другие actions):

```javascript
  // Goodboy кабинет — только явный allowlist gb*; не перехватывает actions Бойни
  if (typeof isGoodboyAction_ === "function" && isGoodboyAction_(action)) {
    return dispatchGoodboyAction_(action, gbParamsFromGet_(e), callback, false);
  }
```

### 2) В `handleApiAction` — тоже **перед** POST-чтением `getClients` / `unknown_action`

Сразу после `submitGoodboyTry`:

```javascript
  // Goodboy — только allowlist; конвейерные actions выше не затрагиваются
  if (typeof isGoodboyAction_ === "function" && isGoodboyAction_(action)) {
    return dispatchGoodboyAction_(action, json || {}, callback, fromPost);
  }
```

### 3) В **конец файла** `Code.gs`

Вставить **целиком** содержимое  
[`goodboy/CODE_GS_GOODBOY.snippet.gs`](./goodboy/CODE_GS_GOODBOY.snippet.gs)  
(один раз; если функции уже есть — не дублировать).

`typeof isGoodboyAction_ === "function"` защищает: без сниппета конвейер просто отвечает `unknown_action` на `gb*`, остальное живо.

---

## После Deploy (владелец)

1. Apps Script → вставить `Code.gs` из `main` (или патч выше) → **Deploy → New deployment** / Edit version.  
2. Открыть:  
   `…/exec?action=gbEnsureSheets&callback=cb`  
   → в книге появятся 3 листа `GB_*`.  
3. Опц. smoke: `bash scripts/test-goodboy-api.sh` (только тестовый id / ник `zzz_test`).  
4. Кабинет Goodboy уже `mode=live` на Pages; до Deploy сам fallback на demo.

**Не** вызывать `finishFullWeekProduction`. **Не** писать тестовые строки в живые CRM-клиенты кроме `zzz_test`.

---

## Сообщение агенту Бойни (скопировать)

```
Нужно аккуратно влить Goodboy GB_* в Code.gs — БЕЗ поломки конвейера.

Читай и следуй:
- MERGE_GOODBOY_GB.md
- goodboy/CODE_GS_GOODBOY.snippet.gs

Правила:
1) НЕ затирай весь Code.gs.
2) НЕ меняй saveOrder/move/delete/materialize/week/склад/нарезку/Доступы/натив gbi_.
3) Добавь 2 роутера (doGet + handleApiAction) как в MERGE_GOODBOY_GB.md — allowlist isGoodboyAction_.
4) В конец файла вставь сниппет целиком (если функций ещё нет).
5) Писать только в GB_Пользователи / GB_Связки / GB_Питомцы; CRM и Календарь_Дат — только чтение.
6) После правок — commit/push; Deploy делает владелец.
7) Проверка: action=gbEnsureSheets; smoke scripts/test-goodboy-api.sh на zzz_test.
```

---

## Если в git `main` уже полный Code.gs с модулем

Владельцу проще: **скопировать весь `Code.gs` из репо → Deploy**.  
Агенту Бойни патч нужен только когда локальный Script новее/расходится с git.
