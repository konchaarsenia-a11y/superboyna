# #718 vs exact finishFullWeek (preview)

## Факт

При `WEEK_CLOSE_CANON=d1-sync` → `isWeekCloseD1Native_` → exact `finishFullWeek` идёт в `closeWeekInD1_`.

**Production-эквивалент этого канона: GAS/Sheets при finish не вызываются.**  
Это **не green** для формулировки #718 «Sheets пишутся (только) при Завершить неделю» — путь записи в Sheets на finish мёртв, gate `sheets_finish_only` разрешает finish*, но d1-native его не вызывает.

`finishFullWeekProbe` → `previewStub` ≠ exact finish.

## Preview-only доводка (без ослабления production gate)

На `PREVIEW_ISOLATED=1` exact `finishFullWeek` теперь:

1. `gasProxy_('finishFullWeek')` → stub (`previewSheetsGate.previewStub=true`, `sheetsWritten=false`)
2. затем реальный `closeWeekInD1_`

`issue718`: `preview_stub_ok_but_d1_native_still_no_real_sheets` — stub gate exercised, real Sheets всё равно не пишутся.

## E2E статус

| Шаг | Статус |
|---|---|
| Reseed artificial week Mon `2026-11-02`, `week_finished` cleared | DONE |
| Deploy preview Worker with gate + inherit `TELEGRAM_BOT_TOKEN` | DONE |
| Exact finish under owner Login (test bot HMAC) | **WAITING** — агент не извлекает live token; ephemeral HMAC → `bad_hash` |
