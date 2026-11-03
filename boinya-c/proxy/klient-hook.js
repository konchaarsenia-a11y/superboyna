/** Решения бота кабинета @klientGB_bot. Секреты и D1 остаются в worker.js. */

export const KLIENT_CABINET_URL = "https://boinya-c.konchaarsenia.workers.dev/k";

export const KLIENT_PAGES_BASE = "https://konchaarsenia-a11y.github.io/superboyna/goodboy";

export const KLIENT_HOOK_PATH = "/telegram/klient";

export const KLIENT_BOT_USERNAME = "klientGB_bot";

export const KLIENT_PROBE_TID = "999000222";

export function klientStartPack_(name) {
  const who = String(name || "").trim();
  const hello = "Привет" + (who ? ", " + who : "") + "!";
  return {
    kind: "start",
    text: hello + "\nКабинет Goodboy.",
    markup: {
      inline_keyboard: [[{ text: "Кабинет", web_app: { url: KLIENT_CABINET_URL } }]]
    }
  };
}

function klientNick_(raw) {
  return String(raw || "").trim().replace(/^@/, "").toLowerCase();
}

function klientRealTid_(id) {
  return /^\d{5,15}$/.test(String(id || ""));
}

/**
 * Первый вход из Mini App.
 * users — строки кабинета. crmExactCount — точные совпадения ника/телефона в подписках, без подстрок.
 */
export function klientBindPlan_(opts) {
  opts = opts || {};
  const tid = String(opts.tid || "");
  const username = klientNick_(opts.username);
  const users = opts.users || [];
  const crm = Number(opts.crmExactCount || 0);
  if (tid && users.some(function (u) { return u && String(u.telegramId) === tid; })) {
    return { action: "open", telegramId: tid };
  }
  if (!username) return { action: "needLogin", reason: "no_username" };
  const named = users.filter(function (u) {
    return u && klientNick_(u.username) === username;
  });
  const foreign = named.filter(function (u) {
    return klientRealTid_(u.telegramId) && String(u.telegramId) !== tid;
  });
  const free = named.filter(function (u) {
    return !klientRealTid_(u.telegramId);
  });
  if (foreign.length && !free.length) return { action: "needLogin", reason: "taken" };
  if (free.length > 1 || crm > 1 || (free.length && foreign.length)) {
    return { action: "needLogin", reason: "ambiguous" };
  }
  if (free.length === 1) {
    return { action: "rebind", fromId: String(free[0].telegramId), reason: "username" };
  }
  if (crm === 1) return { action: "linkCrm", reason: "nick" };
  return { action: "needLogin", reason: "unmatched" };
}

/** Одноразовый вход телефоном или ником, как на сайте. */
export function klientLoginPlan_(opts) {
  opts = opts || {};
  const free = Number(opts.freeCount || 0);
  const foreign = Number(opts.foreignCount || 0);
  const crm = Number(opts.crmExactCount || 0);
  if (foreign > 0 && free === 0) return { action: "ambiguous", reason: "taken" };
  if (free > 1 || foreign > 0 || crm > 1) return { action: "ambiguous", reason: "ambiguous" };
  if (free === 1) return { action: "rebind", reason: "login" };
  if (crm === 1) return { action: "linkCrm", reason: "login" };
  return { action: "not_found", reason: "not_found" };
}
