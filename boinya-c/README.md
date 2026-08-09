# Бойня C — песочница (копия миниаппа)

Полный UI конвейера, **отдельная копия**. Корневые `app.html` / `Code.gs` / `fast/` не трогаем.

| | |
|--|--|
| Открыть | https://konchaarsenia-a11y.github.io/superboyna/boinya-c/ |
| Бейдж | **C · SANDBOX** |
| Запись в таблицу | **выключена** (чтобы не задеть прод) |
| Старт Заказа | из seed/снапшота (быстро), потом можно догнать GAS |

## Что смотреть

Тот же миниапп: вкладки Заказ / Нарезка / Курьер / …  
Оцени скорость открытия списка клиентов и общий UI.

## Обновить копию из прода (не меняет прод)

```bash
bash boinya-c/scripts/sync-from-prod.sh
node boinya-c/scripts/build-seed-inline.mjs
```

Снапшоты дней: `boinya-c/data/` (сейчас из `fast/data`).

## Осторожно: запись

По умолчанию save/move/delete **блокируются**.  
Включить (пишет в тот же GAS/Sheets!): `?allowWrite=1` — только если явно нужно.

## Лаборатория IDB

Старое тонкое демо: [`lab.html`](./lab.html).

## Worker / D1

База D1 создана (`boinya-c`, ID в `proxy/wrangler.toml`).  
**Как задеплоить Worker:** [docs/SETUP_D1.md](./docs/SETUP_D1.md) — после деплоя пришли URL `*.workers.dev`.
