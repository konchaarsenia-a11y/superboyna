# Code.gs Canon / Канон `Code.gs`

**Один файл. Один источник правды. Патч, не подмена.**

Правило для агентов: [`.cursor/rules/code-gs-canon.mdc`](./.cursor/rules/code-gs-canon.mdc) (`alwaysApply: true`).  
Паттерны API: [`.cursor/rules/apps-script.mdc`](./.cursor/rules/apps-script.mdc).  
Сниппеты: [MERGE_GOODBOY_GB.md](./MERGE_GOODBOY_GB.md), [MERGE_NATIVE_AUTH.md](./MERGE_NATIVE_AUTH.md).  
Деплой на Script: [DEPLOY.md](./DEPLOY.md) (CI `clasp-deploy` на `main`).

---

## Source of truth / Источник правды

Корневой [`Code.gs`](./Code.gs) на ветке **`main`** (или на **tip стартовой ветки** PR) — **единственный** бэкенд Apps Script для деплоя.

| Это | Не это |
|-----|--------|
| Один файл в git → merge в `main` → CI clasp заливает «Код» | Отдельные «полные Code.gs» у Бойни / Goodboy / native |
| Сниппеты и `MERGE_*.md` — как влить кусок | Файлы для деплоя вместо корневого `Code.gs` |
| Surgical diff поверх актуального tip | Копия с другой машины, чата, агента, Mac/Win |

Чат агента может называть «мой Code.gs» контур Бойни, `gb*` или `gbi_`. Это **модули внутри одного файла**, не три деплоя.

---

## Contours vs snippets / Контуры ≠ отдельные файлы

| Контур | Где живёт в git | Как попадает в Script |
|--------|-----------------|------------------------|
| Бойня (заказы, нарезка, склад, неделя, people/week canon) | корневой `Code.gs` | это и есть файл |
| Goodboy кабинет `gb*` | [`goodboy/CODE_GS_GOODBOY.snippet.gs`](./goodboy/CODE_GS_GOODBOY.snippet.gs) + [MERGE_GOODBOY_GB.md](./MERGE_GOODBOY_GB.md) | влить в актуальный `Code.gs` |
| Native GBI `gbi_` | [`native/CODE_GS_NATIVE_AUTH.snippet.gs`](./native/CODE_GS_NATIVE_AUTH.snippet.gs) + [MERGE_NATIVE_AUTH.md](./MERGE_NATIVE_AUTH.md) | влить в актуальный `Code.gs` |
| Varka | `varka/` (свой Script позже) | **не** писать в корневой `Code.gs` / `app.html` Бойни |

Сниппет — патч. Деплой — всегда **текущий** корневой `Code.gs` из git после merge.

---

## NEVER / Никогда

- **Не** вставлять и **не** заменять весь `Code.gs` копией с другой машины, ветки-отставания, чата, Cloud/IDE-агента, Mac↔Win.
- **Не** просить владельца «вставь мой Code.gs целиком» вместо патча.
- **Не** считать сниппет Goodboy/native полным бэкендом для Deploy.
- **Не** откатывать чужие handlers, чтобы «проще влить свой кусок».
- **Не** деплоить Apps Script из редактора «от себя» и **не** выдумывать URL `/exec`. Живой Deploy — Action `clasp-deploy` на `main` ([DEPLOY.md](./DEPLOY.md)).

Исключение для человека: аварийный paste `Code.gs` с `main` в Script Editor, **только** если CI красный / нет секрета `CLASPRC_JSON`. Это tip `main`, не «чужая копия».

---

## ALWAYS / Всегда

1. **Прочитать текущий** `Code.gs` с `main` (или tip ветки, от которой стартовал PR) **до** правок. `git pull` / sync. Не править по памяти и не по файлу из прошлого чата.
2. Править **точечным diff** **или** влить сниппет по инструкции `MERGE_*.md` (роуты + функции; без дублей, если уже есть).
3. **Сохранить** существующие обработчики:
   - заказы / CRM / неделя (`saveOrder`, `moveClient`, `deleteClient`, materialize, week close)
   - нарезка, склад, доставки, подписки, просмотр
   - people canon / week-calendar (D1 + фон GAS; см. `boinya-c/docs/PEOPLE_CANON.md`, `WEEK_CALENDAR_CANON.md`)
   - Goodboy `gb*` (allowlist `isGoodboyAction_`; запись только в `GB_*`; CRM/календарь — чтение)
   - native `gbi_` (`/start gbi_<token>`, `getNativeLinkInfo`, `pollNativeAuth`, лист **Доступы** / `getMyAccess`)
4. Согласовать имена `action` с `app.html` / `PROJECT.md`, если меняется API конвейера.
5. Commit + push патча / merge в `main`. CI clasp зальёт Script. **Не** просить вставить `Code.gs`. Галочка в `TZ.md`: `[~]` до зелёного Action (или «задеплоил»).

---

## How to merge / Как вливать

```
git fetch origin main
# взять актуальный Code.gs (main или tip своей ветки после rebase/merge main)
# открыть сниппет + MERGE_*.md
# вставить ТОЛЬКО указанные куски (doGet / handleApiAction / хелперы / конец файла)
# не удалять соседние ветки if (action === …)
```

Конфликт: **оставить поведение `main`**, затем заново наложить сниппет. Не резолвить «взять целиком нашу версию файла».

---

## Deploy

| Кто | Что |
|-----|-----|
| Агент | патч в git; merge в `main`; **не** ходить в Script Editor; **не** менять webhook URL без факта нового Deploy |
| CI | `clasp-deploy`: pull → overlay `Code.gs`→«Код» → push → update существующего webapp ([DEPLOY.md](./DEPLOY.md)) |
| Владелец | один раз секрет `CLASPRC_JSON`; аварийный paste — только если Action красный |
| После Deploy | зелёный Action / «задеплоил» → агент `[~]` → `[x]` в `TZ.md`; при смене `/exec` — обновить `PROJECT.md`, `app.html`, правило `superboyna.mdc` |

Агент **не выдумывает** `/exec` и не закрывает неделю (`finishFullWeekProduction`) без явного ОК.

---

## Humans in Cursor / Человек в Cursor

Чтобы не затереть параллельного агента:

1. Sync / `git pull origin main` **до** правок `Code.gs`.
2. Менять только нужные функции/роуты; не вставлять файл из Downloads, Telegram, другого чата.
3. Если IDE предлагает «принять весь файл» при merge — **нет**. Keep `main`, затем снова влить сниппет.
4. Goodboy/native: следовать `MERGE_*.md`, не «заменить Code.gs версией только с gb*/gbi_».
5. После merge в `main` — CI clasp; локальный Script без зелёного Action ≠ то, что в git.

---

## Checklist before editing Code.gs

- [ ] Файл прочитан с актуального tip, не из старого контекста чата
- [ ] Правка — diff или сниппет, не replace-all
- [ ] На месте: заказы, нарезка, склад, people/week, `gb*`, `gbi_`
- [ ] Varka не попала в этот файл
- [ ] Deploy = CI clasp на `main` ([DEPLOY.md](./DEPLOY.md)); не просить вставить `Code.gs`
