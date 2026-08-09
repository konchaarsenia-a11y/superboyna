# Подключение D1 (владелец)

База уже создана:

| | |
|--|--|
| Name | `boinya-c` |
| Database ID | `8ab3668c-a654-432c-9ebd-a1ac5c4db800` |

Прод-миниапп и Apps Script **не трогаем**.

## На своём компьютере (один раз)

Нужен [Node.js](https://nodejs.org/) (LTS).

В терминале из папки репозитория:

```bash
cd boinya-c/proxy
npx wrangler login
```

Откроется браузер Cloudflare — подтверди доступ.

Создать таблицы в D1:

```bash
npx wrangler d1 execute boinya-c --remote --file=./schema.sql
```

Задеплоить Worker:

```bash
npx wrangler deploy
```

В конце будет URL вида:

`https://boinya-c.<твой-subdomain>.workers.dev`

**Пришли этот URL агенту** — пропишем в песочницу `boinya-c`.

## Проверка

В браузере открой:

`https://boinya-c.<subdomain>.workers.dev/`

Должно быть что-то вроде: `"service":"boinya-c","d1":true`.

## Безопасность

- В панель Cloudflare заходишь только ты.
- URL Worker пока не свети публично.
- Позже добавим секрет и проверку Telegram id.
