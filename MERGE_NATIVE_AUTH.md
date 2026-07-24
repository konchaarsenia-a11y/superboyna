# Совмещение: веб-агент (Windows) + натив-агент (Mac)

**Не копируй весь `Code.gs` с мака на винду.**  
Источник правды по бэкенду/вебу — **машина с веб-агентом** (Windows).  
С мака переносится только **патч нативного логина** (ниже).

---

## Кто чем владеет

| Зона | Владелец | Не трогать другому |
|------|----------|-------------------|
| `app.html`, веб-UI | веб-агент (Win) | натив не правит |
| `Code.gs` (основной) | веб-агент (Win) | натив не перезаписывает файл целиком |
| `native/`, `scripts/sync-native.sh`, `NATIVE.md` | натив-агент (Mac) | веб не ломает оверлеи |
| лист «Доступы», `getMyAccess` | общие | оба читают, не ломают контракт |

---

## Что нужно влить в актуальный `Code.gs` (Win)

Один раз веб-агенту: открыть этот файл + `native/CODE_GS_NATIVE_AUTH.snippet.gs` и **аккуратно вставить куски**, не заменяя весь `Code.gs`.

### 1) В `doGet` — рядом с `getMyAccess`

```javascript
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, false);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth({
      token: e.parameter.token ? decodeURIComponent(e.parameter.token) : ""
    }, callback, false);
  }
```

### 2) В `handleApiAction` — рядом с `getMyAccess`

```javascript
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, fromPost);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth(json, callback, fromPost);
  }
```

### 3) В `handleTelegramUpdate_` — ветка `/start`

Если уже есть обработка `/start` — **добавь** ветку `gbi_` **перед** обычным приветствием курьера.  
Не удаляй существующую логику `/start`.

См. полный код в `native/CODE_GS_NATIVE_AUTH.snippet.gs` (функции + правка `/start`).

### 4) В конец файла (или рядом с telegram-хелперами)

Вставить целиком функции из сниппета:
- `getTelegramBotUsername_`
- `handleGetNativeLinkInfo`
- `handlePollNativeAuth`

---

## Порядок работы (чтобы не конфликтовать)

1. **Win (веб):** `git pull` → правит `app.html` / `Code.gs` → commit/push.  
2. **Win (веб):** вливает сниппет натив-логина в **свой** актуальный `Code.gs` → commit с сообщением вроде `feat(auth): native gbi_ link + pollNativeAuth`.  
3. **Владелец:** Deploy Apps Script.  
4. **Mac (натив):** `git pull` → продолжает только `native/` (не откатывает `Code.gs` с Win).  
5. Если натив снова хочет что-то в `Code.gs` — пишет **новый сниппет/патч**, не шлёт весь файл.

---

## Сообщение веб-агенту (скопировать)

```
Не затирай Code.gs файлом с Mac.

В репо есть инструкция слияния:
- MERGE_NATIVE_AUTH.md
- native/CODE_GS_NATIVE_AUTH.snippet.gs

Нужно в ТВОЙ актуальный Code.gs аккуратно влить только:
1) роуты getNativeLinkInfo / pollNativeAuth в doGet и handleApiAction
2) ветку /start gbi_<token> в handleTelegramUpdate_ (не ломая текущий /start)
3) три функции из сниппета

app.html не связан с этим. После вливания — commit + сказать владельцу Deploy.
Проверь AGENTS.md (Handoff) и MERGE_NATIVE_AUTH.md.
```

---

## Сообщение натив-агенту (этот Mac)

```
Code.gs на Win — source of truth. Не проси владельца вставлять весь Code.gs с Mac.
Дальше любые бэкенд-нужды — только через сниппет/патч в native/ + MERGE_NATIVE_AUTH.md.
Работаем в native/overlays и не откатываем веб-правки Code.gs.
```
