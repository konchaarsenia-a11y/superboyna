// Сухой дайджест себеса на 1 ноября. Ничего не пишет и не шлёт.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { costDigestText_ } from "../boinya-c/proxy/cost-digest.js";

const root = dirname(fileURLToPath(import.meta.url));
const proxy = join(root, "..", "boinya-c", "proxy");
const outDir = process.env.COST_DIGEST_OUT || join(root, "..", "artifacts", "cost-digest-dry");
const MONTH = "2026-10";

function parseWrangler(text) {
  const raw = String(text || "");
  const at = raw.search(/[\[{]/);
  if (at < 0) throw new Error("wrangler: нет json");
  return JSON.parse(raw.slice(at));
}

function d1(sql) {
  const run = spawnSync(
    "npx",
    ["--yes", "wrangler@4", "d1", "execute", "boinya-c", "--remote", "--json", "--command", sql],
    { cwd: proxy, encoding: "utf8", env: process.env, maxBuffer: 8 * 1024 * 1024 }
  );
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "d1").slice(-400));
  }
  const parsed = parseWrangler((run.stdout || "") + "\n" + (run.stderr || ""));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return (block && block.results) || [];
}

const rows = d1(
  "SELECT sku, cost, shrink, effective_from FROM raw_cost_ver WHERE effective_from >= '2026-10-01' AND effective_from < '2026-11-01' ORDER BY effective_from, id"
);
const changes = rows.map(function (row) {
  return {
    sku: String(row.sku || ""),
    cost: row.cost,
    yield: row.shrink,
    from: String(row.effective_from || "").slice(0, 10)
  };
});
const groupRows = d1("SELECT length(value) AS n FROM meta WHERE key = 'telegram_chat_id' AND value != ''");
const hasGroup = !!(groupRows[0] && Number(groupRows[0].n) > 0);
const locked = d1("SELECT value FROM meta WHERE key = 'cost_digest:2026-10'");
const text = changes.length ? costDigestText_(MONTH, changes) : "";
const report = {
  at: new Date().toISOString(),
  when: "1 ноября 11:00 Europe/Minsk",
  month: MONTH,
  wouldSend: changes.length > 0,
  reason: changes.length ? "changes" : "empty",
  changes: changes.length,
  hasGroup: hasGroup,
  recipients: hasGroup ? "общий чат и ключ date_nudge" : "владельцы в личку и ключ date_nudge",
  alreadyLocked: locked.length > 0,
  text: text
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (report.alreadyLocked) process.exit(1);
