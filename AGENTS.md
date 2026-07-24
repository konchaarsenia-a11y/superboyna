# Инструкции для агента

Перед любой задачей прочитай:

1. [PROJECT.md](./PROJECT.md) — карта таблиц и API  
2. [TZ.md](./TZ.md) — приоритеты, экраны и **чеклист с галочками**  
3. Правило `.cursor/rules/superboyna.mdc`
4. [NATIVE.md](./NATIVE.md) — нативка параллельно с вебом  
5. **Handoff** ниже — если трогаешь `Code.gs`

Рабочие файлы: `app.html` (фронт), `Code.gs` (бэкенд).

**Обязательно:** агент **сам** ведёт галочки в `TZ.md` — и после своей работы, и когда владелец написал, что уже сделал/задеплоил/проверил. Не ждать команды «отметь».
- `[x]` сделано  
- `[~]` частично (часто: код в git, live Deploy ещё старый)  
- `[ ]` не сделано  

Не закрывать `[x]`, пока фича не подтверждена кодом или словами владельца. Deploy в Apps Script делает владелец — тогда агент переводит `[~]` → `[x]` после его «задеплоил / работает».

Тест: `scripts/test-api.ps1`, клиент `zzz_test`.  
Не закрывать неделю без явного ОК владельца.

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
