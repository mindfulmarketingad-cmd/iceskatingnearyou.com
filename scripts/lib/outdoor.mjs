/**
 * Outdoor and holiday-rink pages.
 *
 * A listing qualifies only when its own name or description supports the
 * claim. The stored "Outdoor rink" and "Seasonal rink" tags are not enough:
 * they also fire on outdoor pools, playgrounds, and the word "seasonal" in a
 * shop category. Pages are for clusters of at least three qualifying listings.
 */

const NAMED_OUTDOOR = /\boutdoor\b(?:\s+\w+){0,3}\s+(?:ice|rink|skat\w*|hockey\s+rink)\b/i;
const DESCRIBED_OUTDOOR = /\b(?:outdoor\s+(?:ice[\s-]*skating|ice\s+rink|skating\s+rink|rink|skat\w+)|open-air\b[^.]{0,80}\b(?:ice|rink|skat\w+))\b/i;
const RIBBON_OR_TRAIL = /\b(?:ice[\s-]*skating\s+ribbon|skating\s+ribbon|ice\s+ribbon|ice\s+trail)\b/i;
const SKATING_POND = /\b(?:skating\s+pond|ice[\s-]*skating\s+pond|skate\s+pond|ice\s+pond)\b/i;
const SEASONAL_OR_HOLIDAY = /\b(?:seasonal\s+ice(?:[\s-]*skating)?|holiday\s+ice|christmas(?:\s+village)?|winter\s+(?:wonderland|village|garden)|holiday\s+village)\b|\(\s*seasonal\s*\)/i;

function blob(l) {
  return `${l?.name || ''}\n${l?.description || ''}`;
}

function shopNotRink(l) {
  const text = blob(l);
  return /decorations shop|christmas lighting|equipment rental/i.test(text)
    && !/outdoor ice|seasonal ice|public skate/i.test(l?.description || '');
}

/** Indoor ice, with no outdoor-ice wording to keep the listing in play. */
function indoorIceOnly(l) {
  const text = blob(l);
  if (DESCRIBED_OUTDOOR.test(text) || NAMED_OUTDOOR.test(l?.name || '')) return false;
  return /\bindoor\s+(?:ice|rink|arena|skating)\b/i.test(text);
}

/**
 * Why a listing may appear on an outdoor or holiday page, or null.
 * `named-outdoor` and `described-outdoor` mean the listing itself says the
 * ice is outdoors. `ribbon` and `pond` are name patterns this directory
 * already treats as outdoor ice. `seasonal` is holiday or seasonal wording
 * and does not, by itself, mean the ice is outdoors.
 */
export function outdoorIceEvidence(l) {
  if (!l || shopNotRink(l) || indoorIceOnly(l)) return null;
  const name = l.name || '';
  const desc = l.description || '';
  if (NAMED_OUTDOOR.test(name)) return 'named-outdoor';
  if (DESCRIBED_OUTDOOR.test(desc)) return 'described-outdoor';
  if (RIBBON_OR_TRAIL.test(name)) return name.match(/trail/i) ? 'trail' : 'ribbon';
  const barePond = /\bpond\b/i.test(name)
    && /ice skating rink/i.test(l.category || '')
    && !/fishing pond/i.test(l.subtypes || '')
    && !/hockey club/i.test(name)
    && !(l.features || []).includes('Indoor rink');
  if ((SKATING_POND.test(name) || barePond) && !(l.features || []).includes('Indoor rink')) return 'pond';
  if ((l.features || []).includes('Indoor rink')) return null;
  if (SEASONAL_OR_HOLIDAY.test(name) || SEASONAL_OR_HOLIDAY.test(desc)) return 'seasonal';
  return null;
}

export const OUTDOOR_GUIDE_PATH = '/outdoor-ice-skating/';

const link = (l, esc) => (l ? `<a href="${l.url}">${esc(l.name)}</a>` : '');
const where = (l, esc) => (l ? `${esc(l.city)}, ${esc(l.stateCode)}` : '');
const findName = (items, snippet) => items.find((l) => l.name.includes(snippet)) || null;

function sentenceList(parts) {
  return parts.filter(Boolean).join(' ');
}

function joinNames(list) {
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function hoursNote(items) {
  const missing = items.filter((l) => !l.hours).length;
  if (!missing) return 'Every listing on this page publishes weekly hours. Those hours can be the building, not the public skate, so confirm the session before you go.';
  if (missing === items.length) return 'None of these listings publish weekly hours. Confirm whether the ice is open before you go.';
  return `${missing} of these ${items.length} listings do not publish weekly hours. Where hours are listed, confirm that they are public skate and not just the building.`;
}

function priceNote(year) {
  return `Nothing here includes a ${year} opening date or a ticket price. Both change by rink and by season, and they are not in the listing data. Use the rink page for the address and any hours on file, then confirm the date and the price with the rink.`;
}

/**
 * Unique body copy for one outdoor hub. `esc` is the build HTML escaper.
 * Returns null only when there is nothing to say.
 */
export function outdoorEditorial(spec) {
  const { id, items, esc, year, cityTagPath, christmasPath, guidePath } = spec;
  const writers = {
    'new-york': newYorkCopy,
    boston: bostonCopy,
    'washington-dc': washingtonCopy,
    chicago: chicagoCopy,
    minneapolis: minneapolisCopy,
    'san-francisco': sanFranciscoCopy,
    fargo: fargoCopy,
  };
  const writer = writers[id];
  if (!writer) return '';
  return writer({ items, esc, year, cityTagPath, christmasPath, guidePath, yerba: spec.yerba });
}

function newYorkCopy({ items, esc, year, christmasPath, guidePath }) {
  const rock = findName(items, 'Rockefeller');
  const wollman = findName(items, 'Wollman');
  const roosevelt = findName(items, 'Roosevelt Park');
  const littell = findName(items, "Littell");
  const bayville = findName(items, 'Bayville');
  return `<p>The New York circle is not one kind of ice. ${rock ? `${link(rock, esc)}'s listing calls it a seasonal ice skating rink in a shopping complex and does not say the ice is outdoors.` : ''} ${wollman ? `${link(wollman, esc)}'s listing calls it a seasonal rink in Central Park and does not say outdoor either.` : ''} Both belong on a holiday search. They are pop-ups in the sense that the listing itself says seasonal, and the listing does not give this year's opening day.</p>
<p>${roosevelt ? `${link(roosevelt, esc)} in ${where(roosevelt, esc)} is the listing that actually uses the word outdoor: an outdoor family skating rink.` : ''} ${littell ? `${link(littell, esc)} in ${where(littell, esc)} is named as an ice skating pond, and the name says it is seasonal.` : ''} ${bayville ? `${link(bayville, esc)} in ${where(bayville, esc)} is a winter-wonderland name with no description of the ice, so treat it as a holiday listing until you check with them.` : ''}</p>
<p>${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `The <a href="${christmasPath}">Christmas skating page</a> is the wider seasonal list, including listings this page leaves off.` : ''} ${guidePath ? `<a href="${guidePath}">The national outdoor guide</a> explains the same rule for other cities.` : ''}</p>`;
}

function bostonCopy({ items, esc, year, christmasPath, guidePath }) {
  const frog = findName(items, 'Frog Pond');
  const emmons = findName(items, 'Emmons');
  const kelly = findName(items, 'Kelly Outdoor');
  const paw = findName(items, 'Paw Paw');
  return `<p>Boston's qualifying listings are outdoor by their own words, not holiday brands. ${frog ? `${link(frog, esc)}'s listing says the pond is a spray pool in summer and an outdoor ice-skating rink in winter, with a snack bar and a carousel.` : ''} ${emmons ? `${link(emmons, esc)} in ${where(emmons, esc)} says it is an outdoor ice rink open November through March, with public skate and skate rentals. That November-through-March line is the listing's own season note, not a date we set for ${year}.` : ''}</p>
<p>${kelly ? `${link(kelly, esc)} is filed under ${esc(kelly.city)}, not under the city name Boston. The listing calls it an open-air neighborhood rink and says it is open seasonally.` : ''} ${paw ? `${link(paw, esc)} in ${where(paw, esc)} is a pond categorized as an ice skating rink. A pond listing is not the same thing as a staffed city rink, so read that page before you treat it like Frog Pond.` : ''} Charlestown and Jamaica Plain are separate city names in this directory even when skaters think of them as Boston.</p>
<p>${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `Seasonal listings that never say outdoor stay on the <a href="${christmasPath}">Christmas page</a>.` : ''} ${guidePath ? `More cities are on the <a href="${guidePath}">outdoor ice skating guide</a>.` : ''}</p>`;
}

function washingtonCopy({ items, esc, year, christmasPath, guidePath }) {
  const reston = findName(items, 'Reston');
  const westpost = findName(items, 'Westpost');
  const rockville = findName(items, 'Rockville Town Square');
  const glen = findName(items, 'Glen Burnie');
  const cameron = findName(items, 'Cameron Run');
  return `<p>Washington's outdoor ice is mostly in the suburbs, and the listings say so. ${reston ? `${link(reston, esc)} in ${where(reston, esc)} says outdoor skating in the winter months, and it mentions season passes, lessons, and skate rental without listing a price.` : ''} ${westpost ? `${link(westpost, esc)} in ${where(westpost, esc)} says it is an outdoor ice rink with artificial snowfall, plus figure skating and hockey lessons. The name still carries the old Pentagon Row label.` : ''}</p>
<p>${rockville ? `${link(rockville, esc)} in ${where(rockville, esc)} puts outdoor ice skating in the name.` : ''} ${glen ? `${link(glen, esc)} in ${where(glen, esc)} does too. Glen Burnie also sits inside the Baltimore circle, so it is the overlap between those two downtowns, not a second rink.` : ''} ${cameron ? `${link(cameron, esc)} in ${where(cameron, esc)} is the holiday-style listing in this set: a winter village. The name does not say the ice is outdoors.` : ''}</p>
<p>${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `The <a href="${christmasPath}">Christmas page</a> keeps the broader seasonal tag.` : ''} ${guidePath ? `The <a href="${guidePath}">national guide</a> links the other outdoor hubs.` : ''}</p>`;
}

function chicagoCopy({ items, esc, year, cityTagPath, christmasPath, guidePath }) {
  const maggie = findName(items, 'Maggie Daley');
  const mccormick = findName(items, 'McCormick');
  const heritage = findName(items, 'Heritage Park');
  const kimball = findName(items, 'Kimball Hill');
  const west = findName(items, 'West Park');
  const orland = findName(items, 'Orland Park Ice Skating');
  return `<p>This is the 30-mile Chicago page, not the city-limits tag page. ${maggie ? `${link(maggie, esc)} is named as an ice skating ribbon. The listing describes a wide skating track in a park and does not print an opening day.` : ''} ${mccormick ? `${link(mccormick, esc)} describes seasonal ice-skating on a public square. The same sentence mentions an outdoor restaurant, so the word outdoor there is not evidence about the ice. It is on this page as seasonal skating.` : ''}</p>
<p>The suburbs are why this page exists. ${heritage ? `${link(heritage, esc)} in ${where(heritage, esc)} names an outdoor hockey rink. The same name mentions sand volleyball courts, which are not ice.` : ''} ${kimball ? `${link(kimball, esc)} in ${where(kimball, esc)} is named as a winter ice skating pond.` : ''} ${west ? `${link(west, esc)} in ${where(west, esc)} is named as a seasonal ice rink.` : ''} ${orland ? `${link(orland, esc)} in ${where(orland, esc)} puts Winter Wonderland in the name, so read it as a holiday rink.` : ''}</p>
<p>${cityTagPath ? `Rinks inside Chicago that only carry the site's outdoor tag, including tags picked up from a non-ice amenity, stay on the <a href="${cityTagPath}">Chicago city outdoor page</a>.` : ''} ${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `The <a href="${christmasPath}">Christmas page</a> is the wider list.` : ''} ${guidePath ? `Other metros are on the <a href="${guidePath}">outdoor guide</a>.` : ''}</p>`;
}

function minneapolisCopy({ items, esc, year, christmasPath, guidePath }) {
  const shoreview = items.find((l) => l.city === 'Shoreview');
  const keseley = items.find((l) => /Keseley/.test(l.name));
  const mccullough = items.find((l) => /McCullough/.test(l.name));
  const cities = [...new Set(items.map((l) => l.city))].sort((a, b) => a.localeCompare(b));
  return `<p>None of the qualifying listings use a Minneapolis address. They sit in ${esc(joinNames(cities))}, inside 30 miles of downtown Minneapolis, which is the circle this directory already uses for the Twin Cities. ${shoreview ? `${link(shoreview, esc)} in ${where(shoreview, esc)} is named only as an outdoor ice skating rink, with no description attached.` : ''} ${mccullough ? `${link(mccullough, esc)} in ${where(mccullough, esc)} names McCullough Park and says the ice is outdoor skating.` : ''}</p>
<p>${keseley ? `${link(keseley, esc)} in ${where(keseley, esc)} is a pond categorized as an ice skating rink. The listing does not say the pond is staffed, lighted, or open on a holiday schedule, so do not treat the name as a pop-up rink.` : ''} Parade Ice Garden and other indoor Minneapolis arenas are not here, because their listings do not describe outdoor ice.</p>
<p>${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `The <a href="${christmasPath}">Christmas page</a> still lists seasonal tags that failed this wording test.` : ''} ${guidePath ? `The <a href="${guidePath}">national guide</a> covers the other hubs.` : ''}</p>`;
}

function sanFranciscoCopy({ items, esc, year, christmasPath, guidePath, yerba }) {
  const winter = findName(items, 'Winter Lodge');
  const union = findName(items, 'Union Square');
  const yamaguchi = findName(items, 'Yamaguchi');
  const crosses = findName(items, '3Crosses');
  return `<p>San Francisco's outdoor evidence is thinner than the holiday names suggest. ${winter ? `${link(winter, esc)} in ${where(winter, esc)} is the listing that says outdoor skating, and the same sentence says the center is indoor and outdoor. It is not an outdoor-only rink.` : ''} ${union ? `${link(union, esc)} is named as holiday ice in Union Square. The listing does not say outdoor and does not give a ${year} opening date.` : ''}</p>
<p>${yamaguchi ? `${link(yamaguchi, esc)} in ${where(yamaguchi, esc)} is named as a holiday ice rink, with no description of the ice.` : ''} ${crosses ? `${link(crosses, esc)} in ${where(crosses, esc)} is named as a Christmas village, which is holiday wording, not a sentence that says outdoor.` : ''} ${yerba ? `${link(yerba, esc)} is left off this page: its listing mentions an outdoor playground at a bowling and hockey center, not outdoor ice.` : ''}</p>
<p>${hoursNote(items)} ${priceNote(year)} ${christmasPath ? `The <a href="${christmasPath}">Christmas page</a> is where the wider seasonal tag lives.` : ''} ${guidePath ? `See the <a href="${guidePath}">national outdoor guide</a> for cities with a clearer outdoor set.` : ''}</p>`;
}

function fargoCopy({ items, esc, year, guidePath }) {
  const parks = items.map((l) => {
    const parts = l.name.split('|').map((part) => part.trim());
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }).filter(Boolean);
  const sample = parks.slice(0, 4);
  const sampleText = joinNames(sample);
  const unrated = items.filter((l) => !l.rating).length;
  return `<p>Fargo is the city page, and it is a park list. ${items.length} listings are named "Seasonal Ice Skating Rink" at a park or square${sampleText ? `, including ${esc(sampleText)}` : ''}. The names say seasonal ice. They do not say outdoor, and they do not describe an indoor arena. Read them as seasonal park ice, then confirm the sheet is actually open.</p>
<p>${unrated ? `${unrated} of the ${items.length} listings have no Google rating on file, so this page does not pretend to rank a "best" park.` : ''} ${hoursNote(items)} ${priceNote(year)} ${guidePath ? `The <a href="${guidePath}">national outdoor guide</a> explains why other cities did not get a page like this.` : ''}</p>`;
}

export function outdoorHeading(kind, place, items) {
  const seasonal = items.filter((l) => outdoorIceEvidence(l) === 'seasonal').length;
  if (kind === 'city' && seasonal === items.length) return `Seasonal Park Ice Rinks in ${place}`;
  if (seasonal === items.length) return `Seasonal Ice Rinks Near ${place}`;
  if (seasonal === 0) return `Outdoor Ice Rinks Near ${place}`;
  return `Outdoor and Holiday Ice Near ${place}`;
}

export function outdoorLede(id, place, items, year) {
  const custom = {
    'new-york': 'Manhattan holiday rinks, a named outdoor rink in New Jersey, and a seasonal skating pond. Listed only when the rink\'s own words support it.',
    boston: 'Outdoor rinks whose listings say outdoor, including Frog Pond and neighborhood rinks filed under their own city names.',
    'washington-dc': 'Suburban outdoor rinks around Washington, plus one winter-village listing. Glen Burnie sits in this circle and Baltimore\'s.',
    chicago: 'Ribbon, seasonal square, and suburban park ice within 30 miles of downtown. Stricter than the Chicago city tag page.',
    minneapolis: 'Outdoor-named rinks and one pond in the Twin Cities circle. None of them use a Minneapolis street address.',
    'san-francisco': 'One listing that says both indoor and outdoor skating, plus holiday rinks whose names do not say outdoor.',
    fargo: 'Seasonal ice skating rinks named at Fargo parks. The listings do not say outdoor and do not describe an indoor arena.',
  };
  const lead = custom[id] || `${items.length} listings near ${place} whose names or descriptions support outdoor or holiday ice.`;
  return `${lead} No ${year} opening dates or ticket prices are in the data. Confirm both with the rink.`;
}

export function outdoorDescriptionLeads(place, items, year) {
  const top = items[0];
  const seasonal = items.filter((l) => outdoorIceEvidence(l) === 'seasonal').length;
  const mix = seasonal === 0
    ? 'outdoor listings'
    : seasonal === items.length
      ? 'seasonal park listings'
      : 'outdoor and holiday listings';
  return [
    `${items.length} ${mix} near ${place}, led by ${top.name} in ${top.city}. No ${year} dates or prices are in the data.`,
    `${top.name} leads ${items.length} ${mix} near ${place}. Confirm hours and prices with the rink. No ${year} opening dates are listed.`,
    `${items.length} ${mix} near ${place}. Hours on file and directions for each rink. Confirm prices before you go.`,
  ];
}

export function outdoorExtraFaq(place, items, year, dataDateLabel) {
  const seasonal = items.filter((l) => outdoorIceEvidence(l) === 'seasonal');
  const seasonalNames = seasonal.slice(0, 3).map((l) => `${l.name} in ${l.city}`);
  return [
    {
      q: `Which listings near ${place} are holiday or seasonal pop-ups?`,
      a: seasonal.length
        ? `${seasonal.length} of the ${items.length} listings are here because of seasonal or holiday wording, not because they say the ice is outdoors: ${seasonalNames.join('; ')}${seasonal.length > 3 ? '; and others on this page' : ''}. Opening dates are not in our data. Confirm the season with the rink.`
        : `None of the listings on this page rely on holiday wording. They are here because the name or description says the ice is outdoors, or the name is a skating ribbon, ice trail, or pond. That still does not include a ${year} opening date. Confirm hours with the rink.`,
    },
    {
      q: `Do you list ${year} ticket prices near ${place}?`,
      a: `No. Ticket prices are not in these listings. Hours, when the Google listing publishes them, are on each rink page as of ${dataDateLabel}. Public skate can be shorter than those hours, and a holiday rink can be closed on a mild day. Confirm the session and the price with the rink.`,
    },
  ];
}

function p(text) {
  return text && text.trim() ? `<p>${text.trim()}</p>` : '';
}

function hubLinks(place) {
  if (!place) return '';
  const links = [
    place.hubPath ? `<a href="${place.hubPath}">Outdoor page</a>` : null,
    place.christmasPath ? `<a href="${place.christmasPath}">Christmas skating</a>` : null,
    place.nearPath ? `<a href="${place.nearPath}">All rinks near ${place.name}</a>` : null,
    ...(place.stateLinks || []).map((l) => `<a href="${l.href}">${l.label}</a>`),
  ].filter(Boolean);
  return links.length ? `<p class="crumb-links">${links.join(' <span aria-hidden="true">&middot;</span> ')}</p>` : '';
}

/**
 * National guide body, without the FAQ block. Copy stays specific to the
 * listings passed in and does not invent dates or prices.
 */
export function nationalGuideBody(ctx) {
  const { esc, year, places, fargo, othersByState, asides } = ctx;
  const place = (id) => places[id];
  const jump = [
    ['new-york', 'New York'],
    ['boston', 'Boston'],
    ['washington-dc', 'Washington'],
    ['chicago', 'Chicago'],
    ['minneapolis', 'Minneapolis'],
    ['san-francisco', 'San Francisco'],
    ['los-angeles', 'Los Angeles'],
    ['detroit', 'Michigan'],
    ['denver', 'Denver'],
    ['salt-lake-city', 'Salt Lake City'],
    ['atlanta', 'Atlanta'],
    ['columbus', 'Columbus'],
    ['jacksonville', 'Jacksonville'],
    ['baltimore', 'Baltimore'],
    ['fargo', 'Fargo'],
    ['more-listings', 'More listings'],
  ];

  const ny = place('new-york');
  const boston = place('boston');
  const dc = place('washington-dc');
  const chicago = place('chicago');
  const mpls = place('minneapolis');
  const sf = place('san-francisco');
  const la = place('los-angeles');
  const detroit = place('detroit');
  const denver = place('denver');
  const slc = place('salt-lake-city');
  const atlanta = place('atlanta');
  const columbus = place('columbus');
  const jax = place('jacksonville');
  const baltimore = place('baltimore');

  const sections = [];
  sections.push(`<nav class="chip-row" aria-label="On this page">${jump.map(([id, label]) => `<a class="chip" href="#${id}">${label}</a>`).join('')}</nav>`);
  sections.push(p(`Outdoor ice skating near you, for the ${year} holiday season, starts with the wording on the rink's own listing. This guide links every city and metro page we can support from that wording, and it says plainly where the directory does not have enough listings for a page.`));
  sections.push(p(`Some of these rinks are seasonal holiday pop-ups. A listing that says "holiday ice," "Christmas village," or "seasonal ice" is not the same as a listing that says the ice is outdoors, and it is not a promise that the rink is open this week. Opening dates and ticket prices are not in our data. Confirm both with the rink before you travel. Hours on a rink page, when they exist, come from the Google listing and can describe the building rather than public skate.`));
  sections.push(p(`A hub page needs at least three qualifying listings. One famous rink stays on its own page. The test looks at the name and the description: outdoor ice, a skating ribbon or ice trail, a skating pond, or seasonal and holiday ice that is not described as indoor. An outdoor pool, an outdoor playground, or a shop category does not qualify.`));

  sections.push(`<h2 id="new-york">New York</h2>`);
  sections.push(p(sentenceList([
    ny ? `New York has ${ny.items.length} qualifying listings inside 30 miles, which is enough for its own page.` : '',
    findName(ny?.items || [], 'Wollman') ? `${link(findName(ny.items, 'Wollman'), esc)} and ${link(findName(ny.items, 'Rockefeller'), esc)} are seasonal listings in Manhattan. Neither description says the ice is outdoors.` : '',
    findName(ny?.items || [], 'Roosevelt') ? `${link(findName(ny.items, 'Roosevelt'), esc)} in Edison is the named outdoor rink in this circle.` : '',
    `Start with the outdoor page if you want that mix, and use the Christmas page if you want every seasonal tag, including ones this test rejects.`,
  ])));
  sections.push(hubLinks(ny));

  sections.push(`<h2 id="boston">Boston</h2>`);
  sections.push(p(sentenceList([
    boston ? `Boston's ${boston.items.length} qualifying listings are the clearest outdoor set in the Northeast on this site.` : '',
    findName(boston?.items || [], 'Frog Pond') ? `${link(findName(boston.items, 'Frog Pond'), esc)} says it is an outdoor rink in winter and a spray pool in summer.` : '',
    `Kelly Outdoor Rink and the Charlestown memorial rink are stored under their own city names, so a search for the city of Boston alone will not show them. Paw Paw Pond in Hanover is a pond listing, not a downtown pop-up.`,
    `The outdoor page is the one to use. The Christmas page adds seasonal tags that never say outdoor.`,
  ])));
  sections.push(hubLinks(boston));

  sections.push(`<h2 id="washington-dc">Washington, DC</h2>`);
  sections.push(p(sentenceList([
    dc ? `${dc.items.length} listings around Washington qualify, and most of them say outdoor in the name or the description.` : '',
    findName(dc?.items || [], 'Reston') ? `${link(findName(dc.items, 'Reston'), esc)} says outdoor skating in the winter months.` : '',
    findName(dc?.items || [], 'Westpost') ? `${link(findName(dc.items, 'Westpost'), esc)} says outdoor ice and mentions artificial snowfall.` : '',
    findName(dc?.items || [], 'Cameron Run') ? `${link(findName(dc.items, 'Cameron Run'), esc)} is the winter-village listing, holiday wording rather than the word outdoor.` : '',
    findName(dc?.items || [], 'Glen Burnie') ? `Glen Burnie falls inside 30 miles of downtown Washington and inside the Baltimore circle, so it is listed on the Washington page rather than on a separate Baltimore outdoor page.` : '',
  ])));
  sections.push(hubLinks(dc));

  sections.push(`<h2 id="chicago">Chicago</h2>`);
  sections.push(p(sentenceList([
    chicago ? `Chicago already has a city-limits page built from the outdoor tag. The new page is the 30-mile circle, and it uses the stricter wording test, so the two lists are not copies.` : '',
    findName(chicago?.items || [], 'Maggie Daley') ? `${link(findName(chicago.items, 'Maggie Daley'), esc)} is the downtown ribbon.` : '',
    findName(chicago?.items || [], 'McCormick') ? `${link(findName(chicago.items, 'McCormick'), esc)} is seasonal skating on a square. The listing's "outdoor" word is about a restaurant.` : '',
    `Suburban park rinks in Arlington Heights, Rolling Meadows, Lake Forest, and Orland Park are what the metro page adds. Use that page for a day trip. Use the city tag page only if you want every Chicago address the outdoor tag marked.`,
  ])));
  sections.push(hubLinks(chicago));

  sections.push(`<h2 id="minneapolis">Minneapolis</h2>`);
  sections.push(p(sentenceList([
    mpls ? `The Minneapolis circle has ${mpls.items.length} qualifying listings, and none of them are addressed in Minneapolis itself.` : '',
    `Shoreview and St. Paul name outdoor ice skating. Keseley Pond in St. Louis Park is categorized as an ice skating rink and nothing in the listing says it is a staffed holiday rink.`,
    `That is enough for a page because the three listings are real and distinct. It is not a downtown Minneapolis pop-up guide. Indoor arenas such as Parade Ice Garden stay off it.`,
  ])));
  sections.push(hubLinks(mpls));

  sections.push(`<h2 id="san-francisco">San Francisco</h2>`);
  sections.push(p(sentenceList([
    sf ? `San Francisco has ${sf.items.length} qualifying listings, and only one of them says outdoor skating.` : '',
    findName(sf?.items || [], 'Winter Lodge') ? `${link(findName(sf.items, 'Winter Lodge'), esc)} in Palo Alto says the center is indoor and outdoor.` : '',
    `Union Square, the Kristi Yamaguchi holiday rink in San Ramon, and 3Crosses Christmas Village in Castro Valley are holiday names. They are on the outdoor page so holiday searches have somewhere honest to land, with that limit written on the page.`,
    asides.yerba ? `${link(asides.yerba, esc)} is not included. Its listing mentions an outdoor playground, not outdoor ice.` : '',
  ])));
  sections.push(hubLinks(sf));

  sections.push(`<h2 id="los-angeles">Los Angeles</h2>`);
  sections.push(p(sentenceList([
    la && la.christmasPath ? `Los Angeles does not get a separate outdoor page. The ${la.items.length} qualifying listings are holiday-ice names, and they are the same set already on the Christmas page. None of those listings say the ice is outdoors.` : `Los Angeles does not have three listings that say the ice is outdoors.`,
    la ? `The names are ${la.items.map((l) => link(l, esc)).join(', ')}.` : '',
    `Use the Christmas page for those holiday rinks, and confirm dates and prices with each rink. We do not have a ${year} opening calendar for them.`,
  ])));
  sections.push(hubLinks(la));

  sections.push(`<h2 id="detroit">Michigan</h2>`);
  sections.push(p(sentenceList([
    `No Michigan metro has three listings that pass the wording test, so there is no Detroit, Ann Arbor, or other Michigan outdoor hub.`,
    detroit ? `Inside 30 miles of downtown Detroit, ${detroit.items.length} listing${detroit.items.length === 1 ? '' : 's'} qualify${detroit.items.length ? `: ${detroit.items.map((l) => `${link(l, esc)} in ${esc(l.city)}`).join(' and ')}` : ''}.` : '',
    asides.campus && /seasonally/i.test(asides.campus.description || '') ? `${link(asides.campus, esc)} says it is open seasonally for skaters and does not say the ice is outdoors, so it stays on the Christmas page rather than an outdoor hub.` : '',
    asides.annArbor && /indoor ice/i.test(asides.annArbor.description || '') ? `${link(asides.annArbor, esc)} says the ice rink is indoor.` : '',
    asides.petoskey && /seasonal park with ice rinks/i.test(asides.petoskey.description || '') ? `${link(asides.petoskey, esc)} describes a seasonal park with ice rinks, sledding, and skiing. It does not say the ice is outdoors, and Petoskey is far outside the Detroit circle.` : '',
    detroit?.christmasPath ? `For Detroit holiday skating, use the Christmas page and then confirm the season with the rink.` : '',
  ])));
  sections.push(hubLinks(detroit));

  sections.push(`<h2 id="denver">Denver</h2>`);
  sections.push(p(sentenceList([
    denver ? `Denver's 30-mile circle has ${denver.items.length} qualifying listing${denver.items.length === 1 ? '' : 's'}, which is not enough for an outdoor hub.` : '',
    findName(denver?.items || [], 'Parker') ? `${link(findName(denver.items, 'Parker'), esc)} in Parker is named as an ice trail. The listing has no weekly hours.` : '',
    asides.howelsen ? `${link(asides.howelsen.listing, esc)} in Steamboat Springs is named as an outdoor rink. It is about ${asides.howelsen.miles} miles from downtown Denver, outside this circle, and its listing has no hours and no Google rating.` : '',
    `Colorado still has those rink pages. It does not have a Denver outdoor guide, because one suburban ice trail is not a metro page.`,
  ])));
  sections.push(hubLinks(denver));

  sections.push(`<h2 id="salt-lake-city">Salt Lake City</h2>`);
  sections.push(p(sentenceList([
    slc ? `Salt Lake City has ${slc.items.length} qualifying listing${slc.items.length === 1 ? '' : 's'} in the 30-mile circle.` : '',
    slc && slc.items.length ? `They are ${slc.items.map((l) => `${link(l, esc)} in ${esc(l.city)}`).join(' and ')}. An ice ribbon in the name is the same pattern as Maggie Daley's ribbon, and it still takes three listings before this site publishes a hub.` : '',
    `Indoor arenas whose outdoor tag came from a pool are not counted. The Christmas page remains the seasonal roundup for the valley.`,
  ])));
  sections.push(hubLinks(slc));

  sections.push(`<h2 id="atlanta">Atlanta</h2>`);
  sections.push(p(sentenceList([
    atlanta ? `Atlanta's circle has ${atlanta.nearCount} listed rinks and ${atlanta.items.length} that pass the outdoor or holiday wording test.` : '',
    asides.skateTheStation ? `${link(asides.skateTheStation, esc)} is in Atlanta. Its listing text does not say the ice is outdoors and does not name a holiday rink, so it does not start an outdoor page.` : '',
    `There is no Atlanta outdoor hub. Use the metro page for every rink we list near downtown, and ask the rink if you are looking for a pop-up the listing never described.`,
  ])));
  sections.push(hubLinks(atlanta));

  sections.push(`<h2 id="columbus">Columbus</h2>`);
  sections.push(p(sentenceList([
    columbus ? `Columbus has ${columbus.items.length} qualifying listing${columbus.items.length === 1 ? '' : 's'} inside 30 miles.` : '',
    findName(columbus?.items || [], 'Coffman') ? `${link(findName(columbus.items, 'Coffman'), esc)} in Dublin puts "seasonal" in the name. That is one listing, not a page.` : '',
    asides.springfield ? `${link(asides.springfield.listing, esc)} in Springfield, Ohio, is named as an outdoor ice rink. It is about ${asides.springfield.miles} miles from downtown Columbus, outside the circle this site uses for metro pages.` : '',
    `Ohio does not get a Columbus outdoor hub from the current listings. The rink pages above are the supported ones.`,
  ])));
  sections.push(hubLinks(columbus));

  sections.push(`<h2 id="jacksonville">Jacksonville</h2>`);
  sections.push(p(sentenceList([
    jax ? `The Jacksonville circle has ${jax.nearCount} listed rink${jax.nearCount === 1 ? '' : 's'} and ${jax.items.length} with outdoor or holiday wording. That is not a hub, and it is not enough data to invent one.` : '',
    asides.jacksonvilleRink ? `${link(asides.jacksonvilleRink, esc)} is the rink inside that circle. Its name and description do not say the ice is outdoors and do not name a holiday rink.` : '',
    `If you are looking for outdoor ice in north Florida, the honest answer from this directory is that the listing is not there. Check with local parks, and use the Florida rink list for indoor ice we do have.`,
  ])));
  sections.push(hubLinks(jax));

  sections.push(`<h2 id="baltimore">Baltimore</h2>`);
  sections.push(p(sentenceList([
    baltimore ? `Baltimore has ${baltimore.items.length} qualifying listing${baltimore.items.length === 1 ? '' : 's'} inside 30 miles, short of a separate outdoor page.` : '',
    baltimore?.items?.length ? `They are ${baltimore.items.map((l) => `${link(l, esc)} in ${esc(l.city)}`).join(' and ')}.` : '',
    dc?.hubPath ? `Glen Burnie is already on the <a href="${dc.hubPath}">Washington outdoor page</a> because it is inside 30 miles of that downtown too.` : '',
    baltimore?.christmasPath ? `Baltimore's Christmas page is the seasonal roundup. It is a different list from a wording-checked outdoor page.` : '',
  ])));
  sections.push(hubLinks(baltimore));

  sections.push(`<h2 id="fargo">Fargo</h2>`);
  if (fargo) {
    sections.push(p(`Fargo is the city that clears the bar outside the big metros. ${fargo.items.length} listings are named as seasonal ice skating rinks at city parks. They do not say outdoor, they mostly have no hours, and they mostly have no Google rating. The page is still worth publishing because it is a real set of park rinks, not one rink repeated. Confirm which parks are open before you drive.`));
    sections.push(hubLinks({ hubPath: fargo.path, stateLinks: fargo.stateLinks, nearPath: null, christmasPath: null, name: 'Fargo' }));
  } else {
    sections.push(p('Fargo does not currently have three seasonal park listings, so it has no city outdoor page.'));
  }

  sections.push(`<h2 id="more-listings">More listings that did not get a hub</h2>`);
  sections.push(p(`These listings passed the same name-and-description test, and their city or metro did not reach three. A pond, a ribbon, and a holiday name are labeled by the words in the listing. They are not a ranking of the best outdoor ice in the state.`));
  if (!othersByState.length) {
    sections.push(p('Every qualifying listing is already on a hub page above.'));
  }
  for (const group of othersByState) {
    sections.push(`<h3>${esc(group.state)}</h3>`);
    sections.push(`<ul class="link-grid">
${group.items.map((l) => `  <li><a href="${l.url}">${esc(l.name)}</a> <span>${esc(l.city)}</span></li>`).join('\n')}
</ul>`);
    const more = [group.stateHref ? `<a href="${group.stateHref}">All rinks in ${esc(group.state)}</a>` : '', group.findHref ? `<a href="${group.findHref}">Outdoor tag in ${esc(group.state)}</a>` : ''].filter(Boolean);
    if (more.length) sections.push(`<p class="crumb-links">${more.join(' <span aria-hidden="true">&middot;</span> ')}</p>`);
  }

  sections.push(p(`The <a href="/find/outdoor-ice-rinks/">outdoor tag index</a> is a different list. It includes any listing the tag marked, even when the word outdoor belongs to a pool or a playground. The pages on this guide are the narrower set. <a href="/near/">Metro hubs</a> and <a href="/states/">state pages</a> still list every rink, indoor and outdoor.`));
  return sections.filter(Boolean).join('\n');
}

export function nationalGuideFaq(year, dataDateLabel) {
  return [
    {
      q: 'Does this guide list every outdoor rink in the United States?',
      a: 'No. A rink is included only when its own name or description says the ice is outdoors, names a skating ribbon, ice trail, or skating pond, or names a seasonal or holiday rink without describing the ice as indoor. Many outdoor rinks never say so on their Google listing. Those gaps are intentional.',
    },
    {
      q: `Are these rinks open for the ${year} holidays?`,
      a: `We do not have ${year} opening dates or closing dates. Listings that say seasonal or holiday ice are pop-ups or winter-only sheets, and the season changes every year. Hours on a rink page, if any, are from the Google listing as of ${dataDateLabel}. Confirm the date, the session, and the price with the rink.`,
    },
    {
      q: 'Why is there no outdoor page for my city?',
      a: 'A city or metro page is published only when at least three listings qualify under that wording test. One rink, or two, stays on its own rink page. Holiday listings that do not say outdoor may still appear on a Christmas page when that metro has enough seasonal tags.',
    },
    {
      q: 'How is an outdoor page different from a Christmas page?',
      a: 'Christmas pages collect listings tagged outdoor or seasonal within 30 miles, and that tag can include an indoor rink that is open seasonally. Outdoor pages on this guide read the name and description more strictly, and they say when a listing is holiday wording rather than a rink that calls itself outdoor.',
    },
  ];
}
