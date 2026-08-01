# Бойня FAST

Параллельная быстрая копия. **Прод `app.html` / `Code.gs` не трогаем.**

## Открыть (рабочая ссылка)

GitHub Pages сейчас часто залипает на билде — используйте **jsDelivr** (отдаёт прямо из git):

**https://cdn.jsdelivr.net/gh/konchaarsenia-a11y/superboyna@main/fast/**

Должен быть бейдж **FAST**. Счётчики дней и списки клиентов — из `data/*` **сразу**, без ожидания Google.

Запасная (Pages, когда оживёт):  
https://konchaarsenia-a11y.github.io/superboyna/fast/

## Почему раньше «не быстрее»

Снапшоты писались в localStorage, а `apiGet` их **не читал** и каждый раз ждал GAS 3–7 с.  
С **f3/f4** `getClients` / `getWeekDayCounts` отвечают из CDN мгновенно, GAS только фоном.

## Важно

Открывайте именно FAST-URL. Обычная кнопка бота → прод → там по-прежнему медленный GAS.
