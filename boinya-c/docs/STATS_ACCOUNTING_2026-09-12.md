# Канон статистики (2026-09-12)

Владелец: Арсений. Не путать с **ценой клиенту** (`computePpFactFromCost_` RAW26/LEGACY).

## Что в затратах (`costActual` / `fact.cost`)

| Статья | В затратах | В чистом |
|---|---|---|
| Сырьё / пакеты | да | — |
| Recover (3.90/100г + 0.50/шт) или LEGACY +11 | только если нарезчик **ON** | если нарезчик **OFF** → `ppRecoverInClean` |
| Фракции дрессуры | нет | `ppFractionInClean` |
| Доставка ПП | топливо **4×N** (`ppDeliveryFuelCost` / `ppDeliveryCost`) | остаток тарифа: RAW26 **5×N**, LEGACY **2×N** (`ppDeliveryInClean`) |
| Доставка БП | топливо **4×N** | **2×N** (`bpDeliveryInClean`) |
| Плоская ЗП нарезчика (`Stats_Сотрудники` id=`cutter`) | **нет** | зарплата = recover |
| Другие сотрудники листа | да, если есть | — |

`clean = оборот − costActual` после сплитов.

## Что не менять

- Тариф клиенту: RAW26 **9×N**, LEGACY **6×N**, БП **+6**. Формулы цены не трогаем.
- LEGACY только у немигрированных ПП (scheme-based).
- N=2: полный факт один раз на pays-now слот 1; слот 2 — только счётчик доставок.

## Поля API (`getStats` / expected / export)

`ppDeliveryCost` = топливо 4×N (то же `ppDeliveryFuelCost`).  
`ppDeliveryInClean`, `ppDeliveryTariffCost`, `ppFractionInClean`, `bpDeliveryInClean`, `staffCostExcludesCutter`, `cutterExcludedSalary`.

Кэш GAS: `STATS24:{YYYY-MM}`. Deploy: clasp на merge в `main` (`DEPLOY.md`).
