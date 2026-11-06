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

## E2E статус

| Шаг | Статус |
|---|---|
| Code: D1→fromD1Close Sheets path + unit tests | DONE (ветка) |
| Staging `/ui` separate origin + auth ns | DONE |
| Inherit `TELEGRAM_BOT_TOKEN` / DB preview | KEEP |
| Exact finish under owner Login (test bot) | **WAITING** login на staging URL |
| Production Worker / Pages / bot domain | **не трогаем** |
