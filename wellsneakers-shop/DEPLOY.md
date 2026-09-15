# Деплой Wellsneakers на VPS (`new.sneakerworld.by`)

Параллельный стенд. Старый OpenCart на `@` / `www` **не трогаем** (IP `87.232.64.20`).

Цель: сайт + API + операционка на одном облаке hoster.by (1 vCPU / 2 GB / 30 GB NVMe / Ubuntu).

| URL | Что |
|-----|-----|
| `https://new.sneakerworld.by/` | витрина (`web/`) |
| `https://new.sneakerworld.by/ops/` | Mini App |
| `https://new.sneakerworld.by/api/` | бэкенд |

---

## 0. Что прислать / что не трогать

**Арсений присылает агенту**

- IPv4 VPS
- SSH: пользователь + ключ **или** пароль (`root@IP` / `ubuntu@IP`)
- (если есть) запись в панели hoster.by, что DNS `new` уже указывает на этот IP

**Агент делает на VPS**

- Docker, клон/копия `wellsneakers-shop/`, `.env`, `compose up`, nginx + Let's Encrypt
- BotFather Menu Button → `https://new.sneakerworld.by/ops/`

**Не трогать**

- DNS `@` и `www` (остаются на `87.232.64.20`)
- старый OpenCart, его БД, файлы, админку
- Goodboy / Бойня / Varka

---

## 1. DNS — только `new`

В hoster.by → DNS зоны `sneakerworld.by`:

| Хост | Тип | Значение |
|------|-----|----------|
| `new` | A | **IP этого VPS** |
| `@` | A | `87.232.64.20` — **не менять** |
| `www` | A / CNAME | как сейчас на старый сайт — **не менять** |

Проверка с ноутбука (не с VPS):

```bash
dig +short new.sneakerworld.by A
# должен быть IP VPS, не 87.232.64.20
```

Сертификат Let's Encrypt выпускать **после** этой проверки. Сайт по HTTP на `:8080` можно поднять раньше.

---

## 2. SSH

```bash
ssh root@VPS_IP
# или: ssh -i ~/.ssh/id_ed25519 ubuntu@VPS_IP
```

Дальше все команды — на сервере.

```bash
apt-get update && apt-get upgrade -y
timedatectl set-timezone Europe/Minsk
```

---

## 3. Docker

```bash
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
docker compose version
```

---

## 4. Код на сервер

Каталог: `/opt/wellsneakers-shop`.

**Вариант A — git** (если на VPS есть доступ к репо):

```bash
apt-get install -y git
git clone --depth 1 --branch cursor/wellsneakers-shop-tz-cdd0 \
  https://github.com/konchaarsenia-a11y/superboyna.git /opt/superboyna
ln -sfn /opt/superboyna/wellsneakers-shop /opt/wellsneakers-shop
```

После мержа в `main` можно клонировать `main` и так же указать на `wellsneakers-shop/`.

**Вариант B — копия с машины** (репо закрытый, ключа нет):

```bash
# с ноутбука / агента:
rsync -a --exclude node_modules --exclude .env --exclude data \
  ./wellsneakers-shop/ root@VPS_IP:/opt/wellsneakers-shop/
```

---

## 5. `.env`

```bash
cd /opt/wellsneakers-shop
cp .env.example .env
nano .env
```

Минимум для прода:

```env
POSTGRES_USER=wellsneakers
POSTGRES_PASSWORD=ЗАМЕНИТЬ_openssl_rand_hex_16
POSTGRES_DB=wellsneakers
PORT=3080
WEB_ORIGIN=https://new.sneakerworld.by
BOT_TOKEN=токен_бота
ADMIN_TELEGRAM_IDS=telegram_id_админа
ALLOW_DEV_STAFF=0
```

`DATABASE_URL` в `.env` для контейнера **не нужен** — compose сам собирает URL на хост `db`.  
`ALLOW_DEV_STAFF=0` обязательно: иначе staff API пускает без Telegram.

Пароль:

```bash
openssl rand -hex 16
```

Файл `.env` в git не коммитить.

---

## 6. Compose up

```bash
cd /opt/wellsneakers-shop
docker compose up -d --build
# или: bash deploy/vps-up.sh
docker compose ps
curl -sS http://127.0.0.1:8080/api/health
# {"ok":true,"service":"wellsneakers-api","db":true}
```

Схема БД создаётся при **первом** старте Postgres (`db/migrations/001_init.sql`).  
Порты с хоста только на localhost: `8080` (nginx), `3080` (api), `5432` (postgres). Наружу — 80/443 через системный nginx.  
Healthcheck Postgres ждёт user/db `wellsneakers` — как в `.env.example`.

Импорт каталога (если есть XLSX из OpenCart):

```bash
mkdir -p /opt/wellsneakers-shop/data
# положить export_products-*.xlsx в data/
apt-get install -y nodejs npm   # или nvm; нужен Node 20+
cd /opt/wellsneakers-shop && npm ci && npm run import:oc
```

`127.0.0.1:5432` слушает Postgres из compose — импорт идёт с хоста в ту же БД.

---

## 7. nginx + HTTPS

```bash
apt-get install -y nginx certbot python3-certbot-nginx
cp /opt/wellsneakers-shop/deploy/nginx/new.sneakerworld.by.conf \
  /etc/nginx/sites-available/new.sneakerworld.by
ln -sfn /etc/nginx/sites-available/new.sneakerworld.by \
  /etc/nginx/sites-enabled/new.sneakerworld.by
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Открыть 80/443 (если ufw включён):

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Когда `dig` показывает IP VPS:

```bash
certbot --nginx -d new.sneakerworld.by --redirect --agree-tos -m EMAIL@домен --non-interactive
curl -sS https://new.sneakerworld.by/api/health
```

Хостовый nginx только терминирует TLS и проксирует на `127.0.0.1:8080`. Маршруты `/`, `/ops/`, `/api/` — в `deploy/nginx/app.conf` (контейнер `web`).

---

## 8. BotFather

1. Открыть бота в Telegram.
2. `/mybots` → бот → **Bot Settings** → **Menu Button**.
3. URL: `https://new.sneakerworld.by/ops/`
4. Текст кнопки: например «Операционка».

Без HTTPS Mini App в Telegram не откроется.

---

## 9. Проверка

| Проверка | Ожидание |
|----------|----------|
| `https://new.sneakerworld.by/` | витрина |
| `https://new.sneakerworld.by/catalog.html` | каталог |
| `https://new.sneakerworld.by/ops/` | Mini App |
| `https://new.sneakerworld.by/api/health` | `ok: true`, `db: true` |
| `https://sneakerworld.by/` и `www` | **старый** OpenCart, как был |

Обновление кода:

```bash
cd /opt/wellsneakers-shop   # или /opt/superboyna && git pull
docker compose up -d --build
# API сам добавит color/model_key и сделает backfill при старте.
# По желанию с хоста: npm run migrate && npm run import:oc
```

Логи: `docker compose logs -f --tail=100 api`.

---

## Чеклист

### Арсений отправляет

- [ ] IP VPS
- [ ] SSH (логин + ключ или пароль)
- [ ] (по желанию) подтверждение: в DNS добавлен только `new` → этот IP

### Агент на VPS

- [ ] SSH заходит
- [ ] Docker + compose plugin
- [ ] Код в `/opt/wellsneakers-shop`
- [ ] `.env`: пароль БД, `WEB_ORIGIN`, `ALLOW_DEV_STAFF=0`, бот
- [ ] `docker compose up -d --build`, health `ok`
- [ ] nginx → `:8080`, certbot на `new.sneakerworld.by`
- [ ] BotFather Menu Button = `https://new.sneakerworld.by/ops/`

### Не трогаем

- [ ] DNS `@` и `www` (IP `87.232.64.20`)
- [ ] Старый OpenCart и его сервер
- [ ] Goodboy / Бойня / Varka
