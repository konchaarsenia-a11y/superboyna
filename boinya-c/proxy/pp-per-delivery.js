/**
 * t441u: ПП N≥2 — состав доставки целиком, без auto half-split.
 * ПП1 = basket, ПП2 = basket2. Legacy без basket2 не выдумываем и не делим.
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
 * @param {object} opts
 * @param {array} opts.basket delivery1 / N=1
 * @param {array} [opts.basket2] delivery2
 * @param {number} opts.slot 1|2
 * @param {number} opts.deliveriesN
 */
function resolvePpPerDeliverySuggest_(opts) {
  opts = opts || {};
  const deliveriesN = Math.max(1, Number(opts.deliveriesN) || 1);
  const slot = Math.max(1, Number(opts.slot) || 1);
  const delivery1 = ppCloneBasket_(opts.basket);
  const delivery2 = ppCloneBasket_(opts.basket2);
  const has2 = ppBasketHasQty_(delivery2);

  if (deliveriesN <= 1) {
    return {
      proposed: delivery1,
      remaining: [],
      delivery1: delivery1,
      delivery2: [],
      legacyNoBasket2: false,
      needManualComposition: false,
      compositionSource: "n1-whole",
      hint: "ПП N=1 · состав целиком"
    };
  }

  if (slot <= 1) {
    // t441u: ПП1 = basket целиком; half не делаем. Без basket2 — флаг legacy, не remainder-half.
    return {
      proposed: delivery1,
      remaining: has2 ? delivery2 : [],
      delivery1: delivery1,
      delivery2: has2 ? delivery2 : [],
      legacyNoBasket2: !has2,
      needManualComposition: false,
      compositionSource: has2 ? "per-delivery" : "legacy-slot1-whole",
      hint: has2
        ? "ПП N=" + deliveriesN + " · слот 1/" + deliveriesN + " · доставка1 целиком"
        : "ПП N=" +
          deliveriesN +
          " · слот 1/" +
          deliveriesN +
          " · доставка1 целиком · нет basket2 (legacy, не делим)"
    };
  }

  if (has2) {
    return {
      proposed: delivery2,
      remaining: [],
      delivery1: delivery1,
      delivery2: delivery2,
      legacyNoBasket2: false,
      needManualComposition: false,
      compositionSource: "per-delivery",
      hint: "ПП N=" + deliveriesN + " · слот 2/" + deliveriesN + " · доставка2 целиком"
    };
  }

  // t441u: ПП2 без basket2 — пусто; не half от basket и не копия доставки1.
  return {
    proposed: [],
    remaining: [],
    delivery1: delivery1,
    delivery2: [],
    legacyNoBasket2: true,
    needManualComposition: true,
    compositionSource: "legacy-no-basket2",
    hint:
      "ПП N=" +
      deliveriesN +
      " · слот 2/" +
      deliveriesN +
      " · нет basket2 — введи вручную или заполни доставку2 в подписке (legacy не делим)"
  };
}

export { ppCloneBasket_, ppBasketHasQty_, resolvePpPerDeliverySuggest_ };
