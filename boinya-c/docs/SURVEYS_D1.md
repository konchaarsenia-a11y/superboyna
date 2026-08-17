# Опросники: cutover / полный D1

## Как работает сейчас (гибрид cutover)

| Шаг | Где |
|---|---|
| Список / сохранить / Отправлено / Отмена | Mini App → Worker → **GAS → лист «Опросник»** |
| Быстрый список в UI | D1 snap `listSurvey` (подтягивается после записи) |
| **Пуш в Telegram** | Только **Apps Script** `tickBpSurveyReminders_()` внутри `tickCuttingDeficit_` (раз в ~30 мин) |

Уведомление уходит ответственному (`ownerTelegramId`) с 9:00 до 21:00 **в его TZ** из листа «Доступы».
В сообщении кнопка «✅ Отправлено» (`svsent:<id>`).

## Что это значит при полном переезде на D1

Если выключить GAS и оставить только Worker+D1:

1. Список/галочки можно держать в D1 (sandbox `saveSurvey` уже пишет snap).
2. **Пуши в бота сами не появятся** — тик живёт в Apps Script и читает Sheets.
3. Нужно отдельно: Cloudflare Cron + `TELEGRAM_BOT_TOKEN` в секретах Worker (ещё не сделано).

Пока cutover: опросники и TG завязаны на GAS/Sheets. D1 — кэш для скорости.

## Баг, который чинили в Worker

`saveSurvey` через GET JSONP + `redirect:follow` на `/exec` иногда **дважды** выполнял doGet → дубли строк.
В Worker мутации опросников идут **POST** (`saveSurvey` / `deleteSurvey` / …).

## Тест `zzz_test`

Создавать: `saveSurvey` nick=`zzz_test`, kind=`bp2`, dueDate=сегодня, ownerTelegramId=ответственный.
Проверить пуш: ждать до 30 мин (окно 9–21 в TZ ответственного), смотреть бота.
«Отправлено» → статус `sent`, из активного списка пропадает, напоминания больше не шлются.
