/* Leaflet map of rinks. Points come from an inline #map-data block or, on
   the national map, from the URL in data-src. ?focus=<slug> opens one pin. */
(function () {
  'use strict';
  var el = document.getElementById('rink-map');
  if (!el || !window.L) return;
  var map = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function draw(points) {
    map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    var focus = new URLSearchParams(location.search).get('focus');
    var bounds = [];
    var focused = null;
    points.forEach(function (p) {
      var m = L.circleMarker([p.a, p.o], { radius: 7, color: '#0b3a75', weight: 2, fillColor: '#1f7ae0', fillOpacity: 0.85 })
        .addTo(map)
        .bindPopup('<strong><a href="' + esc(p.u) + '">' + esc(p.n) + '</a></strong><br>' + esc(p.c) + (p.r ? '<br>Rating ' + Number(p.r).toFixed(1) : ''));
      bounds.push([p.a, p.o]);
      if (focus && p.k === focus) focused = m;
    });
    if (focused) { map.setView(focused.getLatLng(), 13); focused.openPopup(); }
    else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    else map.setView([39.5, -98.35], 4);
  }

  function start() {
    if (map) { map.invalidateSize(); return; }
    var inline = document.getElementById('map-data');
    if (el.dataset.src) {
      fetch(el.dataset.src).then(function (r) { return r.json(); }).then(draw).catch(function () { draw([]); });
    } else {
      draw(inline ? JSON.parse(inline.textContent) : []);
    }
  }

  if (el.offsetParent !== null) start();
  window.addEventListener('rinkmap:show', start);
  if (el.hasAttribute('data-lazy')) start();
})();
