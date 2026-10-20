# Well Sneakers — операционка на Google Sheet

Касса и склад команды живут в Telegram Mini App + Google Apps Script + таблица. Витрина, каталог для покупателей и заказы с сайта остаются на VPS (Postgres).

Это отдельное дерево. Скрипт Бойни, Goodboy и Varka не используются.

Пока `SCRIPT_URL` в `index.html` не заменён, страница открывается как демо в браузере и в таблицу не пишет.

## Что где лежит

| Слой | Где | Деньги |
|---|---|---|
| Mini App | `index.html` → GitHub Pages | бесплатно |
| API кассы и склада | `Code.gs` + `Logic.gs`, веб-приложение Apps Script | бесплатно |
| Остатки, продажи, приходы | Google Sheet «Well Ops» | бесплатно |
| Сайт, каталог, `POST /api/orders` | VPS Postgres | как сейчас |
| Фото и бирки 58×58 | VPS `/uploads` и `/api/labels` | как сейчас, до отдельного шага |

Продажа в зале и приход размера пишутся в Sheet. Витрина узнает об остатке только после синка Sheet → Postgres (скрипт-набросок в `sync/pull-stock.mjs`, боевой приёмник на VPS в этом изменении нет).

## Листы

Функция `setupWellOps` создаёт шапку и строку Meta. Лишние колонки не удаляет.

**Products** — `id`, `article`, `barcode`, `name`, `brand`, `price_byn`, `old_price_byn`, `active`, `image_url`, `vps_product_id`, `created_at`, `updated_at`

**Sizes** — `id`, `product_id`, `article`, `size`, `qty`

**Sales** — `id`, `operation`, `staff_telegram_id`, `staff_name`, `payment_method`, `discount_byn`, `total_byn`, `comment`, `created_at`, `sync_status`

**SaleItems** — `id`, `sale_id`, `product_id`, `article`, `size`, `qty`, `price_byn`, `product_name`

**Arrivals** — `id`, `product_id`, `article`, `product_name`, `size`, `qty`, `label_printed`, `staff_telegram_id`, `created_at`

**Movements** — журнал движений (`sale`, `arrival`, `inventory`): `id`, `product_id`, `article`, `size`, `delta`, `reason`, `ref_type`, `ref_id`, `created_at`

**StaffUsers** — `telegram_id`, `name`, `role` (`admin` / `seller`), `active`, `updated_at`

**Meta** — `key` / `value`: счётчики id, `sync_dirty`, `sync_products`, `sync_last_ok`

Ключ для синка с витриной — `article`. `vps_product_id` заполняется, когда строка уже есть в Postgres: по нему Mini App открывает бирку на VPS. У нового товара из таблицы этого id нет, бирка молчит, пока синк не свяжет строку.

Сайт-заказы в лист не пишутся.

## Действия API

`POST` на URL веб-приложения, тело `text/plain` (JSON). Так браузер не шлёт preflight, который Apps Script не принимает. Если POST оборвался на редиректе Google, Mini App повторяет запрос через JSONP `GET ?action=&payload=&callback=`.

| action | Кто | Зачем |
|---|---|---|
| `ping` | все | жив ли скрипт |
| `me` | staff | роль |
| `search` | staff | касса и склад, `q`, `all=1` показывает нули |
| `getProduct` | staff | карточка для склада |
| `sale` | staff | продажа, списание размера |
| `stock` | admin | приход `+qty` |
| `inventory` | admin | сверка, абсолютный остаток |
| `arrivals` / `arrivalPrinted` | admin | список приходов и отметка печати |
| `createProduct` / `nextArticle` | admin | новая строка товара |
| `ensureSheets` | admin | создать листы ещё раз |
| `exportCatalog` | секрет синка | снимок товаров и размеров |
| `markSynced` | секрет синка | сбросить очередь `sync_products` |

Ответы в форме `{ ok, ... }`, как у текущего `/api/staff`. Ошибки: `auth_required`, `invalid_init_data`, `staff_not_allowed`, `admin_only`, `insufficient_stock`, `article_exists`.

`orders` и `photo` отвечают отказом: заказы сайта и файлы фото остаются на VPS.

## Вход

Telegram `initData` проверяется HMAC-SHA256, как в Mini App: ключ `WebAppData`, затем секрет из токена бота. Токен берётся из свойства `BOT_TOKEN` (или `TELEGRAM_BOT_TOKEN`). Подпись старше суток не принимается.

`ADMIN_TELEGRAM_IDS` — список telegram id через запятую. Эти люди получают роль admin и строку в StaffUsers. Продавец без этой роли должен быть заранее вписан в StaffUsers с `active=TRUE`, иначе `staff_not_allowed`.

`ALLOW_DEV_STAFF=1` пускает запрос без initData, если в теле `dev: true` и `devTelegramId`. На бою свойство не ставить. В Mini App для этого локально: `localStorage.ws_dev=1` и `localStorage.ws_tg=<id>`.

## Шаги Арсения

1. Google-аккаунт, таблица **Well Ops**, часовой пояс Europe/Minsk.
2. Расширения → Apps Script. Вставить два файла: `Code.gs` и `Logic.gs`. Часовой пояс проекта — Europe/Minsk. Это новый проект, не скрипт Бойни.
3. В редакторе выбрать функцию `setupWellOps` и запустить один раз. Разрешить доступ к таблице. Если скрипт создан из самой таблицы, пункт появится и в меню **Well Ops**. Если скрипт отдельный, в свойствах указать `SPREADSHEET_ID`.
4. Настройки проекта → свойства скрипта:

   | Свойство | Значение |
   |---|---|
   | `BOT_TOKEN` | токен бота `@Wellsneakers_logbot` |
   | `ADMIN_TELEGRAM_IDS` | `650923866` и другие админы через запятую |
   | `SPREADSHEET_ID` | id таблицы, если скрипт не привязан к ней |
   | `SYNC_SECRET` | длинная случайная строка, когда будете забирать остатки на VPS |
   | `VPS_SYNC_URL` | пока пусто. Позже: `https://…/api/internal/sync/catalog` |
   | `VPS_SYNC_SECRET` | тот же секрет, что примет VPS. Пока пусто |
   | `ALLOW_DEV_STAFF` | пусто |

   Токен и секреты в git не класть.

5. Развернуть → Новое развёртывание → тип **Веб-приложение**. Запуск от вашего аккаунта. Доступ: **Все**. Скопировать URL, который заканчивается на `/exec`.
6. В `wellsneakers-ops/index.html` заменить `PASTE_GAS_EXEC_URL` на этот URL. Закоммитить уже без секретов (в файле только URL веб-приложения).
7. Когда папка окажется на ветке, с которой публикуется GitHub Pages (обычно `main`), кнопка меню бота:

   BotFather → `@Wellsneakers_logbot` → Menu Button / Web App  
   `https://konchaarsenia-a11y.github.io/superboyna/wellsneakers-ops/`

   Пока папка только в рабочей ветке магазина, Pages по этому пути ещё старый или пустой. Старый `/ops/` на VPS не выключать.

8. Проверка: открыть Mini App своим id, Касса → поиск артикула → размер → Продать. В листе Sales появляется строка, в Sizes количество уменьшается.

DNS `@` и `www` не менять. `new.sneakerworld.by` для этой операционки не нужен: Mini App открывается по HTTPS Pages. Каталог с VPS в таблицу этим шагом сам не переносится — лист начинается пустым, пока строки не заведут в кассе или не загрузят отдельно.

## Синк остатков на витрину

После продажи, прихода, сверки и нового товара скрипт помечает id в Meta `sync_products`. Если заданы `VPS_SYNC_URL` и `VPS_SYNC_SECRET`, он сам шлёт POST:

```json
{ "source": "wellsneakers-ops", "products": [{ "article": "1577", "price_byn": 220, "sizes": [{ "size": "42", "qty": 1 }] }] }
```

Заголовок: `X-Sync-Secret`. Приёмника на VPS ещё нет — пустые свойства означают «только таблица», продажа при этом всё равно сохраняется (`sync_status=pending`).

Запасной забор с VPS, без записи в базу:

```bash
GAS_EXEC_URL='https://script.google.com/macros/s/…/exec' \
SYNC_SECRET='…' \
node wellsneakers-ops/sync/pull-stock.mjs
```

Скрипт вызывает `exportCatalog` и печатает JSON. `markSynced` с тем же секретом очищает очередь, когда VPS реально записал строки.

Импорт текущего каталога Postgres → Sheet (около 395 товаров) — отдельный проход. Пока его нет, касса видит только то, что уже лежит в таблице.

## Фото и бирки

- Фото по-прежнему на VPS, колонка `image_url` может хранить уже готовую https-ссылку.
- Бирка открывается как `LABELS_ORIGIN + /api/labels/{vps_product_id}?size=`. `LABELS_ORIGIN` в `index.html` оставить пустым, пока нет стабильного HTTPS витрины. Штрихкод в браузере (JsBarcode) можно добавить позже, без VPS.

## Чего этот каркас не делает

- Не деплоит Apps Script и не создаёт таблицу за вас.
- Не удаляет `/ops/` на VPS и не меняет продовые `.env`.
- Не трогает DNS.
- Не меняет `Code.gs` Бойни, Goodboy и Varka. В `clasp.json.example` пустой id нового проекта. Туда не подставлять scriptId Бойни.
