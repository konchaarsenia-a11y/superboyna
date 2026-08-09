# Бойня C — полный клон миниаппа на D1

UI = копия боевого `app.html`. Данные = полный снимок с GAS в Cloudflare D1.  
**Прод / бот / Sheets на запись не трогаем.**

## Тест

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?v=7111498  

Hard refresh. Бейдж **C · D1**.

Worker: https://boinya-c.konchaarsenia.workers.dev/?action=ping

## Что внутри (паритет)

| Область | Источник |
|--|--|
| UI / вкладки | свежий sync с прод `app.html` |
| Заказы недели, Просмотр, переносы | D1 `orders` (живой) |
| Нарезка / курьер / сборка | снапы + флаги в D1 |
| Подписки, опросы, партнёры, доступы, профили, шаблоны, статистика | полный dump GAS → `snap_cache` |
| `calcPrice` / адрес / PP suggest | **чтение** GAS (proxy, без записи) |
| Закрытие недели / materialize | заблокировано (не ломаем прод) |

Запись заказов/справочников в песочнице → **только D1**.

## Обновить клон с боя

```bash
bash boinya-c/scripts/sync-from-prod.sh
node boinya-c/scripts/refresh-full.mjs          # ~5–7 мин, только чтение GAS
CLOUDFLARE_API_TOKEN=… node boinya-c/scripts/seed-d1.mjs
# задеплоить boinya-c/proxy/worker.js
```

## Режимы

| | |
|--|--|
| D1 (по умолчанию) | Worker |
| Прямой GAS | `?live=1` |
