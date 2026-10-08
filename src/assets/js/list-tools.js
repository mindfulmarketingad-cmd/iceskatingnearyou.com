/* Search, filter, sort (including distance from the visitor) and the
   List/Map toggle for ranked lists. The full list is server-rendered; this
   only hides, shows and reorders it. Location never leaves the browser. */
(function () {
  'use strict';
  var form = document.querySelector('[data-list-tools]');
  var listEl = document.querySelector('.list-view .entries');
  if (!form || !listEl) return;

  var entries = Array.prototype.slice.call(listEl.querySelectorAll('.entry'));
  var ads = Array.prototype.slice.call(listEl.querySelectorAll('.entry-ad'));
  ads.forEach(function (ad) { ad._after = ad.previousElementSibling; });
  var q = form.querySelector('[data-q]');
  var city = form.querySelector('[data-city-filter]');
  var type = form.querySelector('[data-type-filter]');
  var sort = form.querySelector('[data-sort]');
  var count = document.querySelector('[data-count]');
  var empty = document.querySelector('[data-empty]');
  var baseCount = count.textContent;
  var here = null;

  function miles(a1, o1, a2, o2) {
    var r = Math.PI / 180;
    var x = Math.sin((a2 - a1) * r / 2), y = Math.sin((o2 - o1) * r / 2);
    return 7917.6 * Math.asin(Math.sqrt(x * x + Math.cos(a1 * r) * Math.cos(a2 * r) * y * y));
  }

  function apply() {
    var term = (q.value || '').trim().toLowerCase();
    var c = city ? city.value : '';
    var t = type ? type.value : '';
    var shown = 0;
    entries.forEach(function (li) {
      var ok = (!term || li.dataset.name.indexOf(term) !== -1 || li.dataset.city.indexOf(term) !== -1) &&
        (!c || li.dataset.city === c) &&
        (!t || (' ' + li.dataset.types + ' ').indexOf(' ' + t + ' ') !== -1);
      li.hidden = !ok;
      if (ok) shown++;
    });

    var key = sort.value;
    var sorted = entries.slice().sort(function (a, b) {
      if (key === 'reviews') return b.dataset.reviews - a.dataset.reviews;
      if (key === 'name') return a.dataset.name.localeCompare(b.dataset.name);
      if (key === 'distance' && here) return a._d - b._d;
      return a.dataset.rank - b.dataset.rank;
    });
    var filtered = term || c || t || key !== 'rank';
    // Ads stay between entries in the default view only.
    ads.forEach(function (ad) { ad.hidden = Boolean(filtered); });
    sorted.forEach(function (li) { listEl.appendChild(li); });
    if (!filtered) {
      ads.forEach(function (ad) { if (ad._after) ad._after.after(ad); });
    }
    count.textContent = filtered ? shown + ' of ' + entries.length + ' rinks shown' : baseCount;
    if (empty) empty.hidden = shown > 0;
  }

  function locate() {
    if (here) { apply(); return; }
    if (!navigator.geolocation) { count.textContent = 'Your browser does not share location.'; sort.value = 'rank'; return; }
    count.textContent = 'Finding your location...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      here = pos.coords;
      entries.forEach(function (li) {
        li._d = miles(here.latitude, here.longitude, Number(li.dataset.lat), Number(li.dataset.lng));
        var badge = li.querySelector('.entry-distance');
        if (badge) { badge.textContent = (li._d < 1 ? 'under 1' : Math.round(li._d).toLocaleString('en-US')) + ' mi away'; badge.hidden = false; }
      });
      apply();
    }, function () {
      sort.value = 'rank';
      apply();
      count.textContent = 'Location was not shared, so the list stays in ranked order.';
    }, { timeout: 10000, maximumAge: 600000 });
  }

  var timer;
  q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(apply, 120); });
  if (city) city.addEventListener('change', apply);
  if (type) type.addEventListener('change', apply);
  sort.addEventListener('change', function () { if (sort.value === 'distance') locate(); else apply(); });
  document.querySelectorAll('[data-reset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      q.value = ''; if (city) city.value = ''; if (type) type.value = ''; sort.value = 'rank';
      apply();
    });
  });

  // List / Map toggle. Leaflet loads on first use only.
  var listView = document.querySelector('[data-view="list"]');
  var mapView = document.querySelector('[data-view="map"]');
  var mapLoaded = false;
  function loadMap() {
    if (mapLoaded) { window.dispatchEvent(new Event('rinkmap:show')); return; }
    mapLoaded = true;
    var v = (document.currentScript || document.querySelector('script[src*="list-tools.js"]')).src.split('?')[1] || '';
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/assets/vendor/leaflet/leaflet.css?' + v;
    document.head.appendChild(css);
    var s1 = document.createElement('script');
    s1.src = '/assets/vendor/leaflet/leaflet.js?' + v;
    s1.onload = function () {
      var s2 = document.createElement('script');
      s2.src = '/assets/js/map.js?' + v;
      document.body.appendChild(s2);
    };
    document.body.appendChild(s1);
  }
  var showDistance = form.querySelector('[data-show-distance]');
  if (showDistance) showDistance.addEventListener('click', function () { sort.value = 'distance'; locate(); });

  var viewBtns = document.querySelectorAll('[data-view-btn]');
  viewBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var map = btn.getAttribute('data-view-btn') === 'map';
      if (!mapView) return;
      listView.hidden = map;
      mapView.hidden = !map;
      viewBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      if (map) loadMap();
    });
  });
})();
