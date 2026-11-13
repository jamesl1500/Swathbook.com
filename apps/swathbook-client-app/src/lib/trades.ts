/**
 * Trade ids (businesses.trade) to the names customers see. Mirrors `trades`
 * in apps/swathbook-web/src/libs/marketing/content.ts; add new trades there too.
 */
const names: Record<string, string> = {
  'mobile-detailing': 'Mobile detailing',
  'house-cleaning': 'House cleaning',
  'lawn-care': 'Lawn mowing',
  plumbing: 'Plumbing',
  'pressure-washing': 'Pressure washing',
  landscaping: 'Landscaping',
  'pool-service': 'Pool service',
  handyman: 'Handyman',
  'mobile-pet-grooming': 'Mobile pet grooming',
  'leaf-cleanup': 'Leaf cleanup',
  'pest-control': 'Pest control',
  painting: 'Painting',
  fencing: 'Fencing',
  'snow-removal': 'Snow removal',
  other: 'Local services',
};

/** "lawn-care" → "Lawn mowing". Unknown ids get a tidied-up version of themselves. */
export function tradeName(id: string) {
  if (names[id]) return names[id];
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Local services';
}
