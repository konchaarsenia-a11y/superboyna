/* Маршрут курьера: порядок, минуты и геокод — те же функции, что в app.main.js. */
(function (root, factory) {
  var maps = (typeof module !== "undefined" && module.exports)
    ? require("../courier-maps.js")
    : (root.CourierMaps || {});
  var api = factory(maps);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BoinyaRoute = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (maps) {
  "use strict";

  function looksLikeOtherCity(addr) {
    return maps.looksLikeOtherCity ? maps.looksLikeOtherCity(addr) : false;
  }
  function detectSearchLocality_(text) {
    return maps.detectLocality ? maps.detectLocality(text) : "";
  }
  function geocodeQuery(addr) {
    return maps.geocodeQueryForMaps ? maps.geocodeQueryForMaps(addr) : String(addr || "");
  }
  function normalizeAddressForMaps(addr) {
    return maps.normalizeAddressForMaps ? maps.normalizeAddressForMaps(addr) : String(addr || "");
  }
  function mapsSavedGeoOk_(geo, addr) {
    if (maps.savedGeoUsable) return maps.savedGeoUsable(geo, addr);
    return !!(geo && geo.lat != null && geo.lon != null);
  }
  function parseSearchStreetHouse_(text) {
    return maps.parseStreetHouse ? maps.parseStreetHouse(text) : { street: "", house: "", query: String(text || "") };
  }

  function normalizeHouseKey_(h) {
    return String(h || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, "")
      .replace(/корп\.?|корпус/gi, "к")
      .replace(/стр\.?|строение/gi, "с")
      .replace(/[k]/g, "к");
  }

  function greaterMinskNominatimViewbox_() {
    return "27.15,54.15,28.05,53.65";
  }

  function inGreaterMinskRegion_(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    return lat >= 53.65 && lat <= 54.15 && lon >= 27.15 && lon <= 28.05;
  }

  function inBelarusBbox_(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    return lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9;
  }

  async function nominatimStructuredClient_(street, house, city) {
    if (!street || !house) return [];
    var streetParam = String(house).trim() + " " + String(street).trim();
    var cityName = String(city || "Минск").trim() || "Минск";
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=by&accept-language=ru" +
      "&street=" + encodeURIComponent(streetParam) +
      "&city=" + encodeURIComponent(cityName);
    if (!detectSearchLocality_(cityName) && !looksLikeOtherCity(cityName)) {
      url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewbox_()) + "&bounded=0";
    }
    var res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "superboyna-courier/1.0" }
    });
    if (!res.ok) return [];
    return await res.json();
  }

  function parseOfficeAddress(note) {
    const m = String(note || "").match(/\[ОТДЕЛЕНИЕ:([^\]]+)\]/i);
    return m ? String(m[1] || "").trim() : "";
  }

  function parseDeliveryMethod(note) {
    const n = String(note || "");
    if (/\[ЕВРОПОЧТА\]/i.test(n)) return "euro";
    if (/\[БЕЛПОЧТА\]/i.test(n)) return "bel";
    if (/\[КУРЬЕР\]/i.test(n)) return "courier";
    return null;
  }

  function parseGeoFromNote(note) {
    try {
      var wishGeo = (typeof globalThis !== "undefined" && globalThis.BoinyaWishesGeo) || null;
      if (wishGeo && wishGeo.peel) {
        var hit = wishGeo.peel(note);
        if (hit && hit.geo) return hit.geo;
      }
    } catch (eWishGeo) {}
    const m = String(note || "").match(/\[GEO:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/i);
    if (!m) return null;
    return { lat: Number(m[1]), lon: Number(m[2]) };
  }

  function stripMetaFromNote(note) {
    var base = String(note || "")
      .replace(/\[(?:ЕВРОПОЧТА|БЕЛПОЧТА|КУРЬЕР|ОТДЕЛЕНИЕ:[^\]]*|GEO:[^\]]*|YMAPS:[^\]]*|TEL:[^\]]*|ЦЕНА:[^\]]*|TO:[^\]]*|NOTE:[^\]]*)\]/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    try {
      var wishGeo = (typeof globalThis !== "undefined" && globalThis.BoinyaWishesGeo) || null;
      if (wishGeo && wishGeo.peel) return wishGeo.peel(base).text;
    } catch (eWishGeo) {}
    return base;
  }

  const POST_OFFICES = {
      euro: [
        { address: "Минск, ул. Монтажников, 2", lat: 53.8695, lon: 27.4855 },
        { address: "Минск, ул. Неманская, 67", lat: 53.9538, lon: 27.4335 },
        { address: "Минск, ул. 50 лет Победы, 5а", lat: 53.9385, lon: 27.4860 },
        { address: "Минск, ул. Мележа, 5", lat: 53.9380, lon: 27.5905 },
        { address: "Минск, ул. Притыцкого, 29", lat: 53.9085, lon: 27.4540 },
        { address: "Минск, ул. Казимировская, 6", lat: 53.8470, lon: 27.4765 },
        { address: "Минск, ул. Плеханова, 38", lat: 53.8665, lon: 27.6200 },
        { address: "Минск, пр. Дзержинского, 104", lat: 53.8465, lon: 27.4820 },
        { address: "Минск, пр. Рокоссовского, 99", lat: 53.8705, lon: 27.6010 },
        { address: "Минск, ул. Уманская, 54", lat: 53.8910, lon: 27.4470 },
        { address: "Минск, ул. Есенина, 76", lat: 53.8415, lon: 27.5155 },
        { address: "Минск, ул. Казинца, 52а", lat: 53.8560, lon: 27.5120 },
        { address: "Минск, ул. Маяковского, 154", lat: 53.8690, lon: 27.6205 },
        { address: "Минск, ул. Гошкевича, 3", lat: 53.8440, lon: 27.4700 },
        { address: "Минск, ул. Алибегова, 13", lat: 53.8890, lon: 27.5305 }
      ],
      bel: [
        { address: "Минск, пр. Независимости, 10", lat: 53.9005, lon: 27.5620 },
        { address: "Минск, ул. Притыцкого, 91", lat: 53.9095, lon: 27.4300 },
        { address: "Минск, ул. Якуба Коласа, 51", lat: 53.9280, lon: 27.5850 },
        { address: "Минск, пр. Партизанский, 6", lat: 53.8840, lon: 27.5805 },
        { address: "Минск, ул. Тимирязева, 65", lat: 53.9275, lon: 27.5080 },
        { address: "Минск, ул. Сурганова, 43", lat: 53.9285, lon: 27.5955 },
        { address: "Минск, пр. Дзержинского, 23", lat: 53.8800, lon: 27.5100 },
        { address: "Минск, ул. Рафиева, 60", lat: 53.8455, lon: 27.4505 },
        { address: "Минск, ул. Каховская, 27", lat: 53.8700, lon: 27.6500 },
        { address: "Минск, ул. Ложинская, 22", lat: 53.9530, lon: 27.6050 }
      ]
    };

  const MINSK_CENTER = { lat: 53.9023, lon: 27.5619 };
  const DEPOT_PRESETS = ["Белецкого 10к2"];
  const ROAD_FACTOR = 1.4;
  const AVG_SPEED_KMH = 18;
  const STOP_MINUTES = 4;
  const TRAFFIC_FACTOR = 1.45;
  let departHour = 14;
  let departMinute = 0;
  const routePlanState = {
    matrix: null,
    depot: null,
    routes: [[], []],
    courierCount: 1,
    geoCache: Object.create(null)
  };

    function haversineKm(a, b) {
      const R = 6371;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLon = (b.lon - a.lon) * Math.PI / 180;
      const la1 = a.lat * Math.PI / 180;
      const la2 = b.lat * Math.PI / 180;
      const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    function geoKey(p) {
      if (!p || p.lat == null || p.lon == null) return "";
      return Number(p.lat).toFixed(5) + "," + Number(p.lon).toFixed(5);
    }

    function driveMinutesBetween(a, b) {
      if (!a || !b || a.lat == null || b.lat == null) return 12 * TRAFFIC_FACTOR;
      const m = routePlanState.matrix;
      if (m && m.index && m.durations) {
        const ia = m.index[geoKey(a)];
        const ib = m.index[geoKey(b)];
        if (ia != null && ib != null && m.durations[ia] && m.durations[ia][ib] != null) {
          const sec = Number(m.durations[ia][ib]);
          if (isFinite(sec) && sec >= 0) return Math.max(1, (sec / 60) * TRAFFIC_FACTOR);
        }
      }
      const km = haversineKm(a, b) * ROAD_FACTOR;
      return (km / AVG_SPEED_KMH) * 60 * TRAFFIC_FACTOR;
    }

    async function refreshDriveMatrix(depot, stops) {
      routePlanState.matrix = null;
      const nodes = [depot].concat((stops || []).filter(function (s) {
        return s && s.lat != null && s.lon != null;
      }));
      if (nodes.length < 2) return;
      const index = {};
      nodes.forEach(function (n, i) {
        index[geoKey(n)] = i;
      });
      try {
        const coords = nodes.map(function (n) { return n.lon + "," + n.lat; }).join(";");
        const url = "https://router.project-osrm.org/table/v1/driving/" + coords + "?annotations=duration";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.code === "Ok" && data.durations) {
          routePlanState.matrix = { index: index, durations: data.durations };
        }
      } catch (e) {}
    }

    function estimateDriveOnlyMinutes(depot, stops) {
      if (!stops.length) return 0;
      let t = 0;
      let cur = depot;
      for (let i = 0; i < stops.length; i++) {
        t += driveMinutesBetween(cur, stops[i]);
        cur = stops[i];
      }
      return t;
    }

    function hhmmToMin_(s) {
      var m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      var h = Number(m[1]);
      var mi = Number(m[2]);
      if (h > 23 || mi > 59) return null;
      return h * 60 + mi;
    }

    function departMinutesNow_() {
      return (Number(departHour) || 0) * 60 + (Number(departMinute) || 0);
    }

    function simulateRouteTimeline_(depot, stops, departMin) {
      var t = departMin != null ? departMin : departMinutesNow_();
      var cur = depot;
      var wait = 0;
      var late = 0;
      var drive = 0;
      var items = [];
      for (var i = 0; i < (stops || []).length; i++) {
        var d = driveMinutesBetween(cur, stops[i]);
        drive += d;
        t += d;
        var after = hhmmToMin_(stops[i].deliveryAfter);
        var before = hhmmToMin_(stops[i].deliveryBefore);
        var waited = 0;
        if (after != null && t < after) {
          waited = after - t;
          wait += waited;
          t = after;
        }
        var lateBy = 0;
        if (before != null && t > before) {
          lateBy = t - before;
          late += lateBy;
        }
        items.push({ arrive: t, waited: waited, lateBy: lateBy });
        if (i < stops.length - 1) t += STOP_MINUTES;
        cur = stops[i];
      }
      return { drive: drive, wait: wait, late: late, totalWall: drive + wait, finish: t, items: items };
    }

    function routeWindowScore_(depot, stops, departMin) {
      var sim = simulateRouteTimeline_(depot, stops, departMin);
      return sim.drive + sim.wait * 0.7 + sim.late * 30;
    }

    function nearestNeighborOrder(depot, stops) {
      const left = stops.slice();
      const ordered = [];
      let cur = depot;
      while (left.length) {
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < left.length; i++) {
          const d = driveMinutesBetween(cur, left[i]);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        const next = left.splice(bestI, 1)[0];
        ordered.push(next);
        cur = next;
      }
      return ordered;
    }

    function twoOptImprove(depot, stops, departMin) {
      let route = stops.slice();
      if (route.length < 3) return route;
      let improved = true;
      let guard = 0;
      while (improved && guard < 50) {
        improved = false;
        guard++;
        const base = routeWindowScore_(depot, route, departMin);
        for (let i = 0; i < route.length - 1; i++) {
          for (let k = i + 1; k < route.length; k++) {
            const cand = route.slice(0, i)
              .concat(route.slice(i, k + 1).reverse())
              .concat(route.slice(k + 1));
            const score = routeWindowScore_(depot, cand, departMin);
            if (score + 0.05 < base) {
              route = cand;
              improved = true;
              i = route.length;
              break;
            }
          }
        }
      }
      return route;
    }

    function optimizeRouteOrder(depot, stops) {
      const departMin = departMinutesNow_();
      const withGeo = (stops || []).filter(function (s) { return s && s.lat != null; });
      const noGeo = (stops || []).filter(function (s) { return !s || s.lat == null; });
      if (withGeo.length <= 1) return withGeo.concat(noGeo);
      const seeded = withGeo.slice().sort(function (a, b) {
        var ba = hhmmToMin_(a.deliveryBefore);
        var bb = hhmmToMin_(b.deliveryBefore);
        if (ba != null && bb != null && ba !== bb) return ba - bb;
        if (ba != null && bb == null) return -1;
        if (ba == null && bb != null) return 1;
        var aa = hhmmToMin_(a.deliveryAfter);
        var ab = hhmmToMin_(b.deliveryAfter);
        if (aa != null && ab != null && aa !== ab) return aa - ab;
        return 0;
      });
      let best = nearestNeighborOrder(depot, seeded);
      let bestScore = routeWindowScore_(depot, best, departMin);
      const limit = Math.min(seeded.length, 12);
      for (let i = 0; i < limit; i++) {
        const start = seeded[i];
        const rest = seeded.filter(function (_, idx) { return idx !== i; });
        const cand = [start].concat(nearestNeighborOrder(start, rest));
        const score = routeWindowScore_(depot, cand, departMin);
        if (score < bestScore) {
          best = cand;
          bestScore = score;
        }
      }
      best = twoOptImprove(depot, best, departMin);
      return best.concat(noGeo);
    }

    function estimateRouteMinutes(depot, stops) {

      if (!stops.length) return 0;
      let t = 0;
      let cur = depot;
      for (let i = 0; i < stops.length; i++) {
        t += driveMinutesBetween(cur, stops[i]);
        if (i < stops.length - 1) t += STOP_MINUTES;
        cur = stops[i];
      }
      return Math.round(t);
    }

    function bearingFrom(depot, p) {
      const dLon = (p.lon - depot.lon) * Math.PI / 180;
      const lat1 = depot.lat * Math.PI / 180;
      const lat2 = p.lat * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function mapsSavedGeoOk_(geo, addr) {
      if (window.CourierMaps && typeof window.CourierMaps.savedGeoUsable === "function") {
        return window.CourierMaps.savedGeoUsable(geo, addr);
      }
      return !!(geo && geo.lat != null && geo.lon != null && inBelarusBbox_(geo.lat, geo.lon));
    }

    function pickNominatimGeocodeHit_(data, addr) {
      var wantH = "";
      try {
        var parsed = (window.CourierMaps && window.CourierMaps.parseStreetHouse)
          ? window.CourierMaps.parseStreetHouse(addr)
          : parseSearchStreetHouse_(addr);
        wantH = normalizeHouseKey_((parsed && parsed.house) || "");
      } catch (eH) {}
      var other = !!(looksLikeOtherCity(addr) || detectSearchLocality_(addr));
      var best = null;
      var bestScore = -1;
      (data || []).forEach(function (row) {
        if (!row) return;
        var lat = Number(row.lat);
        var lon = Number(row.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        if (!inBelarusBbox_(lat, lon)) return;
        var ad = row.address || {};
        var house = String(ad.house_number || row.house || "");
        var typ = String(row.addresstype || row.type || row.class || row.category || "");
        var score = 0;
        if (inGreaterMinskRegion_(lat, lon) || other) score += 20;
        else score -= 25;
        if (wantH && house && normalizeHouseKey_(house) === wantH) score += 50;
        else if (wantH && !house) score -= 18;
        if (/house|building|residential|yes/.test(typ)) score += 12;
        if (/street|road|city|town|suburb/.test(typ) && wantH) score -= 10;
        if (score > bestScore) {
          bestScore = score;
          best = { lat: lat, lon: lon, house: house || wantH };
        }
      });
      return best;
    }

    function rememberGeocodeHit_(key, hit) {
      if (!hit || hit.lat == null) return hit;
      routePlanState.geoCache[key] = hit;
      try { localStorage.setItem("geo:" + key, JSON.stringify(hit)); } catch (e2) {}
      return hit;
    }

    async function geocodeAddress(addr, rawQuery) {
      const query = rawQuery ? geocodeQuery(addr) : geocodeQuery(normalizeAddressForMaps(addr));
      const key = String(query || "").trim().toLowerCase();
      if (!key) return null;
      if (routePlanState.geoCache[key] && mapsSavedGeoOk_(routePlanState.geoCache[key], addr)) {
        return routePlanState.geoCache[key];
      }
      try {
        const cached = localStorage.getItem("geo:" + key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.lat != null && mapsSavedGeoOk_(parsed, addr)) {
            var wantH = "";
            try {
              var pH = (window.CourierMaps && window.CourierMaps.parseStreetHouse)
                ? window.CourierMaps.parseStreetHouse(addr)
                : parseSearchStreetHouse_(addr);
              wantH = normalizeHouseKey_((pH && pH.house) || "");
            } catch (eH) {}
            if (wantH && (!parsed.house || normalizeHouseKey_(parsed.house) !== wantH)) {
              // кэш без дома / другой дом — перегеокод
            } else {
              routePlanState.geoCache[key] = parsed;
              return parsed;
            }
          }
        }
      } catch (e) {}

      var parsedAddr = (window.CourierMaps && window.CourierMaps.parseStreetHouse)
        ? window.CourierMaps.parseStreetHouse(addr)
        : parseSearchStreetHouse_(addr);
      var cityForStruct = "Минск";
      var locWant = detectSearchLocality_(addr);
      if (locWant) cityForStruct = locWant;
      else if (looksLikeOtherCity(addr)) cityForStruct = String(addr);

      try {
        if (parsedAddr && parsedAddr.house && parsedAddr.street) {
          var structured = await nominatimStructuredClient_(parsedAddr.street, parsedAddr.house, cityForStruct);
          var structHit = pickNominatimGeocodeHit_(structured, addr);
          if (structHit) {
            await new Promise(function (r) { setTimeout(r, 1100); });
            return rememberGeocodeHit_(key, structHit);
          }
          await new Promise(function (r) { setTimeout(r, 1100); });
        }
      } catch (eSt) {}

      const variants = [query];
      const plain = String((parsedAddr && parsedAddr.query) || addr || "").trim();
      if (plain && plain.toLowerCase() !== query.toLowerCase()) variants.push(geocodeQuery(plain));

      const stripped = (window.CourierMaps && window.CourierMaps.stripDetailsForGeocode)
        ? window.CourierMaps.stripDetailsForGeocode(addr)
        : String(addr || "").replace(/,?\s*(кв\.?|квартира)\s*\d+[а-яa-z]?/ig, "").replace(/корп\.?\s*\d+/ig, "").trim();
      if (stripped && stripped !== plain) variants.push(geocodeQuery(stripped));

      for (let v = 0; v < variants.length; v++) {
        const q = encodeURIComponent(variants[v]);
        var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=by&accept-language=ru&q=" + q;
        if (!locWant && !looksLikeOtherCity(addr)) {
          url += "&viewbox=" + encodeURIComponent(greaterMinskNominatimViewbox_()) + "&bounded=0";
        }
        try {
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (!res.ok) continue;
          const data = await res.json();
          await new Promise(function (r) { setTimeout(r, 1100); });
          var hit = pickNominatimGeocodeHit_(data, addr);
          if (!hit) continue;
          return rememberGeocodeHit_(key, hit);
        } catch (e3) {}
      }
      return null;
    }
    /** marker courier-maps-by-h1 */

    async function nearestPostOffice(kind, depot) {
      const list = POST_OFFICES[kind] || POST_OFFICES.euro;
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const office = list[i];
        const geo = { lat: office.lat, lon: office.lon };
        const d = haversineKm(depot, geo);
        if (!best || d < best.dist) {
          best = { address: office.address, lat: office.lat, lon: office.lon, dist: d };
        }
      }
      return best || { address: list[0].address, lat: list[0].lat, lon: list[0].lon, dist: 0 };
    }

    function formatMinutes(m) {
      m = Math.max(0, Math.round(Number(m) || 0));
      if (m < 60) return "~" + m + " мин";
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return "~" + h + " ч " + (mm ? mm + " мин" : "");
    }

    function driveMinutesToStop(depot, stops, index) {
      if (!stops || !stops[index]) return 5;
      const from = index <= 0 ? (depot || stops[0]) : stops[index - 1];
      return Math.max(1, Math.round(driveMinutesBetween(from, stops[index])));
    }

    function approxMinutesForClient(mins) {
      const m = Math.max(5, Math.round(Number(mins) || 0));
      return Math.max(5, Math.round(m / 5) * 5);
    }

    function etaLabelForStop(depot, stops, index, depart) {

      const arrive = driveMinutesToStop(depot, stops, index);
      if (!depart) return "через ~" + arrive + " мин";
      const a = new Date(depart.getTime() + arrive * 60000);
      return String(a.getHours()).padStart(2, "0") + ":" + String(a.getMinutes()).padStart(2, "0");
    }

    function geoCentroid_(stops) {
      var n = 0, lat = 0, lon = 0;
      (stops || []).forEach(function (s) {
        if (s && s.lat != null && s.lon != null) {
          lat += Number(s.lat); lon += Number(s.lon); n++;
        }
      });
      if (!n) return null;
      return { lat: lat / n, lon: lon / n };
    }

    function splitGeographic2_(stops) {
      var list = (stops || []).filter(function (s) { return s && s.lat != null; });
      if (list.length <= 1) return [list.slice(), []];
      var a = list[0], b = list[1], bestD = -1;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var d = haversineKm(list[i], list[j]);
          if (d > bestD) { bestD = d; a = list[i]; b = list[j]; }
        }
      }
      var ca = { lat: a.lat, lon: a.lon };
      var cb = { lat: b.lat, lon: b.lon };
      var A = [], B = [];
      for (var iter = 0; iter < 14; iter++) {
        A = []; B = [];
        list.forEach(function (s) {
          if (haversineKm(s, ca) <= haversineKm(s, cb)) A.push(s);
          else B.push(s);
        });
        if (!A.length || !B.length) {
          var depot = routePlanState.depot || { lat: 53.9, lon: 27.56 };
          var sorted = list.slice().sort(function (x, y) {
            return bearingFrom(depot, x) - bearingFrom(depot, y);
          });
          var mid = Math.ceil(sorted.length / 2);
          return [sorted.slice(0, mid), sorted.slice(mid)];
        }
        ca = geoCentroid_(A) || ca;
        cb = geoCentroid_(B) || cb;
      }
      return [A, B];
    }

    function balanceTwoRoutes_(depot, a, b) {
      var departMin = departMinutesNow_();
      a = optimizeRouteOrder(depot, a);
      b = optimizeRouteOrder(depot, b);
      for (var guard = 0; guard < 24; guard++) {
        var sa = routeWindowScore_(depot, a, departMin);
        var sb = routeWindowScore_(depot, b, departMin);
        if (Math.abs(sa - sb) < 10) break;
        var fromLong = sa > sb;
        var from = fromLong ? a : b;
        var to = fromLong ? b : a;
        var toC = geoCentroid_(to) || depot;
        var fromC = geoCentroid_(from) || depot;
        var best = null;
        for (var i = 0; i < from.length; i++) {
          var cand = from[i];
          if (haversineKm(cand, fromC) + 0.4 < haversineKm(cand, toC)) continue;
          var from2 = from.slice(0, i).concat(from.slice(i + 1));
          var to2 = to.concat([cand]);
          from2 = optimizeRouteOrder(depot, from2);
          to2 = optimizeRouteOrder(depot, to2);
          var sFrom = routeWindowScore_(depot, from2, departMin);
          var sTo = routeWindowScore_(depot, to2, departMin);
          var lateBefore = simulateRouteTimeline_(depot, from, departMin).late + simulateRouteTimeline_(depot, to, departMin).late;
          var lateAfter = simulateRouteTimeline_(depot, from2, departMin).late + simulateRouteTimeline_(depot, to2, departMin).late;
          if (lateAfter > lateBefore + 0.5) continue;
          var bal = Math.max(sFrom, sTo) * 1000 + Math.abs(sFrom - sTo);
          var balOld = Math.max(sa, sb) * 1000 + Math.abs(sa - sb);
          if (bal + 1 < balOld) {
            if (!best || bal < best.bal) best = { from2: from2, to2: to2, bal: bal, fromLong: fromLong };
          }
        }
        if (!best) break;
        if (best.fromLong) { a = best.from2; b = best.to2; }
        else { b = best.from2; a = best.to2; }
      }
      return [a, b];
    }

    function autoSplitStops(stops) {
      const depot = routePlanState.depot || { lat: 53.9, lon: 27.56 };
      const withGeo = stops.filter(function (s) { return s.lat != null; });
      const noGeo = stops.filter(function (s) { return s.lat == null; });

      if (routePlanState.courierCount === 1 || stops.length <= 1) {
        routePlanState.routes = [optimizeRouteOrder(depot, withGeo.concat(noGeo)), []];
        return;
      }

      if (!withGeo.length) {
        const half = Math.ceil(noGeo.length / 2);
        routePlanState.routes = [noGeo.slice(0, half), noGeo.slice(half)];
        return;
      }

      var parts = splitGeographic2_(withGeo);
      var a = parts[0] || [];
      var b = parts[1] || [];
      var balanced = balanceTwoRoutes_(depot, a, b);
      a = balanced[0];
      b = balanced[1];
      noGeo.forEach(function (s) {
        var ta = estimateRouteMinutes(depot, a);
        var tb = estimateRouteMinutes(depot, b);
        if (ta <= tb) a.push(s);
        else b.push(s);
      });
      routePlanState.routes = [optimizeRouteOrder(depot, a), optimizeRouteOrder(depot, b)];
    }

  function igMessageForStop(depot, stops, index) {
    const mins = approxMinutesForClient(driveMinutesToStop(depot, stops, index));
    return "Здравствуйте! Буду примерно через " + mins + " мин.";
  }

  function cuttingFlags(items) {
    return (items || []).map(function (it) {
      return [
        it.row,
        it.laid ? 1 : 0,
        it.done ? 1 : 0,
        it.outNext ? 1 : 0,
        Number(it.surplus) || 0
      ].join(",");
    }).join("|");
  }

  function missingEnc(missing) {
    return (missing || []).map(function (m) {
      return String(m.row) + "~" + String(m.name || "").replace(/[|~]/g, " ");
    }).join("|");
  }

  return {
    POST_OFFICES: POST_OFFICES,
    DEPOT_PRESETS: DEPOT_PRESETS,
    MINSK_CENTER: MINSK_CENTER,
    STOP_MINUTES: STOP_MINUTES,
    state: routePlanState,
    setDepart: function (h, m) { departHour = Number(h) || 0; departMinute = Number(m) || 0; },
    setCourierCount: function (n) { routePlanState.courierCount = n === 2 ? 2 : 1; },
    haversineKm: haversineKm,
    optimizeRouteOrder: optimizeRouteOrder,
    estimateRouteMinutes: estimateRouteMinutes,
    approxMinutesForClient: approxMinutesForClient,
    autoSplitStops: autoSplitStops,
    driveMinutesBetween: driveMinutesBetween,
    formatMinutes: formatMinutes,
    geocodeAddress: geocodeAddress,
    nearestPostOffice: nearestPostOffice,
    refreshDriveMatrix: refreshDriveMatrix,
    parseDeliveryMethod: parseDeliveryMethod,
    parseOfficeAddress: parseOfficeAddress,
    parseGeoFromNote: parseGeoFromNote,
    normalizeAddressForMaps: normalizeAddressForMaps,
    stripMetaFromNote: stripMetaFromNote,
    igMessageForStop: igMessageForStop,
    driveMinutesToStop: driveMinutesToStop,
    moveStopBetweenRoutes: function (fromRoute, stopIndex, toRoute) {
      const item = routePlanState.routes[fromRoute].splice(stopIndex, 1)[0];
      if (!item) return;
      routePlanState.routes[toRoute].push(item);
      const depot = routePlanState.depot;
      routePlanState.routes[toRoute] = optimizeRouteOrder(depot, routePlanState.routes[toRoute]);
      routePlanState.routes[fromRoute] = optimizeRouteOrder(depot, routePlanState.routes[fromRoute]);
    },
    cuttingFlags: cuttingFlags,
    missingEnc: missingEnc
  };
});
