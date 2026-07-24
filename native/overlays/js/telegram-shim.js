/**
 * Stub Telegram.WebApp для Capacitor / браузера вне Telegram.
 * Исходный app.html не меняется — подмена только в native/www копии.
 */
(function () {
  "use strict";
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.__boinyaNative) {
    return;
  }

  function noop() {}

  var haptic = {
    impactOccurred: function (style) {
      try {
        if (window.BoinyaNative && window.BoinyaNative.haptic) {
          window.BoinyaNative.haptic(style || "light");
        }
      } catch (e) {}
    },
    notificationOccurred: function (type) {
      try {
        if (window.BoinyaNative && window.BoinyaNative.haptic) {
          window.BoinyaNative.haptic(type === "error" ? "error" : "success");
        }
      } catch (e) {}
    },
    selectionChanged: noop
  };

  var webApp = {
    __boinyaNative: true,
    initData: "",
    initDataUnsafe: {},
    version: "9.0",
    platform: "ios",
    colorScheme: "dark",
    themeParams: {
      bg_color: "#0a0a0a",
      text_color: "#f5f5f7",
      hint_color: "#9a9a9a",
      link_color: "#ff7a00",
      button_color: "#ff7a00",
      button_text_color: "#ffffff"
    },
    isExpanded: true,
    isFullscreen: false,
    viewportHeight: window.innerHeight || 800,
    viewportStableHeight: window.innerHeight || 800,
    headerColor: "#0a0a0a",
    backgroundColor: "#0a0a0a",
    // iPhone 16 / Dynamic Island — ненулевые insets, иначе app ставит --safe-top: 12px
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    ready: noop,
    expand: noop,
    close: noop,
    disableVerticalSwipes: noop,
    enableVerticalSwipes: noop,
    exitFullscreen: noop,
    requestFullscreen: noop,
    setHeaderColor: function (c) { this.headerColor = c; },
    setBackgroundColor: function (c) { this.backgroundColor = c; },
    onEvent: noop,
    offEvent: noop,
    sendData: noop,
    openLink: function (url) {
      try {
        if (window.BoinyaNative && window.BoinyaNative.openUrl) {
          window.BoinyaNative.openUrl(url);
          return;
        }
      } catch (e) {}
      window.open(url, "_blank");
    },
    openTelegramLink: function (url) { this.openLink(url); },
    showPopup: function (params, cb) {
      var msg = (params && (params.message || params.title)) || "";
      window.alert(msg);
      if (typeof cb === "function") cb("ok");
    },
    showAlert: function (msg, cb) {
      window.alert(msg || "");
      if (typeof cb === "function") cb();
    },
    showConfirm: function (msg, cb) {
      var ok = window.confirm(msg || "");
      if (typeof cb === "function") cb(ok);
    },
    HapticFeedback: haptic,
    MainButton: { text: "", isVisible: false, show: noop, hide: noop, onClick: noop, offClick: noop, setText: noop },
    BackButton: { isVisible: false, show: noop, hide: noop, onClick: noop, offClick: noop }
  };

  try {
    var vv = window.visualViewport;
    if (vv) {
      webApp.viewportHeight = vv.height;
      webApp.viewportStableHeight = vv.height;
    }
  } catch (e) {}

  window.Telegram = window.Telegram || {};
  window.Telegram.WebApp = webApp;
})();
