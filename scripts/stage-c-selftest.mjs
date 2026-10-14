function rawKg(dryG, coef, piece) {
  const c = Number(coef) || (piece ? 1 : 0.2);
  const n = piece ? (Number(dryG) || 0) : (Number(dryG) || 0) / 1000 / (c || 0.2);
  return Math.round(n * 100) / 100;
}

function closeStock(stock, arrival, spent) {
  return Math.max(0, (Number(stock) || 0) + (Number(arrival) || 0) - (Number(spent) || 0));
}

if (rawKg(5000, 0.2, false) !== 25) throw new Error("усушка 5000 г / 0.2 = 25 кг");
if (rawKg(3, 1, true) !== 3) throw new Error("штучный остаток без деления");
if (closeStock(10, 2, 5) !== 7) throw new Error("закрытие F+B−сырьё");
if (closeStock(1, 0, 4) !== 0) throw new Error("остаток не уходит ниже нуля");
console.log("STAGE_C_SELFTEST_OK");
