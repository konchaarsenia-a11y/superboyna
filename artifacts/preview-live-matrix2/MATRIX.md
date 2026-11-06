# Preview matrix (strict)

| Check | Result |
|---|---|
| auth enforce, spoof rejected | **PASSED** |
| stranger write denied (`no_access`) | **PASSED** |
| owner signed initData | **PASSED** |
| UI Telegram Login Widget | **NOT_VERIFIED** |
| rename no deleted+insert | **PASSED** |
| rename stable `clients.id` | **PASSED** |
| rename `match_key` updated | **PASSED** |
| rename no client duplicate | **PASSED** |
| move single active row | **PASSED** |
| move reload read-back | **PASSED** |
| Sheets banned before finish | **PASSED** |
| finishFullWeek D1 `sheets:false` | **PASSED** |
| preview ≠ prod D1 binding | **PASSED** |
| CI tip `7957dca0` | **PASSED** (13 success, 0 fail) |

- SHA tip: `7957dca0` · live checks on preview Worker with enforce auth + `planClientNickRenameKeep_`
- Preview D1: `0ddccc42-3444-4adb-9c15-68925880b146`
- Prod D1: `8ab3668c-a654-432c-9ebd-a1ac5c4db800` (untouched)
- Auth: `authMode=enforce`, **no** `AUTH_ENFORCE=0`

## UI staging

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&proxy=https%3A%2F%2Fboinya-c-preview-eabc.konchaarsenia.workers.dev

**Для штатного Login Widget:** CF Dashboard → Worker `boinya-c-preview-eabc` → Secrets → `TELEGRAM_BOT_TOKEN` = токен бота Бойни **вручную** (не копировать из production Worker). BotFather `/setdomain` → `konchaarsenia-a11y.github.io`.

## Counts

Before seed: orders=2, clients=`cli_zzz_preview`,`cli_zzz_future`.  
After rename+move read-back: Mon=[], Wed=`zzz_preview_renamed`/`ZZZ_PREVIEW_RENAMED`, Tue=`zzz_preview_b`.  
After finish D1: orders_active=3, deleted=0; `cli_zzz_preview` keepId with `ZZZ_PREVIEW_RENAMED`; `week_finished:2026-11-02=1`.

See `matrix.json` for full payload.
