---
name: goodboy-ui-build
description: Build or rebuild Goodboy marketing pages (HTML/CSS) with brand tokens, mobile 390px, and mandatory smoke before push.
paths:
  - "goodboy/**"
---

# Goodboy UI build

## Когда

Новая страница, пересборка лендинга/вкладки (например `subscription.html`), NFC-лендинг, крупный сдвиг копирайта + вёрстки.

## Порядок

1. Прочитать `GOODBOY.md`, `.cursor/rules/goodboy-site.mdc`, `.cursor/rules/ui-miniapp.mdc`.
2. **Новый визуал** — skill `frontend-design` (план токенов → код). **Полировка** — `ui-miniapp-pass`.
3. Код:
   - один HTML-файл + `site-v070.css` (не inline-стиль кроме boot-loader);
   - Archivo Black + Outfit, палитра `#1e2421` / `#d4a15a` / `#ede8df`;
   - hero = один главный тезис; вторичное — ниже;
   - CTA Instagram: `ig.me/m/goodboy_rb?text=` + `navigator.clipboard` fallback.
4. Bump `?v=` на CSS/JS.
5. **Обязательно** skill `goodboy-smoke` → exit 0 + скрины 390px.

## Чеклист вёрстки

- [ ] 390px — ничего не обрезано, CTA ≥44px
- [ ] `aria-current="page"` на активной вкладке
- [ ] Копирайт: «питомец», не «хвостик» (если не цитата)
- [ ] Не трогать `Code.gs` / `app.html` Бойни
- [ ] Push сам; Deploy Code.gs — только если менялся бэкенд gb*

## После сдачи

Коротко владельцу: URL Pages, что проверить руками (NFC, IG deep link).
