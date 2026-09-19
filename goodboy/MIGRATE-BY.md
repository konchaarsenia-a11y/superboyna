# Переезд Goodboy на goodboy.by

Подготовка в git. **Покупку домена, DNS и заливку на хостинг этот PR не делает.**

## Скоуп (важно)

На дешёвый BY shared hosting уезжает **только публичный маркетинговый сайт** — статика из папки `goodboy/`. Это один document root: лендинг + `app.html` (кабинет / Mini App). API кабинет по-прежнему зовёт Cloudflare Worker.

| Уезжает на goodboy.by | Остаётся как сейчас |
|-----------------------|---------------------|
| Статика `goodboy/` (`index.html`, about / subscription / trial / try / contact, `css/`, `js/`, `assets/`, `.htaccess`) | Бойня: `app.html` / `boinya-c/`, `Code.gs`, CI `clasp-deploy` |
| `app.html` кабинета Goodboy — тот же docroot, без смены API | Cloudflare Worker `boinya-c.konchaarsenia.workers.dev` |
| | Partner Mini App Varka на GitHub Pages |
| | GAS `/exec`, листы, секреты, GitHub Actions |

Не переносим Worker, GAS, конвейер, Varka и CI на goodboy.by. Не предлагаем полный стек на хостинге — только статика, минимум цены.

Целевой корень: **содержимое** `goodboy/` → document root `https://goodboy.by/`.  
Не заливать корень репозитория.

Сейчас сайт живёт на GitHub Pages:

`https://konchaarsenia-a11y.github.io/superboyna/goodboy/`

## 1. Что залить на хостинг

На BY shared hosting (Apache) в **корень сайта** залить **только** содержимое `goodboy/`.

Залить: HTML (включая `app.html` / `cabinet.html`), `css/`, `js/`, `assets/`, `.htaccess`.

Не заливать как публичные страницы (или оставить вне docroot):

- `MIGRATE-BY.md`, `README.md`
- `redirects-from-pages/` — заготовки для **GitHub Pages**, не для goodboy.by

`.htaccess` нужен на хостинге: HTTPS, `www` → apex, 301 со старых path-style (`/superboyna/goodboy/…`, `/goodboy/…`).

`js/config.js` уже указывает на Worker. **Не менять** `webhookUrl` / `leadWebhookUrl` на github.io и не переносить API на goodboy.by.

## 2. DNS (HB.BY)

В панели регистратора / hoster.by (HB.BY):

- либо **NS** на NS хостинга (как пишет панель),
- либо **A** (и при необходимости AAAA) на IP виртуального хоста.

`www.goodboy.by` — CNAME на `goodboy.by` или тот же A. Редирект `www` → apex делает `.htaccess`.

Не вешать `goodboy.by` как custom domain на GitHub Pages: корень — дешёвый хостинг, не `…/superboyna/goodboy/`. Pages после cutover только stub (ниже).

## 3. GitHub Pages после cutover — stub для купонов

Старые URL останутся на печати (купоны, QR). Их надо перекинуть на `https://goodboy.by/…`.

GitHub Pages **не читает** `.htaccess` и не отдаёт настоящий HTTP 301 из статики. Новый Cloudflare / прокси ради редиректа **не ставим** — ops и так на CF (Worker), лишняя зона не нужна.

**План:** после того как goodboy.by отвечает, заменить опубликованные файлы в `goodboy/` на копии из [`redirects-from-pages/`](./redirects-from-pages/). Каждый stub: `canonical` + `meta refresh` + `location.replace` на тот же путь на goodboy.by. Исходники сайта остаются в git.

Пока stub не выложен, Pages по-прежнему отдаёт полную копию сайта (каноникалы уже указывают на goodboy.by).

## 4. Что не трогать

- API: Cloudflare Worker `https://boinya-c.konchaarsenia.workers.dev` и GAS `/exec` — URL не менять.
- `Code.gs`, Worker, CI clasp, Бойня, Varka (включая растр купонов).
- BotFather: URL Mini App сменить на `https://goodboy.by/app.html` только в момент cutover (тот же статичный файл с хостинга; webhook тот же). Не в этом PR.

## 5. Проверка после заливки (когда будет хостинг)

1. `https://goodboy.by/` открывает лендинг.
2. `https://goodboy.by/subscription.html` и остальные HTML — те же относительные css/js/assets.
3. `https://goodboy.by/app.html` открывает кабинет; запросы идут на Worker, не на github.io.
4. `https://goodboy.by/superboyna/goodboy/subscription.html` → 301 на `/subscription.html`.
5. Legacy Pages: `…/superboyna/goodboy/subscription.html` → goodboy.by (после stub).
