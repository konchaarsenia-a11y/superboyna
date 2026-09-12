/**
 * Telegram bot stub — order notifications (GrammY).
 * Start when BOT_TOKEN is set: node bot/index.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Bot } from "grammy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN missing — bot not started");
  process.exit(0);
}

const bot = new Bot(token);

bot.command("start", (ctx) =>
  ctx.reply(
    "Wellsneakers ops bot.\nMini App откроется из меню бота.\nНовые заказы с сайта приходят сюда."
  )
);

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.start();
console.log("wellsneakers bot started");
