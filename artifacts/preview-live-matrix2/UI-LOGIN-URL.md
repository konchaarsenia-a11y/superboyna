# Preview UI Login (test bot only)

## Staging URL (одна браузерная проверка)

```
https://boinya-c-preview-eabc.konchaarsenia.workers.dev/ui?v=auth-h3
```

Ожидание после Accept в Telegram OAuth (`bot_id=9204491282`):

| Признак | Ок |
|---|---|
| Полосы | `PREVIEW-EABC` + API workers.dev + `@BoinyaTest_bot` |
| После Accept | owner UI (не снова «Войти через Telegram») |
| Badge | `C · PREVIEW-EABC` |
| Если отказ | текст с кодом `bad_hash` / `no_hash` / `expired` / … (без payload) |
| `ping` | `botId=9204491282`, `deployMarker=sheets-finish-only-h3`, `widgetAuth=tgLogin-fallback+post` |

## Что исправлено (auth-h3)

1. Worker `resolveActor_`: при битом/пустом `initData` всё равно проверяет `tgLogin` виджета.
2. `api.js` stamp: всегда шлёт `tgLogin`/`desktopSession` рядом с initData.
3. Auth-запросы с `tgLogin` идут **POST body** (не JSONP query).
4. Preview `/ui` грузит `next/api.js` + `next/app.js` с ветки (не stale Pages).
5. При отказе UI показывает **код reason**, не молча возвращает виджет.

`/setdomain` на `@BoinyaTest_bot`: `boinya-c-preview-eabc.konchaarsenia.workers.dev` (уже настроено).

## Production scope (не деплоим)

Те же правки `resolveActor_` / `stamp` / POST-for-auth в `next/api.js` нужны и production desktop Login при merge — **сейчас production merge/deploy блокирован**; отдельно не расширяли prod Worker/Pages.
