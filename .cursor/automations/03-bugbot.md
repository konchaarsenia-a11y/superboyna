# Bugbot (встроенный агент Cursor)

Это не кастомная Automation из папки — включается отдельно.

## Шаги

1. Открой https://cursor.com/automations/from-cursor/bugbot  
   или Automations → Cursor-managed → **Bugbot**
2. Подключи репозиторий `konchaarsenia-a11y/superboyna`
3. Включи review на PR
4. (Опционально) **Autofix** → Prefer **new branch** (не пушить фиксы сразу в твою PR-ветку вслепую)

## Зачем рядом с `02-pr-safety`

- Bugbot — общие баги/регрессии  
- `02-pr-safety` — доменные правила Бойни (натив, zzz_test, week-close)

Оба можно держать включёнными.
