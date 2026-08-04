# Superboyna — карта системы

## Два продукта

| Продукт | Для кого | Документ |
|---------|----------|----------|
| **Конвейер** (Бойня) | Команда: заказ / нарезка / курьер / склад | этот файл + `TZ.md` |
| **Goodboy** | Клиенты: питомец / подписка / партнёры | [GOODBOY.md](./GOODBOY.md) |
| **Варок** | Владельцы точек: заказ лакомств/купонов | [VAROK.md](./VAROK.md) |

Конвейер = `app.html` + `Code.gs`. Goodboy / Варок = отдельные фронты; общий webhook, UI не смешивать.

## Ссылки

| Что | URL |
|-----|-----|
| Google Sheet | https://docs.google.com/spreadsheets/d/1aBNcgobp5GNBKySjMKRWEDWWKebF5kqb5A-cZoDuvG8/edit |
| Apps Script webhook | https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec |
| Репозиторий | https://github.com/konchaarsenia-a11y/superboyna.git |

## Две книги Google Sheets (v7.6.4+)

| Книга | Script Property | Листы |
|-------|-----------------|-------|
| **Чистовик** (active / Бойня) | — | Склад, Доступы, Клиенты, Прием заказов, Нарезка, Доставки, **Календарь_Дат**, Брони_Заказов, CRM (Контакты/ПП/АФК/БП/месяцы) |
| **Данные мини-аппа** (опц. старая) | `DATA_SPREADSHEET_ID` | `Гео_Клиентов`, `Дефицит_Нарезки`, `Итоги_Нарезки`, `Память_Нарезки`, `Память_Доставок` |

Если всё перенесено в чистовик — `DATA_SPREADSHEET_ID` **не задавать** (пусто = active).

### CRM-месяцы (legacy) + Календарь_Дат (канон для мини-аппа)

**Канон Просмотра (v7.10.64+):** лист **`Календарь_Дат`** — одна строка = один человек на дату.

Колонки: `date` (дд.мм.гггг), `dateIso` (yyyy-MM-dd), `client`, `matchKey`, `segment`, `address`, `phone`, `note` (только текст менеджера), `basketJson`, `subId`, `source`, `status`, `dayName`, `updatedAt`, `pulledAt`, `legacyRef`, `orderPrice`, `ppSlot` (напр. `1/2`).

**Брони_Заказов:** `id`, `date`, `client`, `subId`, `address`, `note`, `basketJson`, `source`, `status`, `dayName`, `updatedAt`, `pulledAt`, `segment`, `phone`, `orderPrice`, `ppSlot`.

Техтеги `[SEG:]`/`[ЦЕНА:]`/`[SUB:]`/`[TEL:]` в note больше не пишутся (v7.11.35); legacy при чтении разбираются в поля.

- Заказ/`saveBooking` → сразу пишет в Календарь_Дат + Брони_Заказов
- `getViewCompare` читает Календарь_Дат; при пустой дате — seed из CRM-месяца и броней
- Миграция: action `migrateCalendar` / кнопка в Просмотре (owner)

Старые CRM-месяцы (сетка дней) остаются как источник импорта:

Сейчас приложение читает так:
- имя листа: `Июль` / `Июль 2026` / `Июль (копия)` — берётся месяц из даты доставки;
- строка 1: номера дней `1`…`31` (или даты);
- ячейка дня: **многострочный текст**
  1. ник (можно `@handle` или латиница; `варка` на 1-й строке = партнёр, ник на 2-й);
  2. опц. адрес;
  3. опц. телефон;
  4. сегмент `ПП` / `АФК` / `БП` / `Р`;
  5. прочий комментарий.

**Поиск человека (матч):** из строки достаётся Instagram-handle (`@nick` или латиница), ключ без учёта регистра и без различия `.` / `_` (`kinolog.vica` ≡ `Kinolog_vica`). Если латиницы нет — сравнивается нормализованное полное имя. Отменённая бронь раньше блокировала повторный перенос — в v7.10.37 при явном переносе бронь оживляется.

В дальнейшем удобный канон для новых листов (не ломая старые): одна строка на клиента в колонке дня, фиксированный порядок строк в ячейке, сегмент всегда отдельной строкой `ПП|АФК|БП|Р`. Переупаковывать живые месяцы без бэкапа не нужно.

## Листы книги «Доставки Июнь»

| Лист | Роль |
|------|------|
| Прием заказов | Матрица товар×клиент по дням Пн–Пт |
| Будущая неделя | Заказы на следующую неделю (как блок Пн) |
| Нарезка | План нарезки на выбранную дату (A1) |
| Доставки | Маршруты/составы курьера, статусы доставки |
| Склад | Остатки, усушка, снабжение |
| Архив | **не используем** — итоги во вкладке Статистика (`getStats`) |
| Память_Нарезки | Сохранённые флаги/излишки по датам (JSON) |
| Память_Доставок | Сохранённые статусы доставки по датам (JSON) |

## Блоки дней «Прием заказов»

Клиенты: столбцы **C–Q** (15 слотов).

| День | Дата (ячейка) | Ники | Товары | Адрес | Примечание |
|------|---------------|------|--------|-------|-----------|
| Понедельник | A1 | 3 | 4–59 | 60 | 61 |
| Вторник | A62 | 64 | 65–120 | 121 | 122 |
| Среда | A123 | 125 | 126–181 | 182 | 183 |
| Четверг | A184 | 186 | 187–242 | 243 | 244 |
| Пятница | A245 | 247 | 248–303 | 304 | 305 |
| Суббота | A306 | 308 | 309–364 | 365 | 366 |
| Воскресенье | A367 | 369 | 370–425 | 426 | 427 |

«Будущая неделя»: отдельный лист, строки как у понедельника (3 / 4–59 / 60 / 61).

### Формулы блоков (от понедельника)

| Ячейка | Формула / правило |
|--------|-------------------|
| A62…A367 | `=A1+1` … `=A1+6` (Вт…Вс) |
| A2 / A63 / … / A368 | название дня (текст) |
| B4:B59 (и +61·N) | `=SUM(C{r}:Q{r})` — итог по клиентам строки |
| **R** (весь блок дня) | остаток сырья со склада с учётом прошлых дней (цепочка Пн→Вт→…→Вс) |
| A3:A61 → Сб/Вс | подписи товаров/адрес/примечание с Пн (значения) |

**Поставить/починить:** в Apps Script выполнить `setupWeekendDayFormulas()` (или `?action=setupWeekendFormulas` owner).  
Тянет в том числе **колонку R** на Сб (с Пт) и Вс (с Сб).  
**Закрытие недели:** двигает только **A1** (+7); даты Вт–Вс пересчитываются формулами от A1.

**Куда влияют:** `recalculateCuttingForDate_` (Нарезка!B), `finishFullWeekProduction` (склад по Пн–Вс), getClients/move/materialize.  
**Нарезка!D** — свои формулы (сырое от B и Склад!D), не ссылки на строки Сб/Вс.  
**Склад G–K** — Остаток Пн–Пт; **L–M** — Остаток Сб/Вс (`setupWarehouseWeekendCols`).

## API webhook

Базовый URL: см. выше (`.../exec`).

### GET (JSONP)

| action | Параметры | Ответ |
|--------|-----------|--------|
| (пусто) | — | `{"status":"online"}` |
| `getClients` | `day`, `date` (опц.), `callback` | `{status, clients:[{name,orderCount,address,note,basket,col}], day, date, fromBookings?}` |
| `deleteClient` | `client`, `day`, `callback` | `{status}` |
| `moveClient` | `client`, `oldDay`, `newDay`, `callback` | `{status}` |
| `getCutting` | `day`, `callback` | `{status, date, items:[{row,name,dry,unit,raw,surplus,done}]}` |
| `getCourier` | `day`, `callback` | `{status, date, clients:[{name,address,note,basket,delivered}]}` |

### POST (JSON body, Content-Type: text/plain)

| action | Тело | Назначение |
|--------|------|------------|
| `saveOrder` | `{day, client, address, note, basket:[{cat,main/name,sub,value/val}]}` | Запись заказа (с фракцией) |
| `deleteClient` | `{action, client, day}` | Очистка столбца |
| `moveClient` | `{action, client, oldDay, newDay}` | Перенос |
| `updateCutting` | `{day, row, surplus?, done?}` | Излишек / нарезано |
| `setDelivered` | `{day, client, delivered}` | Галочка курьера |

Дни: `Понедельник` … `Воскресенье`, `Будущая неделя` (сравнение без регистра).

### Формат basket (целевой)

```json
{ "cat": "dressura", "name": "ЛЁГКОЕ", "sub": "Среднее", "val": 150 }
```

`sub` обязателен для позиций с фракциями. `saveOrder` должен матчить строку листа с учётом фракции (сейчас баг: пишет в первую подходящую).

## Функции закрытия недели / таблица

| Функция | Когда |
|---------|--------|
| `onEdit` на «Нарезка»!A1 | Смена даты: память, пересчёт B, восстановление флагов |
| `finishFullWeekProduction` | mini-app action `finishFullWeek` (owner + confirm=1) → `finishFullWeekProduction`: склад, сдвиг дат, перенос с «Будущей недели» (**без** листа Архив) |

### Баг закрытия недели

Копировалось `C1:Q59` — **без адреса (60) и примечания (61)**. Нужно `C3:Q61` + полная очистка блоков дней включая addr/note.

## Сырьё / Склад / Нарезка / «Завершить неделю» (канон)

**Не ломать:** формулы на «Нарезка»!D (сырое кг) — скрипт пишет только B/C/E/F/G/A1. На «Склад» скрипт пишет B (приход) и F (остаток при закрытии), не затирать целые A:G.

### Поток

```
Прием заказов (гр по клиентам)
  → recalculateCuttingForDate_ → Нарезка!B (сухое, гр)
  → формулы листа → Нарезка!D (сырое, кг)
Склад!D = живой коэф. усушки (если пусто в UI: dry/1000/D)
Дозакуп (мини-апп setWarehouseArrival) → Склад!B
Закрытие недели finishFullWeekProduction:
  F := max(0, F + B − dryНеделя/D − излишекC); B := 0
  даты Пн–Пт и Доставки!A1 +7
  очистка блоков → Будущая C3:Q61 → Пн C3:Q61
  **materializeCurrentWeek_** (брони/CRM/календарь → лист новой недели, onlyMissing)
  (итоги — Статистика в аппе, не лист «Архив»)
```

### Склад (колонки)

| Кол. | Смысл | Кто пишет |
|------|--------|-----------|
| A | Название SKU | лист |
| B | Приход / дозакуп за неделю | мини-апп / TG |
| C | Базовый коэф (справочно) | лист |
| D | Живой коэф усушки | лист (скрипт читает) |
| E | Готовый излишек | лист |
| F | Остаток (ревизия / факт) | закрытие недели |
| G…K | **Остаток Пн…Пт** (формулы: `SUM(Прием!C:Q)/(D×1000)`; при F>0 день стартует от F) | лист |
| **L / M** | **Остаток Сб / Остаток Вс** | цепочка **K→L→M** (без сброса на F); `setupWarehouseWeekendCols` |
| M15:M25 | шт-остаток на конец недели (Вс) | → в F при `finishFullWeekProduction` |

Поставить L/M: выполнить **`setupWarehouseWeekendCols`** или полный **`setupWeekendDayFormulas`**.

Маппинг строк Нарезка→Склад: `getWarehouseRowForCuttingRow_` (явная таблица; жевалки с фракциями схлопываются в одну строку склада). Штучные SKU: `isPieceSkuName_` / ряды склада 10 и 15–25.

### Нарезка

| Кол. | Смысл |
|------|--------|
| A1 | Дата дня |
| B | Сухое (скрипт) |
| C | Излишек |
| D | Сырое кг (**формулы** — не трогать) |
| E/F/G | выложено / нарезано / в след. неделю |

`onEdit(A1)`: память → restore → recalculate. Память: `Память_Нарезки` / `Память_Доставок` (книга DATA или active).

### Риски закрытия недели (не чинить без песочницы)

- Склад списывает **все** заказы недели (не только «доставлен»)
- Future → только блок **Пн**; Вт–Пт после очистки пустые
- `[НЕ РЕЗАТЬ]` учитывается в recalculate, **не** в списании склада
- `warehousePreview` — заглушка (не считает D)
- Лист **Архив** устарел — можно скрыть/удалить вручную; код его не трогает
- **Не вызывать на live без «можно закрыть неделю»**

### Песочница

В коде клона книги нет. Вручную: Google Sheets → **Файл → Создать копию** → отдельный Apps Script deploy на копию. Live id не менять.

## Тестирование (агент)

1. Разрешён тестовый клиент: **`zzz_test`**.
2. Проверка чтения:
   ```
   GET .../exec?action=getClients&day=Понедельник&callback=cb
   ```
3. Проверка записи: POST `saveOrder` с `zzz_test` → GET `getClients` → сверка позиций → `deleteClient`.
4. Не вызывать `finishFullWeekProduction` / `finishFullWeek` без явного ОК от владельца (UI вызывает только с двойным confirm).
5. Фронт: открыть `app.html` локально / через хостинг mini-app; Telegram SDK: `https://telegram.org/js/telegram-web-app.js`.

## v7.6 — роли / склад / подписки / цена / сборка

| action | Назначение |
|--------|------------|
| `getMyAccess` / `requestAccess` | Роль пользователя; заявка владельцу |
| `listAccess` / `setAccessRole` / `setAccessTimezone` | Вкладка «Доступы» (owner): роли + TZ |

| `getWarehouse` / `setWarehouseArrival` / `warehousePreview` | Склад: остатки, дозакуп B, прогноз |
| `listSubscriptions` / `getSubscription` / `pushSubscriptionToDay` | CRM-подписки → бронь на дату |
| `crmInventory` / `seedCrmClients` | Инвентаризация CRM; заливка в «Клиенты» без потерь |
| `calcPrice` | Калькулятор Подписка/Розница |
| `getAssembly` | Пакеты сборки по клиентам дня |
| `finishFullWeek` | Закрытие недели (owner, confirm=1): склад, даты+7, Future→Пн |
| `ensureBpFromOrder` | БП-карта из заказа: basket в doGet через try/catch → [] |
| `listBpIdle` | БП без движения N дней |
| `closeAllOpenDeficits` | Owner: закрыть все open в Дефицит_Нарезки |
| `listTemplates` / `saveTemplate` / `deleteTemplate` | Лист «Шаблоны» (id, kind, title, body); manager+owner |
| `listSurvey` | Список записей листа «Опросник» |
| `saveSurvey` | Создать/обновить опрос (id/nick/kind/dueDate/…) |
| `deleteSurvey` | Удалить запись опросника по id |
| *(ПП upsert)* | saveOrder/CRM ПП: первая пустая строка + packs |

**Лист «Опросник» (канон `SURVEY_HEADERS_`):** `id`, `nick`, `stage`, `kind`, `dueDate`, `sentAt`, `status`, `templateId`, `answer`, `note`, `linkedSubId`, `updatedAt`. API: `listSurvey` / `saveSurvey` / `deleteSurvey`.


Один раз в Script Editor: `setupOpsEcosystem()` + `setupBookingTriggersManual()`.

Script Properties: `OWNER_TELEGRAM_IDS`, `CUTTER_TELEGRAM_IDS`, опционально `CRM_SPREADSHEET_ID`, `PRICE_SPREADSHEET_ID`, `DATA_SPREADSHEET_ID` (старая книга: гео/дефициты/итоги/память).

Навигация: менеджер — Заказ (long-press → Просмотр / Цена / Доступы), Подписки, Цена; курьер — Маршрут \| Сборка; нарезчик — Нарезка; логист — Склад; owner — всё + Доступы.

## Варок — партнёрские заказы (параллельно)

Отдельный Mini App [`varok/`](./varok/) · [VAROK.md](./VAROK.md).  
**Не править** боевой `Code.gs` / `app.html`. Бэкенд Варок — свой Script и своя книга.

## Секреты

В `Code.gs` токен Telegram читается из `PropertiesService` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OWNER_TELEGRAM_IDS`).  
Локально для заметок: `secrets.local.md` (в `.gitignore`), не коммитить.

## CRM sheet names (v7.6.6)

After copy/migrate cleanup, CRM sheets may be named «Имя (копия)». Code accepts that via findSheetByBaseName_; optional renameCrmCopiesToCanonical().
