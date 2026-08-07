# План уровня C (песочница)

```
Телефон IndexedDB  →  мгновенный UI + optimistic
        ↓ sync queue
Cloudflare Worker + D1  →  правда
        ↓ позже (не сейчас)
Apps Script → Sheets  →  зеркало
```

| Фаза | Что | Статус |
|------|-----|--------|
| 0 | Изолированная папка, seed, lab.html | сделано |
| 0b | Копия UI миниаппа (`sync-from-prod`) + блок записи | сделано |
| 0c | TURBO local-first: seed+IDB, quiet 2м, без prefetch GAS | сделано |
| 1 | Worker + D1: чтение заказов дня | заготовка |
| 2 | Запись в D1 (save/move), без Sheets | дальше |
| 3 | Полный optimistic + очередь + poll diff | каркас IDB |
| 4 | Cutover URL бота | только по команде |

## Модель данных (D1)

- `orders` — одна строка = клиент на дату (как Календарь_Дат)
- `cutting_flags` — галочки/излишки
- `deliveries` — доставлено
- `meta` — weekKey, sync cursors
- `outbox` на клиенте (IndexedDB) — несинкнутые мутации

## Не делаем в фазе 0

- Правки прод-`Code.gs`
- Запись в живую таблицу
- Подмена URL в Telegram-боте
