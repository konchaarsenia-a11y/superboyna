# #718 exact finishFullWeek (preview) — D1 then Sheets write-only

## Канон (production-candidate, без preview-only green)

При `WEEK_CLOSE_CANON=d1-sync` / `isWeekCloseD1Native_`:

1. `closeWeekInD1_` — закрытие в D1
2. один разрешённый `gasProxy_('finishFullWeek', { fromD1Close:1, d1Report… })` — write-only в Sheets
3. ответ: `weekCloseCanon=d1-sheets`, `fromD1=true`

На preview (`PREVIEW_ISOLATED=1`) шаг 2 = stub (`previewStub=true`, `sheetsWritten=false`, **без** prod GAS).  
Это проверяет wiring; live Sheets — после merge `Code.gs` `handleFinishFullWeekFromD1_` + clasp на main (сейчас production deploy запрещён).

## Не green раньше

`finishFullWeek` → только `closeWeekInD1_` (`sheets:false`, `weekCloseCanon=d1-only`) ≠ Sheets-write proof.  
`finishFullWeekProbe` → stub ≠ exact finish.

## E2E статус (2026-11-06 auth-h10)

| Шаг | Статус |
|---|---|
| Code: D1→fromD1Close Sheets path + unit tests | DONE |
| Staging `/ui` + auth ns + botMe=ok | DONE |
| Owner Login Widget (same session) | **GREEN** (Заказы/Ещё) |
| Artificial week open for exact | **READY** Пн=`2026-11-02` (`week_finished` empty, banner `finished=false`, 1 active order) |
| Exact finish under UI button | **WAITING** browser «Завершить»×2 |
| Production Worker / Pages / bot domain | **не трогаем** |

### Не засчитывать

- `finishFullWeekProbe` / `previewSheetsContract` — stub contract ≠ exact
- `finishFullWeek` → только `weekCloseCanon=d1-only` / `sheets:false` без stub step
- `week_already_finished`

### UI сценарий (владелец)

1. `https://boinya-c-preview-eabc.konchaarsenia.workers.dev/ui?v=auth-h10` — тот же verified owner
2. Заказы → баннер «Неделя ещё открыта» → **Завершить** → confirm ×2
3. Action: **`finishFullWeek`** (`confirm=1`, `allowDanger=1` cutover) — не probe

### CF before → after (exact green)

| Key | Before | After |
|---|---|---|
| meta `week_finished:2026-11-02` | absent | `1` |
| snap `weekDayCounts` Monday | `2026-11-02` | `2026-11-09` |
| snap `weekBanner` | `finished=false`, `weekKey=2026-11-02` | `finished=true`, `weekCloseCanon=d1-sheets`, `sheetsOk=true` |
| snap `previewGasStub:last` | not `finishFullWeek` | `action=finishFullWeek`, `external=false` (ровно один finish stub) |
| meta `sheet_calls` | N | N+1 (previewStub:finishFullWeek) |
| UI/API body | — | `status=success`, `message=week_closed`, `weekCloseCanon=d1-sheets`, `previewStub=true`, `sheetsResult.fromD1Close=true`, `sheetsWritten=false` |
