# Cutover LIVE (по умолчанию)

## Как открыть

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&v=71115897

Бейдж **C · LIVE**. Режим закреплён в URL (`cutover=1`) — не должен прыгать на **C · D1**.

В Telegram Menu Button:
`.../boinya-c/app.html?cutover=1&v=71115897`

Песочница (без записи в Sheets): `?sandbox=1` или `?cutover=0` → бейдж **C · D1**.

После смены версии — один раз `boinya-c/reset.html`.

## Как это устроено сейчас

| | |
|--|--|
| **Чтение** | сразу из D1 (быстро), в фоне подтягивается GAS |
| **Запись людей** | **Sheets/GAS first** → потом sync D1 (`sheetsVerified`). См. [PEOPLE_CANON.md](./PEOPLE_CANON.md) |
| Флаги / deferred / transfer park | D1-first OK |
| Опасные week-actions | UI «Завершить неделю» после 3 подтверждений шлёт `allowDanger=1` → GAS |

Проверка Worker: `?action=ping` → `peopleCanon: "sheets-first"`.

## Закрыть неделю

1. Открыть с `?cutover=1`, роль **owner**
2. Люди / баннер → **Завершить неделю**
3. Три раза подтвердить (в т.ч. «LIVE → Sheets»)
4. Ждать до ~1–2 мин (GAS тяжёлый)

Тест только на **`zzz_test`**.

## Если снова тормозит

1. Hard refresh / `reset.html` / смени `v=`
2. Не используй `?via=direct` — это медленный путь напрямую в GAS
3. Sandbox без записи в Sheets: `?cutover=0` или `?sandbox=1`
