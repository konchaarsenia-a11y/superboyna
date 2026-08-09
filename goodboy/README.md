# Goodboy

Клиентский **сайт + Telegram Mini App**.  
Конвейер Бойни (`/app.html`, `Code.gs`) не трогаем.

## Ссылки (GitHub Pages)

| Что | URL |
|-----|-----|
| **Сайт — день (палитра 1)** | https://konchaarsenia-a11y.github.io/superboyna/goodboy/ |
| **Сайт — вечер (палитра 8)** | https://konchaarsenia-a11y.github.io/superboyna/goodboy-evening/ |
| **Кабинет на сайте** | https://konchaarsenia-a11y.github.io/superboyna/goodboy/#app |
| **Mini App (для BotFather)** | https://konchaarsenia-a11y.github.io/superboyna/goodboy/app.html |

Два лендинга для сравнения палитр: `goodboy/` = тёплый дневной, `goodboy-evening/` = вечерняя прогулка (общие `assets/`).

## Как устроено

```
goodboy/
  index.html      # сайт: лендинг + кнопка «Открыть кабинет»
  app.html        # тот же кабинет для Telegram Mini App
  cabinet.html    # разметка кабинета (общая)
  css/            # goodboy.css + site.css
  js/             # логика + demo-api (локально)
```

На сайте кабинет открывается поверх (`#app`).  
В Telegram открываете `app.html` — сразу кабинет.

## BotFather

Menu Button / Web App URL →  
`https://konchaarsenia-a11y.github.io/superboyna/goodboy/app.html`

## Режим

`js/config.js` → `mode: "demo"` (localStorage).  
Связка с Бойней — позже, отдельно.
