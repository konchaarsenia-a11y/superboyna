# Бойня C — песочница (TURBO)

Копия миниаппа. Прод (`app.html` / `Code.gs` / бот) **не трогаем**.

## Открыть

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/

Бейдж **C · TURBO** — UI почти не ждёт Google (seed + IndexedDB, сеть только в фоне через ~45с).

| Режим | URL |
|--------|-----|
| Turbo (по умолчанию) | `/boinya-c/` |
| Как «живой» GAS | `?live=1` |
| Разрешить запись в прод | `?allowWrite=1` (осторожно!) |

## Почему быстрее

1. Снапшоты дней/нарезки/курьера вшиты в `seed-inline.js`
2. Повторный заход — из IndexedDB
3. 2 минуты quiet: чтения не блокируют UI
4. Prefetch в GAS на старте **выключен** в turbo

## Обновить снапшоты (чтение GAS)

```bash
node boinya-c/scripts/refresh-cache.mjs
bash boinya-c/scripts/sync-from-prod.sh   # если обновился прод-UI
```

## Важно

Пока нет своего D1 — «вау» = local-first копия данных.  
Данные могут отставать от таблицы на минуты, пока фон не догонит.  
Запись в таблицу по умолчанию **заблокирована**.
