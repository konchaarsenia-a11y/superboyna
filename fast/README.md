# Бойня FAST — параллельная быстрая копия

Отдельная копия Mini App. **Корневые `app.html` / `Code.gs` / `index.html` не трогаются.**

## Уже работает без Cloudflare

1. **GitHub Pages:** `https://konchaarsenia-a11y.github.io/superboyna/fast/`
2. **Снапшоты** `fast/data/*.json` — прогреваются скриптом / Actions каждые 10 мин
3. **Service Worker** `sw.js` — кэш повторных запросов к GAS в браузере

```
Telegram / браузер
       │
       ▼
  fast/app.html  (Pages CDN)
       │
       ├─ data/*.json     ← мгновенно (предзагрузка)
       ├─ Service Worker  ← повторные GET к GAS из Cache Storage
       └─ (опц.) Cloudflare Worker — ещё быстрее на первом miss
              │
              ▼
         Apps Script / Sheets
```

## Открыть сейчас

`https://konchaarsenia-a11y.github.io/superboyna/fast/`

Бейдж **FAST** в углу = вы в копии, не в проде.

## Опционально: Cloudflare Worker

Нужен бесплатный аккаунт Cloudflare (агент не может залогиниться за вас):

```bash
cd fast/proxy
npx wrangler login
npx wrangler deploy
```

URL в `fast/config.js` → `PROXY = "https://….workers.dev"`.

## Обновить копию UI из прода

```bash
bash fast/sync-from-prod.sh
```

## Не делать

- Не менять корневой `app.html` / `Code.gs` ради FAST.
- Не переключать BotFather прод-кнопку на FAST, пока не решите так сознательно.
