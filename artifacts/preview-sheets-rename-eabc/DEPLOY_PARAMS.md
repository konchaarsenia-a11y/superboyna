# Isolated preview (NOT production)

| Resource | Value |
|---|---|
| Preview Worker | `boinya-c-preview-eabc` |
| Preview URL | https://boinya-c-preview-eabc.konchaarsenia.workers.dev |
| UI staging | https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&proxy=https%3A%2F%2Fboinya-c-preview-eabc.konchaarsenia.workers.dev |
| Preview D1 | `0ddccc42-3444-4adb-9c15-68925880b146` |
| Production Worker / D1 | `boinya-c` / `8ab3668c-…` — DO NOT TOUCH |
| Auth | `authMode=enforce` via preview-only `TELEGRAM_BOT_TOKEN` (not AUTH_ENFORCE=0; not copied from prod Worker) |
| UI Login Widget | **Отдельный тестовый бот** OK. Secrets только на preview: `TELEGRAM_BOT_TOKEN` (+ желательно `TELEGRAM_BOT_USERNAME`). BotFather `/setdomain` на **тестовом** боте → `konchaarsenia-a11y.github.io`. Prod secrets/bot не менять. |
| Sheets | `PREVIEW_ISOLATED=1` → in-process stub; never prod GAS_ORIGIN fallback |
| Crons / KV / R2 / queues | none |

## Proofs (не путать)

- `finishFullWeek` + `sheets:false` / `fromD1` = **D1 close** (`closeWeekInD1_`), не Sheets-write gate.
- Sheets gate E2E: non-finish → `sheets_finish_only`; `finishFullWeek*` via `gasProxy_` → `previewStub` (см. `sheets-stub-contract.json`).

Matrix: `artifacts/preview-live-matrix2/MATRIX.md`
