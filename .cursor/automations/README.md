# Automations для Superboyna

Cursor Automations я **не могу создать из Cloud Agent** — только владелец в UI.  
Здесь готовые рецепты: скопировал → вставил → Save.

Создать: https://cursor.com/automations  
или в Agents Window → Customize / Automations  
или в чате Desktop: `/automate`

Репозиторий везде: `konchaarsenia-a11y/superboyna`, ветка `main`.

| Файл | Когда | Что делает |
|------|--------|------------|
| `01-weekly-tz.md` | cron Пн 09:00 | Разбор `TZ.md` → digest / опц. PR |
| `02-pr-safety.md` | PR opened / pushed | Не ломать натив-auth, zzz_test, week-close |
| `03-bugbot.md` | вручную в UI | Включить Bugbot (+ Autofix по желанию) |
