/**
 * Programmatic topic pages. A page is created only when at least MIN_TOPIC
 * listings qualify, so the title, intro, list, and FAQ are all backed by data.
 */
import { METROS, METRO_RADIUS_MILES } from './metros.mjs';
import {
  outdoorIceEvidence, outdoorEditorial, outdoorHeading, outdoorLede, outdoorDescriptionLeads,
  outdoorExtraFaq, nationalGuideBody, nationalGuideFaq, OUTDOOR_GUIDE_PATH,
} from './outdoor.mjs';
import { featuredImageForPath } from './lifestyle.mjs';

const MIN_TOPIC = 3;

const CITY_SPECS = [
  { kind: 'indoor-city', slug: 'indoor-ice-rinks', feature: 'Indoor rink', noun: 'indoor ice rinks', singular: 'indoor ice rink', crumb: 'Indoor ice rinks', h1: (city, code) => `Indoor Ice Rinks in ${city}, ${code}`, find: 'indoor-ice-rinks' },
  { kind: 'outdoor-city', slug: 'outdoor-ice-rinks', feature: 'Outdoor rink', noun: 'outdoor ice rinks', singular: 'outdoor ice rink', crumb: 'Outdoor ice rinks', h1: (city, code) => `Outdoor Ice Rinks in ${city}, ${code}`, find: 'outdoor-ice-rinks' },
  { kind: 'hockey-city', slug: 'hockey-rinks', feature: 'Hockey', noun: 'hockey rinks', singular: 'hockey rink', crumb: 'Hockey rinks', h1: (city, code) => `Hockey Rinks in ${city}, ${code}`, find: 'hockey-rinks' },
  { kind: 'lessons-city', slug: 'ice-skating-lessons', feature: 'Skating lessons', noun: 'rinks with skating lessons', singular: 'rink with skating lessons', crumb: 'Skating lessons', h1: (city, code) => `Ice Skating Lessons in ${city}, ${code}`, find: 'ice-skating-lessons' },
  { kind: 'figure-city', slug: 'figure-skating', feature: 'Figure skating', noun: 'figure skating rinks', singular: 'figure skating rink', crumb: 'Figure skating', h1: (city, code) => `Figure Skating in ${city}, ${code}`, find: 'figure-skating-rinks' },
];

const hasFeature = (l, feature) => (l.features || []).includes(feature);
const isHoliday = (l) => hasFeature(l, 'Outdoor rink') || hasFeature(l, 'Seasonal rink');

function pushLink(map, key, href, label) {
  if (!map.has(key)) map.set(key, []);
  const list = map.get(key);
  if (!list.some((item) => item.href === href)) list.push({ href, label });
}

/**
 * Plans and writes every topic page. Returns link lists for state and city
 * pages, plus the homepage block and search entries.
 */
export function buildTopicPages(ctx) {
  const {
    listings, byState, byCity, stateNames, rank, distanceMiles, statePath, cityPath, stateSlug,
    findStateHref, codeOf, esc, num, plural, joinNatural, fitTitle, fitDescription,
    listSection, faqBlock, faqJsonLd, itemListJsonLd, writePage, render, addToSitemap, pageIndex,
    closesLate, openOnWeekend, isClosed, DATA_DATE, DATA_DATE_LABEL, YEAR, SITE_URL,
  } = ctx;

  const fillers = [`Updated ${YEAR}.`, 'Free to use.', 'Plan your skate.', 'Check before you go.'];
  const describe = (leads) => fitDescription(leads, fillers);
  const plans = [];
  const counts = {
    indoorCity: 0, outdoorCity: 0, hockeyCity: 0, lessonsCity: 0, figureCity: 0,
    openLateState: 0, openWeekendState: 0, openLateCity: 0, openWeekendCity: 0,
    metro: 0, christmas: 0, nearIndex: 0, openLateNational: 0, openWeekendNational: 0,
    outdoorMetro: 0, outdoorCitySupported: 0, outdoorGuide: 0,
  };
  const linksByState = new Map();
  const linksByCity = new Map();

  const addPlan = (plan) => {
    plans.push(plan);
    counts[plan.countKey] += 1;
  };

  function placeDescription(n, noun, place, top) {
    return describe([
      `${n} ${noun} in ${place}, led by ${top.name} in ${top.city}. Hours and directions are listed for each rink.`,
      `${top.name} leads ${n} ${noun} in ${place}. See hours, addresses and directions before you go.`,
      `Browse ${n} ${noun} in ${place}. Hours, addresses and directions are listed for each rink.`,
      `${n} ${noun} in ${place}, with hours and directions for every rink on this page.`,
    ]);
  }

  for (const [key, items] of byCity) {
    const [stateName, cityName] = key.split('|');
    const code = codeOf(stateName);
    for (const spec of CITY_SPECS) {
      const matched = rank(items.filter((l) => hasFeature(l, spec.feature)));
      if (matched.length < MIN_TOPIC) continue;
      const path = `${cityPath(stateName, cityName)}${spec.slug}/`;
      const h1 = spec.h1(cityName, code);
      const top = matched[0];
      addPlan({
        countKey: spec.kind === 'indoor-city' ? 'indoorCity'
          : spec.kind === 'outdoor-city' ? 'outdoorCity'
            : spec.kind === 'hockey-city' ? 'hockeyCity'
              : spec.kind === 'lessons-city' ? 'lessonsCity' : 'figureCity',
        kind: spec.kind,
        path,
        stateName,
        cityName,
        items: matched,
        singleState: true,
        priority: '0.55',
        title: fitTitle(
          `${h1} (${matched.length})`,
          h1,
          `${spec.crumb} in ${cityName}`,
          `${spec.crumb}, ${code}`
        ),
        h1,
        description: placeDescription(matched.length, matched.length === 1 ? spec.singular : spec.noun, `${cityName}, ${code}`, top),
        crumb: spec.crumb,
        listHeading: `${matched.length} ${spec.noun} in ${cityName}`,
        method: `A rink is listed here only when its own name, category, or description mentions this. Many rinks never say so, so the list is incomplete on purpose.`,
        intro: `${matched.length} of the ${items.length} ice ${plural(items.length, 'rink', 'rinks')} we list in ${cityName}, ${code} match. ${top.name} ranks first${matched[1] ? `, ahead of ${matched[1].name}` : ''}.`,
        trail: [
          { label: 'States', href: '/states/' },
          { label: stateName, href: statePath(stateName) },
          { label: cityName, href: cityPath(stateName, cityName) },
          { label: spec.crumb },
        ],
        related: [
          { href: cityPath(stateName, cityName), label: `All rinks in ${cityName}` },
          { href: statePath(stateName), label: `All rinks in ${stateName}` },
          findStateHref(spec.find, stateName) ? { href: findStateHref(spec.find, stateName), label: `${spec.crumb} in ${stateName}` } : null,
        ].filter(Boolean),
        faqSeed: { what: spec.noun, where: `${cityName}, ${code}` },
      });
      pushLink(linksByCity, key, path, spec.crumb);
      pushLink(linksByState, stateName, path, `${spec.crumb} in ${cityName}`);
    }

    for (const spec of [
      { kind: 'open-late-city', countKey: 'openLateCity', slug: 'open-late', crumb: 'Open late', h1Lead: 'Ice Rinks Open Late', noun: 'rinks open late', test: closesLate, method: 'Included when the listed hours close at 9:00 PM or later, or stay open past midnight, on at least one day.' },
      { kind: 'weekend-city', countKey: 'openWeekendCity', slug: 'open-on-weekends', crumb: 'Open on weekends', h1Lead: 'Ice Rinks Open on Weekends', noun: 'rinks open on weekends', test: openOnWeekend, method: 'Included when both Saturday and Sunday publish hours that are not marked closed.' },
    ]) {
      const matched = rank(items.filter(spec.test));
      if (matched.length < MIN_TOPIC || matched.length === items.length) continue;
      const path = `${cityPath(stateName, cityName)}${spec.slug}/`;
      const h1 = `${spec.h1Lead} in ${cityName}, ${code}`;
      addPlan({
        countKey: spec.countKey,
        kind: spec.kind,
        path,
        stateName,
        cityName,
        items: matched,
        singleState: true,
        priority: '0.5',
        title: fitTitle(`${h1} (${matched.length})`, h1, `${spec.crumb} in ${cityName}`, `${cityName} ${spec.crumb}`),
        h1,
        description: placeDescription(matched.length, spec.noun, `${cityName}, ${code}`, matched[0]),
        crumb: spec.crumb,
        listHeading: `${matched.length} ${spec.noun} in ${cityName}`,
        method: spec.method,
        intro: `${matched.length} of the ${items.length} rinks in ${cityName} ${spec.noun === 'rinks open late' ? 'list a late closing time' : 'list Saturday and Sunday hours'}. ${matched[0].name} ranks first.`,
        trail: [
          { label: 'States', href: '/states/' },
          { label: stateName, href: statePath(stateName) },
          { label: cityName, href: cityPath(stateName, cityName) },
          { label: spec.crumb },
        ],
        related: [
          { href: cityPath(stateName, cityName), label: `All rinks in ${cityName}` },
          { href: statePath(stateName), label: `All rinks in ${stateName}` },
        ],
        faqSeed: { what: spec.noun, where: `${cityName}, ${code}` },
      });
      pushLink(linksByCity, key, path, spec.crumb);
    }
  }

  const lateAll = rank(listings.filter(closesLate));
  const weekendAll = rank(listings.filter(openOnWeekend));

  if (lateAll.length >= MIN_TOPIC) {
    addPlan({
      countKey: 'openLateNational',
      kind: 'open-late-national',
      path: '/open/late/',
      items: lateAll.slice(0, 24),
      allCount: lateAll.length,
      singleState: false,
      priority: '0.7',
      title: fitTitle(`Ice Rinks Open Late Near Me (${YEAR})`, 'Ice Rinks Open Late Near Me', 'Rinks Open Late Near Me'),
      h1: 'Ice Rinks Open Late Near Me',
      description: describe([
        `${num(lateAll.length)} ice rinks list a closing time of 9:00 PM or later. ${lateAll[0].name} in ${lateAll[0].city} ranks first. Browse by state.`,
        `${num(lateAll.length)} ice rinks open late, led by ${lateAll[0].name}. Hours and directions, plus a page for every state.`,
        `Find ice rinks open late near you. ${num(lateAll.length)} list a 9:00 PM or later close, with hours and directions.`,
      ]),
      listHeading: `Top ${Math.min(24, lateAll.length)} rinks open late`,
      method: 'A rink is included when its Google hours close at 9:00 PM or later, or stay open past midnight, on at least one day. Public skate may end earlier than the building hours.',
      intro: `${num(lateAll.length)} rinks across ${stateNames.filter((s) => byState.get(s).some(closesLate)).length} states list a late closing time. ${lateAll[0].name} in ${lateAll[0].city}, ${lateAll[0].stateCode} ranks first. The top 24 are below, and every state with at least ${MIN_TOPIC} has its own page.`,
      trail: [{ label: 'Open late' }],
      related: [{ href: '/open/weekends/', label: 'Rinks open on weekends' }, { href: '/states/', label: 'Browse by state' }],
      faqSeed: { what: 'ice rinks open late', where: 'the United States' },
      extraLinks: stateNames
        .map((s) => ({ s, n: byState.get(s).filter(closesLate).length }))
        .filter((x) => x.n >= MIN_TOPIC)
        .map((x) => ({ href: `/open/late/${stateSlug(x.s)}/`, label: x.s, n: x.n })),
    });
  }

  if (weekendAll.length >= MIN_TOPIC) {
    addPlan({
      countKey: 'openWeekendNational',
      kind: 'weekend-national',
      path: '/open/weekends/',
      items: weekendAll.slice(0, 24),
      allCount: weekendAll.length,
      singleState: false,
      priority: '0.7',
      title: fitTitle(`Ice Rinks Open on Weekends (${YEAR})`, 'Ice Rinks Open on Weekends', 'Weekend Ice Rinks Near Me'),
      h1: 'Ice Rinks Open on Weekends',
      description: describe([
        `${num(weekendAll.length)} ice rinks list hours on both Saturday and Sunday. ${weekendAll[0].name} in ${weekendAll[0].city} ranks first.`,
        `${num(weekendAll.length)} weekend ice rinks, led by ${weekendAll[0].name}. Hours, addresses and a page for every state.`,
        `Find ice rinks open Saturday and Sunday. ${num(weekendAll.length)} list weekend hours, with directions.`,
      ]),
      listHeading: `Top ${Math.min(24, weekendAll.length)} rinks open on weekends`,
      method: 'A rink is included when both Saturday and Sunday have opening hours that are not marked closed. Session times inside those hours still change.',
      intro: `${num(weekendAll.length)} rinks list Saturday and Sunday hours. ${weekendAll[0].name} in ${weekendAll[0].city}, ${weekendAll[0].stateCode} ranks first. The top 24 are below. States with at least ${MIN_TOPIC} have their own page.`,
      trail: [{ label: 'Open on weekends' }],
      related: [{ href: '/open/late/', label: 'Rinks open late' }, { href: '/states/', label: 'Browse by state' }],
      faqSeed: { what: 'ice rinks open on weekends', where: 'the United States' },
      extraLinks: stateNames
        .map((s) => ({ s, n: byState.get(s).filter(openOnWeekend).length }))
        .filter((x) => x.n >= MIN_TOPIC)
        .map((x) => ({ href: `/open/weekends/${stateSlug(x.s)}/`, label: x.s, n: x.n })),
    });
  }

  for (const stateName of stateNames) {
    const stateItems = byState.get(stateName);
    for (const spec of [
      { countKey: 'openLateState', slug: 'late', noun: 'rinks open late', crumb: 'Open late', h1: (state) => `Ice Rinks Open Late in ${state}`, link: (state) => `Rinks open late in ${state}`, test: closesLate, method: 'Included when the listed hours close at 9:00 PM or later, or stay open past midnight, on at least one day. Public skate may end sooner.' },
      { countKey: 'openWeekendState', slug: 'weekends', noun: 'rinks open on weekends', crumb: 'Open on weekends', h1: (state) => `Ice Rinks Open on Weekends in ${state}`, link: (state) => `Rinks open on weekends in ${state}`, test: openOnWeekend, method: 'Included when both Saturday and Sunday publish hours that are not marked closed.' },
    ]) {
      const matched = rank(stateItems.filter(spec.test));
      if (matched.length < MIN_TOPIC) continue;
      const path = `/open/${spec.slug}/${stateSlug(stateName)}/`;
      const h1 = spec.h1(stateName);
      addPlan({
        countKey: spec.countKey,
        kind: spec.countKey,
        path,
        stateName,
        items: matched,
        singleState: true,
        priority: '0.65',
        title: fitTitle(`${h1} (${matched.length})`, h1, `${spec.crumb} in ${stateName}`, `${codeOf(stateName)} rinks ${spec.crumb.toLowerCase()}`),
        h1,
        description: placeDescription(matched.length, spec.noun, stateName, matched[0]),
        listHeading: `${matched.length} ${spec.noun} in ${stateName}`,
        method: spec.method,
        intro: `${matched.length} of the ${stateItems.length} ice rinks we list in ${stateName} qualify. ${matched[0].name} in ${matched[0].city} ranks first${matched[1] ? `, then ${matched[1].name} in ${matched[1].city}` : ''}.`,
        trail: [
          { label: spec.crumb, href: spec.slug === 'late' ? '/open/late/' : '/open/weekends/' },
          { label: stateName },
        ],
        related: [
          { href: statePath(stateName), label: `All rinks in ${stateName}` },
          { href: spec.slug === 'late' ? '/open/late/' : '/open/weekends/', label: spec.slug === 'late' ? 'Open late in other states' : 'Weekend rinks in other states' },
          { href: spec.slug === 'late' ? `/open/weekends/${stateSlug(stateName)}/` : `/open/late/${stateSlug(stateName)}/`, label: spec.slug === 'late' ? `Weekends in ${stateName}` : `Open late in ${stateName}` },
        ],
        faqSeed: { what: spec.noun, where: stateName },
      });
      pushLink(linksByState, stateName, path, spec.link(stateName));
    }
  }

  const allMetros = METROS.map((metro) => {
    const items = rank(listings.filter((l) => distanceMiles(metro.lat, metro.lng, l.lat, l.lng) <= METRO_RADIUS_MILES));
    return { ...metro, items };
  });
  const metros = allMetros.filter((metro) => metro.items.length >= MIN_TOPIC);

  for (const metro of metros) {
    const path = `/near/${metro.slug}/`;
    const nearest = [...metro.items].sort((a, b) => distanceMiles(metro.lat, metro.lng, a.lat, a.lng) - distanceMiles(metro.lat, metro.lng, b.lat, b.lng))[0];
    const miles = Math.max(1, Math.round(distanceMiles(metro.lat, metro.lng, nearest.lat, nearest.lng)));
    const cities = [...new Set(metro.items.map((l) => l.city))];
    const h1 = `Ice Skating Near ${metro.name}`;
    const holiday = rank(metro.items.filter(isHoliday));
    const cityKey = [...byCity.keys()].find((k) => k.toLowerCase() === `${metro.state}|${metro.name}`.toLowerCase());
    addPlan({
      countKey: 'metro',
      kind: 'metro',
      path,
      stateName: metro.state,
      items: metro.items,
      singleState: false,
      priority: '0.75',
      title: fitTitle(
        `Ice Skating Near ${metro.name}: ${metro.items.length} Rinks`,
        `Ice Skating Near ${metro.name} (${metro.items.length})`,
        `Ice Skating Near ${metro.name}`,
        `${metro.name} Ice Rinks`
      ),
      h1,
      description: placeDescription(metro.items.length, 'ice rinks', `the ${metro.name} area`, metro.items[0]),
      listHeading: `${metro.items.length} ice rinks within ${METRO_RADIUS_MILES} miles of downtown ${metro.name}`,
      method: `Rinks are included when they sit within ${METRO_RADIUS_MILES} miles of downtown ${metro.name}, measured in a straight line. Drive time can be longer. Suburbs in neighboring states are included when they fall inside that circle.`,
      intro: `${metro.items.length} ice rinks sit within ${METRO_RADIUS_MILES} miles of downtown ${metro.name}, across ${cities.length} ${plural(cities.length, 'city', 'cities')}${cities.length > 1 ? `, including ${joinNatural(cities.slice(0, 3))}` : ''}. ${metro.items[0].name} in ${metro.items[0].city} ranks first. The rink closest to downtown is ${nearest.name} in ${nearest.city}, about ${miles} ${plural(miles, 'mile', 'miles')} away.`,
      trail: [{ label: 'Near a city', href: '/near/' }, { label: metro.name }],
      related: [
        { href: statePath(metro.state), label: `All rinks in ${metro.state}` },
        { href: '/near/', label: 'Other major cities' },
        cityKey ? { href: cityPath(...cityKey.split('|')), label: `Ice skating in ${metro.name}` } : null,
        holiday.length >= MIN_TOPIC ? { href: `/near/${metro.slug}/christmas-ice-skating/`, label: `Christmas skating near ${metro.name}` } : null,
      ].filter(Boolean),
      faqSeed: { what: 'ice rinks', where: metro.name },
      metro,
      nearest,
      miles,
    });
    pushLink(linksByState, metro.state, path, `Ice skating near ${metro.name}`);

    if (holiday.length >= MIN_TOPIC) {
      const hPath = `/near/${metro.slug}/christmas-ice-skating/`;
      const h1Holiday = `Christmas Ice Skating Near ${metro.name}`;
      addPlan({
        countKey: 'christmas',
        kind: 'christmas',
        path: hPath,
        stateName: metro.state,
        items: holiday,
        singleState: false,
        priority: '0.6',
        title: fitTitle(
          `${h1Holiday} (${holiday.length})`,
          h1Holiday,
          `Holiday Skating Near ${metro.name}`,
          `Christmas Skating, ${metro.name}`
        ),
        h1: h1Holiday,
        description: placeDescription(holiday.length, 'outdoor or seasonal rinks', `the ${metro.name} area`, holiday[0]),
        listHeading: `${holiday.length} outdoor and seasonal rinks near ${metro.name}`,
        method: 'Included when the rink\'s own listing describes it as outdoor or seasonal and it sits within 30 miles of downtown. Holiday dates change every year, so confirm the season before you go. Indoor rinks that skate all year are on the main near page, not here.',
        intro: `${holiday.length} rinks within ${METRO_RADIUS_MILES} miles of downtown ${metro.name} describe themselves as outdoor or seasonal, the usual set for holiday and Christmas skating. ${holiday[0].name} in ${holiday[0].city} ranks first. Opening dates are not in our data, so check the rink for this year's season.`,
        trail: [
          { label: 'Near a city', href: '/near/' },
          { label: metro.name, href: path },
          { label: 'Christmas ice skating' },
        ],
        related: [
          { href: path, label: `All rinks near ${metro.name}` },
          { href: statePath(metro.state), label: `All rinks in ${metro.state}` },
          findStateHref('seasonal-ice-rinks', metro.state) ? { href: findStateHref('seasonal-ice-rinks', metro.state), label: `Seasonal rinks in ${metro.state}` } : null,
          findStateHref('outdoor-ice-rinks', metro.state) ? { href: findStateHref('outdoor-ice-rinks', metro.state), label: `Outdoor rinks in ${metro.state}` } : null,
        ].filter(Boolean),
        faqSeed: { what: 'holiday ice rinks', where: metro.name },
      });
      pushLink(linksByState, metro.state, hPath, `Christmas skating near ${metro.name}`);
    }
  }

  if (metros.length >= MIN_TOPIC) {
    const top = metros.reduce((best, metro) => (metro.items.length > best.items.length ? metro : best));
    addPlan({
      countKey: 'nearIndex',
      kind: 'near-index',
      path: '/near/',
      items: rank(metros.flatMap((m) => m.items)).filter((l, i, arr) => arr.findIndex((o) => o.slug === l.slug) === i).slice(0, 12),
      singleState: false,
      priority: '0.6',
      title: fitTitle('Ice Skating Near Major US Cities', 'Ice Skating Near Major Cities', 'Skating Near Major Cities'),
      h1: 'Ice Skating Near Major Cities',
      description: describe([
        `Ice skating near ${metros.length} major US cities. Each hub lists rinks within ${METRO_RADIUS_MILES} miles of downtown, including suburbs.`,
        `${metros.length} metro ice skating hubs, each covering rinks within ${METRO_RADIUS_MILES} miles of downtown. ${top.name} is one of them.`,
        `Find ice skating near a major city. ${metros.length} hubs list rinks within ${METRO_RADIUS_MILES} miles, with hours and directions.`,
      ]),
      listHeading: 'A sample of highly rated rinks in these metros',
      method: `Each city hub below includes rinks within ${METRO_RADIUS_MILES} miles of that downtown. A rink can appear in two hubs when the circles overlap.`,
      intro: `${metros.length} major metros have at least ${MIN_TOPIC} ice rinks within ${METRO_RADIUS_MILES} miles of downtown. ${top.name} has ${top.items.length}, the largest circle in this set. Pick a city to see every rink in that radius, not only the ones inside the city limits.`,
      trail: [{ label: 'Near a city' }],
      related: [{ href: '/open/late/', label: 'Rinks open late' }, { href: '/open/weekends/', label: 'Rinks open on weekends' }, { href: '/states/', label: 'Browse by state' }],
      faqSeed: { what: 'metro ice skating hubs', where: 'the United States' },
      extraLinks: metros.map((m) => ({ href: `/near/${m.slug}/`, label: m.name, n: m.items.length })),
      skipListCountFaq: true,
    });
  }

  const publishedMetro = new Set(metros.map((metro) => metro.slug));
  const outdoorReport = { added: [], skipped: [] };
  const outdoorHubs = [];
  const outdoorMethod = 'A rink is listed only when its own name or description says the ice is outdoors, names a skating ribbon, ice trail, or skating pond, or names a seasonal or holiday rink without describing the ice as indoor. An outdoor pool, playground, or shop category does not count. Holiday pop-ups change dates every year. Opening dates and ticket prices are not in this data, so confirm both with the rink.';
  const reportIds = new Set(['san-francisco', 'atlanta', 'columbus', 'jacksonville', 'detroit', 'new-york', 'boston', 'minneapolis', 'denver', 'washington-dc', 'los-angeles', 'chicago', 'baltimore', 'salt-lake-city']);
  const yerba = listings.find((l) => l.name === 'Yerba Buena Ice Skating & Bowling Center') || null;

  const sameIds = (a, b) => a.length === b.length && a.every((l) => b.some((o) => o.id === l.id));
  const christmasPathFor = (slug) => {
    const path = `/near/${slug}/christmas-ice-skating/`;
    return plans.some((plan) => plan.path === path) ? path : null;
  };
  const placeShell = (metro, supported) => ({
    name: metro.name,
    slug: metro.slug,
    items: supported,
    nearCount: metro.items.length,
    nearPath: publishedMetro.has(metro.slug) ? `/near/${metro.slug}/` : null,
    christmasPath: christmasPathFor(metro.slug),
    hubPath: null,
    stateLinks: [...new Set(supported.map((l) => l.state))].map((stateName) => ({ href: statePath(stateName), label: `All rinks in ${stateName}` })),
  });
  const places = {};

  for (const metro of allMetros) {
    const supported = rank(metro.items.filter((l) => outdoorIceEvidence(l)));
    const holiday = metro.items.filter(isHoliday);
    const shell = placeShell(metro, supported);
    places[metro.slug] = shell;
    if (supported.length < MIN_TOPIC) {
      if (reportIds.has(metro.slug) || supported.length > 0) {
        outdoorReport.skipped.push({
          name: metro.name,
          reason: `${supported.length} listing${supported.length === 1 ? '' : 's'} whose name or description supports outdoor or holiday ice, short of ${MIN_TOPIC}`,
        });
      }
      continue;
    }
    if (sameIds(supported, holiday)) {
      outdoorReport.skipped.push({ name: metro.name, reason: `same ${supported.length} listings as the Christmas page, and none add an outdoor wording the Christmas page lacks` });
      continue;
    }
    const path = `/near/${metro.slug}/outdoor-ice-rinks/`;
    const h1 = outdoorHeading('metro', metro.name, supported);
    const stateNamesHere = [...new Set(supported.map((l) => l.state))];
    shell.hubPath = path;
    addPlan({
      countKey: 'outdoorMetro',
      kind: 'outdoor-metro',
      path,
      stateName: metro.state,
      items: supported,
      singleState: stateNamesHere.length === 1,
      priority: '0.64',
      title: fitTitle(`${h1} (${supported.length})`, h1, `Outdoor Ice Near ${metro.name}`),
      h1,
      ogTitle: h1,
      description: fitDescription(outdoorDescriptionLeads(metro.name, supported, YEAR), [`Updated ${YEAR}.`, 'Confirm with the rink.', 'Holiday hours vary.']),
      lede: outdoorLede(metro.slug, metro.name, supported, YEAR),
      method: outdoorMethod,
      editorial: outdoorEditorial({
        id: metro.slug,
        items: supported,
        esc,
        year: YEAR,
        cityTagPath: metro.slug === 'chicago' ? `${cityPath('Illinois', 'Chicago')}outdoor-ice-rinks/` : null,
        christmasPath: shell.christmasPath,
        guidePath: OUTDOOR_GUIDE_PATH,
        yerba: metro.slug === 'san-francisco' ? yerba : null,
      }),
      extraFaq: outdoorExtraFaq(metro.name, supported, YEAR, DATA_DATE_LABEL),
      crumb: 'Outdoor ice rinks',
      listHeading: `${supported.length} outdoor and holiday listings near ${metro.name}`,
      intro: outdoorLede(metro.slug, metro.name, supported, YEAR),
      trail: [
        { label: 'Near a city', href: '/near/' },
        { label: metro.name, href: shell.nearPath },
        { label: 'Outdoor ice rinks' },
      ],
      related: [
        { href: OUTDOOR_GUIDE_PATH, label: 'Outdoor ice skating near me' },
        shell.nearPath ? { href: shell.nearPath, label: `All rinks near ${metro.name}` } : null,
        shell.christmasPath ? { href: shell.christmasPath, label: `Christmas skating near ${metro.name}` } : null,
        metro.slug === 'chicago' ? { href: `${cityPath('Illinois', 'Chicago')}outdoor-ice-rinks/`, label: 'Outdoor-tagged rinks in Chicago' } : null,
        ...stateNamesHere.map((stateName) => ({ href: statePath(stateName), label: `All rinks in ${stateName}` })),
        ...stateNamesHere.map((stateName) => {
          const href = findStateHref('outdoor-ice-rinks', stateName);
          return href && href.includes(`/${stateSlug(stateName)}/`) ? { href, label: `Outdoor tag in ${stateName}` } : null;
        }),
      ].filter(Boolean),
      faqSeed: { what: 'outdoor and holiday rinks', where: metro.name },
    });
    const hub = {
      id: metro.slug,
      name: metro.name,
      path,
      nearPath: shell.nearPath,
      christmasPath: shell.christmasPath,
      states: stateNamesHere,
      items: supported,
    };
    outdoorHubs.push(hub);
    outdoorReport.added.push({ name: metro.name, path, count: supported.length, kind: 'metro' });
    for (const l of supported) pushLink(linksByCity, `${l.state}|${l.city}`, path, `Outdoor rinks near ${metro.name}`);
    for (const stateName of stateNamesHere) pushLink(linksByState, stateName, path, `Outdoor rinks near ${metro.name}`);
  }

  let fargoHub = null;
  for (const [key, items] of byCity) {
    const supported = rank(items.filter((l) => outdoorIceEvidence(l)));
    if (supported.length < MIN_TOPIC) continue;
    const [stateName, cityName] = key.split('|');
    const path = `${cityPath(stateName, cityName)}outdoor-ice-rinks/`;
    if (plans.some((plan) => plan.path === path)) continue;
    const code = codeOf(stateName);
    const place = `${cityName}, ${code}`;
    const h1 = outdoorHeading('city', place, supported);
    const pageId = cityName === 'Fargo' ? 'fargo' : cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    addPlan({
      countKey: 'outdoorCitySupported',
      kind: 'outdoor-city',
      path,
      stateName,
      cityName,
      items: supported,
      singleState: true,
      priority: '0.55',
      title: fitTitle(`${h1} (${supported.length})`, h1, `Seasonal Ice in ${cityName}`),
      h1,
      description: fitDescription(outdoorDescriptionLeads(place, supported, YEAR), [`Updated ${YEAR}.`, 'Confirm with the rink.', 'Park ice varies.']),
      lede: outdoorLede(pageId, place, supported, YEAR),
      method: outdoorMethod,
      editorial: outdoorEditorial({
        id: pageId,
        items: supported,
        esc,
        year: YEAR,
        guidePath: OUTDOOR_GUIDE_PATH,
      }),
      extraFaq: outdoorExtraFaq(place, supported, YEAR, DATA_DATE_LABEL),
      crumb: 'Outdoor ice rinks',
      listHeading: `${supported.length} seasonal park listings in ${cityName}`,
      intro: outdoorLede(pageId, place, supported, YEAR),
      trail: [
        { label: 'States', href: '/states/' },
        { label: stateName, href: statePath(stateName) },
        { label: cityName, href: cityPath(stateName, cityName) },
        { label: 'Outdoor ice rinks' },
      ],
      related: [
        { href: OUTDOOR_GUIDE_PATH, label: 'Outdoor ice skating near me' },
        { href: cityPath(stateName, cityName), label: `All rinks in ${cityName}` },
        { href: statePath(stateName), label: `All rinks in ${stateName}` },
        findStateHref('outdoor-ice-rinks', stateName) && findStateHref('outdoor-ice-rinks', stateName).includes(`/${stateSlug(stateName)}/`)
          ? { href: findStateHref('outdoor-ice-rinks', stateName), label: `Outdoor tag in ${stateName}` }
          : null,
      ].filter(Boolean),
      faqSeed: { what: 'seasonal park rinks', where: place },
    });
    pushLink(linksByCity, key, path, 'Outdoor ice rinks');
    pushLink(linksByState, stateName, path, `Outdoor ice rinks in ${cityName}`);
    outdoorReport.added.push({ name: `${cityName}, ${stateName}`, path, count: supported.length, kind: 'city' });
    if (cityName === 'Fargo') {
      fargoHub = {
        path,
        items: supported,
        stateLinks: [{ href: statePath(stateName), label: `All rinks in ${stateName}` }, { href: cityPath(stateName, cityName), label: `All rinks in ${cityName}` }],
      };
    }
  }

  const hubIds = new Set(outdoorHubs.flatMap((hub) => hub.items.map((l) => l.id)));
  if (fargoHub) for (const l of fargoHub.items) hubIds.add(l.id);
  const otherSupported = rank(listings.filter((l) => outdoorIceEvidence(l) && !hubIds.has(l.id)));
  const othersByState = [];
  for (const stateName of [...new Set(otherSupported.map((l) => l.state))].sort()) {
    const findHref = findStateHref('outdoor-ice-rinks', stateName);
    othersByState.push({
      state: stateName,
      stateHref: statePath(stateName),
      findHref: findHref && findHref.includes(`/${stateSlug(stateName)}/`) ? findHref : null,
      items: otherSupported.filter((l) => l.state === stateName),
    });
  }

  const bySlug = new Map(allMetros.map((metro) => [metro.slug, metro]));
  const milesFrom = (slug, listing) => Math.max(1, Math.round(distanceMiles(bySlug.get(slug).lat, bySlug.get(slug).lng, listing.lat, listing.lng)));
  const howelsen = listings.find((l) => l.name === 'Howelsen Outdoor Ice Rink') || null;
  const springfield = listings.find((l) => l.name.startsWith('Greater Springfield Partnership Outdoor')) || null;
  const guideItems = rank(outdoorHubs.flatMap((hub) => hub.items)
    .filter((l, i, arr) => arr.findIndex((o) => o.id === l.id) === i));
  const guideH1 = `Outdoor Ice Skating Near Me: Outdoor Rinks and Holiday Rinks (${YEAR})`;
  addPlan({
    countKey: 'outdoorGuide',
    kind: 'outdoor-guide',
    path: OUTDOOR_GUIDE_PATH,
    items: guideItems,
    singleState: false,
    priority: '0.8',
    title: fitTitle(`Outdoor Ice Skating Near Me (${YEAR} Guide)`, `Outdoor Ice Skating Near Me (${YEAR})`, 'Outdoor Ice Skating Near Me'),
    h1: guideH1,
    ogTitle: guideH1,
    noFeatured: true,
    description: fitDescription(
      `Outdoor ice skating near me for the ${YEAR} season. Hubs list only rinks whose listings say outdoor or holiday ice. Confirm hours and prices with the rink.`
    ),
    lede: `National guide for the ${YEAR} holiday season. A rink is included only when its own listing supports outdoor ice or a seasonal holiday rink. Opening dates and ticket prices are not in our data.`,
    method: outdoorMethod,
    skipListTools: true,
    bodyHtml: nationalGuideBody({
      esc,
      year: YEAR,
      places,
      fargo: fargoHub,
      othersByState,
      asides: {
        yerba,
        campus: listings.find((l) => l.name === 'The Rink at Campus Martius') || null,
        annArbor: listings.find((l) => l.name.includes('Veterans Memorial Park Pool')) || null,
        petoskey: listings.find((l) => l.name === 'Petoskey Winter Sports Park') || null,
        howelsen: howelsen ? { listing: howelsen, miles: milesFrom('denver', howelsen) } : null,
        springfield: springfield ? { listing: springfield, miles: milesFrom('columbus', springfield) } : null,
        skateTheStation: listings.find((l) => l.name === 'Skate the Station') || null,
        jacksonvilleRink: (bySlug.get('jacksonville')?.items || [])[0] || null,
      },
    }),
    faqOverride: nationalGuideFaq(YEAR, DATA_DATE_LABEL),
    trail: [{ label: 'Find', href: '/find/' }, { label: 'Outdoor ice skating' }],
    related: [
      { href: '/find/outdoor-ice-rinks/', label: 'Outdoor tag index' },
      { href: '/near/', label: 'Metro hubs' },
      { href: '/states/', label: 'Browse by state' },
    ],
    faqSeed: { what: 'outdoor ice rinks', where: 'the United States' },
  });

  for (const stateName of new Set(listings.filter((l) => outdoorIceEvidence(l)).map((l) => l.state))) {
    pushLink(linksByState, stateName, OUTDOOR_GUIDE_PATH, 'Outdoor ice skating near me');
  }

  const liveTopic = new Set(plans.map((plan) => plan.path));
  for (const plan of plans) {
    plan.related = (plan.related || []).filter((link) => {
      if (!link) return false;
      if (link.href.startsWith('/open/') || link.href.startsWith('/near/')) return liveTopic.has(link.href);
      return true;
    });
  }

  // Cross-link siblings now that every plan exists.
  const byKindCity = new Map();
  for (const plan of plans) {
    if (!plan.cityName) continue;
    const key = `${plan.stateName}|${plan.cityName}`;
    if (!byKindCity.has(key)) byKindCity.set(key, []);
    byKindCity.get(key).push(plan);
  }
  for (const group of byKindCity.values()) {
    for (const plan of group) {
      for (const other of group) {
        if (other === plan) continue;
        plan.related.push({ href: other.path, label: other.crumb || other.h1 });
      }
    }
  }

  const planByPath = new Map(plans.map((plan) => [plan.path, plan]));
  for (const plan of plans) {
    if (plan.kind === 'metro' || plan.kind === 'christmas' || plan.kind === 'near-index' || plan.kind === 'outdoor-metro' || plan.kind === 'outdoor-city') {
      plan.related.unshift({ href: OUTDOOR_GUIDE_PATH, label: 'Outdoor ice skating near me' });
    }
  }
  for (const hub of outdoorHubs) {
    const near = hub.nearPath ? planByPath.get(hub.nearPath) : null;
    if (near) near.related.unshift({ href: hub.path, label: `Outdoor rinks near ${hub.name}` });
    const xmas = hub.christmasPath ? planByPath.get(hub.christmasPath) : null;
    if (xmas) xmas.related.unshift({ href: hub.path, label: `Outdoor rinks near ${hub.name}` });
    if (hub.id === 'chicago') {
      const cityTag = planByPath.get(`${cityPath('Illinois', 'Chicago')}outdoor-ice-rinks/`);
      if (cityTag) cityTag.related.unshift({ href: hub.path, label: 'Outdoor rinks near Chicago' });
    }
  }

  const searchEntries = [];
  for (const plan of plans) {
    const shown = plan.items;
    const sunday = shown.filter((l) => l.hours && l.hours.sunday && !isClosed(l.hours.sunday));
    const top = shown[0];
    const where = plan.faqSeed.where;
    const what = plan.faqSeed.what;
    const faq = [];
    if (plan.faqOverride) {
      faq.push(...plan.faqOverride);
    } else if (!plan.skipListCountFaq && top) {
      const near = plan.kind === 'metro' || plan.kind === 'christmas' || plan.kind === 'outdoor-metro';
      faq.push({
        q: plan.allCount ? `How many ${what} do you list?` : `How many ${what} are ${near ? 'near' : 'in'} ${where}?`,
        a: plan.allCount
          ? `We list ${num(plan.allCount)} nationwide. This page shows the top ${shown.length}, and each state with at least ${MIN_TOPIC} has its own page.`
          : `We list ${shown.length} here${top ? `, led by ${top.name} in ${top.city}` : ''}. ${plan.method}`,
      });
    } else if (plan.kind === 'near-index') {
      faq.push({
        q: 'How far out do these city hubs reach?',
        a: `Each hub includes ice rinks within ${METRO_RADIUS_MILES} miles of downtown, in a straight line. ${metros.length} metros have at least ${MIN_TOPIC} rinks inside that circle.`,
      });
    }
    if (!plan.faqOverride) {
      if (top && top.rating) {
        faq.push({
          q: `Which rink ranks first?`,
          a: `${top.name} in ${top.city}, ${top.stateCode} ranks first here, with a ${top.rating.toFixed(1)} Google rating from ${num(top.reviews || 0)} ${plural(top.reviews || 0, 'review', 'reviews')}. Rankings weigh the rating by how many reviews sit behind it.`,
        });
      }
      faq.push({
        q: 'Which of these list Sunday hours?',
        a: sunday.length
          ? `${sunday.length} of the ${shown.length} rinks on this page list Sunday hours, including ${joinNatural(sunday.slice(0, 3).map((l) => l.name))}. Public sessions inside those hours change, so confirm with the rink.`
          : `None of the rinks on this page list Sunday hours right now. Hours change with the season, so check with the rink.`,
      });
      faq.push({
        q: 'How do you decide what appears here?',
        a: `${plan.method} Details come from each rink's public Google listing as of ${DATA_DATE_LABEL}.`,
      });
      if (plan.extraFaq?.length) faq.unshift(...plan.extraFaq);
    }

    const introHtml = plan.editorial
      ? `<div class="prose">${plan.editorial}</div>`
      : `<p>${esc(plan.intro)}</p>`;
    const body = plan.bodyHtml
      ? `${relatedNav(plan.related, esc)}
${plan.bodyHtml}
<div class="prose">
  ${faqBlock(faq)}
  <p class="data-note">Listing data from public Google business profiles, last updated ${DATA_DATE_LABEL}. <a href="/contact/">Report a correction</a>.</p>
</div>`
      : `${introHtml}
${relatedNav(plan.related, esc)}
<h2>${esc(plan.listHeading)}</h2>
${listSection(shown, { stateName: plan.singleState ? plan.stateName : null, peers: shown, headingTag: 'h3' })}
${plan.extraLinks?.length ? `<h2>Browse by place</h2>
<ul class="link-grid">
${plan.extraLinks.map((l) => `  <li><a href="${l.href}">${esc(l.label)}</a>${l.n != null ? ` <span>${l.n}</span>` : ''}</li>`).join('\n')}
</ul>` : ''}
<div class="prose">
  ${faqBlock(faq)}
  <p class="data-note">Listing data from public Google business profiles, last updated ${DATA_DATE_LABEL}. <a href="/contact/">Report a correction</a>.</p>
</div>`;

    const featuredImage = featuredImageForPath(plan.path);
    const meta = {
      path: plan.path,
      title: plan.title,
      description: plan.description,
      h1: plan.h1,
      lede: esc(plan.lede || plan.method),
      ogTitle: plan.ogTitle || plan.h1,
      noFeatured: Boolean(plan.noFeatured),
      layout: 'wide',
      nav: plan.cityName ? 'states' : 'find',
      featuredState: plan.stateName || null,
      ogDescription: plan.description,
      ogImage: featuredImage ? `${SITE_URL}${featuredImage.hero}` : undefined,
      ogImageAlt: featuredImage ? featuredImage.alt : plan.h1,
      ogImageWidth: featuredImage ? featuredImage.width : undefined,
      ogImageHeight: featuredImage ? featuredImage.height : undefined,
      featuredImage,
      trail: plan.trail,
    };
    const jsonld = [
      { '@type': 'CollectionPage', name: meta.title, description: meta.description, url: SITE_URL + plan.path, dateModified: DATA_DATE },
      itemListJsonLd(shown),
      faqJsonLd(faq),
    ];
    writePage(plan.path, render(meta, body, { jsonld, scripts: plan.skipListTools ? '' : ctx.listToolScripts() }));
    addToSitemap(plan.path, plan.priority, DATA_DATE);
    pageIndex.push({ path: plan.path, title: plan.h1, group: 'Topics' });
    searchEntries.push({ t: 'Topic', n: plan.h1, p: plan.description, u: plan.path });
  }

  // National counters were incremented inside addPlan AND preset. Undo the double count.
  if (counts.openLateNational > 1) counts.openLateNational = 1;
  if (counts.openWeekendNational > 1) counts.openWeekendNational = 1;
  if (counts.nearIndex > 1) counts.nearIndex = 1;

  const homeHtml = metros.length
    ? `<ul class="link-grid">
${metros.map((m) => `  <li><a href="/near/${m.slug}/">${esc(m.name)}</a> <span>${m.items.length}</span></li>`).join('\n')}
</ul>
<p class="section-sub"><a href="/near/">All metro hubs</a> <span aria-hidden="true">&middot;</span> <a href="${OUTDOOR_GUIDE_PATH}">Outdoor ice skating near me</a> <span aria-hidden="true">&middot;</span> <a href="/open/late/">Rinks open late</a> <span aria-hidden="true">&middot;</span> <a href="/open/weekends/">Open on weekends</a></p>`
    : '';

  // Published /near/ hubs only. Christmas and outdoor paths are set when that
  // page was actually written, so callers never link a hub that 404s.
  const metroHubs = [...metros]
    .sort((a, b) => b.items.length - a.items.length || a.slug.localeCompare(b.slug))
    .map((metro) => {
      const christmasPath = `/near/${metro.slug}/christmas-ice-skating/`;
      const outdoorPath = `/near/${metro.slug}/outdoor-ice-rinks/`;
      const christmas = planByPath.get(christmasPath);
      const outdoor = planByPath.get(outdoorPath);
      return {
        name: metro.name,
        slug: metro.slug,
        state: metro.state,
        lat: metro.lat,
        lng: metro.lng,
        count: metro.items.length,
        path: `/near/${metro.slug}/`,
        christmasPath: christmas ? christmasPath : null,
        christmasCount: christmas ? christmas.items.length : 0,
        outdoorPath: outdoor ? outdoorPath : null,
        outdoorCount: outdoor ? outdoor.items.length : 0,
      };
    });

  return {
    linksByState,
    linksByCity,
    counts,
    searchEntries,
    homeHtml,
    plans: plans.length,
    metroHubs,
    outdoorHubs,
    outdoorGuidePath: OUTDOOR_GUIDE_PATH,
    outdoorReport,
  };
}

function relatedNav(links, esc) {
  const unique = [];
  for (const link of links) {
    if (!link || unique.some((item) => item.href === link.href)) continue;
    unique.push(link);
  }
  if (!unique.length) return '';
  return `<nav class="chip-row" aria-label="Related pages">${unique.slice(0, 8).map((l) => `<a class="chip" href="${l.href}">${esc(l.label)}</a>`).join('')}</nav>`;
}
