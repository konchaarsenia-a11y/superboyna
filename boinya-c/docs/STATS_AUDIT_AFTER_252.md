# Аудит вкладки Статистика (после PR #252)

Источник: `origin/main` @ `03a47d14` (merge #252, 2026-09-11).  
Код: `handleGetStats` / `collectMonthCalendarStats_` / `applyStatsCutterRecoverSplit_` / `collectBpLifetimeEconomics_` / `handleGetExpectedProfit` в `Code.gs`; UI `loadStats` / `renderStatsDashboard_` / `loadExpectedProfit` в `boinya-c/app.main.js`.  
Формулы цены: `computePpFactFromCost_` + `artifacts/product-costs/SUBSCRIPTION-PRICE.md`.  
Живые цифры с таблицы **не** выдумывались.

Канон #252: Нарезчик OFF → recover ПП **не** в `costActual`, а в `fact.ppRecoverInClean` (чистое выше). ON → recover в затратах + плоская ЗП.

Контракт `scripts/test-stats-cutter-recover.mjs` на этом tip: **OK** (ON cost 1131.23 / OFF 200, recover 31.23).

---

## Месячный факт: как собирается

`getStats` → `collectMonthCalendarStats_(ss, monthKey, { onlyPast: true })` — календарь + брони, даты ≤ сегодня (Europe/Minsk).

| Величина | Формула в коде |
|---|---|
| Оборот / «прибыль» | `calTurnover = ppActual + retail + partner`. БП = 0. |
| `ppActual` | `collectPpActualOut_`: max цена на клиента **один раз**. N=2: pays-now / `paid=yes` на 1-й → вся выручка сразу. Слот 2 без `paid=yes` — не деньги. `paid=no` мимо. |
| Розница / партнёр-заказ | цена строки (`orderPrice` → тег `[ЦЕНА]`). |
| Себест ПП на человека | `computePpFactFromCost_(сырьё листа, monthBasket, N листа если ≥2, coef=1, scheme)`. **Без наценки 2.3/2.6.** N=2: полный factCost сразу на 1-й; слот 2 не плюсует. |
| RAW26 (coef=1) | `сырьё + recoverByn + 9×nDel + пакеты + фракции` |
| LEGACY (coef=1) | `сырьё + 11 + 6×nDel + пакеты + фракции` |
| `recoverByn` | 3.90 / 100г дрессуры + 0.50 / шт жевалки (`recoverBynFromPpLines_`) |
| Recover в статистике | `ppLightCost` = Σ (LEGACY `fixed=11` **или** RAW26 `recoverByn`); `ppRecoverCost = ppLightCost` |
| #252 split | `applyStatsCutterRecoverSplit_`: cutter OFF и recover>0 → вычесть recover из `costActual` и `costBySource.pp`, записать `ppRecoverInClean` |
| ЗП | `collectStatsStaffForMonth_`: active + `fromMonth≤month≤to` + месяц ≥ `2026-09` + salary>0. После split: `costActual += staffCost` |
| Чистое | `calTurnover − costActual` (уже после split и ЗП) |
| БП месяц | `Σ(сырьё + 6)` по доставкам; 0 если партнёр `paysCost` |
| CAC месяца | `bpSpend / converted` (все БП месяца / переходы этого месяца) |

Кэш GAS: `STATS19:{month}` 10 мин. Worker D1 snap `getStats:{YYYY-MM}` до 6 ч; `setStatsCutterEnabled` помечает snap `stale`.

---

## Таблица блоков UI

| Block | Formula / source | Status | Notes |
|---|---|---|---|
| Месяц ‹› + Обновить | `getStats?month=YYYY-MM`; UI не дальше текущего месяца, не дальше −24 мес | OK | `loadStats` / `shiftStatsMonth_` |
| Плитки: прибыль / чистое / затраты / доставки | прибыль=`fact.profit`=оборот; чистое=`fact.clean`; затраты=`fact.cost`; доставки=`fact.deliveries` | OK | после #252 чистое растёт на recover (+ нет ЗП) при OFF |
| Подпись источников под плитками | счётчики `fact.bySource` (пп/бп/розн/партнёр) | OK | это **число доставок**, не деньги |
| Откуда деньги: ПП | `fact.ppRevenue` = `collectPpActualOut_` | OK | не сумма слотов |
| Откуда деньги: розница / партнёр | `fact.retail` / `fact.partner` | OK | |
| Откуда деньги: БП = 0 | жёстко 0 в UI; в оборот не входит | OK | TZ «оборот БП пояснён» |
| Затраты: продукция всего | `fact.productCost` = розн+партнёр+Σсырьё ПП (без recover/доставки) | OK | rollup, не слагаемое «Всего» |
| Затраты: · розница / · ПП состав / · партнёр | `costBy.retail`, `ppBasketCost`, `costBy.partner` | OK | ПП состав = сырьё, не factCost |
| Затраты: купоны | `fact.couponsCost` (не ПП) | OK | |
| Затраты: Recover ПП / Recover в чистом | ON: `ppRecoverCost` в затратах; OFF: строка «Recover в чистом», **не** в `cost` | OK (#252) | UI `v71115946` |
| Затраты: доставки ПП | `ppDeliveryCost` = Σ `9×nDel` или `6×nDel` | OK | подпись RAW26/LEGACY верная; API всё ещё шлёт `ppDeliveryFeeEach=6` (не используется в этом блоке) |
| Затраты: БП (состав+6) | `fact.bpCost` | OK | |
| Затраты: ЗП | `fact.staffCost` / `staffCount` | OK | 0 если cutter OFF или месяц &lt; «с» / &lt; 2026-09 |
| Затраты: Всего | `fact.cost` | BUG | в total сидят **пакеты У\* + фракции дрессуры** (`packagesByn` + `fractionMarkup`), отдельной строки нет → сумма видимых строк ≠ Всего |
| Нарезчик ON/OFF | `setStatsCutterEnabled` → лист `Stats_Сотрудники` id=`cutter`; `isStatsCutterActiveForMonth_` | OK логика / STALE UI | карточка смотрит `staff.cutter.enabled` (**глобальный** active), сноска затрат — `fact.cutter.enabled` (**месяц**). Август / месяц до «с»: карточка «Включён», затраты как OFF |
| БП месяц: доставки / состав / 6р / переходы / CAC | calendar BP + `collectBpToPpConversions_(month)` | OK | CAC = все затраты БП месяца ÷ переходы месяца (включая тех, кто ещё не конвертнулся) |
| БП lifetime / воронка денег | `collectBpLifetimeEconomics_`: только БП **перешедших**; выручка = max цена ПП на клиента×месяц после даты конверсии; выхлоп = выручка − затраты БП | OK / STALE UI | подпись «Затраты на все БП» врёт — только перешедшие. Воронка CRM БП1/БП2/Финал в UI **не рисуется** |
| БП CRM-воронка (`bp.bp1/bp2/final`, `charts.bpStages`) | `collectBpFunnelStats_` лист БП | STALE UI | хелп: «воронка БП»; `statsBarRow_` мёртвый |
| Партнёры | `collectPartnerStatsFromMonth_`: БП месяца с `ppPartner`; «стало ПП» = all-time конверсия этих клиентов; выручка = **цена ПП этого месяца**; прибыль = выручка − затрата БП (0 если `paysCost`) | OK / легко ошибиться | не lifetime LTV; не конверсии только этого месяца |
| Лист ПП (снимок) | `collectPpMoneyStats_`: колонки оборот / себест / выхлоп с листа ПП | OK | не факт доставок; UI это пишет |
| Диапазон / expected | UI → `getStats mode=expected` → `handleGetExpectedProfit` | **BUG** | `ppRev = revenueBySource.pp` — в `collectMonthCalendarStats_` ПП **никогда не кладётся** в revenue (только через `collectPpActualOut_`). Оборот диапазона **без ПП**. Нет cutter-split, нет ЗП. `note` всё ещё «свет 11 + 6». `onlyPast: false` (будущее — ок для «ожидаемой») |
| exportStats | `handleExportStats` + `exportStatsMonth()` | STALE UI | кнопки на `statsScreen` нет; help «аудит, экспорт». TSV без clean/recover/staff; месяц не передаётся; цены строк — только тег в note |
| history / compare | `readStatsMonthHistory_` + `statsDelta_` в payload | STALE UI | `statsDeltaTxt_` нигде не вызывается |
| charts (sources / ppFlow / turnover / ppMoney) | считаются в `handleGetStats` | STALE UI | отдельных вкладок/графиков в `statsScreen` нет |
| Worker snap | D1 `getStats:YYYY-MM` + SWR | OK после toggle | до clasp-deploy live GAS без split; UI деградирует: нет `fact.cutter` → сноска «Нарезчик вкл» |

---

## Cutter ON vs OFF (канон #252)

| | Нарезчик ON (месяц ≥ «с») | Нарезчик OFF |
|---|---|---|
| Recover RAW26 / LEGACY +11 | в `costActual`, строка «Recover ПП» | `ppRecoverInClean`, строка «Recover в чистом», не в затратах |
| ЗП 900 (дефолт) | в `staffCost` | 0 |
| Чистое | оборот − (товары + recover + доставки + БП + пакеты/фракции + 900) | оборот − (то же без recover и без 900) |

`staffCost` добавляется **после** split — OFF не вычитает 900 из recover-логики, его просто нет в applied staff.

---

## Скрытые ошибки формул ПП (не из #252, но ломают recover-in-clean)

1. **Схема с `row.note` календаря**, не с wishes листа ПП: `resolvePpScheme_({ wishes: row.note, forNew: false })`. Тег `[SCHEME:RAW26]` живёт в CRM wishes (`stampPpSchemeIntoWishesGs_`). Нет тега → **LEGACY**. Тогда «recover» = +11, доставка = 6×N. #252 перекладывает в чистое **эту** сумму, не 3.90/100г.

2. **Корзина для recover = первая доля слота.** ПП N=2 пишется половинами (`proposePpSlotBasket_`: дрессура floor n/2, жевалки ceil n/2). Сырьё суммируется по слотам (верно). Recover/пакеты/фракции — с **первой** корзины ≈ половина месяца.

---

## Топ-3 фикса (отдельные PR, не этот отчёт)

1. **Expected:** в `handleGetExpectedProfit` считать ПП через тот же `collectPpActualOut_` (или заполнить `revenueBySource.pp`). Потом тот же cutter-split + staff, что в месяце. Иначе «Посчитать» врёт оборот.
2. **Схема + полная корзина ПП:** scheme/wishes с листа ПП (`collectPpMoneyStats_.byKey`); recover/пакеты с **месячного** состава, не с доли слота 1.
3. **Разбивка затрат:** строка «Пакеты + фракции»; карточка Нарезчика — `enabledForMonth` + глобальный тумблер раздельно.

Не деплоить с отчётного PR #253. `Code.gs` там не патчился.

---

## Фиксы (PR после #253)

| # | Что | Статус |
|---|---|---|
| A1 | `handleGetExpectedProfit`: PP через `collectPpActualOut_`, cutter-split + `staffCost`, note RAW26 | в коде, ждать clasp |
| A2 | Схема из `collectPpMoneyStats_.byKey.wishes` (`resolvePpSchemeForStats_`) | в коде |
| A3 | Recover/пакеты с корзины листа ПП (`monthBasketForPpStats_`); N=2 factCost сразу (N с листа) | в коде |
| N=2 lock | Выручка + полный factCost один раз при pays-now на 1-й; слот 2 только `bySource.pp` | в коде |
| Cost=revenue | factCost только по `listPpMoneyClientKeys_` (тот же paysNow, что `collectPpActualOut_`). Unpaid N≥2 не в `costActual` / чистое. Счётчик доставок не фильтруем | в коде |
| A4 | `exportStats`: onlyPast/clean/recover/staff/split + `calendarRowPrice_` | в коде |
| B5 | Строка «Пакеты + фракции» | UI `v71115948` |
| B6 | Карточка Нарезчика: тумблер и `enabledForMonth` раздельно | UI |
| B7 | Кнопка «Экспорт TSV» + month/force | UI + worker не подменяет snap |
| B8 | Воронка `charts.bpStages` + compare + оборот | UI |
| B9 | Подпись «Затраты БП перешедших» | UI |
| C10 | `ADULT-COST-MODEL.md` / `COST-TABLE.md` | **нет в репо** — ссылки в `SUBSCRIPTION-PRICE.md` битые; цифры не выдумывали. Живые константы: `PP_RAW26_RECOVER_100_=3.90`, piece `0.50`, N=9/6 в `Code.gs` |

Тесты: `scripts/test-stats-cutter-recover.mjs`, `scripts/test-stats-expected-pp.mjs`, `scripts/test-stats-pp-n2-once.mjs`.

**Deploy:** merge в `main` → Action `clasp-deploy` ([DEPLOY.md](../../DEPLOY.md)). Не вставлять `Code.gs` в редактор. До зелёного Action UI на старом Script деградирует (нет `ppPackagesCost` / expected PP).
