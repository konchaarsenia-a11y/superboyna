# Бойня C — песочница (TURBO + быстрый старт)

Копия миниаппа. Прод не трогаем.

## Открыть

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/

Бейдж **C · TURBO**.

## Почему первая загрузка стала легче

| Было | Стало |
|------|--------|
| `index` грузил seed+bridge, потом снова `app.html` ~1MB | `index` — только редирект + preload |
| Весь JS внутри `app.html` (блок парсинга) | `app.html` ~140KB + `app.main.js` (defer, параллельно) |
| Жирный seed ~110KB в критическом пути | Lite seed ~22KB (clients); нарезка/курьер — async из `data/` |
| SW от FAST | SW прекэш оболочки (2-й заход из кэша) |

## Режимы

| | |
|--|--|
| Turbo | по умолчанию |
| Живой GAS | `?live=1` |
| Запись в прод | `?allowWrite=1` (осторожно) |

## Обновить из прода

```bash
bash boinya-c/scripts/sync-from-prod.sh   # копирует UI → split → lite seed
node boinya-c/scripts/refresh-cache.mjs   # снапшоты с GAS (чтение)
```

Потолок без D1: первый визит всё ещё качает ~800KB JS (gzip ~200KB).  
Дальше — Worker+D1 и нарезка экранов по вкладкам.
