# Preview UI Login (test bot only)

**Не production Pages.** Отдельный origin → отдельный storage; prod-сессию не трогаем и не просим выходить.

## Подтверждённый staging URL

```
https://boinya-c-preview-eabc.konchaarsenia.workers.dev/ui
```

Открывать **только** этот URL.  
Не использовать `github.io/.../next.html?proxy=…` — тот origin общий с production и поднимает старую «C LIVE» сессию без виджета `@BoinyaTest_bot`.

## Что должно быть на экране сразу

| Параметр | Ожидание |
|---|---|
| Красная полоса | `PREVIEW-EABC · API https://boinya-c-preview-eabc.konchaarsenia.workers.dev` |
| Синяя полоса | `@BoinyaTest_bot` + `/setdomain` host |
| Badge | `C · PREVIEW-EABC` (не «C LIVE») |
| API target | тот же workers.dev origin (`X-Boinya-Preview-Api`) |
| Widget | `data-telegram-login=BoinyaTest_bot` |
| Auth storage | `nx_tg_*:preview-eabc` на origin workers.dev |
| D1 | `0ddccc42-3444-4adb-9c15-68925880b146` |
| Auth | `authMode=enforce`, без bypass |

## Шаги входа (без выхода из production)

1. Открыть staging URL выше (лучше обычное окно; production можно оставить как есть).
2. **Вариант A — Login Widget:** в BotFather у **только** `@BoinyaTest_bot` выполнить  
   `/setdomain` → `boinya-c-preview-eabc.konchaarsenia.workers.dev`  
   (без `https://`, без `/ui`; **prod bot domain не менять**). Затем нажать виджет на странице.
3. **Вариант B — без setdomain:** кнопка «Открыть Telegram и подтвердить» → Start у `@BoinyaTest_bot` (`gbi_…`) → вернуться на вкладку (pollDesktopAuth).
4. После входа — вкладка «Неделя» → exact «Завершить неделю» на artificial week (stub Sheets на preview).

## API check (агент)

- `GET /ui` → `X-Boinya-Preview-Ui: preview-eabc`, `X-Boinya-Login-Domain: boinya-c-preview-eabc.konchaarsenia.workers.dev`
- `startDesktopAuth` → `botUsername=BoinyaTest_bot`, `loginDomain=boinya-c-preview-eabc.konchaarsenia.workers.dev`
- `ping` → `authMode=enforce`, `hasTelegramToken=true`, `weekCloseSheets=d1-then-finishFullWeek-fromD1Close`
