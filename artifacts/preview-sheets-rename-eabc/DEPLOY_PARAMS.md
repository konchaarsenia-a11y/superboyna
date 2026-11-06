# Isolated preview deploy params (NOT production)

| Resource | Value |
|---|---|
| Account | `390357cec5b74985576a04dbc68d5694` |
| Worker script name | `boinya-c-preview-eabc` (MUST NOT be `boinya-c`) |
| Preview D1 name | `boinya-c-preview-eabc` |
| Preview D1 UUID | `0ddccc42-3444-4adb-9c15-68925880b146` |
| Production D1 UUID | `8ab3668c-a654-432c-9ebd-a1ac5c4db800` — **DO NOT BIND** |
| Bundle | `artifacts/preview-sheets-rename-eabc/worker.bundle.js` |
| Metadata | `artifacts/preview-sheets-rename-eabc/metadata.json` |
| Schema | `artifacts/preview-sheets-rename-eabc/schema.sql` |
| Seed | `artifacts/preview-sheets-rename-eabc/seed-artificial.sql` (artificial only) |
| Auth preview | `AUTH_ENFORCE=0` + `telegramId=650923866` (preview Worker only; production unchanged) |
| Sheets | `SHEETS_MODE=finish-only`, `GAS_ORIGIN=""` (no Sheets/GAS) |
| Crons | none |
| Secrets | none copied from production |

Branch code: `cursor/preview-sheets-rename-eabc` = #718 + #719 combined.
