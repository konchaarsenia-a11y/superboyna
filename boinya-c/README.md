# Бойня C — песочница (TURBO + быстрый старт)

Копия миниаппа. Прод не трогаем.

## Открыть

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/

Бейдж **C · INSTANT**.

Просмотр дней и перенос людей — **локально, без ожидания GAS** (снапшот + IndexedDB).

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

<<<<<<< HEAD
Потолок без D1: первый визит всё ещё качает ~800KB JS (gzip ~200KB).  
Дальше — Worker+D1 и нарезка экранов по вкладкам.
=======
Снапшоты дней: `boinya-c/data/` (сейчас из `fast/data`).

## Осторожно: запись

По умолчанию save/move/delete **блокируются**.  
Включить (пишет в тот же GAS/Sheets!): `?allowWrite=1` — только если явно нужно.

## Лаборатория IDB

Старое тонкое демо: [`lab.html`](./lab.html).

## Worker / D1

База D1 создана (`boinya-c`, ID в `proxy/wrangler.toml`).  
**Как задеплоить Worker:** [docs/SETUP_D1.md](./docs/SETUP_D1.md) — после деплоя пришли URL `*.workers.dev`.
>>>>>>> origin/cursor/boinya-c-d1-wire-15e1
