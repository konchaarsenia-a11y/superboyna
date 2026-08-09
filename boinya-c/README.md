# Бойня C

Два режима:

1. **Sandbox (по умолчанию)** — снимок в D1, Sheets не трогаем.  
2. **Cutover LIVE** — `?cutover=1` → Worker → боевой GAS (свежие данные + запись в таблицу).

## Пробуем LIVE (как прод, через Worker)

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&v=7111499  

Бейдж **C · LIVE**. Тестируй на **`zzz_test`**.

Подробности: [docs/CUTOVER.md](./docs/CUTOVER.md)

## Sandbox D1

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?v=7111499  

Бейдж **C · D1**. Запись только в D1.

## Обновить снимок sandbox

```bash
node boinya-c/scripts/refresh-full.mjs
CLOUDFLARE_API_TOKEN=… node boinya-c/scripts/seed-d1.mjs
```
