/**
 * Telegram ops bot — order notifications + owner /promo windows.
 * Start when BOT_TOKEN is set: node bot/index.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Bot } from "grammy";
import { config } from "../api/src/config.js";
import {
  ensurePromosTable,
  getPromoPublicState,
  setNextPromoFromOwnerText,
} from "../api/src/services/promo.js";
import { formatMinskDate, formatMinskDateTime } from "../api/src/lib/promo.js";
import { pool } from "../api/src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const token = process.env.BOT_TOKEN || config.botToken;
if (!token) {
  console.error("BOT_TOKEN missing — bot not started");
  process.exit(0);
}

const adminIds = config.adminTelegramIds;

function isAdmin(ctx) {
  const id = Number(ctx.from?.id);
  return Number.isFinite(id) && adminIds.includes(id);
}

const bot = new Bot(token);

bot.command("start", (ctx) =>
  ctx.reply(
    "Wellsneakers ops bot.\n" +
      "Mini App откроется из меню бота.\n" +
      "Новые заказы с сайта приходят сюда.\n\n" +
      "Хозяин: /promo — акция «все модели по 100 BYN»."
  )
);

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.command("promo", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply("Команда только для хозяина.");
  }
  const raw = (function () {
  if (typeof ctx.match === "string") return ctx.match.trim();
  const text = ctx.message?.text || "";
  return text.replace(/^\/promo(?:@\w+)?\s*/i, "").trim();
})();
  if (!raw) {
    try {
      const state = await getPromoPublicState(new Date());
      const cur = state.current
        ? `${formatMinskDate(state.current.starts_at)}–${formatMinskDate(state.current.ends_at)}` +
          (state.active ? " (сейчас)" : "")
        : "нет активного окна";
      const next = state.next
        ? `${formatMinskDate(state.next.starts_at)}–${formatMinskDate(state.next.ends_at)}`
        : "не задана";
      return ctx.reply(
        `Акция «${state.title}» · ${state.price_byn} BYN\n` +
          `Сейчас: ${cur}\n` +
          `Следующая: ${next}\n\n` +
          `Задать следующую:\n` +
          `/promo 04.10 05.10\n` +
          `/promo 04.10-05.10`
      );
    } catch (err) {
      console.warn("[bot/promo] status fail", err.message);
      return ctx.reply("Не удалось прочитать акцию. Проверьте БД.");
    }
  }

  try {
    const result = await setNextPromoFromOwnerText(raw, new Date());
    if (!result.ok) {
      return ctx.reply(
        "Не понял даты. Пример:\n/promo 04.10 05.10\nили\n/promo 04.10-05.10"
      );
    }
    const p = result.promo;
    return ctx.reply(
      `✅ Следующая акция сохранена: ${result.label}\n` +
        `${formatMinskDateTime(p.starts_at)} → ${formatMinskDateTime(p.ends_at)} (Минск)`
    );
  } catch (err) {
    console.warn("[bot/promo] set fail", err.message);
    return ctx.reply("Ошибка сохранения. Попробуйте ещё раз.");
  }
});

async function main() {
  try {
    await ensurePromosTable();
  } catch (err) {
    console.warn("[bot] promo table:", err.message);
  }
  bot.start();
  console.log("wellsneakers bot started (promo + orders)");
}

main().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
