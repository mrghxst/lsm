// Orient Catering isn't on the ETH API — this is their printed Dürüm card.
// Prices are CHF; the large size lives in the description because a meal
// carries only one primary price column.
const ORIENT_MENU = [
  ['Falafel Dürüm', '', 8.5, 10],
  ['Makali Dürüm', 'mit Aubergine + Blumenkohl', 8.5, 10],
  ['Poulet Dürüm', '', 10, 12],
  ['Musahab Dürüm', 'mit Poulet + Grillgemüse', 10.5, 12.5],
  ['Lamm Dürüm', '', 12, 14],
  ['Köfte Dürüm', '', 11, 13],
].map(([name, note, normal, gross]) => ({
  line: 'Dürüm',
  name,
  description: [note, `gross ${gross.toFixed(2)}`].filter(Boolean).join(' · '),
  price: normal,
  image: null,
}));

export function orientMenuForDay(dayCode) {
  return dayCode === 7
    ? { meals: [], status: 'closed' }
    : { meals: ORIENT_MENU, status: 'open' };
}
