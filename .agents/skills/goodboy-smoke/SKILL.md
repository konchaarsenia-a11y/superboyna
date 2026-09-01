---
name: goodboy-smoke
description: Run Playwright smoke on Goodboy static site (subscription, index, IG CTA). Use after goodboy HTML/CSS changes or before shipping site pages.
paths:
  - "goodboy/**"
  - "scripts/goodboy-smoke.py"
---

# Goodboy smoke

## Когда

После правок `goodboy/**/*.html`, `goodboy/css/**` или перед сдачей страницы сайта.

## Команда

```bash
python3 scripts/goodboy-smoke.py --screenshot-dir /tmp/gb-smoke
```

Локальный сервер поднимается сам. Против live Pages:

```bash
python3 scripts/goodboy-smoke.py \
  --base-url https://konchaarsenia-a11y.github.io/superboyna/goodboy \
  --screenshot-dir /tmp/gb-smoke
```

## Что проверяет

- `subscription.html` — hero пробной недели, 3 этапа, IG-кнопка `ig.me/m/goodboy_rb?text=`, высота CTA ≥44px
- `index.html` — hero, табы навигации, ссылка на подписку

## Definition of Done

- [ ] `goodboy-smoke.py` exit 0
- [ ] При смене вёрстки — скрины 390px в `/tmp/gb-smoke` просмотрены
- [ ] Cache-bust CSS обновлён

## Зависимости

Cloud: Playwright в `.cursor/environment.json`. Локально:

```bash
python3 -m pip install --user playwright
python3 -m playwright install chromium
```

## Не путать

- Бойня webhook → `scripts/test-api.sh` / skill `test-api` (`zzz_test` only)
- Goodboy gb* API → `scripts/test-goodboy-api.sh`
