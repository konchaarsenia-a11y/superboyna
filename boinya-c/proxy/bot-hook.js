/** Решения вебхука бота Бойни. Секреты и D1 остаются в worker.js. */

export const BOINYA_MINI_URL =
  "https://konchaarsenia-a11y.github.io/superboyna/boinya-c/next.html?cutover=1";

export const BOINYA_HOOK_PATH = "/telegram/boinya";

export const BOINYA_PROBE_TID = "999000111";

const ROLE_LABELS = {
  owner: "владелец",
  manager: "менеджер",
  cutter: "нарезчик",
  courier: "курьер",
  logistics: "логистика / склад",
  all: "полный доступ",
  pending: "ожидает одобрения",
  denied: "отказано",
  none: "нет доступа"
};

export function botRoleLabel_(role) {
  const key = String(role || "").toLowerCase();
  return ROLE_LABELS[key] || (key || "неизвестно");
}

export function botProbeFrom_(from) {
  return String((from && from.id) || "") === BOINYA_PROBE_TID &&
    String((from && from.username) || "") === "tokencheck";
}

export function botPrivateChatOk_(chat, from) {
  if (!chat || (chat.type && chat.type !== "private")) return false;
  const id = String(chat.id == null ? "" : chat.id);
  const tid = String((from && from.id) || "");
  return /^\d{5,15}$/.test(id) && /^\d{5,15}$/.test(tid);
}

export function botStartCommand_(text) {
  const m = String(text || "").match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);
  if (!m) return null;
  return { payload: String(m[1] || "") };
}

export function botAccessAsk_(text) {
  return /^(запросить\s+доступ|\/request(?:@\w+)?)$/i.test(String(text || "").trim());
}

export function botCallbackKind_(data) {
  const s = String(data || "");
  if (s === "access_req") return "access_req";
  if (s === "costpub") return "costpub";
  if (/^svsent:/i.test(s)) return "svsent";
  if (/^mtrack:/i.test(s)) return "mtrack";
  if (/^mpay:/i.test(s)) return "mpay";
  if (/^ppafk:/i.test(s)) return "ppafk";
  if (/^defdone:/i.test(s)) return "defdone";
  if (/^vrc:/i.test(s)) return "vrc";
  return "";
}

/** «Обновить прайс», дефицит, опрос, «В АФК», трек и оплата почты в личке того же бота. */
export function botStaffButtonInDm_(cq) {
  const kind = botCallbackKind_(cq && cq.data);
  if (!kind || kind === "vrc") return false;
  const chat = cq && cq.message && cq.message.chat;
  const from = (cq && cq.from) || {};
  if (!chat || (chat.type && chat.type !== "private")) return false;
  return botPrivateChatOk_(chat, from);
}

export function botInboundMedia_(msg) {
  if (!msg) return false;
  if (msg.photo || msg.document || msg.sticker) return true;
  return false;
}

/**
 * Кнопка «мой чат» у бота: группа сохраняется, выход стирает только этот id.
 * Личные чаты и чужие статусы не трогаем.
 */
export function botGroupMemberAction_(update) {
  const m = update && update.my_chat_member;
  if (!m || !m.chat) return { action: "ignore", chatId: "" };
  const type = String(m.chat.type || "");
  if (type !== "group" && type !== "supergroup") return { action: "ignore", chatId: "" };
  const chatId = String(m.chat.id == null ? "" : m.chat.id).trim();
  if (!chatId) return { action: "ignore", chatId: "" };
  const status = String((m.new_chat_member && m.new_chat_member.status) || "");
  if (status === "member" || status === "administrator") return { action: "save", chatId: chatId };
  if (status === "left" || status === "kicked") return { action: "clear", chatId: chatId };
  return { action: "ignore", chatId: chatId };
}

export function botStartPack_(opts) {
  opts = opts || {};
  const name = String(opts.name || "").trim();
  const tid = String(opts.tid || "").trim();
  const role = String(opts.role || "").toLowerCase();
  const status = String(opts.status || "").toLowerCase();
  const isOwner = !!opts.isOwner || role === "owner";
  const mini = String(opts.miniUrl || BOINYA_MINI_URL);
  const hello = "Привет" + (name ? ", " + name : "") + "!";
  const openBtn = { text: "Открыть Бойню", web_app: { url: mini } };
  function kb(rows) {
    return { inline_keyboard: rows };
  }
  if (!tid) {
    return {
      kind: "noid",
      text: hello + "\nНе удалось прочитать Telegram ID.",
      markup: kb([[openBtn]])
    };
  }
  if (isOwner) {
    return {
      kind: "owner",
      text: hello + "\nТвоя роль: " + botRoleLabel_("owner") + ".\nID: " + tid +
        "\nОткрывай мини-приложение Бойня.",
      markup: kb([[openBtn]])
    };
  }
  if (status === "denied" || role === "denied") {
    return {
      kind: "denied",
      text: hello + "\nДоступ закрыт.\nID: " + tid + "\nЕсли это ошибка — напиши владельцу.",
      markup: kb([[openBtn]])
    };
  }
  if (status === "pending" || role === "pending") {
    return {
      kind: "pending",
      text: hello + "\nЗапрос уже есть — ждём одобрения владельцем.\nID: " + tid,
      markup: kb([[openBtn], [{ text: "Повторить запрос", callback_data: "access_req" }]])
    };
  }
  const known = { manager: 1, cutter: 1, courier: 1, logistics: 1, all: 1 };
  if (status === "active" || known[role]) {
    const extra = role === "courier"
      ? "\nКогда сменщик пришлёт маршрут — придёт сюда."
      : "\nОткрывай мини-приложение Бойня.";
    return {
      kind: "role",
      text: hello + "\nТвоя роль: " + botRoleLabel_(role) + ".\nID: " + tid + extra,
      markup: kb([[openBtn]])
    };
  }
  return {
    kind: "none",
    text: hello + "\nТебя ещё нет в доступах Бойни.\nID: " + tid +
      "\nНажми кнопку — отправим запрос владельцу.",
    markup: kb([[openBtn], [{ text: "Запросить доступ", callback_data: "access_req" }]])
  };
}
