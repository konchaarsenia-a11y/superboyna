# Preview UI Login (test bot only) — auth-h3

## Одна браузерная проверка

```
https://boinya-c-preview-eabc.konchaarsenia.workers.dev/ui?v=auth-h3
```

### Сначала подтвердить токен (без браузера)

```
GET https://boinya-c-preview-eabc.konchaarsenia.workers.dev/?action=ping
```

| Поле | Нужно |
|---|---|
| `botMe` | `ok` |
| `botId` | `9204491282` |
| `botUsername` | `BoinyaTest_bot` |
| `deployMarker` | `sheets-finish-only-h3` |
| `widgetAuth` | `tgLogin-fallback+post` |

**Сейчас live:** `botMe=fail:Not Found`, `botId=null`, `hasTelegramToken=true`.  
Telegram отклоняет секрет Worker (`TELEGRAM_BOT_TOKEN`) — виджет `@BoinyaTest_bot` подписывает hash своим токеном → Worker всегда даёт `bad_hash` → UI снова «Войти через Telegram».

**Что сделать владельцу (секрет не в чат):** в Cloudflare → Worker `boinya-c-preview-eabc` → Settings → Variables → Secret `TELEGRAM_BOT_TOKEN` = актуальный token **только** `@BoinyaTest_bot` (9204491282). Не трогать prod Worker/bot. Затем снова `ping` → `botMe=ok` / `botId=9204491282`, и одна проверка `/ui?v=auth-h3`.

### После Accept (когда botMe=ok)

| Признак | Ок |
|---|---|
| Полосы | PREVIEW-EABC + API workers.dev + @BoinyaTest_bot |
| UI | owner (не снова «Войти…») |
| При отказе | текст с кодом `bad_hash` / `expired` / … |

## Исправления auth-h3 (код)

1. `resolveActor_`: fallback на `tgLogin`, если `initData` битый  
2. `stamp`: всегда шлёт widget login  
3. Auth reads → POST body  
4. Preview `/ui` отдаёт branch `api.js`/`app.js`  
5. Safe reason codes на гейте  
6. `ping.botMe` / `botId` диагностика без секрета  

SHA: `126c61e3` (git) · preview Worker redeployed auth-h3.
