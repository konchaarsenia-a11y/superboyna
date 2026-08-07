# Бойня C — песочница (не прод)

Параллельный контур уровня **C**: IndexedDB + optimistic UI + (дальше) Worker/D1.  
**Реальный миниапп не трогаем.**

| Запрещено менять из этой папки | Можно |
|--------------------------------|--------|
| корневые `app.html`, `Code.gs` | всё внутри `boinya-c/` |
| `fast/` | свой Worker / D1 / UI |
| `TZ.md`, бот, webhook прода | локальный seed, демо |

Прод: как был. Переключение — отдельным решением, когда C готов.

## Открыть

После пуша на Pages:

`https://konchaarsenia-a11y.github.io/superboyna/boinya-c/`

Локально: любой static server из корня репо, путь `/boinya-c/`.

Бейдж **C · SANDBOX** на экране — это не конвейер.

## Фазы

См. [docs/PLAN.md](./docs/PLAN.md). Сейчас: **фаза 0–1 каркас** (IDB + optimistic + seed, Worker-заготовка).

## Cloudflare (позже, бесплатно)

```bash
cd boinya-c/proxy
npx wrangler login
npx wrangler d1 create boinya-c
# прописать database_id в wrangler.toml
npx wrangler d1 execute boinya-c --file=./schema.sql
npx wrangler deploy
# URL → client/config.js → PROXY
```

До деплоя Worker демо работает **полностью офлайн** на seed + IndexedDB.
