# Бойня C

Два режима:

1. **Sandbox (по умолчанию)** — снимок в D1, Sheets не трогаем.  
2. **Cutover LIVE** — `?cutover=1` → Worker → боевой GAS (свежие данные + запись в таблицу).

## LIVE (как прод по скорости)

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&v=7111500  

Бейдж **C · LIVE** — напрямую в GAS (без лишнего hop через Worker).  
Тест на **`zzz_test`**. См. [docs/CUTOVER.md](./docs/CUTOVER.md).

## Sandbox D1 (быстрый снимок)

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?v=7111500  

Бейдж **C · D1**.

## Обновить снимок sandbox

```bash
node boinya-c/scripts/refresh-full.mjs
CLOUDFLARE_API_TOKEN=… node boinya-c/scripts/seed-d1.mjs
```
