/* Homepage: hero video, "Ice Rinks Near You" carousel and geolocation. */
(function () {
  'use strict';

  // The hero video only plays on larger screens, without reduced motion or
  // data saver; everyone else keeps the poster image and never downloads it.
  var video = document.querySelector('[data-hero-video]');
  if (video) {
    var conn = navigator.connection || {};
    var skip = window.matchMedia('(max-width: 640px)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData;
    if (skip) {
      video.remove();
    } else {
      video.preload = 'auto';
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  var section = document.querySelector('[data-near-you]');
  if (!section) return;
  var list = section.querySelector('[data-near-list]');
  var status = section.querySelector('[data-near-status]');
  var carousel = section.querySelector('[data-carousel]');
  var locateBtn = section.querySelector('[data-locate]');

  section.querySelectorAll('[data-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      carousel.scrollBy({ left: Number(btn.getAttribute('data-scroll')) * carousel.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  if (section.getAttribute('data-has-data') !== 'true') {
    section.querySelector('.section-actions').hidden = true;
    status.textContent = 'Nearby rinks appear here as soon as listings are published.';
    return;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function miles(a1, o1, a2, o2) {
    var r = Math.PI / 180;
    var x = Math.sin((a2 - a1) * r / 2), y = Math.sin((o2 - o1) * r / 2);
    return 7917.6 * Math.asin(Math.sqrt(x * x + Math.cos(a1 * r) * Math.cos(a2 * r) * y * y));
  }

  locateBtn.addEventListener('click', function () {
    if (!navigator.geolocation) { status.textContent = 'Your browser does not share location. Try searching by city instead.'; return; }
    status.textContent = 'Finding rinks near you...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      fetch('/data/rinks.json').then(function (r) { return r.json(); }).then(function (rinks) {
        rinks.forEach(function (k) { k.d = miles(lat, lng, k.a, k.o); });
        rinks.sort(function (a, b) { return a.d - b.d; });
        var near = rinks.slice(0, 12);
        list.innerHTML = near.map(function (k) {
          return '<article class="card rink-card"><a class="card-media" href="' + esc(k.u) + '" tabindex="-1" aria-hidden="true">' +
            '<img src="' + esc(k.i) + '" alt="" width="480" height="300" loading="lazy" onerror="this.onerror=null;this.src=\'' + esc(k.f) + '\'"></a>' +
            '<div class="card-body"><h3><a href="' + esc(k.u) + '">' + esc(k.n) + '</a></h3>' +
            '<p class="card-place">' + esc(k.c) + ' <span class="card-miles">' + (k.d < 1 ? 'under 1' : Math.round(k.d)) + ' mi away</span></p>' +
            '<p class="card-rating">' + (k.r ? k.r.toFixed(1) + ' rating' + (k.v ? ' (' + k.v.toLocaleString('en-US') + ')' : '') : 'No rating yet') + '</p></div></article>';
        }).join('');
        carousel.scrollLeft = 0;
        status.textContent = near.length ? 'The ' + near.length + ' closest rinks to you, by straight-line distance. Your location stays in your browser.' : 'No rinks found yet.';
      }).catch(function () { status.textContent = 'Could not load rinks. Try browsing by state.'; });
    }, function () {
      status.textContent = 'Location was not shared. Search by city or browse by state instead.';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });
})();
