# BLOCKER: monthly economics vs basket1-only fact (sub37)

## Вердикт

**Не сохранять split сейчас.** Факт/экономика карточки считают **только `card.basket` (доставка1)**, не `basket+basket2`.

Код (`boinya-c/next/clients.js`):

```js
function cardBasketList_() {
  /* Как econ(): себес одной доставки; N учитывается формулой (+7.60×N), не суммой двух слотов. */
  return card ? (card.basket || []).slice() : [];
}
```

Сейчас у sub37 в `basket` лежит **полный месячный** состав → факт ~145.43 / указанная 145 при N=2, coef 2.3, пакеты U1=0 U2=4 U3=6 УП4=2.

Если записать half в `basket` и half в `basket2`:

1. Правка состава → `scheduleCardPpRecalc_({ basketChanged: true })` → `priceDirty`
2. `saveCard()` при `priceDirty` зовёт `refreshCardPpPrice_({ force: true })` с **overwriteStated по умолчанию**
3. `liveCalc`/`quotePp` идут по **половине** сырья + recover с половины + те же 7.60×N и пакеты карточки
4. **Указанная/факт уедут вниз** (не «месячная» экономика). Формулу скрыто не меняем.

Сообщение клиенту наоборот конкатит `basket+basket2` — это другой путь, не факт карточки.

## Что нельзя делать

- Сохранять split, пока не зафиксирован безопасный путь **без** пересчёта stated/fact/пакетов
- Скрыто менять `cardBasketList_` / формулу «чтобы сошлось»

## Что можно без записи

- Backup + payload mapping (ниже)
- Artificial harness PR723 на копии составов (suggest/slots), без production save

## Условие снятия blocker (отдельное решение владельца)

Либо явный safe-save: правка только basket/basket2, **жёстко** оставить statedCost=145, calcFactCost как было, packCounts, coef, без `refreshCardPpPrice_` overwrite;  
либо отдельный канон «факт = basket1+basket2» — это **смена бизнес-модели**, не этот шаг.
