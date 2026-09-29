# Бойня-Конвейер (superboyna)

Telegram Mini App + Google Sheets для подписки на лакомства для собак.

## Структура

```
superboyna/
  app.html              # Mini App (прод) — не трогать ради FAST/натива
  Code.gs               # Apps Script (бэкенд)
  fast/                 # параллельная быстрая копия (edge proxy) — см. fast/README.md
  native/               # Capacitor iOS/Android (см. NATIVE.md)
  scripts/sync-native.sh
  PROJECT.md / TZ.md / NATIVE.md
  .cursor/rules/
```

## Деплой Apps Script

**Канон:** merge `Code.gs` в `main` → GitHub Action `clasp-deploy` пушит файл «Код» и обновляет существующий webapp. Вставлять код в Script Editor не нужно. Секрет `CLASPRC_JSON` и детали: [DEPLOY.md](./DEPLOY.md).

`setupSecrets` (токен бота / chat id) — один раз в свойствах скрипта, CI это не трогает.

Аварийный ручной Deploy (если Action красный): [ИНСТРУКЦИЯ.md](./ИНСТРУКЦИЯ.md). Не создавать новое webapp-развёртывание — сменится URL `/exec`.

## Деплой Mini App

1. Выложить `app.html` на HTTPS (GitHub Pages / Cloudflare / любой хостинг).
2. В BotFather: Menu Button / Web App URL → ссылка на `app.html`.

## Тест API (PowerShell)

```powershell
.\scripts\test-api.ps1
```

Или вручную открыть в браузере:

`WEBHOOK?action=getClients&day=Понедельник&callback=cb`

## Для Cursor Agent

- Правило: `.cursor/rules/superboyna.mdc` (always on).
- Тестовый клиент: `zzz_test`.
- Не закрывать неделю без явного ОК владельца.
- После правок `Code.gs` — push/merge в `main`, CI clasp сам зальёт. Не просить вставить код.

## Натив (Capacitor)

Параллельная оболочка в [`native/`](./native/) — веб для Telegram **не меняется**.  
Инструкция: **[NATIVE.md](./NATIVE.md)**. Sync: `bash scripts/sync-native.sh`.

## FAST (edge proxy) — параллельная копия

Быстрая копия UI в [`fast/`](./fast/) через Cloudflare Worker (кэш).  
**Прод `app.html` / `Code.gs` не меняются.** См. [fast/README.md](./fast/README.md).

## Varka (партнёры)

Бесплатное пополнение лакомств/купонов для точек.  
Фронт: [`varka/`](./varka/) · [VAROK.md](./VAROK.md).  
**Параллельно конвейеру:** свой бэкенд; корневой `Code.gs` Бойни **не трогаем**.

Pages: https://konchaarsenia-a11y.github.io/superboyna/varka/

## Документы

- [DEPLOY.md](./DEPLOY.md) — clasp CI, секрет `CLASPRC_JSON`
- [ИНСТРУКЦИЯ.md](./ИНСТРУКЦИЯ.md) — аварийная вставка в Script Editor
- [PROJECT.md](./PROJECT.md) — устройство таблиц и API
- [TZ.md](./TZ.md) — ТЗ и отложенные задачи (токен бота)
- [VAROK.md](./VAROK.md) — Varka (бесплатное пополнение)
- [NATIVE.md](./NATIVE.md) — Capacitor iOS/Android
