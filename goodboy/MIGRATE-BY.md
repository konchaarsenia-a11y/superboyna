# Переезд Goodboy на goodboy.by

Подготовка в git. **Покупку домена, DNS и заливку на хостинг этот PR не делает.**

Целевой корень: содержимое `goodboy/` → document root `https://goodboy.by/`.

Сейчас сайт живёт на GitHub Pages:

`https://konchaarsenia-a11y.github.io/superboyna/goodboy/`

## 1. Что залить на хостинг

На BY shared hosting (Apache) в **корень сайта** залить содержимое `goodboy/`, не весь репозиторий.

Залить: HTML, `css/`, `js/`, `assets/`, `.htaccess`.

Не заливать как публичные страницы (или оставить вне docroot):

- `MIGRATE-BY.md`, `README.md`
- `redirects-from-pages/` — это заготовки для **GitHub Pages**, не для goodboy.by

`.htaccess` нужен на хостинге: HTTPS, `www` → apex, 301 со старых path-style (`/superboyna/goodboy/…`, `/goodboy/…`).

## 2. DNS (HB.BY)

В панели регистратора / hoster.by (HB.BY):

- либо **NS** на NS хостинга (как пишет панель),
- либо **A** (и при необходимости AAAA) на IP виртуального хоста.

`www.goodboy.by` — CNAME на `goodboy.by` или тот же A. Редирект `www` → apex делает `.htaccess`.

Не включать кастомный домен в GitHub Pages для goodboy.by: корень должен быть хостинг, не `…/superboyna/goodboy/`.

## 3. GitHub Pages после cutover — 301 / stub

Старые URL останутся на печати (купоны, QR, BotFather до смены). Их надо перекинуть на `https://goodboy.by/…`.

GitHub Pages **не читает** `.htaccess` и не отдаёт настоящий HTTP 301 из статики. Два рабочих варианта:

| Вариант | Как | Когда |
|---------|-----|--------|
| **A. Stub на Pages (рекомендуем)** | После того как goodboy.by отвечает, заменить опубликованные файлы в `goodboy/` на копии из [`redirects-from-pages/`](./redirects-from-pages/). Каждый stub: `canonical` + `meta refresh` + `location.replace` на тот же путь на goodboy.by. | Проще, без Cloudflare, купоны продолжают открываться |
| **B. Cloudflare перед Pages** | Redirect Rule / Bulk Redirect: `konchaarsenia-a11y.github.io/superboyna/goodboy/*` → `https://goodboy.by/$1` с кодом 301 | Настоящий 301 для SEO; нужен прокси |

Рекомендация: **оставить тонкий stub на Pages (A)**. Настоящий 301 на github.io без прокси недоступен; для людей и купонов stub достаточен. Если позже появится Cloudflare на Pages — можно добавить B поверх.

Пока stub не выложен, Pages по-прежнему отдаёт полную копию сайта (каноникалы уже указывают на goodboy.by).

## 4. Что не трогать

- API: Cloudflare Worker `https://boinya-c.konchaarsenia.workers.dev` и GAS `/exec` — **не** менять на github.io и не переносить на goodboy.by.
- `Code.gs`, Worker, купоны Varka (растр).
- BotFather: URL Mini App сменить на `https://goodboy.by/app.html` только в момент cutover (не в этом PR).

## 5. Проверка после заливки (когда будет хостинг)

1. `https://goodboy.by/` открывает лендинг.
2. `https://goodboy.by/subscription.html` и остальные HTML — те же относительные css/js/assets.
3. `https://goodboy.by/superboyna/goodboy/subscription.html` → 301 на `/subscription.html`.
4. Legacy Pages: `…/superboyna/goodboy/subscription.html` → goodboy.by (после stub).
5. Кабинет и заявки по-прежнему ходят на Worker, не на github.io.
