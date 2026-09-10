# Apps Script deploy (clasp CI)

Live Boinya backend is Google Apps Script. The editor file is named **Код**; git keeps it as `Code.gs`.

Канон файла (патч, не replace): [CODE_GS_CANON.md](./CODE_GS_CANON.md).

## What agents do

1. Change `Code.gs` on a branch, open a PR, **merge to `main`**.
2. GitHub Action `clasp-deploy` pushes to the existing Apps Script project and updates the existing webapp deployment.
3. **Do not** ask Arseniy (or anyone) to paste `Code.gs` into Script Editor.
4. **Do not** create a new webapp deployment — that would change the `/exec` URL.

Webhook (unchanged when CI updates the existing deployment):

`https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec`

Manual paste is emergency-only (secret missing, Action red). See `ИНСТРУКЦИЯ.md`.

## Secret: `CLASPRC_JSON` (once)

Repo **Settings → Secrets and variables → Actions → New repository secret**.

| Name | Value |
|------|--------|
| `CLASPRC_JSON` | Entire contents of `~/.clasprc.json` (one JSON object) |

**Grok Bot / КЕНТ GB** already has a local clasprc. Copy that file into the secret. Do not commit it. Do not paste tokens into git, PRs, or chat.

`CLASPRC_JSON` must come from **clasp 3.x** (same major as CI, currently `@google/clasp@3.4.1`). clasp 2.x cannot read the 3.x token shape `{tokens:{default:...}}` and fails at `clasp pull` with `Cannot read properties of undefined (reading 'access_token')`.

If you need a fresh login (on a trusted machine, not in this repo):

```bash
npx @google/clasp@3.4.1 login
# scopes must include script.projects + script.deployments
cat ~/.clasprc.json   # paste into the GitHub secret, then delete the terminal scrollback
```

Typical clasp scopes: `script.projects`, `script.deployments`, `drive.metadata.readonly`, `logging.read`, `userinfo.email`.

## What CI does (and why pull first)

`clasp push` of only `Code.gs` from the git root would **delete** remote files that are not in git (for example `index.html` in the Apps Script project).

Safe path used by `.github/workflows/clasp-deploy.yml`:

1. Write `~/.clasprc.json` from the secret.
2. `clasp pull` into a temp dir with `scriptId` from `.clasp.json`.
3. Overlay pulled **Код.js** (or `Code.js`) with repo `Code.gs`. Keep pulled `appsscript.json` and every other remote file.
4. `clasp push --force`
5. `clasp deploy -i AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7`

Repo `appsscript.json` is a timezone/runtime stub (`Europe/Minsk`, V8). CI does **not** push that stub over the live manifest (no invented OAuth scopes).

Never run `clasp push` from the repository root. Root `.claspignore` ignores `*` on purpose.

## After the first green run

Cursor Cloud Agents only need to merge `Code.gs` to `main`. Watch the `clasp-deploy` Action; if it fails on auth, refresh `CLASPRC_JSON`.
