import { Bot } from "grammy";
import { config } from "../config.js";

let bot;

function getBot() {
  if (!config.botToken) return null;
  if (!bot) bot = new Bot(config.botToken);
  return bot;
}

export async function notifyNewOrder(order, items = []) {
  const b = getBot();
  if (!b || !config.adminTelegramIds.length) {
    console.log("[notify] skip (no BOT_TOKEN or ADMIN_TELEGRAM_IDS)", order?.order_number);
    return { sent: 0, skipped: true };
  }
  const lines = (items || [])
    .map((i) => `• ${i.product_name} · ${i.size} × ${i.qty} · ${i.article}`)
    .join("\n");
  const text =
    `🆕 Заказ ${order.order_number}\n` +
    `${order.customer_name}\n` +
    `📞 ${order.phone}\n` +
    `${order.fulfillment === "delivery" ? "🚚 Доставка" : "🏛 Самовывоз"}\n` +
    (order.address ? `📍 ${order.address}\n` : "") +
    `\n${lines}\n\nИтого: ${Number(order.total_byn).toFixed(2)} BYN`;

  let sent = 0;
  for (const chatId of config.adminTelegramIds) {
    try {
      await b.api.sendMessage(chatId, text);
      sent++;
    } catch (err) {
      console.warn("[notify] fail", chatId, err.message);
    }
  }
  return { sent, skipped: false };
}
