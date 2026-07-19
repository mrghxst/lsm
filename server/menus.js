import { LUNCH_PLACES, ORIENT_FACILITY_ID } from './votes.js';
import { orientMenuForDay } from './orient-menu.js';

// Today's lunch menus, proxied from ETH's public gastronomy API ("Cookpit",
// the same source as the ethz.ch menu pages). Proxied server-side because
// the API sends no CORS headers. Only lightly cached: mensas edit their
// menus and add dish photos through the morning (some spots quite late), so
// whenever someone actually opens the menu we want near-current data — the
// short window just coalesces a burst of viewers into one upstream call.
const API = 'https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas';
const CLIENT = 'ethz-wcms'; // the meal-photo endpoint wants the same client id
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map(); // facilityId -> { at, date, meals }

function zurichParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // Cookpit numbers days 1 (Monday) … 7 (Sunday).
  const dayCode = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get('weekday')];
  return { date, dayCode };
}

function studentPrice(meal) {
  const prices = meal['meal-price-array'] ?? [];
  return (prices.find((p) => p['customer-group-code'] === 10) ?? prices[0])?.price ?? null;
}

async function fetchFacilityMenu(facilityId, date, dayCode) {
  const url = `${API}?client-id=ethz-wcms&lang=de&rs-first=0&rs-size=5&facility=${facilityId}&valid-after=${date}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ETH menu API answered ${res.status}`);
  const data = await res.json();
  const rota = (data['weekly-rota-array'] ?? []).find((r) => r['valid-from'] <= date && (!r['valid-to'] || date <= r['valid-to']));
  const day = rota?.['day-of-week-array']?.find((d) => d['day-of-week-code'] === dayCode);
  const meals = [];
  for (const oh of day?.['opening-hour-array'] ?? []) {
    for (const mt of oh['meal-time-array'] ?? []) {
      for (const line of mt['line-array'] ?? []) {
        if (!line.meal) continue;
        const img = line.meal['image-url'];
        meals.push({
          line: line.name,
          name: line.meal.name,
          description: line.meal.description ?? '',
          price: studentPrice(line.meal),
          image: img ? `${img}?client-id=${CLIENT}` : null,
        });
      }
    }
  }
  // Distinguish "closed" from "menu just not online yet": if the week's rota
  // is published but today has no service (or no dishes), the mensa is known
  // closed; if the rota itself is missing, the menu may simply not be up yet.
  const status = meals.length > 0 ? 'open' : rota ? 'closed' : 'unknown';
  return { meals, status };
}

export async function menusHandler(req, res) {
  const { date, dayCode } = zurichParts();
  const menus = await Promise.all(
    LUNCH_PLACES.filter((p) => p.facilityId !== null).map(async (p) => {
      if (p.facilityId === ORIENT_FACILITY_ID) {
        return { facilityId: p.facilityId, label: p.label, ...orientMenuForDay(dayCode) };
      }
      const hit = cache.get(p.facilityId);
      if (hit && hit.date === date && Date.now() - hit.at < CACHE_MS) {
        return { facilityId: p.facilityId, label: p.label, meals: hit.meals, status: hit.status };
      }
      try {
        const { meals, status } = await fetchFacilityMenu(p.facilityId, date, dayCode);
        cache.set(p.facilityId, { at: Date.now(), date, meals, status });
        return { facilityId: p.facilityId, label: p.label, meals, status };
      } catch {
        // ETH API down or slow — fall back to today's last good menu if we
        // have one, else show the vote without menus rather than fail.
        if (hit && hit.date === date) {
          return { facilityId: p.facilityId, label: p.label, meals: hit.meals, status: hit.status };
        }
        return { facilityId: p.facilityId, label: p.label, meals: [], status: 'unknown' };
      }
    }),
  );
  res.json({ date, menus });
}
