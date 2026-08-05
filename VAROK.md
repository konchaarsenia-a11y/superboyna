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

Управление — вкладка **Партнёры** в конвейере Бойни (owner, long-press Заказ → Партнёры).  
Во `varka/` кнопки владельца нет — только партнёр.

| Лист | Что |
|------|-----|
| `Partner_Networks` | Сети (Varka, NaN, …) |
| `Partner_Points` | Точки сети |
| `Partner_Access` | Доступ: `@username` / Telegram ID → точки |

API (`Code.gs`): `partnerListAdmin`, `partnerGetMe`, `partnerSaveNetwork`, `partnerSavePoint`, `partnerSaveAccess`, `partnerRevokeAccess`, `partnerSeedDefaults`.

Мини-апп читает тот же webhook Бойни (`partnerGetMe` по Telegram username).

Не путать с листом **«Партнёры»** (источник БП во вкладке Доступы).

Уведомления заказов в бота Бойни и вкладка «Отложенные» — **отдельным этапом**.

---

## Поток

```
Telegram @username → partnerGetMe → свои точки
  → кабинет / заказ (каталог → точка) / история
```

Демо без TG: на экране входа выбрать профиль `@varka_two` и т.п.

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
- [ ] Пуш заказов в Бойню / Отложенные
- [ ] `/start` с кнопкой Web App
