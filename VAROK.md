# Good Boy · партнёрское пополнение

Telegram Mini App для **партнёрских сетей**: бесплатная заявка на лакомства и купоны.

**Живой URL:** https://konchaarsenia-a11y.github.io/superboyna/varka/

**Бот партнёров:** [@GOODBOY_LG](https://t.me/GOODBOY_LG)  
(отдельный от бота Бойни; токен только в Script Properties / `secrets.local.md`, не в git)

**Стиль:** как Instagram [@goodboy_rb](https://www.instagram.com/goodboy_rb/) — чёрный фон, крем, оранжевый акцент, логотип Good Boy.

**Бесплатно** — цен нет.

## Привязка Mini App к боту (BotFather)

1. [@BotFather](https://t.me/BotFather) → `/mybots` → **GOODBOY_LG**
2. **Bot Settings → Menu Button → Configure menu button**
   - Text: `Открыть`
   - URL: `https://konchaarsenia-a11y.github.io/superboyna/varka/`
3. Проверка: открыть [@GOODBOY_LG](https://t.me/GOODBOY_LG) → кнопка меню слева от поля ввода → должен открыться миниап с лого Good Boy.

Токен бота в репозиторий **не** писать. Для webhook/уведомлений позже — `PropertiesService` в своём Script.

---

## Связка с Бойней (кабинет владельца)

Управление — вкладка **Партнёры** в конвейере Бойни (owner).  
Во `varka/` кнопок владельца нет — только кабинет партнёра.

| Лист | Что |
|------|-----|
| `Partner_Networks` | Сети: **Varka**, NaN clinic, Fundog, Firedog, Polotno, Indixvost, Bob Wow Collar |
| `Partner_Points` | Точки сети |
| `Partner_Access` | Доступ: `@username` / Telegram ID → точки |
| `Partner_Orders` | Заявки партнёров |

API (Бойня C Worker → GAS): `partnerListAdmin`, `partnerGetMe`, `partnerSubmitOrder`, `partnerListMyOrders`, `partnerSaveNetwork`, `partnerSavePoint`, `partnerSaveAccess`, `partnerRevokeAccess`, `partnerSeedDefaults`, `partnerSetNotifyRecipients`.

**Живой webhook мини-аппа:** `https://boinya-c.konchaarsenia.workers.dev` (`cutover=1`), не сырой `/exec`.

**Prod v3+:** демо-вход выключен.  
- Есть `Partner_Access` → только выданные точки (даже если человек owner Бойни)  
- Нет Access и owner Бойни → все точки  
- Админка — вкладка **Партнёры** в Бойне  

Worker: `@arseniyhotko` / `650923866` видит только **NaN clinic · Янковского 34** (роль owner в Бойне не трогаем). Deploy — **Worker**, не вставка `Code.gs`.

Ответственные за пуши: Script Property `PARTNER_ORDER_NOTIFY_IDS`.

Не путать с листом **«Партнёры»** (источник БП во вкладке Доступы).

---

## Поток заявки

```
Партнёр жмёт Отправить
  → лист Partner_Orders + Отложенное (режим partner)
  → пуш команде в бота Бойни (Партнёры→Пуши, иначе owners)
  → пуш партнёру в @GOODBOY_LG: день и время слота (завтра, вс→пн, 12:00–18:00)
Отложенные → Заказы
  → «В пути» → партнёру «курьер уже в пути»
  → «Доставлено» → партнёру «доставлено», заявка в историю, карточка закрывается
```

Токен партнёрского бота: Script Property `PARTNER_BOT_TOKEN` (или `GOODBOY_BOT_TOKEN`). Без него пуш партнёру идёт через бота Бойни (может не дойти, если человек не писал Бойне).

Демо-профили в браузере при живом webhook **отключены**.

---

## Дальше

1. Пуш заявок в бота Бойни + Отложенные  
2. Каталог/статусы заказов с сервера  
3. `/start` с кнопкой Web App  

## Чеклист

- [x] Бот [@GOODBOY_LG](https://t.me/GOODBOY_LG) + Menu Button → `varka/` (Pages) — **OK**
- [x] Стиль Good Boy (IG)
- [x] Вход по @username + свои точки
- [x] Купоны поштучно + баннер
- [x] ЛК: тема, настройки, доступ сотруднику
- [x] Убран вход «Владелец» из `varka/`
- [x] Вкладка владельца в Бойне (сети/точки/доступы)
- [x] Листы Partner_* + seed
- [x] Qty-пресеты: лёгкое/сердце 50–200 г; купоны 48/73/96/120; баннер только 1 шт · **Pages**
- [x] **Prod v3.0.0:** без демо · партнёры из Access · `partnerSubmitOrder` · **Pages** · **нужен Deploy**
- [x] **Varka точки v3.0.1:** 10 адресов (Репина…Скрипникова) · **Pages** · **нужен Deploy Code.gs** (`PARTNER_PROD_V4`)
- [~] **Varka точки v3.0.2:** + **Шевченко 1** (`pt_varka_shevchenko_1`) · уже в живой таблице · **нужен Deploy Code.gs** (`PARTNER_PROD_V11`)
- [~] **v3.1.0 / v3.3.3:** `@arseniyhotko` — 1 точка **NaN clinic · Янковского 34** (не owner в мини-апп) · **Pages** · **нужен Deploy Code.gs** (`PARTNER_PROD_V10`) · Worker
- [ ] **v3.3.2:** ~~`@nan_animal_clinic`~~ — отменено, доступ у `@arseniyhotko`
- [x] **v3.0.9:** у позиций лакомств убрана буква «г» — **Pages**
- [x] **v3.0.8:** как было — owner first (все точки); `@one_more_person_228` обычный owner; allowlist/тест-Access сняты (`PARTNER_PROD_V7`) · **Pages** · **нужен Deploy Code.gs**
- [~] Пуш заявок команде + партнёру слот / в пути / доставлено · Отложенные→Заказы · **нужен Deploy Code.gs** + `PARTNER_BOT_TOKEN`
- [ ] `/start` с кнопкой Web App
