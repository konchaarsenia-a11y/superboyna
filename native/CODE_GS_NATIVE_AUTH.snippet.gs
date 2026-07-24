/**
 * SNIPPET: нативный логин GBI → влить в актуальный Code.gs (Windows / веб-агент).
 * НЕ заменять весь Code.gs этим файлом.
 * Инструкция: MERGE_NATIVE_AUTH.md
 *
 * Зависимости (уже должны быть в Code.gs):
 *   telegramSendText_, findAccessById_, upsertAccessRow_, isOwnerId_,
 *   jsonp, jsonpText, upsertCourier_
 */

// ========== A) ВСТАВИТЬ ВНУТРЬ handleTelegramUpdate_ вместо голого /start ==========
// Идея: после upsertCourier_, вместо простого if (/^\/start/) { ... }
// использовать блок ниже (сохранив остальную логику callback_query и т.д.).
/*

    var text = String(msg.text || "");
    var startMatch = text.match(/^\/start(?:\s+(\S+))?/i);
    if (startMatch) {
      var payload = String(startMatch[1] || "");
      // Вход из нативного GBI: /start gbi_<token>
      if (/^gbi_/i.test(payload)) {
        var linkToken = payload.replace(/^gbi_/i, "");
        if (linkToken) {
          try {
            CacheService.getScriptCache().put(
              "native_auth_" + linkToken,
              JSON.stringify({
                telegramId: String(from.id),
                name: name,
                username: String(from.username || "")
              }),
              600
            );
          } catch (eCache) {}
          try {
            var tid = String(from.id);
            var existing = findAccessById_(tid);
            var role = "pending";
            var status = "pending";
            if (isOwnerId_(tid)) {
              role = "owner";
              status = "active";
            } else if (existing && existing.role) {
              role = existing.role;
              status = existing.status || "active";
            }
            upsertAccessRow_(tid, name, from.username || "", role, status);
          } catch (eAcc) {}
          telegramSendText_(
            chat.id,
            "✅ GBI: Telegram подключён.\n" +
              "Имя: " + (name || "—") + "\n" +
              "ID: " + from.id + "\n\n" +
              "Вернись в приложение — вход подтянется сам."
          );
          return;
        }
      }
      // --- здесь оставь СВОЁ обычное приветствие /start (курьер и т.д.) ---
      telegramSendText_(chat.id, "Привет! Ты в списке курьеров Бойни. Когда сменщик пришлёт маршрут — придёт сюда.");
    }

*/

// ========== B) РОУТЫ (добавить рядом с getMyAccess) ==========
/*

  // doGet:
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, false);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth({
      token: e.parameter.token ? decodeURIComponent(e.parameter.token) : ""
    }, callback, false);
  }

  // handleApiAction:
  if (action === "getNativeLinkInfo") {
    return handleGetNativeLinkInfo(callback, fromPost);
  }
  if (action === "pollNativeAuth") {
    return handlePollNativeAuth(json, callback, fromPost);
  }

*/

// ========== C) НОВЫЕ ФУНКЦИИ (вставить в Code.gs один раз) ==========

function getTelegramBotUsername_() {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty("TELEGRAM_BOT_USERNAME") || "";
  if (cached) return cached;
  var token = props.getProperty("TELEGRAM_BOT_TOKEN") || "";
  if (!token) return "";
  try {
    var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getMe", {
      muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText() || "{}");
    if (body && body.ok && body.result && body.result.username) {
      props.setProperty("TELEGRAM_BOT_USERNAME", String(body.result.username));
      return String(body.result.username);
    }
  } catch (e) {}
  return "";
}

function handleGetNativeLinkInfo(callback, fromPost) {
  var username = getTelegramBotUsername_();
  var ok = {
    status: username ? "success" : "error",
    botUsername: username,
    message: username ? "ok" : "no_bot_username"
  };
  return fromPost ? jsonpText(callback, ok) : jsonp(callback, ok);
}

function handlePollNativeAuth(json, callback, fromPost) {
  var token = String((json && json.token) || "").trim();
  if (!token || !/^[A-Za-z0-9_-]{6,40}$/.test(token)) {
    var bad = { status: "error", message: "bad_token", linked: false };
    return fromPost ? jsonpText(callback, bad) : jsonp(callback, bad);
  }
  var raw = "";
  try {
    raw = CacheService.getScriptCache().get("native_auth_" + token) || "";
  } catch (e) {}
  if (!raw) {
    var wait = { status: "success", linked: false };
    return fromPost ? jsonpText(callback, wait) : jsonp(callback, wait);
  }
  var data = {};
  try {
    data = JSON.parse(raw);
  } catch (e2) {
    data = {};
  }
  try {
    CacheService.getScriptCache().remove("native_auth_" + token);
  } catch (e3) {}
  var done = {
    status: "success",
    linked: true,
    telegramId: String(data.telegramId || ""),
    name: String(data.name || ""),
    username: String(data.username || "")
  };
  return fromPost ? jsonpText(callback, done) : jsonp(callback, done);
}
