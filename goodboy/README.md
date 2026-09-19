# Goodboy

Клиентский **сайт + Telegram Mini App**.  
Конвейер Бойни (`/app.html`, `Code.gs`) не трогаем.

## Ссылки (goodboy.by)

Публичный корень после переезда — **только** содержимое этой папки на `https://goodboy.by/` (дешёвый BY hosting, статика).  
`app.html` — тот же docroot. Бойня, Worker, Varka, GAS, CI — как сейчас на GitHub / Cloudflare / Apps Script.  
Как залить и DNS: [MIGRATE-BY.md](./MIGRATE-BY.md).

| Что | URL |
|-----|-----|
| **Сайт** | https://goodboy.by/ |
| **Подписка** | https://goodboy.by/subscription.html |
| **Пробный период** | https://goodboy.by/trial.html |
| **Хочу попробовать** | https://goodboy.by/try.html |
| **О проекте** | https://goodboy.by/about.html |
| **Связь** | https://goodboy.by/contact.html |
| **Кабинет** | https://goodboy.by/app.html |
| **Кабинет (кнопка на сайте)** | https://goodboy.by/app.html |
| **Mini App (для BotFather)** | https://goodboy.by/app.html |

**Legacy (GitHub Pages)** — до cutover и для старых ссылок/купонов:

`https://konchaarsenia-a11y.github.io/superboyna/goodboy/`

После переезда эти URL должны **301** на те же пути `https://goodboy.by/…`.  
Заготовки stub: [redirects-from-pages/](./redirects-from-pages/).

Палитра лендинга: **вечерняя прогулка** (8).

## Как устроено

```
goodboy/
  index.html           # сайт: лендинг
  subscription.html    # вкладка «Подписка»
  app.html             # кабинет для Telegram Mini App
  cabinet.html         # разметка кабинета (общая)
  css/                 # goodboy.css + site.css / site-v070.css
  js/                  # логика + demo-api (локально)
```

На сайте кабинет открывается поверх (`#app`).  
В Telegram открываете `app.html` — сразу кабинет.

## BotFather

Menu Button / Web App URL →  
`https://goodboy.by/app.html`

Пока Mini App ещё на Pages (до смены URL в BotFather):  
`https://konchaarsenia-a11y.github.io/superboyna/goodboy/app.html`

## Режим

`js/config.js` → `mode: "live"`, webhook = Cloudflare Worker `boinya-c.konchaarsenia.workers.dev`.  
При переезде домена сайта **не менять** API URL и не переносить Worker на хостинг.
