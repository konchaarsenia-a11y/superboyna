/**
 * t441u/t451u/t454u: ПП без повторного half на suggest/order.
 * N2 auto: monthly→ПП1/ПП2 (нечёт → слот1 +1: ceil жевалки / floor дрессура).
 * Тумблер ppManualDist: ON — ручные ПП1/ПП2 не перезаписывать.
 * N1 — один полный состав, без ПП2.
 */

function ppCloneBasket_(list) {
  const out = [];
  for (let i = 0; i < (list || []).length; i++) {
    const it = list[i] || {};
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) continue;
    out.push(ppCloneRowWithQty_(it, v));
  }
  return out;
}

/** t451u: копия строки с qty; meta (frac/crumb/…) без picker re-add. */
function ppCloneRowWithQty_(it, qty) {
  const src = it || {};
  const row = {};
  Object.keys(src).forEach(function (k) {
    if (k === "value" || k === "val") return;
    const v = src[k];
    if (Array.isArray(v)) {
      row[k] = v.map(function (x) {
        return x && typeof x === "object" ? Object.assign({}, x) : x;
      });
    } else {
      row[k] = v;
    }
  });
  const q = Number(qty) || 0;
  row.cat = src.cat || "";
  row.main = src.main || src.name || "";
  row.name = src.name || src.main || "";
  row.sub = src.sub || "";
  row.value = q;
  row.val = q;
  return row;
}

function ppBasketHasQty_(list) {
  return ppCloneBasket_(list).length > 0;
}

function ppBasketItemKey_(it) {
  const cat = String((it && it.cat) || "").trim().toLowerCase();
  const main = String((it && (it.main || it.name)) || "")
    .trim()
    .toUpperCase();
  const sub = String((it && it.sub) || "")
    .trim()
    .toUpperCase();
  return cat + "|" + main + "|" + sub;
}

function ppQtyMap_(list) {
  const m = Object.create(null);
  (list || []).forEach(function (it) {
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) return;
    const k = ppBasketItemKey_(it);
    m[k] = (m[k] || 0) + v;
  });
  return m;
}

function ppQtyMapsEqual_(a, b) {
  const ka = Object.keys(a || {}).sort();
  const kb = Object.keys(b || {}).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if ((a[ka[i]] || 0) !== (b[ka[i]] || 0)) return false;
  }
  return true;
}

/** Сумма слотов → monthly (для manual→auto без потери qty). */
function ppMergeBasketsAsMonthly_(basket, basket2) {
  const map = Object.create(null);
  const meta = Object.create(null);
  function add(list) {
    (list || []).forEach(function (it) {
      const v = Number(it.value != null ? it.value : it.val) || 0;
      if (v <= 0) return;
      const k = ppBasketItemKey_(it);
      map[k] = (map[k] || 0) + v;
      if (!meta[k]) meta[k] = it;
    });
  }
  add(basket);
  add(basket2);
  return Object.keys(map).map(function (k) {
    return ppCloneRowWithQty_(meta[k], map[k]);
  });
}

function isPpChewItem_(it) {
  const cat = String((it && it.cat) || "").toLowerCase();
  if (cat === "chews" || cat === "chew") return true;
  if (cat === "dressura") return false;
  const name = String((it && (it.main || it.name)) || "");
  return /шт\.?|колен|копыт|нос|ухо|уши|шея|хрящ|лоп|хвост|рога?|сустав|быч|трахе|аорт|станова|переп|губ|утин/i.test(
    name
  );
}

/** t454u: нечёт → слот1 на 1 больше (ceil); сумма 1+2 = qty. */
function splitQtyForPpSlot_(qty, isChew, slot) {
  const v = Number(qty) || 0;
  if (v <= 0) return 0;
  void isChew; /* правило одно: первая получает больше при нечёте */
  const first = Math.ceil(v / 2);
  if (slot <= 1) return first;
  return Math.max(0, v - first);
}

function splitMonthlyBasketToTwoDeliveries_(monthly) {
  const full = ppCloneBasket_(monthly);
  const delivery1 = [];
  const delivery2 = [];
  for (let i = 0; i < full.length; i++) {
    const it = full[i];
    const chew = isPpChewItem_(it);
    const q1 = splitQtyForPpSlot_(it.value, chew, 1);
    const q2 = splitQtyForPpSlot_(it.value, chew, 2);
    if (q1 + q2 !== Number(it.value)) {
      return {
        ok: false,
        reason: "qty_split_mismatch",
        key: ppBasketItemKey_(it),
        value: it.value,
        q1: q1,
        q2: q2
      };
    }
    if (q1 > 0) delivery1.push(ppCloneRowWithQty_(it, q1));
    if (q2 > 0) delivery2.push(ppCloneRowWithQty_(it, q2));
  }
  const sumMap = Object.create(null);
  function add(list, sign) {
    for (let i = 0; i < (list || []).length; i++) {
      const it = list[i];
      const k = ppBasketItemKey_(it);
      sumMap[k] = (sumMap[k] || 0) + sign * (Number(it.value) || 0);
    }
  }
  add(full, 1);
  add(delivery1, -1);
  add(delivery2, -1);
  const bad = Object.keys(sumMap).filter(function (k) {
    return sumMap[k] !== 0;
  });
  if (bad.length) return { ok: false, reason: "sum_invariant", keys: bad };
  return { ok: true, delivery1: delivery1, delivery2: delivery2, monthly: full };
}

function parsePpDeliveriesN_(raw) {
  if (typeof raw === "number" && isFinite(raw)) {
    const n = Math.round(raw);
    return n >= 1 ? n : 0;
  }
  const s = String(raw == null ? "" : raw)
    .trim()
    .replace(",", ".");
  if (!s) return 0;
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const plain = Math.round(Number(s));
    return plain >= 1 ? plain : 0;
  }
  const slash = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (slash) {
    const den = Number(slash[2]);
    return den >= 1 ? den : 0;
  }
  const lead = s.match(/(\d+)/);
  if (lead) {
    const nLead = Number(lead[1]);
    return nLead >= 1 ? nLead : 0;
  }
  return 0;
}

function parsePpManualDist_(raw) {
  if (raw === true || raw === 1 || raw === "1") return true;
  if (raw === false || raw === 0 || raw === "0" || raw == null || raw === "") return false;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * t454u: уже разные слоты ≠ auto(sum) → считать ручным (не сбрасывать при открытии).
 * Явный ppManualDist=1 тоже manual. Пустой basket2 → auto.
 */
function inferPpManualDistribution_(opts) {
  opts = opts || {};
  if (parsePpManualDist_(opts.ppManualDist)) return true;
  const n = parsePpDeliveriesN_(opts.deliveriesN);
  if (n < 2) return false;
  const b1 = ppCloneBasket_(opts.basket);
  const b2 = ppCloneBasket_(opts.basket2);
  if (!ppBasketHasQty_(b2)) return false;
  const monthly = ppMergeBasketsAsMonthly_(b1, b2);
  const split = splitMonthlyBasketToTwoDeliveries_(monthly);
  if (!split.ok) return true;
  if (!ppQtyMapsEqual_(ppQtyMap_(b1), ppQtyMap_(split.delivery1))) return true;
  if (!ppQtyMapsEqual_(ppQtyMap_(b2), ppQtyMap_(split.delivery2))) return true;
  return false;
}

/**
 * Auto materialize: monthly→два слота. Если уже has basket2 и не manual — не трогать.
 * manual→auto: monthly=sum(slots), затем split (сумма сохраняется).
 */
function materializePpAutoSplit_(opts) {
  opts = opts || {};
  const n = parsePpDeliveriesN_(opts.deliveriesN);
  if (n < 2) {
    return {
      ok: true,
      skipped: true,
      reason: "n1",
      delivery1: ppCloneBasket_(opts.basket),
      delivery2: [],
      ppManualDist: false
    };
  }
  const b1 = ppCloneBasket_(opts.basket);
  const b2 = ppCloneBasket_(opts.basket2);
  const forceFromSum = opts.forceFromSum === true;
  if (!forceFromSum && ppBasketHasQty_(b2) && !parsePpManualDist_(opts.ppManualDist)) {
    /* Уже сохранено auto/совпадает — не делить повторно. */
    return {
      ok: true,
      skipped: true,
      reason: "already_split",
      delivery1: b1,
      delivery2: b2,
      ppManualDist: false
    };
  }
  const monthly = forceFromSum || ppBasketHasQty_(b2) ? ppMergeBasketsAsMonthly_(b1, b2) : b1;
  const split = splitMonthlyBasketToTwoDeliveries_(monthly);
  if (!split.ok) return { ok: false, reason: split.reason || "split_fail", detail: split };
  return {
    ok: true,
    skipped: false,
    delivery1: split.delivery1,
    delivery2: split.delivery2,
    monthly: split.monthly,
    ppManualDist: false
  };
}

function classifyPpCardForN2Split_(row) {
  const sheet = String((row && (row.sheet || row.segment)) || "")
    .trim()
    .toUpperCase();
  if (sheet && sheet !== "ПП" && sheet !== "PP") {
    return { kind: "skip_sheet", sheet: sheet };
  }
  const n = parsePpDeliveriesN_(row && row.deliveries != null ? row.deliveries : row && row.n);
  const b1 = ppCloneBasket_(row && row.basket);
  const b2 = ppCloneBasket_(row && (row.basket2 || row.basketSlot2 || row.composition2));
  const has1 = b1.length > 0;
  const has2 = b2.length > 0;
  const manual = inferPpManualDistribution_({
    deliveriesN: n,
    basket: b1,
    basket2: b2,
    ppManualDist: row && row.ppManualDist
  });
  if (n === 1) return { kind: "skip_n1", deliveriesN: 1, has1: has1, has2: has2 };
  if (n !== 2) {
    return {
      kind: "ambiguous",
      reason: n > 2 ? "n_gt_2" : "n_unclear",
      deliveriesN: n,
      has1: has1,
      has2: has2
    };
  }
  if (manual || has2) {
    return {
      kind: manual ? "manual" : "already",
      deliveriesN: 2,
      has1: has1,
      has2: has2,
      basketN: b1.length,
      basket2N: b2.length,
      ppManualDist: manual
    };
  }
  if (!has1) {
    return { kind: "ambiguous", reason: "empty_basket", deliveriesN: 2, has1: false, has2: false };
  }
  const split = splitMonthlyBasketToTwoDeliveries_(b1);
  if (!split.ok) {
    return {
      kind: "ambiguous",
      reason: split.reason || "split_fail",
      deliveriesN: 2,
      detail: split
    };
  }
  return {
    kind: "migrate",
    deliveriesN: 2,
    basketN: b1.length,
    before: b1,
    delivery1: split.delivery1,
    delivery2: split.delivery2,
    ppManualDist: false
  };
}

/**
 * Suggest/order: готовый слот целиком; без повторного half.
 * N2 + пустой basket2 → auto-split monthly (не полный месяц, не half-of-half).
 * N2 + basket2 → слот целиком (auto-saved или manual).
 */
function resolvePpPerDeliverySuggest_(opts) {
  opts = opts || {};
  const deliveriesN = Math.max(0, parsePpDeliveriesN_(opts.deliveriesN));
  const n = deliveriesN >= 1 ? deliveriesN : 1;
  const slotRaw = Math.max(1, Number(opts.slot) || 1);
  const delivery1In = ppCloneBasket_(opts.basket);
  const delivery2In = n >= 2 ? ppCloneBasket_(opts.basket2) : [];
  const has2 = ppBasketHasQty_(delivery2In);
  const slot = n <= 1 ? 1 : slotRaw;
  const manual = n >= 2 && inferPpManualDistribution_(opts);

  if (n <= 1) {
    return {
      proposed: delivery1In,
      remaining: [],
      delivery1: delivery1In,
      delivery2: [],
      deliveriesN: 1,
      slot: 1,
      legacyNoBasket2: false,
      needManualComposition: false,
      ppManualDist: false,
      compositionSource: "n1-whole",
      hint: "ПП N=1 · одна доставка · состав целиком"
    };
  }

  let delivery1 = delivery1In;
  let delivery2 = delivery2In;
  let source = has2 ? (manual ? "per-delivery-manual" : "per-delivery") : "n2-auto-split";
  let legacyNoBasket2 = !has2;

  if (!has2) {
    /* t454u default auto: monthly в basket → слоты на лету; не отдаём monthly целиком. */
    const split = splitMonthlyBasketToTwoDeliveries_(delivery1In);
    if (!split.ok) {
      return {
        proposed: [],
        remaining: [],
        delivery1: delivery1In,
        delivery2: [],
        deliveriesN: n,
        slot: slot,
        legacyNoBasket2: true,
        needManualComposition: true,
        ppManualDist: false,
        compositionSource: "n2-auto-split-fail",
        hint: "ПП N=" + n + " · не удалось авто-разделить состав"
      };
    }
    delivery1 = split.delivery1;
    delivery2 = split.delivery2;
    source = "n2-auto-split";
  }

  if (slot <= 1) {
    return {
      proposed: delivery1,
      remaining: delivery2,
      delivery1: delivery1,
      delivery2: delivery2,
      deliveriesN: n,
      slot: 1,
      legacyNoBasket2: legacyNoBasket2,
      needManualComposition: false,
      ppManualDist: manual,
      compositionSource: source,
      hint:
        "ПП N=" +
        n +
        " · слот 1/" +
        n +
        " · " +
        (source === "n2-auto-split" ? "auto-разделённая доставка1" : "доставка1 целиком")
    };
  }

  return {
    proposed: delivery2,
    remaining: [],
    delivery1: delivery1,
    delivery2: delivery2,
    deliveriesN: n,
    slot: 2,
    legacyNoBasket2: legacyNoBasket2,
    needManualComposition: false,
    ppManualDist: manual,
    compositionSource: source,
    hint:
      "ПП N=" +
      n +
      " · слот 2/" +
      n +
      " · " +
      (source === "n2-auto-split" ? "auto-разделённая доставка2" : "доставка2 целиком")
  };
}

export {
  ppCloneBasket_,
  ppCloneRowWithQty_,
  ppBasketHasQty_,
  ppBasketItemKey_,
  ppQtyMap_,
  ppQtyMapsEqual_,
  ppMergeBasketsAsMonthly_,
  isPpChewItem_,
  splitQtyForPpSlot_,
  splitMonthlyBasketToTwoDeliveries_,
  classifyPpCardForN2Split_,
  parsePpDeliveriesN_,
  parsePpManualDist_,
  inferPpManualDistribution_,
  materializePpAutoSplit_,
  resolvePpPerDeliverySuggest_
};
