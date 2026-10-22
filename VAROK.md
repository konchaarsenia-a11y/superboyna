# Good Boy · партнёрское пополнение

Telegram Mini App для **партнёрских сетей**: заявка на лакомства и купоны. Лакомства (сердце / лёгкое) и вкладка «Для аллергиков» (баранье лёгкое / индейка) — разовый заказ по формуле подписки (ПП, схема RAW26, канон 09.10.2026), но с наценкой `PARTNER_VARKA_COEF = 2.2` и доставкой `PARTNER_VARKA_DELIVERY_BYN = 4` за заказ. Подписка остаётся на 2.6 и доставке 7.60. Минимум сердца и лёгкого — 100 г. Аллергики, NFC, баннер и купоны в этот минимум не входят, заказ только из них можно. Купоны, NFC и баннер — 0 BYN. Статус оплаты не ведём.

**Живой URL Mini App (предпочтительно, без index-redirect):**  
https://konchaarsenia-a11y.github.io/superboyna/varka/app.html  

`/varka/` тоже работает: `index.html` сохраняет `#tgWebAppData` при переходе на `app.html`.  
Не ставить Menu Button на jsDelivr (`.html` как `text/plain`).

**Зеркало Worker (после deploy, сразу `app.html`):** https://boinya-c.konchaarsenia.workers.dev/varka/

**Бот партнёров:** [@GOODBOY_LG](https://t.me/GOODBOY_LG)  
(отдельный от бота Бойни; токен только в Script Properties / `secrets.local.md`, не в git)

**Стиль:** как Instagram [@goodboy_rb](https://www.instagram.com/goodboy_rb/) — чёрный фон, крем, оранжевый акцент, логотип Good Boy.

**Цена лакомств** — сервер считает сам (`partnerCalcPrice` и повторно `partnerSubmitOrder`). Клиентскую сумму не принимаем. В корзине мини-аппа строка «Сумма: … BYN».

## Привязка Mini App к боту (BotFather)

1. [@BotFather](https://t.me/BotFather) → `/mybots` → **GOODBOY_LG**
2. **Bot Settings → Menu Button → Configure menu button**
   - Text: `Открыть`
   - URL (лучше, без лишнего redirect): `https://konchaarsenia-a11y.github.io/superboyna/varka/app.html`
   - запасной: `https://konchaarsenia-a11y.github.io/superboyna/varka/` — hash `#tgWebAppData` должен доехать до `app.html`
   - Worker: `https://boinya-c.konchaarsenia.workers.dev/varka/`
3. Проверка: открыть [@GOODBOY_LG](https://t.me/GOODBOY_LG) → сразу **заказ**, сверху История / Кабинет, кнопка «← К заказу» вне заказа; после отправки — «скоро уведомление о дате» (без даты в алерте). Не должно быть «Откройте мини-апп из Telegram».

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
| `Предложения_партнёров` | «Предложить партнёра»: дата, тип, форма, автор, точка, статус `новое` |
| `Partner_AccessRequests` | Заявки «Подключить точку» с бота и с экрана «Нет доступа» |

Хаб **Партнёры** в новом UI: две вкладки, **Заказы** и **Точки**. Заказы — заявки, запросы на подключение и предложения. Точка открывается карточкой: название, адрес, сеть (можно завести новую и переименовать), хозяин (`Partner_Access`, role=partner), сотрудники точки (role=staff), согласие на платные лакомства. Флага «Платит себестоимость» в интерфейсе нет. Колонку листа не переписываем; в новом расчёте статистики флаг считается выключенным. Источник БП в заказе — точка из списка точек. Старое имя источника, которого нет среди точек, остаётся выбранным в этом заказе.

`/start` у @GOODBOY_LG: без доступа — текст «Чтобы подключить свою точку к партнёрке Good Boy, нажмите кнопку.» и кнопка «Подключить точку». С доступом — кнопка открыть мини-апп. Заявка: `partnerAccessRequestCreate` (initData, не больше 3 в день, повтор открытой заявки не плодит новую), лист в хабе, `partnerAccessRequestResolve` только owner. После отправки бот пишет «Спасибо! Заявка принята, мы свяжемся с вами.» Пуш команде — ключ `partner_access_request` (вместе с `partner_order` и `partner_suggest` в «Сотрудники»). «Подключить» создаёт точку и доступ role=partner. «Отклонить» только меняет статус, заявителю не пишем.

Каталог партнёров (сети, точки, доступы, согласие) читается и пишется только в D1, снимок `partnerListAdmin`: `partnerListAdmin`, `partnerGetMe`, `partnerSaveNetwork`, `partnerSavePoint`, `partnerDeletePoint`, `partnerSaveAccess`, `partnerAcceptAccess`, `partnerRevokeAccess`, `partnerSetNotifyRecipients`, `partnerSetPointConsent`, `partnerMigrateVarkaConsent`. Пустой или битый снап не пересобирается из листа: ответ `partner_admin_snap_missing`, D1 не затирается. `partnerSeedDefaults` каталог из листа больше не подтягивает.

Заявки и подсказки по-прежнему могут ходить в GAS: `partnerCalcPrice`, `partnerSubmitOrder`, `partnerListMyOrders`, `partnerSetOrderStatus`, `partnerSetOrderSlot`, `partnerVarkaBroadcast` (отправка), `partnerSuggestPartner`, `partnerListSuggestions`, `partnerSetSuggestionStatus`, `partnerAccessRequestCreate`, `partnerAccessRequestList`, `partnerAccessRequestResolve`, `partnerAccessRequestUpsert`.

**Цена лакомства:** `vr_t_heart` → `СЕРДЦЕ / Ломтики`, `vr_t_lung` → `ЛЁГКОЕ / Ломтики`. Вкладка «Для аллергиков»: `vr_t_lamb_lung` → `БАРАНЬЕ ЛЁГКОЕ / Целое` (сырьё 8.40 за 100 г), `vr_t_turkey` → `ИНДЕЙКА / Ломтики` (сырьё 7.50 за 100 г). Если в снимке `priceCostsPp` этих ключей нет, Worker берёт `RAW_COST_BUILTIN_`, GAS — `PP_RAW_COST_OVERRIDE_BYN_`. Режим `pp`, `fullFact=1`, `scheme=RAW26`, `deliveriesN=1`, `coef = PARTNER_VARKA_COEF` (**2.2**). Константа подписки `PP_RAW26_COEF_DEFAULT_` / `PP_RAW26_COEF_DEFAULT_D1_` остаётся **2.6**, доставка подписки **7.60**. В заявке Varka доставка заменяется на `PARTNER_VARKA_DELIVERY_BYN = 4` (за заказ, не ×N). Потолок 0.92×R не меняется: база — розница товара плюс розничная доставка 9, если товар на доставку ниже 80. Recover 3.30 за 100 г и 0.80 за жевалку берутся из канона 09.10. GAS передаёт 2.2 четвёртым аргументом в `computePpFactFromCost_`, затем `partnerApplyVarkaDelivery_`. Worker так же через `calcPricePpD1_`. Тот же вызов у `partnerCalcPrice` и у повторного пересчёта в `partnerSubmitOrder`. Пакеты `{u1,u2,u3,up4}=0`. Фракция «Ломтики» и «Целое» — ставка 0. Сумма заявки = цена клиенту до рубля (`clientDisplayPrice`). Колонка `totalByn` — последняя в `Partner_Orders`.

Короткая формула товара `min(сырьё×2.2 + 3.30, 0.92×розница)` для обоих аллергиков даёт 14.72 и округляется до **15 BYN за 100 г**. В заявке потолок считается на всю цену: розница 16 + доставка прайса 9, 0.92×25 = 23. За 100 г бараньего лёгкого или индейки итог **23 BYN** (лакомства 19, доставка 4). 100 г сердца: итог **16 BYN** (лакомства 12, доставка 4).

**Минимум 100 г** — сумма граммов сердца и лёгкого. Баранье лёгкое, индейка, NFC, баннер и купон в граммы не входят (`countMin: false`). Заказ без сердца и лёгкого проходит. Меньше 100 г сердца и лёгкого: кнопка «Минимум 100 г» неактивна, сервер отвечает `min_treat_grams`. Под суммой: «Минимальный заказ — 100 г» и «Чем больше заказ, тем выгоднее».

**Строки в карточке суммы:** «Лакомства», «Доставка», «Итого». Итого — прежний итог до рубля, доставка уже внутри него. Лакомства = итог − 4. В листе `Partner_Orders` по-прежнему колонка `totalByn`. В заявке D1, payload отложенного и пуше ещё `treatsByn` и `deliveryByn`.

**Живой webhook мини-аппа:** `https://boinya-c.konchaarsenia.workers.dev` (`cutover=1`), не сырой `/exec`.

**Wipe историй заявок (one-shot, owner):** после merge + Worker Deploy + clasp `Code.gs` —

```
CONFIRM=WIPE_ALL TELEGRAM_ID=<owner_tid> bash scripts/wipe-partner-order-histories.sh
```

Без `CONFIRM=WIPE_ALL` — dry-run (`need_confirm`). Чистит D1 `partnerOrders` + partner-строки `listDeferred` и лист `Partner_Orders`. Непартнёрские отложенные не трогает.

**Партнёр nan clinic:** `pa_nan_animal_clinic` / `@nan_animal_clinic` / точка `pt_nan_1` — **активный партнёр**. Не revoke. В кабинете не рисовать его как staff (role=partner ≠ staff; revoked/inactive скрыты). Owner может выдать доступ к `pt_nan_1` как к любой точке. Restore после ошибочного revoke #285:

```
TELEGRAM_ID=827494606 bash scripts/restore-nan-partner.sh
```

Helper #281 (`827494606`) — канон-owner, не трогать. Arseniy `650923866` тоже канон-owner партнёрки (список в `Code.gs` и мини-аппе). В restore его по-прежнему не подставлять актором.

**Prod v3+:** демо-вход выключен.  
- Есть `Partner_Access` → только выданные точки (даже если человек owner Бойни)  
- **Канон-owner** партнёрки: `827494606` / `@one_more_person_228` и `650923866`. Все активные точки, включая Varka (`ownerMode`). «Выдать доступ» виден. Owner бьёт exclude Varka. Мини-апп (`3.3.68`) верит флагу `partnerGetMe`: `ownerMode && isOwner && role==="owner"` (сервер сверяет initData). Список `CANON_OWNER_TIDS_` — запасной, если флагов нет.  
- **Arseniy** `650923866` / `@arseniyhotko` входит в этот список. Строка staff на `pt_varka_rokoss_80` в `Partner_Access` может остаться, кабинет открывает канон-owner, не эта строка.  
- Любой другой owner Бойни без Access → **нет** кабинета партнёрки  
- Админка — вкладка **Партнёры** в Бойне (owner identity в списке доступов скрыт)

Worker: `@one_more_person_228` — **полный owner** (allowlist `PARTNER_CANON_OWNER_*`). Скоуп «все кроме Varka» снят: `isPartnerOwnerAllUser_` не применяется к canon-owner. **Inspect loca / чип «Лока» сняты**. Single-point live-test выкл. Deploy — **Worker** (CI на merge в `main`) + Pages `varka/` + clasp `Code.gs`.

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

**Сейчас у `@one_more_person_228`:** **полный owner-кабинет**: все активные точки **включая Varka**, «Выдать доступ» / «Режим владельца». Точки для проверки / чип «Лока» **сняты**.

**Сейчас у `@arseniyhotko`:** staff, одна точка **Varka Рокоссовского 80** (`pt_varka_rokoss_80`). Не owner. Не 150Б. После Deploy Worker+GAS:

```
TELEGRAM_ID=827494606 bash scripts/grant-arseniy-rokoss80-staff.sh
```

На каждой точке проверять: вход → каталог/кнопки → NFC → Отправить → пуш в бот → история.

Ответственные за пуши: Script Property `PARTNER_ORDER_NOTIFY_IDS`.

Не путать с листом **«Партнёры»** (источник БП во вкладке Доступы).

---

## Поток заявки

```
Партнёр жмёт Отправить
  → лист Partner_Orders + Отложенное (режим partner)
  → пуш команде в бота Бойни (Партнёры→Пуши, иначе owners)
  → пуш партнёру в @GOODBOY_LG: день и время слота (завтра, вс→пн, 19:00–22:00)
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

---

## Согласие Varka и рассылка (не отправлять до деплоя)

Точки сети `net_varka` закрываются для заказов только явным `paidConsent=pending` или `declined`. Пустое поле читается как `accepted` (заказ открыт). `partnerMigrateVarkaConsent` `pending` не пишет и согласие не понижает (`pendingWritten` всегда 0, `downgraded` всегда 0). Другие сети не затрагиваются.

Согласие лежит в D1: поле `paidConsent` точки в `partnerListAdmin` и ответы в `partnerBroadcastReplies`. Листы `Partner_Points` и `Ответы_рассылки` каталог не пересобирают. Если снимка нет или он битый, чтение отвечает `partner_admin_snap_missing` и ничего не пишет. Сохранение точки само `pending` не пишет. В Бойне: Партнёры → Точки, у точки Varka список «Согласие на платные лакомства». Действие `partnerSetPointConsent` (только owner, без сервисного ключа) пишет и точку, и строку ответа, чтобы старый ответ не откатил ручную правку. Кнопка в боте пишет `partnerBroadcastReplies` и тем же согласием обновляет точки в D1, если снап на месте. Пустой снап ответ может сохранить, каталог при этом не затирается.

Мини-апп и `partnerSubmitOrder` при `pending` / `declined` заявку не принимают.

Рассылка хозяевам точек Varka (активный доступ, роль не `staff`, есть Telegram ID) ботом @GOODBOY_LG. id рассылки `varka-paid-2026-10`. Источник правды по согласию — снимок D1 `partnerBroadcastReplies` (`paid` → `accepted`, `decline` → `declined`). Пустой список ответов уже стоящие согласия не меняет. Повтор кнопки не пишет вторую строку. Команде уходит пуш ботом Бойни на `PARTNER_ORDER_NOTIFY_IDS`. Кнопка «Продолжаем…» ставит `accepted` на все точки Varka этого человека. «Спасибо, но…» ставит `declined`. Доступ в `Partner_Access` не отзывается: заказ закрыт флагом, вернуть можно списком в Бойне.

В сиде репозитория список `access` пустой, поэтому dry-run по файлам репо даёт **0 получателей**. Точек Varka в сиде 13. Живое число появится только после dry-run на задеплоенных D1 и листе. `@arseniyhotko` в репо записан как staff, в рассылку не входит.

### Деплой перед рассылкой

Не запускать рассылку, пока цепочка ниже не зелёная.

1. Смержить PR в `main`.
2. Дождаться CI `clasp-deploy` (`Code.gs`).
3. Дождаться деплоя Worker.
4. Дождаться Pages (`varka/app.html`).
5. `partnerMigrateVarkaConsent` согласия не понижает и `pending` не пишет. Пустое согласие остаётся «заказ открыт». Явный `pending` или `declined` закрывает точку, пока владелец или ответ кнопки не поставит другое.
6. Привязать webhook @GOODBOY_LG (не бота Бойни) на `https://boinya-c.konchaarsenia.workers.dev/telegram/goodboy`. Заголовок `X-Telegram-Bot-Api-Secret-Token` = секрет Worker `GOODBOY_WEBHOOK_SECRET` (не `WORKER_SHARED_SECRET`). Токен бота — `PARTNER_BOT_TOKEN`. Пока webhook не стоит, кнопки не дойдут. Если `GOODBOY_WEBHOOK_SECRET` пустой, заголовок не проверяется.
7. Dry-run, без сообщений. Смотреть `count`, `recipients`, `skipped`.
8. Тест на свой Telegram ID. Точки не меняются, если этот ID не хозяин точки Varka. Ответ на кнопку приходит в бот.
9. Боевая рассылка только с `mode=live` и `confirm=SEND_VARKA`.

Worker в `wrangler.toml`: имя `boinya-c`. Секреты утреннего запуска (Dashboard или `wrangler secret put`, не в git):

| Секрет | Зачем |
|--------|--------|
| `VARKA_ADMIN_KEY` | заголовок `X-Varka-Admin-Key` только для `partnerMigrateVarkaConsent` и `partnerVarkaBroadcast` (dry / test / live). Пустой секрет — ключ не работает. Другие action ключ не открывает. |
| `GOODBOY_WEBHOOK_SECRET` | `secret_token` вебхука `/telegram/goodboy` |
| `PARTNER_BOT_TOKEN` | отправка и ответ кнопок ботом @GOODBOY_LG (`GOODBOY_BOT_TOKEN` — запасное имя) |

Зеркало в GAS идёт тем же доверенным путём Worker→GAS (`GAS_SHARED_SECRET` = Script Property `WORKER_SHARED_SECRET`): в запрос ставится канон-owner. `live` без `confirm=SEND_VARKA` не отправляется.

Утренний запуск без initData. `KEY` — значение `VARKA_ADMIN_KEY`. Порядок: migrate, потом dry, потом live.

```bash
BASE=https://boinya-c.konchaarsenia.workers.dev
KEY='ВСТАВИТЬ_VARKA_ADMIN_KEY'

curl -sS -X POST "$BASE/?action=partnerMigrateVarkaConsent" \
  -H "X-Varka-Admin-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -sS -X POST "$BASE/?action=partnerVarkaBroadcast&mode=dry" \
  -H "X-Varka-Admin-Key: $KEY"

curl -sS -X POST "$BASE/?action=partnerVarkaBroadcast&mode=live&confirm=SEND_VARKA" \
  -H "X-Varka-Admin-Key: $KEY"
```

Тест на один id, между dry и live, по желанию:

```bash
curl -sS -X POST "$BASE/?action=partnerVarkaBroadcast&mode=test&testTelegramId=СВОЙ_ID" \
  -H "X-Varka-Admin-Key: $KEY"
```

Ответ migrate: `{"status":"success","pendingWritten":0,"kept":M,"downgraded":0}`.

Ответ broadcast (dry / test / live):

```json
{
  "status": "success",
  "mode": "dry",
  "dryRun": true,
  "count": 0,
  "recipients": [],
  "skipped": [],
  "sent": [],
  "errors": [],
  "sentCount": 0
}
```

`count` — сколько хозяев уйдёт в рассылку. `recipients` — эти люди и их точки. `skipped` — хозяева без Telegram ID. `sent` — id, которым сообщение ушло. `errors` — id, которым отправка не удалась (в dry оба списка пустые). `live` без `confirm=SEND_VARKA` возвращает `{"status":"error","message":"need_confirm"}` и ничего не шлёт.

Вебхук, один раз, токеном того же бота:

```bash
curl -sS -X POST "https://api.telegram.org/bot$PARTNER_BOT_TOKEN/setWebhook" \
  -d "url=https://boinya-c.konchaarsenia.workers.dev/telegram/goodboy" \
  -d "secret_token=$GOODBOY_WEBHOOK_SECRET"
```

Проверка: пустая точка Varka оформляет заказ. Явный `pending` или `declined` закрывает заявку. После `accepted` корзина считается. После `declined` текст «Точка отключена…». Чужая сеть оформляет заказ как раньше. Пропавший снап `partnerListAdmin` согласия не сбрасывает: запрос отвечает ошибкой, D1 не переписывается.

Откат согласия: в Бойне `partnerSetPointConsent` поставить `accepted` нужным точкам. Колонка листа каталог не меняет. Ответы живут в D1 `partnerBroadcastReplies`. Webhook @GOODBOY_LG, если мешает, снять в BotFather / `deleteWebhook` этим ботом, не трогая webhook бота Бойни.

Worker: `wrangler secret put PARTNER_BOT_TOKEN` (или `GOODBOY_BOT_TOKEN`) — секрет кладётся CI **после** успешного deploy из одноимённого GitHub secret (workflow `boinya-c-worker-deploy`; skip если пусто, fail не валит деплой). GAS: Script Property с тем же именем. `VARKA_ADMIN_KEY` и `GOODBOY_WEBHOOK_SECRET` в этот CI не входят: их задают отдельно на Worker `boinya-c` перед утренним запуском.

Демо-профили в браузере при живом webhook **отключены**.

---

## Дальше

1. Пуш заявок в бота Бойни + Отложенные  
2. Каталог/статусы заказов с сервера  
3. `/start` с кнопкой Web App  

## Чеклист

- [~] **Каталог партнёров только D1 2026-10-22:** сети, точки, доступы и `paidConsent` читаются и пишутся в D1. Пересборка `partnerListAdmin` из Sheets/GAS убрана, в том числе при пустом снапе (ошибка `partner_admin_snap_missing`, без записи поверх). `partnerMigrateVarkaConsent` не пишет `pending`. Согласие с кнопок и из Бойни — снимок `partnerBroadcastReplies`. `telegramSendTextWorker_` и `telegramSendPartnerBot_` пишут в лог `ok` / `error_code` / `description`. Заявки, слот, статус и зеркало заявок на подключение по-прежнему могут ходить в GAS. **Worker не задеплоен**
- [~] **Лакомства платные (RAW26, разовый заказ):** сердце/лёгкое = ПП `СЕРДЦЕ`/`ЛЁГКОЕ`, sub «Ломтики», пакеты и фракции 0, `deliveriesN=1`, наценка `PARTNER_VARKA_COEF = 2.2`, доставка Varka `PARTNER_VARKA_DELIVERY_BYN = 4` (подписка остаётся 2.6 и 7.60, потолок 0.92×R как в каноне). Минимум сердца и лёгкого 100 г; аллергики, NFC, баннер и купон без них можно. NFC / купон / баннер = 0 BYN. Верхний лимит 200 г снят. Сумма `totalByn` в листе и D1. Пустой `paidConsent` = заказ открыт; явный `pending` и `declined` заказ закрывают. Миграция сама `pending` не пишет. Рассылка хозяевам не запускалась. Pages varka `3.3.68`, **не задеплоено** (Pages, Worker, Code.gs)
- [~] **Для аллергиков:** вкладка в мини-аппе. `vr_t_lamb_lung` «Баранье лёгкое» → `БАРАНЬЕ ЛЁГКОЕ|Целое`, сырьё 8.40. `vr_t_turkey` «Индейка» → `ИНДЕЙКА|Ломтики`, сырьё 7.50. В минимум граммов не входят. Короткая цена товара 15 BYN/100 г; заявка на 100 г одной позиции — 23 BYN (лакомства 19, доставка 4). Подсказка «Чем больше заказ, тем выгоднее». Pages varka `3.3.68`, **не задеплоено**
- [~] **Лимит 200 г снят:** `MAX_ORDER_GRAMS` и отказ `max_order_grams` убраны из UI, Worker и `partnerSubmitOrder`. Пресеты строки 50/100/150/200 г остаются. Старые заявки не переписываем.
- [x] Бот [@GOODBOY_LG](https://t.me/GOODBOY_LG) + Menu Button → лучше `varka/app.html` (Pages; `/varka/` тоже ок, hash сохраняется) — **не jsDelivr**
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
- [~] **v3.3.57:** Helper `827494606` / `@one_more_person_228` снова полный канон-owner (откат TEMP demote #305). Arseniy `650923866` **не** в allowlist. `partnerGetMe` → `isOwner`/`ownerMode` true, все точки. `isPartnerOwnerAllUser_` skip для canon-owner. Pages · **нужен Worker Deploy** + **Deploy Code.gs**
- [~] **v3.3.56:** Helper `827494606` временно снят с канон-owner (тест Арсения). ~~Allowlist пуст~~ откат 3.3.57. Arseniy не возвращали.
- [~] **v3.3.55:** P0 — Mini App из Telegram больше не режется гейтом «откройте из Telegram». Redirect сохраняет `#tgWebAppData`; ждём WebApp/hash/username. Worker hydrates initData. Pages · **нужен Worker Deploy**
- [~] **v3.3.52:** Arseniy `650923866` снят с канон-owner; helper `827494606` остаётся owner. Arseniy → staff `pt_varka_rokoss_80` через `partnerSaveAccess` после Deploy. Не `PARTNER_MANUAL_ACCESS_*`. Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.50:** ~~nan clinic без staff / leftover revoked / `nan_staff_forbidden`~~ ошибка #285 — nan партнёр, см. 3.3.51
- [~] **v3.3.49:** `@one_more_person_228` без inspect loca (чип «Лока» / селект сняты). Owner-кабинет (#281) остаётся. `canPickInspectLoca=false` · Pages · Worker
- [~] **v3.3.48:** `@one_more_person_228` (`827494606`) временно полный owner (тот же allowlist, что Arseniy). Все точки включая Varka, «Выдать доступ» виден. Owner бьёт exclude. ~~Inspect loca не мешает~~ снято в 3.3.49 · Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.47:** экран Кабинет у всех; owner-UI / «Выдать доступ» только `650923866`. Helper без owner-кабинета, Varka закрыта, inspect loca жив · Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.46:** owner-only кабинет (`650923866`, все точки включая Varka). Helper `827494606` не owner, не видит owner в access. #266/#268 без регресса · Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.45:** слот **19:00–22:00**; подпись «Баннер» (Varka); точки без адресов; polotno/indixvost/bow_wow — только купоны+NFC; qty 48/73/96/120 без custom; **баннер NaN отложен**; wipe `partnerWipeOrderHistories` · Pages · Worker · **Deploy Code.gs**
- [~] **v3.3.44:** ~~`@one_more_person_228` сам выбирает локу для проверки~~ снято в 3.3.49 · Pages + Worker
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
- [x] **v3.3.2 / v3.3.51:** `@nan_animal_clinic` — партнёр nan clinic (`pt_nan_1`), не staff. Не revoke.
- [x] **v3.0.9:** у позиций лакомств убрана буква «г» — **Pages**
- [x] **v3.0.8:** как было — owner first (все точки); `@one_more_person_228` обычный owner; allowlist/тест-Access сняты (`PARTNER_PROD_V7`) · **Pages** · **нужен Deploy Code.gs**
- [~] Пуш заявок команде + партнёру слот / в пути / доставлено · Отложенные→Заказы · **нужен Deploy Code.gs** + `PARTNER_BOT_TOKEN`
- [ ] `/start` с кнопкой Web App
