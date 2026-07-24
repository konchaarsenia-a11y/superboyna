# Нативное приложение (Capacitor)

Параллельно с Telegram Mini App. **Исходный веб не трогаем:** корневые `app.html` и `Code.gs` остаются для TG / Apps Script. UI-правки нативки — только в `native/overlays/` + `scripts/sync-native.sh`.

## Структура

```
native/
  package.json              # Capacitor + плагины
  capacitor.config.json     # appId: ru.boinya.konveyer
  overlays/                 # слой поверх sync-снимка (источник правды)
    css/ native-theme.css
    js/  telegram-shim.js, boinya-native.js, native-perf.js,
         native-brand.js, native-manager-island.js, …
    assets/                 # логотип → www/assets при sync
  www/                      # КОПИЯ веба (gitignore, собирается sync)
  ios/                      # Xcode, SPM (без CocoaPods)
  android/                  # каркас
scripts/sync-native.sh      # app.html → www/index.html + inject оверлеев
```

## Быстрый старт

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # если Node в ~/.local/node
cd native
npm install
npm run sync          # или: bash ../scripts/sync-native.sh
npx cap sync
npx cap open ios      # Xcode
```

В Xcode: Signing (Team) → iPhone → ▶.

## Sync после правок веба

```bash
bash scripts/sync-native.sh
cd native && npx cap sync
```

Копируется свежий `app.html` → `native/www/index.html`, плюс `assets/`, `maps.html`, `yandex-route.html`.  
В копии Telegram CDN заменяется на локальные шимы. **Корневой `app.html` не меняется.**

## Auth / линк с ботом (GBI)

В `Code.gs` (точечный merge с Mac, см. `MERGE_NATIVE_AUTH.md` + `native/CODE_GS_NATIVE_AUTH.snippet.gs`):

- `/start gbi_<token>` в `handleTelegramUpdate_`
- actions `getNativeLinkInfo`, `pollNativeAuth`

Веб-агент **не откатывает и не удаляет** это. Лист **Доступы** и `getMyAccess` общие с Mini App.

## Мост BoinyaNative + Live Activity

`window.BoinyaNative` — haptic / openUrl / notify / Live Activity.

«Пульс дня» на **Dynamic Island** (если есть) и на **экране блокировки** (iOS 16.1+):

- день, число клиентов, открытые задачи ☰
- роли: manager / owner / all (когда видна кнопка задач)
- оверлей: `native/overlays/js/native-manager-island.js`
- Swift: `BoinyaLiveActivityPlugin` + Widget `BoinyaIsland`

После sync: `npx cap sync ios` → собрать App (+ extension) на устройство.

## Не делать

- Секреты / provisioning в git
- Править корневой `app.html` «под натив»
- Ломать shared `Code.gs`-контракты нативки (см. Handoff в [AGENTS.md](./AGENTS.md))
- Живые клиенты — только `zzz_test`

## Что дальше (TZ §N)

- [x] Signing на iPhone (dev)
- [x] ActivityKit менеджерский пульс (Island + Lock Screen)
- [ ] Курьер / нарезка Live Activity
- [ ] Push (APNs)
- [ ] Полная Android-сборка
