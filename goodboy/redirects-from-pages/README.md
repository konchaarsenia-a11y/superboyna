# GitHub Pages stub → goodboy.by

Заготовки **после cutover**. Не заливать на хостинг goodboy.by.

Сейчас Pages отдаёт живой сайт из `goodboy/`:

`https://konchaarsenia-a11y.github.io/superboyna/goodboy/`

Когда `https://goodboy.by/` уже открывается, скопировать эти HTML **поверх** опубликованных страниц в `goodboy/` (на ветке, которую отдаёт Pages). Исходники сайта остаются в git — stub только на опубликованном дереве Pages, либо отдельным коммитом после переезда.

Каждый файл шлёт на тот же путь на `https://goodboy.by/…` (`meta refresh` + JS). GitHub Pages не умеет HTTP 301 из статики; для купонов и старых ссылок этого достаточно.

Карта:

| Pages (legacy) | Цель |
|----------------|------|
| `/superboyna/goodboy/` | `https://goodboy.by/` |
| `/superboyna/goodboy/about.html` | `https://goodboy.by/about.html` |
| `/superboyna/goodboy/subscription.html` | `https://goodboy.by/subscription.html` |
| `/superboyna/goodboy/trial.html` | `https://goodboy.by/trial.html` |
| `/superboyna/goodboy/try.html` | `https://goodboy.by/try.html` |
| `/superboyna/goodboy/contact.html` | `https://goodboy.by/contact.html` |
| `/superboyna/goodboy/app.html` | `https://goodboy.by/app.html` |
| `/superboyna/goodboy/cabinet.html` | `https://goodboy.by/cabinet.html` |

Неизвестный путь: `404.html` снимает префикс `/superboyna/goodboy/` и открывает тот же хвост на goodboy.by.

Подробности: [../MIGRATE-BY.md](../MIGRATE-BY.md).
