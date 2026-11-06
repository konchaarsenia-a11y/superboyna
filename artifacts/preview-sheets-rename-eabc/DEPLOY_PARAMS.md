# Isolated preview (NOT production)

| Resource | Value |
|---|---|
| Preview Worker | `boinya-c-preview-eabc` |
| Preview URL | https://boinya-c-preview-eabc.konchaarsenia.workers.dev |
| Preview D1 | `boinya-c-preview-eabc` / `0ddccc42-3444-4adb-9c15-68925880b146` |
| Production Worker | `boinya-c` — **DO NOT MODIFY** |
| Production D1 | `8ab3668c-a654-432c-9ebd-a1ac5c4db800` — **DO NOT BIND** |
| Account | `390357cec5b74985576a04dbc68d5694` |
| Bundle | `artifacts/preview-sheets-rename-eabc/worker.bundle.js` |
| Metadata | `artifacts/preview-sheets-rename-eabc/metadata.json` |
| Schema | `artifacts/preview-sheets-rename-eabc/schema.sql` |
| Auth preview | `AUTH_ENFORCE=0` + owner `telegramId=650923866` (preview only) |
| Sheets | `SHEETS_MODE=finish-only`, `GAS_ORIGIN=""` |
| Crons / KV / R2 / queues / secrets from prod | none |

Branch: `cursor/preview-sheets-rename-eabc` = #718 + #719 + match_key merge fix.
Live matrix: `artifacts/preview-live-matrix/MATRIX.md`
