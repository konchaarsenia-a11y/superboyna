# Бойня FAST (f5)

Прод не трогаем.

## Открыть

https://konchaarsenia-a11y.github.io/superboyna/fast/

или

https://konchaarsenia-a11y.github.io/superboyna/fast/app.html

Должен быть бейдж **FAST**.

## Что ускорено в f5

- Данные заказов **вшиты** в `seed-inline.js` (без запроса на старте)
- Первые **20 секунд** чтения не ходят в Google Apps Script
- `getMyAccess` не блокирует UI (роль из кэша)

Запись заказа / «Обновить» по-прежнему идут в GAS (это медленно — потолок Sheets).
