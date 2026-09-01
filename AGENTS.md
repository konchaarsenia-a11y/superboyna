# Инструкции для агента

Перед любой задачей прочитай:

1. [PROJECT.md](./PROJECT.md) — карта таблиц и API  
2. [TZ.md](./TZ.md) — приоритеты, экраны и **чеклист с галочками**  
3. Правило `.cursor/rules/superboyna.mdc`
4. [NATIVE.md](./NATIVE.md) — нативка параллельно с вебом  
5. [GOODBOY.md](./GOODBOY.md) — клиентская экосистема (сайт + TG; не конвейер)
6. [VAROK.md](./VAROK.md) — Varka: бесплатное пополнение (точки / каталог)
7. **[boinya-c/docs/PEOPLE_CANON.md](./boinya-c/docs/PEOPLE_CANON.md)** — канон save/move/delete (Sheets-confirm); **не ломать**
8. **[boinya-c/docs/WEEK_CALENDAR_CANON.md](./boinya-c/docs/WEEK_CALENDAR_CANON.md)** — неделя vs календарь при незакрытой неделе
9. **[MERGE_GOODBOY_GB.md](./MERGE_GOODBOY_GB.md)** — листы `GB_*` / actions `gb*` (клиентский кабинет); **не писать в CRM/неделю**
10. **Handoff** ниже — если трогаешь `Code.gs`

## Skills (Cursor Agent)

В `.cursor/skills/` — подключаются сами по описанию или через `/имя`:

| Skill | Когда |
|-------|--------|
| `frontend-design` | Новый/смелый UI (лендинги, Goodboy); не ломать токены конвейера |
| `ui-miniapp-pass` | Полировка Mini App / HTML без полного редизайна |
| `goodboy-ui-build` | Новая/пересборка страницы сайта Goodboy |
| `goodboy-smoke` | Playwright smoke goodboy после HTML/CSS |
| `webapp-testing` | Playwright / локальный HTML UI smoke |
| `test-api` | Smoke webhook на `zzz_test` (`scripts/test-api.sh`) |
| `tz-checklist` | Галочки в `TZ.md` после работы / слов владельца |

UI-токены конвейера и Varka: `.cursor/rules/ui-miniapp.mdc`.  
Hooks: `.cursor/hooks.json` (блок `finishFullWeekProduction` в shell).  
Environment: `.cursor/environment.json`.

## Cursor Cloud

- Тест API из VM: `bash scripts/test-api.sh` / skill `test-api`, клиент только `zzz_test`.
- Не запускать `finishFullWeekProduction` без явного ОК.
- Deploy Apps Script делает владелец; в git код пушить сам, напоминать только про Deploy.
- Environment/Builds/Secrets — в [Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents#environments); секреты не коммитить.
- **People canon:** LIVE people-write = D1 accept + фон GAS + `pollPeopleWrite`; toast «Точно …» только при `sheetsVerified`. Не блокировать UI полным await GAS и не врать success до Sheets. Off-week → только calendar/`saveBooking`. Подробно: [PEOPLE_CANON.md](./boinya-c/docs/PEOPLE_CANON.md), [WEEK_CALENDAR_CANON.md](./boinya-c/docs/WEEK_CALENDAR_CANON.md).

## Automations

Готовые рецепты (создаёт владелец в UI): [`.cursor/automations/`](./.cursor/automations/README.md)  
Создать: [cursor.com/automations](https://cursor.com/automations) или `/automate` в Desktop.  
Cloud Agent **не может** сохранить Automation за владельца — только положить prompt в репо.

Рабочие файлы конвейера: `app.html` (фронт), `Code.gs` (бэкенд).  
Клиентский продукт: **Goodboy** — см. `GOODBOY.md`.  
Партнёры **Varka** (бесплатное пополнение): **`varka/`** — см. `VAROK.md`.  
**Параллельно конвейеру:** агент Varka **никогда** не правит `Code.gs` и `app.html` Бойни (свой Script/книга).

**Обязательно:** агент **сам** ведёт галочки в `TZ.md` — и после своей работы, и когда владелец написал, что уже сделал/задеплоил/проверил. Не ждать команды «отметь».
- `[x]` сделано  
- `[~]` частично (часто: код в git, live Deploy ещё старый)  
- `[ ]` не сделано  

Не закрывать `[x]`, пока фича не подтверждена кодом или словами владельца. Deploy в Apps Script делает владелец — тогда агент переводит `[~]` → `[x]` после его «задеплоил / работает».

**Пуш:** после готового фикса/фичи в `app.html` / `Code.gs` / `TZ.md` — сразу commit + push на `main` (Pages). Не ждать «пуш». Напоминать только Deploy Code.gs, если трогали бэкенд.

Тест: `scripts/test-api.ps1`, клиент `zzz_test`.  
Не закрывать неделю без явного ОК владельца.

---

## ⚠️ Handoff: Goodboy GB_* (клиентский кабинет, 2026-08-26)

Клиентский сайт/кабинет Goodboy связан с Бойней через **отдельные** листы и `gb*`-actions.

| Что | Детали |
|-----|--------|
| Инструкция | **[MERGE_GOODBOY_GB.md](./MERGE_GOODBOY_GB.md)** |
| Сниппет | [`goodboy/CODE_GS_GOODBOY.snippet.gs`](./goodboy/CODE_GS_GOODBOY.snippet.gs) |
| Листы (запись) | только `GB_Пользователи`, `GB_Связки`, `GB_Питомцы` |
| CRM / Календарь_Дат | **только чтение** |
| Не трогать | заказы, нарезка, склад, Доступы, materialize/week, натив `gbi_` |

Владельцу после merge в `main`: вставить весь `Code.gs` → Deploy → `?action=gbEnsureSheets`.  
Агенту Бойни при расхождении Script↔git: вливать **патч** по `MERGE_GOODBOY_GB.md`, не затирать файл.

---

## ⚠️ Handoff: правки `Code.gs` от нативного агента (2026-07-24)

Параллельно делается **натив GBI** (`native/`, см. [NATIVE.md](./NATIVE.md)).  
Веб-агент (TG Mini App / `app.html` на **Windows**) — **source of truth** для `Code.gs` и `app.html`.

### Не копировать весь Code.gs с Mac → Win

Слияние только через патч:
- **[MERGE_NATIVE_AUTH.md](./MERGE_NATIVE_AUTH.md)** — правила и порядок
- **[native/CODE_GS_NATIVE_AUTH.snippet.gs](./native/CODE_GS_NATIVE_AUTH.snippet.gs)** — что влить

### Что добавлено для натива (общий бэкенд)

| Изменение | Зачем |
|-----------|--------|
| `/start gbi_<token>` в `handleTelegramUpdate_` | Вход из натива: ID+имя в CacheService |
| `getNativeLinkInfo` | `botUsername` для `t.me/bot?start=gbi_…` |
| `pollNativeAuth` | Натив поллит токен → `telegramId`, `name` |
| upsert в лист **«Доступы»** при линке | Имя/роль для шапки |

Обычный `/start` без `gbi_` — сохранить как у веб-агента.  
Остальные actions не ломать.

### Правила

1. Веб-агент вливает сниппет в **свой** актуальный `Code.gs`, commit/push.  
2. Натив-агент не просит «вставь мой Code.gs целиком».  
3. Deploy Apps Script — владелец.  
4. Натив не правит `app.html`.  
5. Подробности: [NATIVE.md](./NATIVE.md), [MERGE_NATIVE_AUTH.md](./MERGE_NATIVE_AUTH.md).

---

**Пуш сам:** после рабочих правок `app.html` / `TZ.md` / связанных фронтовых файлов — **сразу commit + `git push origin main`** (Pages). Не ждать команды «пуш». `Code.gs` в git тоже пушить; Deploy Apps Script по-прежнему делает владелец.

---

## Handoff: веб-агент ↔ нативный агент (GBI)

Нативка и веб делят один `Code.gs` и лист **Доступы** (`getMyAccess` / `requestAccess` / …).

### Не трогать / не откатывать

| Что | Зачем |
|-----|--------|
| `/start gbi_<token>` в `handleTelegramUpdate_` | Линк Telegram ↔ нативное приложение |
| actions `getNativeLinkInfo`, `pollNativeAuth` (+ связанные хелперы) | Deep-link / polling авторизации нативки |
| Лист **Доступы** и контракт `getMyAccess` | Общий для Mini App и native |

### Можно менять как раньше

- `app.html` (веб Mini App / Pages)
- Остальной `Code.gs` (заказы, нарезка, курьер, склад, подписки, просмотр…) — **не ломая** пункты выше
- `TZ.md`, `PROJECT.md`

### Deploy

Владелец вставляет `Code.gs` → Deploy. Агент Deploy сам не делает.

Подробности нативки: [NATIVE.md](./NATIVE.md).
