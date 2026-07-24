# Нативное приложение (параллельно с веб)

Веб (`app.html` + `Code.gs`) и нативка идут **параллельно**. Нативка **не правит** веб — только sync-снимок + слой `native/bridge/`.

## Зачем натив

Не «просто обертка», а доступ к телефону: **Dynamic Island / Live Activities**, локальные уведомления, хаптик, быстрый кэш без Telegram.

## Скорость (уже в оболочке)

| Механизм | Эффект |
|---|---|
| Вшитый `www/` (не remote URL) | Старт без скачивания UI |
| `native-perf.js` SWR-кэш JSONP | Повторный `getClients` / нарезка / курьер — мгновенно из кэша, сеть обновляет фон |
| dns-prefetch / preconnect к Apps Script | Чуть быстрее первый запрос |
| Capacitor Splash + safe-area | Меньше дёрганья UI |
| Инвалидация кэша на save/delete/cut | Без «протухших» данных после записи |

Плагины: Preferences, Haptics, Local Notifications, Network.

## Телефон (мост `BoinyaNative`)

```js
BoinyaNative.haptic('light'|'medium'|'success')
BoinyaNative.notify({ title, body })
BoinyaNative.startCuttingActivity({ day, total, done })
BoinyaNative.updateCuttingActivity({ done, total, label })
BoinyaNative.endCuttingActivity()
```

- Старт/финиш нарезки уже мягко хукаются (`startCutting` / `finishCutting`).
- **Остров:** Swift-заготовки `BoinyaLiveActivityPlugin.swift` + `CuttingActivityAttributes.swift` — на Mac добавить в target Xcode, Capability «Live Activities», Widget Extension для UI острова.

## Папка

```
native/
  bridge/           ← shim + perf + device (источник; копируется в www)
  scripts/sync-from-web.ps1
  scripts/bootstrap-ios.sh
  ios/ android/
```

## Sync

```powershell
cd native
npm run sync:web
npx cap sync
```

## iPhone (Mac M3)

```bash
cd native
./scripts/bootstrap-ios.sh
```

Xcode → Team → iPhone → ▶.

## Когда веб готов

«веб готов, накати» → re-sync + проверка кэша/хаптика; на Mac — добить ActivityKit для острова.

## Auth / линк с ботом (GBI)

В `Code.gs` нативный агент добавляет:

- `/start gbi_<token>` в `handleTelegramUpdate_`
- actions `getNativeLinkInfo`, `pollNativeAuth`

Веб-агент **не откатывает и не удаляет** это. Лист **Доступы** и `getMyAccess` общие с Mini App.

## Не делать

- Секреты / provisioning в git  
- `finishFullWeekProduction` без ОК  
- Живые клиенты — только `zzz_test`
- Ломать shared `Code.gs`-контракты нативки (см. Handoff в [AGENTS.md](./AGENTS.md))
