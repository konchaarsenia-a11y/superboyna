---
name: tz-checklist
description: Maintain TZ.md checklist checkboxes after work or owner confirmations. Use when finishing a TZ item, after deploy confirmation, or when the owner says something is done/partial/live.
---

# TZ Checklist

## Статусы

- `[x]` — сделано и подтверждено кодом или словами владельца («задеплоил / работает»).
- `[~]` — частично: часто код в git, live Deploy Apps Script ещё старый.
- `[ ]` — не сделано.

## Правила

1. После своей работы по пункту ТЗ — **сразу** обновить галочку в `TZ.md`. Не ждать «отметь».
2. Если менялся только git/`app.html`, а `Code.gs` владелец ещё не задеплоил → ставить `[~]`, не `[x]`.
3. Когда владелец пишет «задеплоил / проверил / работает» — перевести соответствующие `[~]` → `[x]`.
4. Не закрывать `[x]` «на глаз», если фича не в коде и владелец не подтвердил.
5. Приоритет — незакрытые пункты (брони/материализация, навигация) из `TZ.md`.

## После правок

Commit + push вместе с кодом фичи. В ответе владельцу — что отмечено и что ещё ждёт Deploy.
