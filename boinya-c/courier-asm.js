/* Статус сборки на экране курьера.
 * Галочка живёт в getAssembly (снимок сборки). getCourier её часто не видит:
 * setAssembled в D1-primary пишет только assembly-snap, список курьера остаётся старым.
 * Здесь сводим карточки сборки (в т.ч. две собаки) к одному заказу курьера. */
(function (root) {
  "use strict";

  var LOCAL_MS = 1800000;

  function norm(s) {
    return String(s || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .replace(/Ё/g, "Е");
  }

  function ownerName(name) {
    return String(name || "").replace(/\s*[·•#]\s*2\s*$/i, "").trim();
  }

  function same(a, b, sameFn) {
    var na = norm(a);
    var nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (typeof sameFn === "function") {
      try { return !!sameFn(a, b); } catch (e) { return false; }
    }
    return false;
  }

  function cardMatches(courier, asm, sameFn) {
    if (!courier || !asm) return false;
    var cMk = String(courier.matchKey || "").trim();
    var aMk = String(asm.matchKey || "").trim();
    if (cMk && aMk) return same(cMk, aMk, sameFn);
    var cName = String(courier.name || "").trim();
    var aName = String(asm.name || "").trim();
    var owner = ownerName(asm.ownerName || aName);
    if (cName && aName && same(cName, aName, sameFn)) return true;
    if (cName && owner && same(cName, owner, sameFn)) return true;
    if (cName && aName && same(ownerName(cName), ownerName(aName), sameFn)) return true;
    return false;
  }

  function flagOf(localFlags, name, now) {
    if (!localFlags || !name) return null;
    var keys = [String(name).trim().toUpperCase(), norm(name)];
    for (var i = 0; i < keys.length; i++) {
      var o = keys[i] && localFlags[keys[i]];
      if (!o) continue;
      if ((now - (Number(o.ts) || 0)) > LOCAL_MS) continue;
      if (o.assembled === undefined) continue;
      return !!o.assembled;
    }
    return null;
  }

  function statusFor(courier, asmClients, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var sameFn = opts.same;
    var localFlags = opts.localFlags || null;
    var parts = [];
    (asmClients || []).forEach(function (a) {
      if (cardMatches(courier, a, sameFn)) parts.push(a);
    });
    if (!parts.length) {
      var local = flagOf(localFlags, courier && courier.name, now);
      var assembled = local == null ? !!(courier && courier.assembled) : local;
      return {
        known: local != null,
        fromAssembly: false,
        assembled: assembled,
        done: assembled ? 1 : 0,
        total: 1,
        partial: false
      };
    }
    var done = 0;
    parts.forEach(function (a) {
      var local = flagOf(localFlags, a.name, now);
      if (local == null) local = flagOf(localFlags, a.ownerName, now);
      var on = local == null ? !!a.assembled : local;
      if (on) done++;
    });
    var total = parts.length;
    return {
      known: true,
      fromAssembly: true,
      assembled: total > 0 && done === total,
      done: done,
      total: total,
      partial: done > 0 && done < total
    };
  }

  function apply(clients, asmClients, opts) {
    (clients || []).forEach(function (c) {
      var st = statusFor(c, asmClients, opts);
      c.assembled = !!st.assembled;
      c.assembledDone = st.done;
      c.assembledTotal = st.total;
      c.assembledPartial = !!st.partial;
      c.assembledKnown = !!st.known;
      c.assembledFromAssembly = !!st.fromAssembly;
    });
    return clients;
  }

  function badgeText(c) {
    if (c && c.assembledPartial) {
      return "собран " + (c.assembledDone || 0) + "/" + (c.assembledTotal || 0);
    }
    if (c && c.assembled) return "собран";
    return "не собран";
  }

  function badgeKind(c) {
    if (c && c.assembledPartial) return "part";
    if (c && c.assembled) return "yes";
    return "no";
  }

  function sig(clients) {
    return (clients || []).map(function (c) {
      return badgeKind(c) + ":" + (c.assembledDone || 0) + "/" + (c.assembledTotal || 0);
    }).join("|");
  }

  root.BoinyaCourierAsm = {
    ownerName: ownerName,
    cardMatches: cardMatches,
    statusFor: statusFor,
    apply: apply,
    badgeText: badgeText,
    badgeKind: badgeKind,
    sig: sig
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
