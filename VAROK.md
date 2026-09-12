# Good Boy · партнёрское пополнение

Telegram Mini App для **партнёрских сетей**: бесплатная заявка на лакомства и купоны.

**Живой URL:** https://konchaarsenia-a11y.github.io/superboyna/varka/  

**Не использовать jsDelivr для Mini App** — `.html` там как `text/plain` («просто код», без картинок).

**Зеркало Worker (после deploy):** https://boinya-c.konchaarsenia.workers.dev/varka/

**Бот партнёров:** [@GOODBOY_LG](https://t.me/GOODBOY_LG)  
(отдельный от бота Бойни; токен только в Script Properties / `secrets.local.md`, не в git)

**Стиль:** как Instagram [@goodboy_rb](https://www.instagram.com/goodboy_rb/) — чёрный фон, крем, оранжевый акцент, логотип Good Boy.

**Бесплатно** — цен нет.

## Привязка Mini App к боту (BotFather)

1. [@BotFather](https://t.me/BotFather) → `/mybots` → **GOODBOY_LG**
2. **Bot Settings → Menu Button → Configure menu button**
   - Text: `Открыть`
   - URL: `https://konchaarsenia-a11y.github.io/superboyna/varka/`
3. Проверка: открыть [@GOODBOY_LG](https://t.me/GOODBOY_LG) → сразу **заказ**, сверху История / Кабинет, кнопка «← К заказу» вне заказа; после отправки — «скоро уведомление о дате» (без даты в алерте).

Токен бота в репозиторий **не** писать. Для webhook/уведомлений позже — `PropertiesService` в своём Script.

---

## Связка с Бойней (кабинет владельца)

Управление — вкладка **Партнёры** в конвейере Бойни (owner).  
Во `varka/` кнопок владельца нет — только кабинет партнёра.

| Лист | Что |
|------|-----|
| `Partner_Networks` | Сети: **Varka**, NaN clinic, Fundog, Polotno, Indixvost, BOW Wow Collar (~~Firedog~~ убран) |
| `Partner_Points` | Точки сети |
| `Partner_Access` | Доступ: `@username` / Telegram ID → точки |
| `Partner_Orders` | Заявки партнёров |

API (Бойня C Worker → GAS): `partnerListAdmin`, `partnerGetMe`, `partnerSubmitOrder`, `partnerListMyOrders`, `partnerSaveNetwork`, `partnerSavePoint`, `partnerSaveAccess`, `partnerRevokeAccess`, `partnerSeedDefaults`, `partnerSetNotifyRecipients`.

**Живой webhook мини-аппа:** `https://boinya-c.konchaarsenia.workers.dev` (`cutover=1`), не сырой `/exec`.

**Prod v3+:** демо-вход выключен.  
- Есть `Partner_Access` → только выданные точки (даже если человек owner Бойни)  
- Нет Access и owner Бойни → все точки  
- Админка — вкладка **Партнёры** в Бойне  

Worker: `@one_more_person_228` — **все партнёры кроме Varka** (`PARTNER_MANUAL_ACCESS_EXCLUDE_NETS=net_varka`, owner-all except). Single-point live-test выкл. `@arseniyhotko` — Варки сняты (`PARTNER_PROD_V17`). Deploy — **Worker** (CI на merge в `main`).

### Команда «следующая точка»

Сейчас single-point прогон **выключен** (`PARTNER_LIVE_TEST_ENABLED_=false`). Владелец выдаёт наборы адресов Varka вручную («дай доступ …»).

Когда снова включат single и владелец пишет **«следующая точка»**, агент:
1. Сдвигает `PARTNER_LIVE_TEST_IDX_` (+1) в `Code.gs` и `PARTNER_LIVE_TEST_IDX` в Worker  
2. Commit + push `main`  
3. Напоминает **Deploy Code.gs**  
4. Пишет, какая точка сейчас у `@one_more_person_228`

Очередь (архив single-прогона):

| # | id | Точка |
|---|-----|--------|
| 0 | `pt_nan_1` | nan_animal_clinic · ул. Янковского, 34 · ✅ |
| 1–12 | `pt_varka_*` | Varka — вручную по наборам |
| 13 | `pt_fundog_1` | Fundog · ✅ |
| 14 | `pt_polotno_1` | polotno_an · Чечота 11 · ✅ |
| 15 | `pt_indix_1` | indixvost · Проспект победителей 73/1 · ✅ |
| 16 | `pt_bob_1` | bow_wow_collar · ✅ |

**Сейчас у `@one_more_person_228`:** все активные точки **кроме Varka** (`owner_all_except_net_varka`). NaN / Fundog / Polotno / Indixvost / BOW доступны; `net_varka` / `pt_varka_*` — нет.

На каждой точке проверять: вход → каталог/кнопки → NFC → Отправить → пуш в бот → история.

Ответственные за пуши: Script Property `PARTNER_ORDER_NOTIFY_IDS`.

Не путать с листом **«Партнёры»** (источник БП во вкладке Доступы).

---

## Поток заявки

```
Партнёр жмёт Отправить
  → лист Partner_Orders + Отложенное (режим partner)
  → пуш команде в бота Бойни (Партнёры→Пуши, иначе owners)
  → пуш партнёру в @GOODBOY_LG: день и время слота (завтра, вс→пн, 12:00–22:00)
Отложенные → Заказы
  → «В пути» → партнёру «курьер уже в пути»
  → «Доставлено» → партнёру «доставлено», заявка в историю, карточка закрывается
```

**Куда какой пуш**

| Кому | Что | Бот / секрет |
|------|-----|----------------|
| Партнёр (`order.telegramId`) | статусы: заявка / слот / в пути / доставлено | [@GOODBOY_LG](https://t.me/GOODBOY_LG) — `PARTNER_BOT_TOKEN` или `GOODBOY_BOT_TOKEN` |
| Снабжение (`PARTNER_ORDER_NOTIFY_IDS` / notifyRecipients) | только «Новая заявка партнёра» | бот Бойни — `TELEGRAM_BOT_TOKEN` |

Клиентские статусы **никогда** не идут в notifyRecipients и **не** через бота Бойни. Если `PARTNER_BOT_TOKEN` / `GOODBOY_BOT_TOKEN` нет — пуш партнёру пропускается (лог), fallback на `TELEGRAM_BOT_TOKEN` нет.

Worker: `wrangler secret put PARTNER_BOT_TOKEN` (или `GOODBOY_BOT_TOKEN`) — секрет кладётся CI из одноимённого GitHub secret (workflow `boinya-c-worker-deploy`). GAS: Script Property с тем же именем.

Демо-профили в браузере при живом webhook **отключены**.

---

## Дальше

1. Пуш заявок в бота Бойни + Отложенные  
2. Каталог/статусы заказов с сервера  
3. `/start` с кнопкой Web App  

## Чеклист

- [x] Бот [@GOODBOY_LG](https://t.me/GOODBOY_LG) + Menu Button → `varka/` (Pages) — **OK** (не jsDelivr)
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
- [~] **v3.1.0 / v3.3.3:** ~~`@arseniyhotko` → NaN / 4 Варки~~ · **V17: Варки сняты** · **нужен Deploy Code.gs** (`PARTNER_PROD_V17`) · Worker
- [x] **v3.3.4:** купон **NaN clinic × Good Boy** по `networkId` (`assets/partners/nan-coupon.png`) · **Pages**
- [x] **v3.3.5:** купон **Indixvost / Ди & Хвосты** (`assets/partners/indixvost-coupon.png`) · **Pages**
- [x] **v3.3.6:** купон **Polotno** (`assets/partners/polotno-coupon.png`) · **Pages**
- [x] **v3.3.7:** купон **Fundog / Fun Dogs Club** (`assets/partners/fundog-coupon.png`) · **Pages**
- [x] **v3.3.8:** Firedog убран · купоны: бумажный с ламинацией + NFC (к телефону клиента) · **Pages** · **нужен Deploy Code.gs** (`PARTNER_PROD_V12`)
- [~] **v3.3.9:** **BOW** Wow Collar (не Bob) · **нужен Deploy Code.gs** (`PARTNER_PROD_V13`)
- [x] **v3.3.9:** баннер только у **Varka** (у остальных сетей пока нет) · **Pages**
- [x] **v3.3.10:** купон **BOW Wow Collar** (`assets/partners/bowwow-coupon.png`) · **Pages**
- [x] **v3.3.11:** подписи купонов без дублей; NFC — полупрозрачная подсказка · **Pages**
- [x] **v3.3.12:** купоны компактнее (мини-превью слева) · **Pages**
- [x] **v3.3.13:** NFC — 1 на точку; второй только с причиной (поломка/потеря/цель) · **Pages** · **нужен Deploy Code.gs**
- [x] **v3.3.14:** NFC причины: поломка / потеря / второй для работы / несколько сотрудников; без штрафов при поломке и потере · **Pages**
- [x] **v3.3.15:** NFC без пресетов 48/73/96/120 — только «Взять 1» / «+ещё» · **Pages**
- [x] **v3.3.17:** убран редирект на jsDelivr (`text/plain` = «просто код» без картинок) · снова локальный `app.html` на Pages
- [x] **v3.3.18:** главная = заказ сразу; сверху История / Кабинет · чуть мягче UI · **Pages**
- [~] **v3.3.19:** кнопка «К заказу»; без версии в шапке; заявка без даты → уведомление позже; Бойня Партнёры→Заказы · **Pages** · **нужен Deploy Code.gs** + Worker
- [~] **v3.3.20:** примечание к заявке · ~~`@arseniyhotko` → 4 Варки~~ (снято V17) · **Pages** · **Deploy Code.gs**
- [~] **v3.3.21:** + точка **Varka Маяковского 14** (`pt_varka_mayakovskogo_14`, `PARTNER_PROD_V15`); в Бойне Удалить/Вернуть точку (`partnerDeletePoint`) · Pages Бойня `v71115940` · **нужен Deploy Code.gs** + Worker
- [x] **v3.3.21b:** лист причин NFC; без дубля Маяковского и без «·»; soft-toast Отправить · Pages varka 3.3.21 · **Deploy Code.gs** (`PARTNER_PROD_V16`)
- [~] **v3.3.37:** баннер Varka вернули; nudge дат снова 11+19 · Pages · **Deploy Code.gs** если меняли триггер
- [~] **v3.3.36:** слот 12–22; Varka NFC+баннер (без бумажного купона); +250г без custom; owner grant staff; фикс дубля заказов; nav/кабинет · Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.35:** rename polotno_an / indixvost + адрес ниже; 1× Маяковского; Бойня скрыть Firedog+дубли Маяковского · Pages varka 3.3.35 / Бойня `v71115942` · **Deploy Code.gs** (`PARTNER_PROD_V34`) + Worker
- [~] **v3.3.34 batch:** rename точек (Fundog / Чечота 11 / Победителей 73/1 / bow_wow_collar); история без «Привезём»; купон photo+qty; qty blur keep; Delete в Партнёры→Заказы; access pending+notify+accept; staff без grant; empty-day skip force · Pages varka 3.3.34 · **Deploy Code.gs** (`PARTNER_PROD_V32`) + Worker
- [~] **v3.3.43:** Access `@one_more_person_228` (tid 827494606) → **все кроме Varka** (`PARTNER_MANUAL_ACCESS_EXCLUDE_NETS=net_varka`) · Worker · после merge CI deploy
- [~] **v3.3.42:** Access `@one_more_person_228` → ~~только 12 точек Varka (`manual_varka_only`)~~ снято: теперь all-except-Varka · Worker
- [~] **v3.3.41:** Access `@one_more_person_228` → ~~все партнёры (owner-all)~~ снято Varka-only, затем all-except-Varka · Worker · Deploy Code.gs V33 опционально
- [~] **v3.3.40:** Access `@one_more_person_228` → только **Маяковского 14** · Worker · Deploy Code.gs V31 опционально
- [~] **v3.3.39:** Access `@one_more_person_228` → только **Шевченко 1** · Worker · Deploy Code.gs V30 опционально
- [~] **v3.3.38:** Access `@one_more_person_228` → только **Скрипникова 1** · Worker · Deploy Code.gs V29 опционально
- [~] **v3.3.37:** Access `@one_more_person_228` → только **Цвирко 100** · Worker · Deploy Code.gs V28 опционально
- [~] **v3.3.36:** Access `@one_more_person_228` → только **Матусевича 70** · Worker · Deploy Code.gs V27 опционально
- [~] **v3.3.35:** Access `@one_more_person_228` → Голодеда / Рокосс 80 / 150Б / Казинца · Worker · **Deploy Code.gs** (`PARTNER_PROD_V26`) опционально
- [~] **v3.3.34:** ручной Access `@one_more_person_228` → только **Карского 23** · **Deploy Code.gs** (`PARTNER_PROD_V25`) + Worker
- [~] **v3.3.33:** ручной Access `@one_more_person_228` → **Репина 4** + **Авиационная 17**; single live-test выкл. (фронт+Worker+GAS) · Pages · **Deploy Code.gs** (`PARTNER_PROD_V24`) + Worker
- [x] **v3.3.32:** live-test → **BOW Wow Collar** (`pt_bob_1`); Indixvost ✅ · Pages · **Deploy Code.gs** (`PARTNER_PROD_V23`) + Worker
- [~] **v3.3.31:** live-test → **Indixvost** (`pt_indix_1`); Polotno ✅ · Pages · **Deploy Code.gs** (`PARTNER_PROD_V22`) + Worker
- [~] **v3.3.30:** live-test → **Polotno** (`pt_polotno_1`); Fundog ✅ · Pages · **Deploy Code.gs** (`PARTNER_PROD_V21`) + Worker
- [~] **v3.3.29:** live-test → **Fundog** (`pt_fundog_1`); NaN ✅; Varka пропущены · Pages · **Deploy Code.gs** (`PARTNER_PROD_V20`) + Worker
- [~] **v3.3.28:** точка NaN → название `nan_animal_clinic`, адрес Янковского ниже · Pages · **Deploy Code.gs** (`PARTNER_PROD_V19`) + Worker
- [~] **v3.3.27:** уведомления снова через Worker; после даты заказ уходит из Партнёры→Заказы; убраны лишние подписи в заказе · Pages · **Deploy Code.gs** + Worker
- [~] **v3.3.26:** шаг «Далее · точка» даже для 1 NaN; «Заявка отправлена» только партнёру в @GOODBOY_LG (не снабжение) · Pages · **Deploy Code.gs** + Worker
- [~] **v3.3.25:** при 1 точке (NaN) после сырья — экран «Далее · точка» / выбор NaN, не сразу Отправить · Pages varka 3.3.25
- [~] **v3.3.24:** заявка без дублей TG (только GAS); сразу в Бойне Партнёры→Заказы (deferred D1) · **Worker Deploy**
- [~] **v3.3.23:** fix owner→все точки у `@one_more_person_228` (tid 827494606); только NaN clinic · Pages varka 3.3.23 · **Deploy Code.gs** (`PARTNER_PROD_V18`) + Worker
- [~] **v3.3.22:** `@arseniyhotko` без Варок; `@one_more_person_228` → NaN clinic; очередь «следующая точка» · **Deploy Code.gs** (`PARTNER_PROD_V17`) + Worker
- [ ] **v3.3.2:** ~~`@nan_animal_clinic`~~ — отменено, доступ у `@arseniyhotko`
- [x] **v3.0.9:** у позиций лакомств убрана буква «г» — **Pages**
- [x] **v3.0.8:** как было — owner first (все точки); `@one_more_person_228` обычный owner; allowlist/тест-Access сняты (`PARTNER_PROD_V7`) · **Pages** · **нужен Deploy Code.gs**
- [~] Пуш заявок команде + партнёру слот / в пути / доставлено · Отложенные→Заказы · **нужен Deploy Code.gs** + `PARTNER_BOT_TOKEN`
- [ ] `/start` с кнопкой Web App
