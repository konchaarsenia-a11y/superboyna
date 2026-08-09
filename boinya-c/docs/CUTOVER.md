# Cutover: пробуем живой режим

## Режимы C

| URL | Режим | Скорость | Данные / запись |
|--|--|--|--|
| `/boinya-c/` | Sandbox D1 | быстро (кэш) | снимок / только D1 |
| `/boinya-c/?cutover=1` | **LIVE прямой GAS** | как прод | бой / Sheets |
| `/boinya-c/?cutover=1&via=worker` | LIVE через Worker | медленнее (+hop) | бой / Sheets |

Раньше `?cutover=1` всегда шёл Browser→Worker→GAS — из‑за этого было «сильно дольше».  
Сейчас по умолчанию cutover = **напрямую в GAS**, как боевой миниапп.

## Как пробовать сейчас

1. Открой:  
   https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&v=7111500  
2. Hard refresh. Бейдж **C · LIVE**.
3. Проверяй на **`zzz_test`**.
4. Реальных клиентов не крути, пока не убедишься.

## Чего ещё нет для полного cutover бота

- URL в Telegram-боте всё ещё на старый миниапп.
- Опасные week-actions требуют явного `allowDanger`.
- Нет авто-rollback и мониторинга.

Когда LIVE стабилен на `zzz_test` и неделе — отдельно меняем URL бота.
