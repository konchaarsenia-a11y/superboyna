# Бойня FAST — параллельная быстрая копия

Отдельная копия Mini App. **Корневые `app.html` / `Code.gs` / `index.html` не трогаются.**

Прод (медленный прямой GAS) остаётся как был.  
FAST ходит в тот же Apps Script **через Cloudflare Worker** с edge-кэшем → повторные чтения обычно **десятки мс**, а не 2–7 с.

```
Telegram / браузер
       │
       ▼
  fast/app.html     ← GitHub Pages …/fast/  или Firebase Hosting (бесплатно)
       │
       ▼
  Cloudflare Worker ← кэш HIT ~20–80 мс (бесплатно, 100k req/день)
       │ miss
       ▼
  Google Apps Script / Sheets  (как сейчас)
```

## Что внутри

| Путь | Назначение |
|------|------------|
| `index.html` / `app.html` | Копия UI (бейдж FAST) |
| `config.js` | URL прокси — **единственная настройка** |
| `proxy/worker.js` | Cloudflare Worker (кэш JSONP) |
| `firebase.json` | Опциональный хостинг UI на Firebase |

Записи (`saveOrder`, `deleteClient`, …) **не кэшируются** и сбрасывают read-кэш.

## 1. Задеплоить прокси (обязательно для скорости)

Бесплатный аккаунт [Cloudflare](https://dash.cloudflare.com/) → Workers.

```bash
cd fast/proxy
npx wrangler login
npx wrangler deploy
```

В ответе будет URL вида:

`https://boinya-fast.<ваш-subdomain>.workers.dev`

Вставьте его в `fast/config.js`:

```js
var PROXY = "https://boinya-fast.XXXX.workers.dev";
```

Без деплоя прокси FAST всё равно откроется, но пойдёт **напрямую в GAS** (как прод) — выигрыша не будет.

### Проверка прокси

Откройте в браузере:

`https://ВАШ-WORKER/ `

Должен ответить JSON `boinya-fast-proxy`.

Затем:

`https://ВАШ-WORKER/?action=getWeekDayCounts&callback=cb`

- Первый раз: заголовок `X-Boinya-Cache: MISS` (медленно, GAS)
- Обновите: `X-Boinya-Cache: HIT` (быстро)

## 2. Открыть UI

### Вариант A — GitHub Pages (уже есть у репо)

После merge/push:

`https://konchaarsenia-a11y.github.io/superboyna/fast/`

Или с прокси без правки файла:

`…/fast/?proxy=https://boinya-fast.XXXX.workers.dev`

### Вариант B — Firebase Hosting (бесплатный Spark)

```bash
cd fast
cp .firebaserc.example .firebaserc   # подставьте project id
npx firebase login
npx firebase hosting:sites:create boinya-fast   # опционально
npx firebase deploy --only hosting
```

В BotFather можно завести **вторую** Menu Button / отдельного бота на FAST URL — прод не трогать.

## 3. (Опционально) keepWarm на GAS

Если на проде уже есть `setupKeepWarm` — оставьте.  
Прокси сам кэширует `keepWarm` / пустые ping; UI FAST греет прокси при входе.

## Ограничения

- Первый запрос после истечения TTL всё равно ждёт GAS (~2 с) — дальше HIT с края.
- Кэш Worker — по дата-центру Cloudflare (Cache API); для Минска/Европы этого достаточно.
- Бесплатный Workers: **100 000 запросов/день** — для команды ок.
- Это **копия** UI: правки в корневом `app.html` сами в FAST не попадут (нужно обновить копию или снова скопировать).

## Обновить копию из прода

```bash
cp app.html fast/app.html
# затем снова наложить патчи: PROXY, версия f1, config.js, бейдж —
# или попросить агента «синхронизируй fast/ с app.html».
```

## Не делать

- Не менять корневой `app.html` / `Code.gs` ради FAST.
- Не переключать BotFather прод-кнопку на FAST, пока не решите так сознательно.
