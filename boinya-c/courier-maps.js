/**
 * Карта курьера: геокод-запрос с bias Минск/Беларусь + Yandex URL без обрезки стопов.
 * marker: courier-maps-by-h1
 */
(function (root) {
  var DEFAULT_CITY = "Минск";
  var COUNTRY = "Беларусь";
  var YANDEX_MAX_POINTS = 25;
  var YANDEX_URL_SOFT_MAX = 1800;
  var OTHER_CITY_RE =
    /(брест|гродн|гомел|витебск|могил[её]в|борисов|жодино|молодечн|баранович|пинск|орша|полоцк|лида|слоним|бобруйск|солигорск|слуцк|дзержинск|фанипол|смолевич|светлогорск|жлобин|речиц|новополоцк|мозыр|колодищ|голодищ|городищ|боровлян|жданович|ратомк|миханович|семков|прилук|крыжовк|хатежин|тарасов|раубич|озерц|щепич|заславл|логойск|руденск|мачулищ|сеница|копищ|юхновк|лесной|гай\b)/i;
  var LOCALITY_RE =
    /(колодищ\w*|голодищ\w*|городищ\w*|боровлян\w*|жданович\w*|фанипол\w*|дзержинск\w*|смолевич\w*|ратомк\w*|миханович\w*|семков\w*|прилук\w*|крыжовк\w*|хатежин\w*|тарасов\w*|раубич\w*|озерц\w*|щепич\w*|заславл\w*|логойск\w*|руденск\w*|мачулищ\w*|сениц\w*|копищ\w*|юхновк\w*|лесной|боровляны|брест\w*|гродн\w*|гомел\w*|витебск\w*|могил[её]в\w*|борисов\w*|жодино|молодечн\w*|баранович\w*|пинск\w*|орша|полоцк\w*|лида|слоним\w*|бобруйск\w*|солигорск\w*|слуцк\w*)/i;

  function looksLikeOtherCity(addr) {
    return OTHER_CITY_RE.test(String(addr || ""));
  }

  function detectLocality(text) {
    var m = String(text || "").match(LOCALITY_RE);
    if (!m) return "";
    var loc = String(m[0] || "");
    if (/^голодищ/i.test(loc)) loc = loc.replace(/^голодищ/i, "Колодищ");
    return loc;
  }

  function stripDetailsForGeocode(raw) {
    var s = String(raw || "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    s = s
      .replace(/[·|]+/g, ", ")
      .replace(/(?:^|[;,\s])(?:подъезд|под\.)\s*[0-9]+[а-яa-z]?/gi, " ")
      .replace(/(?:^|[;,\s])п\.?\s*под\.?\s*[0-9]+[а-яa-z]?/gi, " ")
      .replace(/(?:^|[;,\s])п\.?\s*[0-9]+[а-яa-z]?(?=\s|,|$)/gi, " ")
      .replace(/(?:^|[;,\s])(?:этаж|эт\.?)\s*[0-9]+[а-яa-z]?/gi, " ")
      .replace(/(?:^|[;,\s])(?:квартира|кв\.?)\s*[0-9]+[а-яa-z\-\/]*/gi, " ")
      .replace(/(?:^|[;,\s])[0-9]+[а-яa-z\-\/]*\s*кв\.?\b/gi, " ")
      .replace(/(?:^|[;,\s])домофон\s*[^\s;,.]{1,24}/gi, " ")
      .replace(/(?:^|[;,\s])код\s*[^\s;,.]{1,24}/gi, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/(?:,\s*){2,}/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,.\s]+|[,.\s]+$/g, "")
      .trim();
    return s || String(raw || "").trim();
  }

  function parseStreetHouse(text) {
    var raw0 = String(text || "").trim().replace(/\s+/g, " ");
    if (!raw0) return { street: "", house: "", query: "" };
    var s = stripDetailsForGeocode(raw0) || raw0;
    var house = "";
    var street = s;
    var m = s.match(/^(.*?)(?:,\s*|\s+)(?:д\.?|дом)\s*([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
    if (m && /[а-яa-z]/i.test(m[1])) {
      street = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
      house = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");
      return { street: street, house: house, query: (street + ", " + house).trim() };
    }
    m = s.match(/^(.*?)(?:,\s*|\s+)([0-9]+[а-яa-z]?(?:\s*[\/кk]\s*[0-9]+[а-яa-z]?)?)\s*$/i);
    if (m) {
      var st = String(m[1] || "").trim().replace(/[,\s]+$/g, "");
      var hn = String(m[2] || "").replace(/\s+/g, "").replace(/[k]/gi, "к");
      if (st && /[а-яa-z]/i.test(st) && !/^\d{5,6}$/.test(hn)) {
        street = st;
        house = hn;
      }
    }
    var query = house ? (street + ", " + house).trim() : street;
    return { street: street, house: house, query: query };
  }

  function geocodeQueryForMaps(addr) {
    var parsed = parseStreetHouse(addr);
    var core = parsed.query || stripDetailsForGeocode(addr);
    if (!core) return "";
    if (/беларусь/i.test(core)) return core;
    if (looksLikeOtherCity(core) || detectLocality(core)) {
      if (/минск/i.test(core) && !looksLikeOtherCity(core) && !detectLocality(core)) {
        return COUNTRY + ", " + core;
      }
      return COUNTRY + ", " + core;
    }
    if (/минск/i.test(core)) return COUNTRY + ", " + core;
    return COUNTRY + ", " + DEFAULT_CITY + ", " + core;
  }

  function normalizeAddressForMaps(addr) {
    var parsed = parseStreetHouse(addr);
    var a = parsed.query || String(addr || "").trim();
    if (!a) return "";
    if (/минск/i.test(a) || looksLikeOtherCity(a) || detectLocality(a)) return a;
    return DEFAULT_CITY + ", " + a;
  }

  function inBelarusBbox(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    return lat >= 51.2 && lat <= 56.3 && lon >= 23.1 && lon <= 32.9;
  }

  function inGreaterMinskRegion(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    return lat >= 53.65 && lat <= 54.15 && lon >= 27.15 && lon <= 28.05;
  }

  function savedGeoUsable(geo, addr) {
    if (!geo || geo.lat == null || geo.lon == null) return false;
    if (!inBelarusBbox(geo.lat, geo.lon)) return false;
    var other = looksLikeOtherCity(addr) || detectLocality(addr);
    if (!other && !inGreaterMinskRegion(geo.lat, geo.lon)) return false;
    return true;
  }

  function collectDayMapClients(clients) {
    var out = [];
    var seen = Object.create(null);
    (clients || []).forEach(function (c, idx) {
      if (!c) return;
      var addr = String(c.address || c.clientAddress || "").trim();
      if (!addr) return;
      var key = String(c.matchKey || c.name || addr).trim().toLowerCase();
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      out.push({
        name: String(c.name || "").trim(),
        address: addr,
        delivered: !!c.delivered,
        geo: c.geo || null,
        note: c.note || "",
        index: idx
      });
    });
    return out;
  }

  function pointToYandexRtext(p) {
    if (p == null) return "";
    if (typeof p === "object") {
      if (p.lat != null && p.lon != null && isFinite(Number(p.lat)) && isFinite(Number(p.lon))) {
        return Number(p.lat) + "," + Number(p.lon);
      }
      var addr = String(p.address || "").trim();
      if (addr) return geocodeQueryForMaps(addr);
      return "";
    }
    var s = String(p).trim();
    if (!s) return "";
    if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(s)) return s.replace(/\s+/g, "");
    return geocodeQueryForMaps(s);
  }

  function encodeRtext(rtext) {
    return encodeURIComponent(rtext).replace(/%2C/gi, ",").replace(/%7E/gi, "~");
  }

  function buildYandexRouteUrl(points) {
    var rtext = (points || []).map(pointToYandexRtext).filter(Boolean).join("~");
    if (!rtext) return "https://yandex.ru/maps/";
    return "https://yandex.ru/maps/?mode=routes&rtt=auto&rtext=" + encodeRtext(rtext);
  }

  function buildYandexMapsAppUrl(points) {
    var rtext = (points || []).map(pointToYandexRtext).filter(Boolean).join("~");
    if (!rtext) return "yandexmaps://maps.yandex.ru/";
    return "yandexmaps://maps.yandex.ru/?rtt=auto&rtext=" + encodeRtext(rtext);
  }

  function buildYandexWidgetUrl(points) {
    var rtext = (points || []).map(pointToYandexRtext).filter(Boolean).join("~");
    if (!rtext) return "https://yandex.ru/map-widget/v1/?lang=ru_RU";
    return "https://yandex.ru/map-widget/v1/?lang=ru_RU&mode=routes&rtt=auto&rtext=" + encodeRtext(rtext);
  }

  function buildYandexPointUrl(p) {
    if (p && p.lat != null && p.lon != null && isFinite(Number(p.lat)) && isFinite(Number(p.lon))) {
      return "https://yandex.ru/maps/?pt=" + Number(p.lon) + "," + Number(p.lat) + "&z=17&l=map";
    }
    var addr = geocodeQueryForMaps((p && (p.address || p.name)) || p || "");
    var u = "https://yandex.ru/maps/?text=" + encodeURIComponent(addr);
    return u;
  }

  function urlLen(url) {
    return String(url || "").length;
  }

  function splitRouteChunks(points, opts) {
    opts = opts || {};
    var maxPoints = Number(opts.maxPoints) > 0 ? Number(opts.maxPoints) : YANDEX_MAX_POINTS;
    var maxUrl = Number(opts.maxUrlLen) > 0 ? Number(opts.maxUrlLen) : YANDEX_URL_SOFT_MAX;
    var list = (points || []).filter(function (p) {
      return p && (pointToYandexRtext(p) || (p.address || p.name));
    });
    if (!list.length) return [];
    var chunks = [];
    var i = 0;
    while (i < list.length) {
      var take = Math.min(maxPoints, list.length - i);
      var slice = list.slice(i, i + take);
      while (slice.length > 1 && urlLen(buildYandexRouteUrl(slice)) > maxUrl) {
        slice = slice.slice(0, slice.length - 1);
      }
      if (!slice.length) {
        slice = [list[i]];
      }
      chunks.push(slice);
      if (i + slice.length >= list.length) break;
      i += Math.max(1, slice.length - 1);
    }
    return chunks;
  }

  var api = {
    DEFAULT_CITY: DEFAULT_CITY,
    COUNTRY: COUNTRY,
    YANDEX_MAX_POINTS: YANDEX_MAX_POINTS,
    YANDEX_URL_SOFT_MAX: YANDEX_URL_SOFT_MAX,
    looksLikeOtherCity: looksLikeOtherCity,
    detectLocality: detectLocality,
    stripDetailsForGeocode: stripDetailsForGeocode,
    parseStreetHouse: parseStreetHouse,
    geocodeQueryForMaps: geocodeQueryForMaps,
    normalizeAddressForMaps: normalizeAddressForMaps,
    inBelarusBbox: inBelarusBbox,
    inGreaterMinskRegion: inGreaterMinskRegion,
    savedGeoUsable: savedGeoUsable,
    collectDayMapClients: collectDayMapClients,
    pointToYandexRtext: pointToYandexRtext,
    buildYandexRouteUrl: buildYandexRouteUrl,
    buildYandexMapsAppUrl: buildYandexMapsAppUrl,
    buildYandexWidgetUrl: buildYandexWidgetUrl,
    buildYandexPointUrl: buildYandexPointUrl,
    splitRouteChunks: splitRouteChunks,
    MARKER: "courier-maps-by-h1"
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CourierMaps = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
