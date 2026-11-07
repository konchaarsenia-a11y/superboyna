# t448u — месячный fact = basket1+basket2 (N≥2)

## Что изменено (узко)

`boinya-c/next/clients.js`:
- `cardBasketList_()` — при N≥2 склеивает `basket`+`basket2` для fact/quote; при N=1 только `basket` (stale2 игнор).
- `cardOverwriteStated_()` + save `overwriteStated: false` — указанная клиента не затирается при refresh fact после split/состава; coefTouched по-прежнему может обновить указанную.

Формула RAW26 / coef / пакеты / 7.60×N **не менялись**.

## Проверено (artificial sub37 copy)

| Проверка | Результат |
|---|---|
| Monthly before split @ coef 2.3, packs 0/4/6/2 | fact **145.43** |
| After split 1+2 same raw | fact **145.43** |
| Stated | **145** неизменна |
| Half-only (старый баг) | 111.87 ≠ monthly |
| N=1 + stale basket2 | monthly list = basket1 only |
| PR723 suggest slot1/2 | целые корзины, без half |
| Odd (колени 1) | слот1=1, слот2=0 |
| Harness | 6/6 pass |

## Не проверено / не сделано

- Browser production save sub37 — **ждёт ваш UI save + read-back**
- Остальные 7 карточек migrate
- Merge/deploy в prod runtime

## Безопасный порядок релиза

1. **Сначала** этот UI-fix (`cardBasketList_` sum) — на legacy N2 с пустым basket2 поведение = как раньше (sum = basket1).
2. **Потом** staff split+save первых 8 (с UI, где уже sum) — fact не падает с половины; stated/coef/packs не трогаем.
3. **Не** выкатывать per-delivery suggest как единственный путь заказов, пока legacy без basket2 не разложены (ПП2 будет пустым / legacy flag) — либо мигрировать 8 до опоры на per-delivery в проде заказов.
4. Merge PR723 после green harness + ваш read-back first-client.

Запрещено: сохранять split на старом UI (basket1-only fact) — half→~111 и priceDirty overwrite.
