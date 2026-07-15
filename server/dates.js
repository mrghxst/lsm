const ZURICH_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Calendar day at ETH (Europe/Zurich) as YYYY-MM-DD. Date arithmetic is
// performed on the formatted calendar parts, not in 24-hour chunks, because
// Zurich days can be 23 or 25 hours when daylight saving time changes.
export function zurichDate(offsetDays = 0, now = new Date()) {
  const parts = ZURICH_DATE_FORMAT.formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const shifted = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offsetDays));
  return shifted.toISOString().slice(0, 10);
}
