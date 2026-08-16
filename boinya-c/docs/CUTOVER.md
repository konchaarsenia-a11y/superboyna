# Cutover LIVE (быстрый)

## Как открыть

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/?cutover=1&v=7111586

Hard refresh. Бейдж **C · LIVE**.

В Telegram Menu Button лучше сразу:
`.../boinya-c/app.html?cutover=1&v=7111586`
(без лишнего редиректа через index.html).

## Как это устроено сейчас

| | |
|--|--|
| **Чтение** | сразу из D1 (быстро), в фоне подтягивается GAS |
| **Запись** | в боевой GAS/Sheets, потом D1 обновляется |
| Опасные week-actions | только с `allowDanger=1` |

Тест только на **`zzz_test`**.

## Если снова тормозит

1. Hard refresh / смени `v=`
2. Не используй `?via=direct` — это медленный путь напрямую в GAS
3. Sandbox без записи: `?cutover=0` или `?sandbox=1`
