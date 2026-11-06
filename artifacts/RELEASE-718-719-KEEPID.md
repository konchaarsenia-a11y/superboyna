# Production candidate: #718 + #719 + surgical #19 clients keepId

## What / why

| Piece | Why |
|---|---|
| #718 sheets-finish-only | D1 reads; Sheets only `finishFullWeek*` |
| #718 exact finish | `closeWeekInD1_` → `gasProxy_(finishFullWeek, fromD1Close)` → `weekCloseCanon=d1-sheets` + `Code.gs` `handleFinishFullWeekFromD1_` |
| #719 #19/#23 orders | in-place `UPDATE` same order row (rename/move PK) |
| surgical #19 clients | `planClientNickRenameKeep_` + aliases → same `clients.id` (live: `c_180e5f34`) |
| surgical match_key | `mergeOrderRowsKeepNonEmpty_` takes new match_key on client rename |

## Explicitly excluded

Preview/auth #721 and preview-only #720: `PREVIEW_ISOLATED`, stubs, AUTH gate, tidFp, logout, `/ui` staging, wrangler.preview, preview bundles, ACL/env/token/bindings.

## Rollback

1. Revert this PR commit(s) on `main` (or redeploy previous Worker version + previous `Code.gs` clasp).
2. Env: `SHEETS_FINISH_ONLY=0` / `SHEETS_MODE=mirror` restores pre-finish-only reads if needed.
3. Official backup already exists — do not re-run production test mutations.

## Deploy scope (after green CI + owner «да»)

1. Merge this PR → `main`
2. Worker deploy (existing CI/worker-deploy path) — **production Worker only**
3. clasp-deploy `Code.gs` (`handleFinishFullWeekFromD1_`) via Action on `main`
4. No preview Worker/D1; no ACL/secret changes; no `finishFullWeek` smoke on live clients
