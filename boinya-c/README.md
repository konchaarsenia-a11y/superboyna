# Бойня C — полный миниапп на D1

Копия UI прода. **Прод / бот / Sheets не трогаем.**

## Тест

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/

Hard refresh. Бейдж **C · D1**. Worker: https://boinya-c.konchaarsenia.workers.dev/?action=ping

В D1 залито: **24 заказа** недели + снапшоты Просмотр / Нарезка / Курьер / Сборка / месяц / склад.

Запись `saveOrder` / `moveClient` / `deleteClient` → **D1**. Остальные мутации — sandbox noop (не Sheets).

## Режимы

| | |
|--|--|
| D1 (по умолчанию) | `client/config.js` → Worker |
| Старый GAS | `?live=1` |

## Обновить данные

```bash
node boinya-c/scripts/refresh-cache.mjs
node boinya-c/scripts/build-view-snaps.mjs
CLOUDFLARE_API_TOKEN=… node boinya-c/scripts/seed-d1.mjs
cd boinya-c/proxy && npx wrangler@4 deploy
```
