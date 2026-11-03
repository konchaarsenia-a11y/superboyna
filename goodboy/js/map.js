/**
 * Карта Минска: Leaflet + тайлы OSM, точки из data/minsk-dog-places.json.
 * Координаты не выдумываются. Если файл не открылся, пинов нет.
 */
(function (global) {
  "use strict";

  var data = null;
  var loading = null;
  var map = null;
  var layer = null;

  var LABELS = {
    all: "Все",
    cafe: "Кафе",
    shop: "Зоомагазин",
    vet: "Ветклиника",
    groom: "Груминг",
    play: "Площадка",
    park: "Парк",
    partner: "Партнёр"
  };

  function ver() {
    return (global.GB_CONFIG && global.GB_CONFIG.version) || "0";
  }

  function esc(s) {
    if (global.GBUI && global.GBUI.esc) return global.GBUI.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadData() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch("data/minsk-dog-places.json?v=" + encodeURIComponent(ver()), { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("places " + r.status);
        return r.json();
      })
      .then(function (body) {
        var places = Array.isArray(body && body.places) ? body.places : [];
        var partners = Array.isArray(body && body.partners) ? body.partners : [];
        data = { places: places, partners: partners, source: (body && body.source) || "OpenStreetMap" };
        return data;
      });
    return loading;
  }

  function ensureLeaflet() {
    if (global.L && global.L.map) return Promise.resolve(global.L);
    if (ensureLeaflet._p) return ensureLeaflet._p;
    ensureLeaflet._p = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.crossOrigin = "";
      document.head.appendChild(css);
      var script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.crossOrigin = "";
      script.onload = function () { resolve(global.L); };
      script.onerror = function () { reject(new Error("leaflet")); };
      document.head.appendChild(script);
    });
    return ensureLeaflet._p;
  }

  function allRows() {
    if (!data) return [];
    return data.places.concat(data.partners);
  }

  function filtered() {
    var st = global.GBStore.get() || {};
    var filter = st.mapFilter || "all";
    return allRows().filter(function (row) {
      if (!row || typeof row.lat !== "number" || typeof row.lon !== "number") return false;
      if (filter === "all") return true;
      return row.cat === filter;
    });
  }

  function pickId(rows) {
    var st = global.GBStore.get() || {};
    var id = st.mapPlaceId || "";
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return id;
    }
    var best = rows[0];
    var bestD = Infinity;
    var clat = 53.902;
    var clon = 27.561;
    for (i = 0; i < rows.length; i++) {
      var dlat = rows[i].lat - clat;
      var dlon = rows[i].lon - clon;
      var dist = dlat * dlat + dlon * dlon;
      if (dist < bestD) {
        bestD = dist;
        best = rows[i];
      }
    }
    return best ? best.id : "";
  }

  function routeUrl(row) {
    return "https://www.openstreetmap.org/directions?to=" +
      encodeURIComponent(row.lat + "," + row.lon);
  }

  function paintChips(filter) {
    document.querySelectorAll("[data-map-filter]").forEach(function (btn) {
      var on = btn.getAttribute("data-map-filter") === filter;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function paintCard(row, rows) {
    var card = document.getElementById("cabinetPlaceCard");
    if (!card) return;
    if (!row) {
      var filter = (global.GBStore.get() || {}).mapFilter || "all";
      var empty = filter === "park"
        ? "В OSM нет парков с отметкой dog=yes. Собачьи площадки лежат в фильтре «Площадки»."
        : "В этом фильтре мест нет.";
      card.innerHTML = "<p class=\"cabinet-hint\">" + esc(empty) + "</p>";
      return;
    }
    var addr = row.address ? row.address : "Адрес в OSM не указан";
    card.innerHTML =
      "<p class=\"cabinet-place-kicker\">" + esc(LABELS[row.cat] || "Место") + "</p>" +
      "<h2>" + esc(row.name) + "</h2>" +
      "<p>" + esc(addr) + "</p>" +
      "<a class=\"btn cabinet-route\" data-route=\"1\" href=\"" + esc(routeUrl(row)) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Маршрут</a>" +
      "<p class=\"cabinet-hint\">" + rows.length + " в этом фильтре" +
      (rows.length > 40 ? " · в списке 40 ближайших" : "") +
      " · " + esc((data && data.source) || "OpenStreetMap") + "</p>";
  }

  function listRows(rows, activeId) {
    var active = null;
    var rest = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === activeId) active = rows[i];
      else rest.push(rows[i]);
    }
    var origin = active || { lat: 53.902, lon: 27.561 };
    rest.sort(function (a, b) {
      function dist(row) {
        var dlat = row.lat - origin.lat;
        var dlon = row.lon - origin.lon;
        return dlat * dlat + dlon * dlon;
      }
      return dist(a) - dist(b);
    });
    var out = [];
    if (active) out.push(active);
    for (i = 0; i < rest.length && out.length < 40; i++) out.push(rest[i]);
    return out;
  }

  function paintList(rows, activeId) {
    var list = document.getElementById("cabinetPlaceList");
    if (!list) return;
    var shown = listRows(rows, activeId);
    list.innerHTML = shown.map(function (row) {
      return "<button type=\"button\" class=\"cabinet-place" + (row.id === activeId ? " is-active" : "") + "\" data-place=\"" + esc(row.id) + "\">" +
        "<div><strong>" + esc(row.name) + "</strong><span>" + esc(row.address || LABELS[row.cat] || "") + "</span></div>" +
        "</button>";
    }).join("");
    var active = list.querySelector(".is-active");
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: "nearest" }); } catch (e) {}
    }
  }

  function markerIcon(L, row, on) {
    return L.divIcon({
      className: "gb-pin gb-pin--" + row.cat + (on ? " is-on" : ""),
      iconSize: on ? [22, 22] : [16, 16],
      iconAnchor: on ? [11, 11] : [8, 8]
    });
  }

  function drawMarkers(Llib, rows, activeId, refit) {
    if (!map) return;
    if (layer) layer.clearLayers();
    else layer = Llib.layerGroup().addTo(map);
    var bounds = [];
    rows.forEach(function (row) {
      var marker = Llib.marker([row.lat, row.lon], {
        icon: markerIcon(Llib, row, row.id === activeId),
        title: row.name,
        keyboard: true
      });
      marker.on("click", function () {
        global.GBStore.set({ mapPlaceId: row.id });
        sync({ refit: false, pan: true });
      });
      marker.addTo(layer);
      bounds.push([row.lat, row.lon]);
    });
    if (refit && bounds.length) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } else if (refit && !bounds.length) {
      map.setView([53.902, 27.561], 12);
    }
  }

  function sync(opts) {
    opts = opts || {};
    var el = document.getElementById("cabinetMap");
    if (!el || !data || !map) return;
    var st = global.GBStore.get() || {};
    var filter = st.mapFilter || "all";
    var rows = filtered();
    var activeId = pickId(rows);
    if (activeId && activeId !== st.mapPlaceId) global.GBStore.set({ mapPlaceId: activeId });
    paintChips(filter);
    var row = null;
    rows.forEach(function (item) { if (item.id === activeId) row = item; });
    paintCard(row, rows);
    paintList(rows, activeId);
    drawMarkers(global.L, rows, activeId, !!opts.refit);
    if (opts.pan && row && !opts.refit) map.panTo([row.lat, row.lon]);
    setTimeout(function () { if (map) map.invalidateSize(); }, 60);
  }

  function mount() {
    var el = document.getElementById("cabinetMap");
    if (!el) return;
    if (el.getAttribute("data-map") === "1") {
      if (map) {
        sync({ refit: false });
        setTimeout(function () { if (map) map.invalidateSize(); }, 80);
      }
      return;
    }
    el.setAttribute("data-map", "1");
    Promise.all([ensureLeaflet(), loadData()]).then(function (pair) {
      var Llib = pair[0];
      var node = document.getElementById("cabinetMap");
      if (!node || node !== el) return;
      if (map) {
        try { map.remove(); } catch (e) {}
        map = null;
        layer = null;
      }
      map = Llib.map(el, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true
      });
      Llib.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      map.setView([53.902, 27.561], 12);
      map.on("click", function () {
        if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
      });
      map.on("blur", function () {
        if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
      });
      sync({ refit: true });
    }).catch(function () {
      var card = document.getElementById("cabinetPlaceCard");
      if (card) card.innerHTML = "<p class=\"cabinet-hint\">Карта не открылась. Проверьте сеть и обновите страницу.</p>";
    });
  }

  function openRoute(anchor) {
    var url = anchor.getAttribute("href") || "";
    if (!url) return;
    var tg = global.Telegram && global.Telegram.WebApp;
    if (tg && typeof tg.openLink === "function") {
      tg.openLink(url);
      return;
    }
    global.open(url, "_blank", "noopener");
  }

  global.addEventListener("resize", function () {
    if (map) map.invalidateSize();
  });

  global.GBMap = { mount: mount, sync: sync, openRoute: openRoute };
})(window);
