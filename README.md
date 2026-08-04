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

1. Открыть [таблицу](https://docs.google.com/spreadsheets/d/1aBNcgobp5GNBKySjMKRWEDWWKebF5kqb5A-cZoDuvG8/edit) → **Расширения → Apps Script**.
2. Заменить код на содержимое `Code.gs` из этого репозитория.
3. **Один раз** выполнить функцию `setupSecrets` (или вручную: Настройки проекта → Свойства скрипта):
   - `TELEGRAM_BOT_TOKEN` = токен бота
   - `TELEGRAM_CHAT_ID` = ваш chat id
4. **Развернуть → Управление развёртываниями → Изменить** (карандаш) → Новая версия → Развернуть.
5. Скопировать URL `/exec` в `app.html` (`GOOGLE_WEBHOOK_URL`) и в `PROJECT.md`, если URL изменился.

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
- После правок — тест через webhook, потом инструкция владельцу на Deploy.

## Натив (Capacitor)

Параллельная оболочка в [`native/`](./native/) — веб для Telegram **не меняется**.  
Инструкция: **[NATIVE.md](./NATIVE.md)**. Sync: `bash scripts/sync-native.sh`.

## FAST (edge proxy) — параллельная копия

Быстрая копия UI в [`fast/`](./fast/) через Cloudflare Worker (кэш).  
**Прод `app.html` / `Code.gs` не меняются.** См. [fast/README.md](./fast/README.md).

## Варок (партнёры)

Mini App для владельцев точек: заказ лакомств и купонов.  
Фронт: [`varok/`](./varok/) · логика: [VAROK.md](./VAROK.md).  
**Параллельно конвейеру:** свой бэкенд/книга; корневой `Code.gs` Бойни **не трогаем**.

## Документы

- [ИНСТРУКЦИЯ.md](./ИНСТРУКЦИЯ.md) — **для владельца: куда вставить код**
- [PROJECT.md](./PROJECT.md) — устройство таблиц и API
- [TZ.md](./TZ.md) — ТЗ и отложенные задачи (токен бота)
- [VAROK.md](./VAROK.md) — партнёры Варок (заказы пополнения)
- [NATIVE.md](./NATIVE.md) — Capacitor iOS/Android
