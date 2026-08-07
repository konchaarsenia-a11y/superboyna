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

API (`Code.gs`): `partnerListAdmin`, `partnerGetMe`, `partnerSubmitOrder`, `partnerListMyOrders`, `partnerSaveNetwork`, `partnerSavePoint`, `partnerSaveAccess`, `partnerRevokeAccess`, `partnerSeedDefaults`, `partnerSetNotifyRecipients`.

**Prod v3+:** демо-вход выключен.  
- Владелец Бойни → все точки в мини-апп  
- Партнёр / сотрудник → только `pointIds` из `Partner_Access`  
- Админка — вкладка **Партнёры** в Бойне  

После Deploy: `PARTNER_PROD_V3` / `V4` / `V7` (V7 снимает тестовый Access у `@one_more_person_228` — он обычный owner).

Ответственные за пуши: Script Property `PARTNER_ORDER_NOTIFY_IDS`.

Не путать с листом **«Партнёры»** (источник БП во вкладке Доступы).

---

## Поток

```
Telegram → partnerGetMe
  → владелец Бойни → все точки
  → иначе Partner_Access → только pointIds
  → кабинет / заказ / история
```

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
- [x] **v3.0.8:** как было — owner first (все точки); `@one_more_person_228` обычный owner; allowlist/тест-Access сняты (`PARTNER_PROD_V7`) · **Pages** · **нужен Deploy Code.gs**
- [~] Пуш заявок получателям из Партнёры→Пуши (`PARTNER_ORDER_NOTIFY_IDS`) — в коде, нужен Deploy + настройка списка
- [ ] `/start` с кнопкой Web App
- [ ] Вкладка «Отложенные» в Бойне под заявки партнёров
