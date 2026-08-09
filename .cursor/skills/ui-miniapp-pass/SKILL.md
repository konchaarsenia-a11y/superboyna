---
name: ui-miniapp-pass
description: UI-pass по Telegram Mini App / HTML экранам Бойни, Varka или Goodboy. Use when restyling app.html, varka, goodboy pages, fixing visual bugs, or when the user asks for design polish without a full redesign.
paths:
  - "app.html"
  - "varka/**"
  - "goodboy/**"
  - "*.html"
---

# UI Mini App Pass

## Когда

Пользователь просит улучшить/починить вид Mini App или HTML-экрана. Не запускать полный редизайн конвейера без явного «перерисуй».

## Шаги

1. Прочитать целевой файл и правило `.cursor/rules/ui-miniapp.mdc`.
2. Определить продукт:
   - Конвейер → `app.html` (тёмный iOS/TG, оранжевый акцент).
   - Varka → `varka/**` (свои токены; не трогать корневой `Code.gs`/`app.html`).
   - Goodboy / лендинг → `GOODBOY.md` + skill `frontend-design` только для **нового** визуала.
3. Для конвейера: менять только затронутый экран/компонент; переиспользовать CSS-переменные; сохранить safe-area и max-width ~420px.
4. Перед сдачей чеклист:
   - [ ] Те же токены/радиусы, что рядом на экране
   - [ ] Кнопки ≥44px по высоте тапа где уместно
   - [ ] Нет обрезки нижней панели на iPhone + TG inset
   - [ ] Пустые/ошибки — короткий текст + действие
   - [ ] Не добавлен чужой стек (React/Tailwind) в HTML Mini App
5. Если задача — «сделай красиво с нуля» для лендинга: сначала подключить `/frontend-design`, набросать план токенов, потом код.
