# Wellsneakers Shop

Продакшен: сайт клиента + Telegram Mini App (склад / заказы / бирки).

| Документ | Содержание |
|----------|------------|
| [DEPLOY.md](./DEPLOY.md) | VPS hoster.by → `new.sneakerworld.by` (не трогать `@`/`www`) |
| [TZ.md](./TZ.md) | ТЗ и план 25 дней |
| [ADMIN_SOURCE.md](./ADMIN_SOURCE.md) | OpenCart источник (read-only) |
| [OPS_UX.md](./OPS_UX.md) | Касса/импорт, знакомо+удобнее |
| [label-sample.png](./label-sample.png) | Образец бирки |

## Стек

Node.js + Express + PostgreSQL + GrammY · VPS в Беларуси · Docker.

```
wellsneakers-shop/
  api/           # Express API
  web/           # сайт клиента
  miniapp/       # операционка (продажа)
  bot/           # TG уведомления
  db/migrations/ # Postgres
  scripts/       # импорт OpenCart XLSX
```

## Локальный запуск

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run migrate
# положить export_products-*.xlsx в data/ (gitignore)
npm run import:oc
npm run api
```

- API: http://127.0.0.1:3080/api/health  
- Сайт: `npx serve web -p 3081`  
- Mini App: `npx serve miniapp -p 3082`  

Staff headers (dev): `x-staff-role: admin|seller`.

## API (v0.1)

| Method | Path | Зачем |
|--------|------|-------|
| GET | `/api/health` | health + DB |
| GET | `/api/promo/current` | акция 100 BYN: `active`, `current`/`next` окна, `server_now` (Europe/Minsk) |
| GET | `/api/catalog` | витрина: **модели** с цветами (`models[]`, размеры qty>0). Дефолтный порядок — `stockSizeCount` (число строк размеров с qty>0 по всем цветам, одинаковый EU в двух цветах считается дважды), затем бренд/имя. `?sort=name` — по алфавиту; без `sort` или `?sort=stock` — наличие. `?sale=1` — только уценка (`old_price_byn > price_byn`); `?gender=men` или `women` — точное поле `gender` (null не попадает; `total` 0 → «Нет моделей»). Цвета несут `description` из полей бирки; `images[]` в списке пустой (см. деталь) |
| GET | `/api/catalog/models/:modelKey` | **карточка модели** (PDP): colorways + `images[]` + `label`/`description`. `modelKey` URL-encoded (`nike%7Cair%20jordan%2011`) |
| GET | `/api/catalog/:id` | то же по id/артикулу варианта или `modelKey` |
| GET | `/api/brands` | бренды |
| POST | `/api/orders` | заказ с сайта → списание (+ TG notify) |
| GET | `/api/labels/:id?size=` | HTML бирка 58×58 + Code128 |
| GET | `/api/labels/:id/barcode.png` | PNG штрихкода |
| GET | `/api/staff/me` | роль staff (initData / dev headers) |
| GET | `/api/staff/search?q=` | касса-автокомплит |
| POST | `/api/staff/sales` | продажа в зале |
| GET/PATCH | `/api/staff/orders` | сайт-заказы / статусы |
| POST | `/api/staff/products` | админ: новый товар |
| POST | `/api/staff/stock` | админ: приход размера → labelUrl |
| GET | `/api/staff/arrivals` | список приходов |

Staff auth: `x-telegram-init-data` (прод) или dev-заголовки при `ALLOW_DEV_STAFF=1`.  
Для пушей: `BOT_TOKEN` + `ADMIN_TELEGRAM_IDS` в `.env`.

Акция «все по 100»: seed `26.09–27.09.2026` (Минск). API шлёт хозяевам remind за сутки до конца; хозяин задаёт следующее окно в боте: `/promo 04.10 05.10`.
