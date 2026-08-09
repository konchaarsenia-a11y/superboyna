---
name: test-api
description: Smoke-test Google Apps Script webhook for Superboyna (getClients, saveOrder, deleteClient, moveClient) using zzz_test. Use before shipping order/CRM changes or when the user asks to verify the API.
---

# Test API (zzz_test)

## Правила

- Тестовый клиент только **`zzz_test`**. Реальных клиентов не создавать/не удалять без явного ОК.
- Webhook URL — из `.cursor/rules/superboyna.mdc` / `PROJECT.md` / `GOOGLE_WEBHOOK_URL` в `app.html` (после redeploy может смениться).
- Не вызывать `finishFullWeekProduction` без явного «можно закрыть неделю».

## Минимальный smoke

1. `getClients` на нужный день/лист — ответ ок, структура клиентов читается.
2. При правках заказа: `saveOrder` для `zzz_test` → перечитать → сверить basket/address/note.
3. При удалении/переносе: `deleteClient` / `moveClient` на `zzz_test` → проверить отсутствие/новое место.
4. Скрипты в репо: `scripts/test-api.ps1`, при наличии Python — `scripts/full_live_test.py` (только если безопасно и не бьёт прод-данные сверх zzz_test).

## Формат отчёта владельцу

Коротко: action → ok/fail → что увидели. Если 401/CORS/HTML login — сказать, что Deploy/доступ webhook, а не баг фронта.
