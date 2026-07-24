/**
 * JS-мост телефона. Live Activity → Capacitor BoinyaLiveActivity.
 */
(function () {
  "use strict";
  if (window.BoinyaNative && window.BoinyaNative.__ready) return;

  function cap() {
    return window.Capacitor || null;
  }

  function plugin() {
    var C = cap();
    if (!C || !C.Plugins) return null;
    return C.Plugins.BoinyaLiveActivity || null;
  }

  async function haptic(kind) {
    try {
      var C = cap();
      if (C && C.Plugins && C.Plugins.Haptics) {
        var H = C.Plugins.Haptics;
        if (kind === "success" || kind === "error" || kind === "warning") {
          await H.notification({
            type: kind === "error" ? "ERROR" : kind === "warning" ? "WARNING" : "SUCCESS"
          });
        } else {
          var style = kind === "medium" || kind === "heavy" ? String(kind).toUpperCase() : "LIGHT";
          await H.impact({ style: style });
        }
        return;
      }
    } catch (e) {}
  }

  function openUrl(url) {
    try {
      window.open(url, "_blank");
    } catch (e) {}
  }

  function notify(title, body) {
    try {
      if (window.console) console.log("[BoinyaNative.notify]", title, body || "");
    } catch (e) {}
    return Promise.resolve({ ok: false, stub: true });
  }

  async function startLiveActivity(payload) {
    var p = plugin();
    if (!p || !p.start) {
      try {
        console.log("[BoinyaNative.startLiveActivity]", payload);
      } catch (e) {}
      return { ok: false, stub: true };
    }
    try {
      return await p.start(payload || {});
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  async function updateLiveActivity(payload) {
    var p = plugin();
    if (!p || !p.update) {
      try {
        console.log("[BoinyaNative.updateLiveActivity]", payload);
      } catch (e) {}
      return { ok: false, stub: true };
    }
    try {
      return await p.update(payload || {});
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  async function endLiveActivity(payload) {
    var p = plugin();
    if (!p || !p.end) {
      try {
        console.log("[BoinyaNative.endLiveActivity]", payload);
      } catch (e) {}
      return { ok: false, stub: true };
    }
    try {
      return await p.end(payload || {});
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  window.BoinyaNative = {
    __ready: true,
    platform: "capacitor",
    haptic: haptic,
    openUrl: openUrl,
    notify: notify,
    startLiveActivity: startLiveActivity,
    updateLiveActivity: updateLiveActivity,
    endLiveActivity: endLiveActivity
  };
})();
