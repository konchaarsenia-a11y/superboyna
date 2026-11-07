/**
 * t441u/t442u: ПП состав доставки без auto half-split.
 * N=1 — только доставка1 (basket); basket2/stale не делают вторую.
 * N=2 — ПП1=basket, ПП2=basket2 целиком. Без basket2 не выдумываем half/копию.
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
  parsePpDeliveriesN_,
  resolvePpPerDeliverySuggest_
};
