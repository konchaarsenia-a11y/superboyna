# Wellsneakers Shop

Продакшен: сайт клиента + Telegram Mini App (склад / заказы / бирки).

| Документ | Содержание |
|----------|------------|
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
| GET | `/api/catalog` | витрина (только размеры с qty>0) |
| GET | `/api/catalog/:id` | карточка |
| GET | `/api/brands` | бренды |
| POST | `/api/orders` | заказ с сайта → списание |
| GET | `/api/staff/search?q=` | касса-автокомплит |
| POST | `/api/staff/sales` | продажа в зале |
| GET/PATCH | `/api/staff/orders` | сайт-заказы / статусы |
| POST | `/api/staff/products` | админ: новый товар + размеры |
