/**
 * t441u/t442u: ПП состав доставки без auto half-split.
 * N=1 — только доставка1 (basket); basket2/stale не делают вторую.
 * N=2 — ПП1=basket, ПП2=basket2 целиком. Без basket2 не выдумываем half/копию.
 *
 * t444u: штатный split карточек = splitQtyForPpSlot_ (дрессура floor, жевалки ceil);
 * сумма долей = исходный состав. Suggest после миграции берёт basket/basket2 целиком.
 */

function ppCloneBasket_(list) {
  const out = [];
  for (let i = 0; i < (list || []).length; i++) {
    const it = list[i] || {};
    const v = Number(it.value != null ? it.value : it.val) || 0;
    if (v <= 0) continue;
    out.push({
      cat: it.cat || "",
      main: it.main || it.name || "",
      name: it.name || it.main || "",
      sub: it.sub || "",
      value: v,
      val: v
    });
  }
  return out;
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

/** Как Code.gs isPpChewItem_ / Worker isPpChewItemD1_ — штат карточек. */
function isPpChewItem_(it) {
  const cat = String((it && it.cat) || "").toLowerCase();
  if (cat === "chews" || cat === "chew") return true;
  if (cat === "dressura") return false;
  const name = String((it && (it.main || it.name)) || "");
  return /шт\.?|колен|копыт|нос|ухо|уши|шея|хрящ|лоп|хвост|рога?|сустав|быч|трахе|аорт|станова|переп|губ|утин/i.test(
    name
  );
}

/** Штат карточек: дрессура floor(n/2), жевалки ceil(n/2); 1г дрессуры → слот1. */
function splitQtyForPpSlot_(qty, isChew, slot) {
  const v = Number(qty) || 0;
  if (v <= 0) return 0;
  let first = isChew ? Math.ceil(v / 2) : Math.floor(v / 2);
  if (first <= 0 && v > 0) first = v;
  if (slot <= 1) return first;
  return Math.max(0, v - first);
}

/**
 * t444u: разложить месячный basket на delivery1+delivery2 тем же правилом, что proposePpSlotBasket_.
 * Сумма по ключу product/fraction обязана совпасть с исходным.
 */
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
    if (q1 > 0) {
      delivery1.push({
        cat: it.cat,
        main: it.main,
        name: it.name,
        sub: it.sub,
        value: q1,
        val: q1
      });
    }
    if (q2 > 0) {
      delivery2.push({
        cat: it.cat,
        main: it.main,
        name: it.name,
        sub: it.sub,
        value: q2,
        val: q2
      });
    }
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
  if (bad.length) {
    return { ok: false, reason: "sum_invariant", keys: bad };
  }
  return { ok: true, delivery1: delivery1, delivery2: delivery2, monthly: full };
}

/**
 * Классификация карточки ПП для миграции t444u.
 * migrate = N=2, basket полный, basket2 пуст.
 * already = N=2 и basket2 с qty.
 * skip_n1 = N=1.
 * ambiguous = иначе (неясный N / пустой basket / N>2).
 */
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
  if (has2) {
    return { kind: "already", deliveriesN: 2, has1: has1, has2: true, basketN: b1.length, basket2N: b2.length };
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
    delivery2: split.delivery2
  };
}

/**
 * Канон поля доставок: «1»/«2»/числа. «2/мес» → 2.
 * Слот «1/2» в ЭТОМ поле читаем как N=знаменатель (как monthDeliveriesN_).
 * Пусто → 0 (вызывающий решает fallback).
 */
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

/**
 * @param {object} opts
 * @param {array} opts.basket delivery1 / N=1
 * @param {array} [opts.basket2] delivery2 (игнор при N=1)
 * @param {number} opts.slot 1|2
 * @param {number|string} opts.deliveriesN
 */
function resolvePpPerDeliverySuggest_(opts) {
  opts = opts || {};
  const deliveriesN = Math.max(0, parsePpDeliveriesN_(opts.deliveriesN));
  const n = deliveriesN >= 1 ? deliveriesN : 1;
  const slotRaw = Math.max(1, Number(opts.slot) || 1);
  const delivery1 = ppCloneBasket_(opts.basket);
  // t442u: при N=1 stale basket2 не читаем — второй доставки нет.
  const delivery2 = n >= 2 ? ppCloneBasket_(opts.basket2) : [];
  const has2 = ppBasketHasQty_(delivery2);
  // t442u: N=1 всегда слот 1, даже если UI/params прислали 2.
  const slot = n <= 1 ? 1 : slotRaw;

  if (n <= 1) {
    return {
      proposed: delivery1,
      remaining: [],
      delivery1: delivery1,
      delivery2: [],
      deliveriesN: 1,
      slot: 1,
      legacyNoBasket2: false,
      needManualComposition: false,
      compositionSource: "n1-whole",
      hint: "ПП N=1 · одна доставка · состав целиком"
    };
  }

  if (slot <= 1) {
    // t441u: ПП1 = basket целиком. Нет basket2 — флаг N=2-legacy (не путать с N=1).
    return {
      proposed: delivery1,
      remaining: has2 ? delivery2 : [],
      delivery1: delivery1,
      delivery2: has2 ? delivery2 : [],
      deliveriesN: n,
      slot: 1,
      legacyNoBasket2: !has2,
      needManualComposition: false,
      compositionSource: has2 ? "per-delivery" : "n2-legacy-no-basket2-slot1",
      hint: has2
        ? "ПП N=" + n + " · слот 1/" + n + " · доставка1 целиком"
        : "ПП N=" +
          n +
          " · слот 1/" +
          n +
          " · доставка1 целиком · нет basket2 (N=2 legacy, не N=1; не делим)"
    };
  }

  if (has2) {
    return {
      proposed: delivery2,
      remaining: [],
      delivery1: delivery1,
      delivery2: delivery2,
      deliveriesN: n,
      slot: 2,
      legacyNoBasket2: false,
      needManualComposition: false,
      compositionSource: "per-delivery",
      hint: "ПП N=" + n + " · слот 2/" + n + " · доставка2 целиком"
    };
  }

  // N=2 слот2 без basket2 — пусто; не half и не копия basket.
  return {
    proposed: [],
    remaining: [],
    delivery1: delivery1,
    delivery2: [],
    deliveriesN: n,
    slot: 2,
    legacyNoBasket2: true,
    needManualComposition: true,
    compositionSource: "n2-legacy-no-basket2-slot2",
    hint:
      "ПП N=" +
      n +
      " · слот 2/" +
      n +
      " · нет basket2 — введи вручную или заполни доставку2 (N=2 legacy, не N=1)"
  };
}

export {
  ppCloneBasket_,
  ppBasketHasQty_,
  ppBasketItemKey_,
  isPpChewItem_,
  splitQtyForPpSlot_,
  splitMonthlyBasketToTwoDeliveries_,
  classifyPpCardForN2Split_,
  parsePpDeliveriesN_,
  resolvePpPerDeliverySuggest_
};
