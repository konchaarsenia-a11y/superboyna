# Automation: Еженедельный TZ

## В UI выставить

| Поле | Значение |
|------|----------|
| Name | `Superboyna weekly TZ` |
| Trigger | Scheduled → cron `0 9 * * 1` (Пн 09:00 UTC; сдвинь под Минск если нужно) |
| Repository | `konchaarsenia-a11y/superboyna` @ `main` |
| Tools | Pull request creation = on; Memories = on; Slack = опционально |
| Permissions | Private |

## Prompt (вставить целиком)

```
Ты фоновый агент репо Superboyna (Бойня-Конвейер + Goodboy).

Прочитай:
1. TZ.md — чеклист [x] / [~] / [ ]
2. PROJECT.md — карта API (кратко)
3. AGENTS.md и .cursor/rules/superboyna.mdc — запреты

Сделай:
1. Список топ-5 незакрытых пунктов ([ ] и [~]), с приоритетом броней/навигации.
2. Для 1–2 самых безопасных пунктов: небольшой фикс в коде + PR, ИЛИ только план если риск высокий.
3. В ответе / описании PR — короткий digest на русском.

Жёсткие запреты:
- Не трогать реальных клиентов. Тест только zzz_test.
- Не вызывать finishFullWeekProduction.
- Не откатывать native auth: /start gbi_, getNativeLinkInfo, pollNativeAuth, лист Доступы.
- Агент Varka не правит корневые Code.gs / app.html.
- Секреты не коммитить. Deploy Apps Script не обещать как сделанный — только напомнить владельцу.

Если безопасного кода нет — не открывай пустой PR, только digest в итоге run.
```
