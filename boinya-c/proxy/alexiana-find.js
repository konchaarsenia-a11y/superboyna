/** Поиск «Алексиана / alexiana» и близких написаний. Ничего не пишет. */

import { afkSamePerson_ } from "./afk-guard.js";

const CYR_STEMS_ = ["алексиана", "алексианна"];
const LATIN_STEMS_ = ["alexiana", "aleksiana", "alexianna", "aleksianna"];

const CYR_LAT_ = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya"
};

export function alexianaSheet_(row) {
  const s = String((row && (row.sheet || row.segment)) || "").trim().toUpperCase();
  if (s === "АФК" || s === "AFK") return "АФК";
  if (s === "ПП" || s === "PP" || s === "SUBSCRIPTION") return "ПП";
  if (s === "БП" || s === "BP") return "БП";
  return s;
}

function fold_(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s._\-]+/g, "");
}

function latin_(raw) {
  const src = String(raw || "").toLowerCase().replace(/ё/g, "е");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (CYR_LAT_[ch]) out += CYR_LAT_[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
  }
  return out;
}

export function alexianaHitText_(raw) {
  const fold = fold_(raw);
  const lat = latin_(raw);
  if (!fold && !lat) return false;
  for (let i = 0; i < CYR_STEMS_.length; i++) {
    if (fold.indexOf(CYR_STEMS_[i]) >= 0) return true;
  }
  for (let j = 0; j < LATIN_STEMS_.length; j++) {
    if (lat.indexOf(LATIN_STEMS_[j]) >= 0 || fold.indexOf(LATIN_STEMS_[j]) >= 0) return true;
  }
  return false;
}

export function alexianaHitRow_(row) {
  if (!row) return false;
  const fields = [row.nick, row.label, row.client, row.name, row.match_key, row.matchKey];
  for (let i = 0; i < fields.length; i++) {
    if (alexianaHitText_(fields[i])) return true;
  }
  return false;
}

function subId_(row) {
  return String((row && (row.subId || row.id)) || "").trim();
}

function find_(parent, i) {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

function sameGroup_(a, b) {
  const sa = subId_(a);
  const sb = subId_(b);
  if (sa && sb && sa === sb && a.kind !== "client" && b.kind !== "client") return true;
  return afkSamePerson_(a, b);
}

export function groupAlexiana_(rows) {
  const hits = (rows || []).filter(alexianaHitRow_);
  const parent = [];
  for (let i = 0; i < hits.length; i++) parent[i] = i;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      if (!sameGroup_(hits[i], hits[j])) continue;
      const pa = find_(parent, i);
      const pb = find_(parent, j);
      if (pa !== pb) parent[pb] = pa;
    }
  }
  const buckets = Object.create(null);
  const order = [];
  for (let i = 0; i < hits.length; i++) {
    const r = find_(parent, i);
    if (!buckets[r]) {
      buckets[r] = [];
      order.push(r);
    }
    buckets[r].push(hits[i]);
  }
  return order.map(function (r) {
    return { members: buckets[r] };
  });
}

/** Один человек и ровно одна карточка ПП — можно жать «В АФК». Иначе только список. */
export function alexianaMoveDecision_(groups) {
  const list = groups || [];
  if (!list.length) return { action: "none", groups: 0 };
  if (list.length !== 1) return { action: "list", groups: list.length };
  const cards = (list[0].members || []).filter(function (row) {
    return row.kind === "card";
  });
  const pp = cards.filter(function (row) {
    return alexianaSheet_(row) === "ПП";
  });
  if (cards.length === 1 && pp.length === 1) {
    return { action: "move", groups: 1, card: pp[0] };
  }
  return { action: "list", groups: 1, cards: cards.length, pp: pp.length };
}
