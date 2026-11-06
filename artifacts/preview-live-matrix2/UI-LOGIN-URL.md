# Preview UI Login (test bot only)

**Не утверждаю, что Login уже пройден** — нужен ваш реальный клик по виджету.

## Подтверждённый staging URL

```
https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&proxy=https%3A%2F%2Fboinya-c-preview-eabc.konchaarsenia.workers.dev
```

Открывать **целиком**, с `proxy=`. Без `proxy=` live Pages `config.js` молча ставит production Worker `boinya-c.konchaarsenia.workers.dev` (бот 8968047386 / prod DB) — так нельзя для этой проверки.

## Что должно быть на экране

| Параметр | Ожидание |
|---|---|
| API / webhook | `https://boinya-c-preview-eabc.konchaarsenia.workers.dev` |
| Login Widget `data-telegram-login` | `BoinyaTest_bot` (id **9204491282**, не prod 8968047386) |
| Источник username | `startDesktopAuth` → preview Worker (`TELEGRAM_BOT_USERNAME` / getMe) |
| Подпись | штатный Login Widget hash → `verifyTgInitData_` preview `TELEGRAM_BOT_TOKEN` |
| D1 | только `0ddccc42-3444-4adb-9c15-68925880b146` |
| Auth | `authMode=enforce`, `AUTH_ENFORCE=1` |

## UI config (как это работает)

- Live Pages ещё **без** sticky-proxy / storage-isolation из этой ветки (они в git на `cursor/preview-sheets-rename-eabc`).
- Поэтому **обязателен** query `proxy=…preview-eabc…` на каждый заход.
- Рекомендуется чистое окно (или очистить `nx_tg_login_v1` / `nx_desk_sess_v1` / `nx_access_v1`), чтобы не подтянуть prod-сессию.
- BotFather `/setdomain` на **тестовом** боте: `konchaarsenia-a11y.github.io` (loginDomain с preview уже такой).

## API check (агент, без секрета)

- `ping`: `authMode=enforce`, `hasTelegramToken=true`, preview D1
- `startDesktopAuth`: `botUsername=BoinyaTest_bot`, `desktopAuth=tg-login-widget`, `loginDomain=konchaarsenia-a11y.github.io`

## После вашего Login

Напишите «вошёл» — добьём exact `finishFullWeek` E2E на уже посеянной artificial неделе `2026-11-02` (агент **не** подписывает initData live test-bot токеном).
