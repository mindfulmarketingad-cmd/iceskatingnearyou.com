/* Client-side search over rinks, cities, states, rink types and guides. */
(function () {
  'use strict';
  var input = document.getElementById('site-search-input');
  var status = document.getElementById('site-search-status');
  var results = document.getElementById('site-search-results');
  if (!input || !results) return;
  var MAX = 40;
  var index = [];
  var initialStatus = status.textContent;

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function search(query) {
    var q = query.trim().toLowerCase();
    if (!q) { status.textContent = initialStatus; results.innerHTML = ''; return; }
    var words = q.split(/\s+/);
    var scored = [];
    index.forEach(function (item) {
      var name = item.n.toLowerCase();
      var hay = name + ' ' + item.p.toLowerCase();
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return;
      var score = (name.indexOf(q) === 0 ? 0 : name.indexOf(q) !== -1 ? 5 : 10) +
        ({ State: 0, City: 1, Type: 2, Rink: 3, Guide: 4 }[item.t] || 5) + name.length * 0.01;
      scored.push({ item: item, score: score });
    });
    scored.sort(function (a, b) { return a.score - b.score; });
    if (!scored.length) {
      status.textContent = 'No matches for "' + query.trim() + '".';
      results.innerHTML = '<div class="empty-state"><p>Try a city, a state or part of a rink name, or <a href="/states/">browse by state</a>.</p></div>';
      return;
    }
    status.textContent = scored.length + ' result' + (scored.length === 1 ? '' : 's') + (scored.length > MAX ? ', showing the first ' + MAX : '');
    results.innerHTML = scored.slice(0, MAX).map(function (s) {
      return '<div class="search-result"><span class="search-kind">' + esc(s.item.t) + '</span><h3><a href="' + esc(s.item.u) + '">' + esc(s.item.n) + '</a></h3><p>' + esc(s.item.p) + '</p></div>';
    }).join('');
  }

  var initial = new URLSearchParams(location.search).get('q') || '';
  fetch('/data/search-index.json').then(function (r) { return r.json(); }).then(function (json) {
    index = json;
    if (initial) { input.value = initial; search(initial); }
  }).catch(function () { status.textContent = 'Search could not load. Try browsing by state instead.'; });

  var timer;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { search(input.value); }, 120); });
})();
