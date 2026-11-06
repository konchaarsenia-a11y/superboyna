## auth-h3 (2026-11-06)

Git `126c61e3` · marker `sheets-finish-only-h3` · `/ui?v=auth-h3`  
Live blocker: `ping.botMe=fail:Not Found` (preview `TELEGRAM_BOT_TOKEN` invalid) — Widget Accept cannot verify until secret refreshed for `@BoinyaTest_bot` / `9204491282`.  
Exact finish E2E: still waiting owner Login. sheets-finish-only CI: pass on PR.

## Staging UI (2026-11-06)

**URL:** `https://boinya-c-preview-eabc.konchaarsenia.workers.dev/ui`  
**SHA:** `14467514` · loginDomain `boinya-c-preview-eabc.konchaarsenia.workers.dev` · marker `sheets-finish-only-h2`  
Pages+proxy **не** использовать (prod session). Exact finish E2E ждёт Login.

# Preview matrix (strict)

| Check | Result |
|---|---|
| auth enforce, spoof rejected | **PASSED** |
| stranger write denied (`no_access`) | **PASSED** |
| owner signed initData (API HMAC) | **PASSED** |
| UI Telegram Login Widget | **NOT_VERIFIED** (URL ready: `@BoinyaTest_bot` via `?proxy=preview-eabc`; ждём реальный клик) |
| rename no deleted+insert | **PASSED** |
| rename stable `clients.id` | **PASSED** |
| rename `match_key` updated | **PASSED** |
| rename no client duplicate | **PASSED** |
| move single active row | **PASSED** |
| move reload read-back | **PASSED** |
| Sheets banned (non-finish → `sheets_finish_only`) | **PASSED** |
| Sheets finish* → preview stub (`finishFullWeekProbe`) | **PASSED** (≠ exact E2E) |
| finishFullWeek D1 `sheets:false` / `fromD1` | **PASSED** (D1 close only — **не** Sheets-write proof) |
| Owner UI Login Widget auth-h10 | **PASSED** (Заказы/Ещё) |
| Exact UI `finishFullWeek` → D1 + stub `d1-sheets` | **WAITING** browser (week `2026-11-02` open) |
| preview ≠ prod D1 binding | **PASSED** |
| CI tip `7957dca0` | **PASSED** (13 success, 0 fail) |

- SHA tip: `7957dca0` · live checks on preview Worker with enforce auth + `planClientNickRenameKeep_`
- Preview D1: `0ddccc42-3444-4adb-9c15-68925880b146`
- Prod D1: `8ab3668c-a654-432c-9ebd-a1ac5c4db800` (untouched)
- Auth: `authMode=enforce`, **no** `AUTH_ENFORCE=0`
- Stub contract JSON: `artifacts/preview-live-matrix2/sheets-stub-contract.json`

## Разделение finish vs stub

| Что | Что доказывает | Что НЕ доказывает |
|---|---|---|
| `finishFullWeek` → `sheets:false`, `fromD1`, `weekCloseCanon=d1-only` | закрытие недели в D1 (`closeWeekInD1_`) | единственный разрешённый Sheets-write |
| `mirrorSheetClients` → `sheets_finish_only` + `finishFullWeekProbe` → `previewStub` | gate `gasProxy_` (non-finish skip / finish* stub, без prod GAS) | UI Login Widget |

## UI staging

https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1&proxy=https%3A%2F%2Fboinya-c-preview-eabc.konchaarsenia.workers.dev

## Login Widget — тестовый бот (не production)

Да: preview UI поддерживает **отдельный тестовый** Telegram-бот. Штатный путь: Login Widget → hash → `verifyTgInitData_` тем же `TELEGRAM_BOT_TOKEN`, что в secrets preview Worker. Production Worker / prod bot token **не трогать**.

**Минимальный шаг:** создать/взять test-бота в BotFather → у него `/setdomain` = `konchaarsenia-a11y.github.io` → в CF Dashboard → Worker `boinya-c-preview-eabc` → Secrets выставить поля ниже (токен — только через секрет, не в чат).

| Secret / поле | Нужно? | Куда |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **да** | только preview Worker; токен **тестового** бота |
| `TELEGRAM_BOT_USERNAME` | желательно | username тестового бота без `@` (`data-telegram-login`) |
| `OWNER_TELEGRAM_IDS` | уже есть (`650923866`) | var preview; ваш Telegram id для owner |
| BotFather `/setdomain` | **да** | на **тестовом** боте → `konchaarsenia-a11y.github.io` |

Синтетическая HMAC initData для API = **не** UI Login. Deep-link `gbi_` на preview без webhook тестового бота не считать входом.

## Counts

Before seed: orders=2, clients=`cli_zzz_preview`,`cli_zzz_future`.  
After rename+move read-back: Mon=[], Wed=`zzz_preview_renamed`/`ZZZ_PREVIEW_RENAMED`, Tue=`zzz_preview_b`.  
After finish D1: orders_active=3, deleted=0; `cli_zzz_preview` keepId with `ZZZ_PREVIEW_RENAMED`; `week_finished:2026-11-02=1`.

See `matrix.json` / `sheets-stub-contract.json` for payloads.
