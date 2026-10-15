import type { SVGProps } from 'react';

/**
 * Shared food illustration set, used wherever a dish has no photo. These are
 * drawings, never presented as photos of the restaurant's food. Colours come
 * from the theme: --art-ink (outline), --art-a (main fill), --art-b (second fill).
 */
export type ArtKey = 'curry' | 'bread' | 'kebab' | 'rice' | 'sweet' | 'coffee' | 'bakery' | 'egg' | 'chaat' | 'roll' | 'pav' | 'drink' | 'thali';

const ink = 'var(--art-ink, currentColor)';
const a = 'var(--art-a, #f2b544)';
const b = 'var(--art-b, #c2410c)';
const sw = 'var(--art-stroke, 2.5)';

const ART: Record<ArtKey, JSX.Element> = {
  curry: (
    <>
      <path d="M8 30h48c0 14-10 24-24 24S8 44 8 30Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <ellipse cx="32" cy="30" rx="24" ry="5" fill={b} stroke={ink} strokeWidth={sw} />
      <circle cx="24" cy="29" r="2.2" fill="#fff" /><circle cx="36" cy="31" r="1.8" fill="#fff" /><circle cx="41" cy="28.5" r="1.6" fill="#fff" />
      <path d="M26 20c-2-3 2-5 0-9M34 20c-2-3 2-5 0-9" fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" opacity=".5" />
    </>
  ),
  bread: (
    <>
      <path d="M10 40c-2-14 10-26 24-26 13 0 22 10 20 22-1 7-8 12-22 13-13 1-21-2-22-9Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx="24" cy="30" r="3" fill={b} opacity=".7" /><circle cx="37" cy="25" r="2.5" fill={b} opacity=".7" /><circle cx="40" cy="38" r="3" fill={b} opacity=".7" /><circle cx="27" cy="41" r="2" fill={b} opacity=".7" />
    </>
  ),
  kebab: (
    <>
      <path d="M8 56 56 8" stroke={ink} strokeWidth={sw} strokeLinecap="round" />
      <rect x="15" y="34" width="13" height="13" rx="3" transform="rotate(-45 21.5 40.5)" fill={b} stroke={ink} strokeWidth={sw} />
      <rect x="25" y="24" width="13" height="13" rx="3" transform="rotate(-45 31.5 30.5)" fill={a} stroke={ink} strokeWidth={sw} />
      <rect x="35" y="14" width="13" height="13" rx="3" transform="rotate(-45 41.5 20.5)" fill={b} stroke={ink} strokeWidth={sw} />
    </>
  ),
  rice: (
    <>
      <path d="M12 34h40c0 11-9 19-20 19s-20-8-20-19Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M14 34c0-10 8-18 18-18s18 8 18 18" fill="#fff" stroke={ink} strokeWidth={sw} />
      <path d="M24 26h3M33 22h3M38 29h3M28 31h3" stroke={ink} strokeWidth="2" strokeLinecap="round" opacity=".45" />
    </>
  ),
  sweet: (
    <>
      <ellipse cx="32" cy="46" rx="24" ry="7" fill={a} stroke={ink} strokeWidth={sw} />
      <circle cx="24" cy="36" r="9" fill={b} stroke={ink} strokeWidth={sw} />
      <circle cx="40" cy="36" r="9" fill={b} stroke={ink} strokeWidth={sw} />
      <path d="M21 32a4 4 0 0 1 4-3M37 32a4 4 0 0 1 4-3" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  coffee: (
    <>
      <path d="M14 26h30v14c0 8-6 14-15 14s-15-6-15-14Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M44 30h4a6 6 0 0 1 0 12h-5" fill="none" stroke={ink} strokeWidth={sw} />
      <ellipse cx="29" cy="26" rx="15" ry="3.5" fill={b} stroke={ink} strokeWidth={sw} />
      <path d="M24 18c-2-3 2-5 0-8M32 18c-2-3 2-5 0-8" fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" opacity=".5" />
    </>
  ),
  bakery: (
    <>
      <path d="M8 40c4-14 14-22 24-22s20 8 24 22c-8 4-16 6-24 6s-16-2-24-6Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M22 22c2 8 2 16 0 22M32 18v27M42 22c-2 8-2 16 0 22" fill="none" stroke={ink} strokeWidth={sw} opacity=".6" />
    </>
  ),
  egg: (
    <>
      <path d="M10 34c0-12 8-20 18-18 6-6 18-4 22 4 6 4 6 14 0 20-6 8-20 10-30 8-6-2-10-7-10-14Z" fill="#fff" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx="33" cy="33" r="9" fill={a} stroke={ink} strokeWidth={sw} />
      <circle cx="30" cy="30" r="2" fill="#fff" opacity=".8" />
    </>
  ),
  chaat: (
    <>
      <ellipse cx="32" cy="46" rx="25" ry="7" fill={b} stroke={ink} strokeWidth={sw} />
      <circle cx="20" cy="36" r="8" fill={a} stroke={ink} strokeWidth={sw} />
      <circle cx="34" cy="34" r="8" fill={a} stroke={ink} strokeWidth={sw} />
      <circle cx="46" cy="38" r="7" fill={a} stroke={ink} strokeWidth={sw} />
      <path d="M17 33h6M31 31h6M43 35h5" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  roll: (
    <>
      <rect x="8" y="22" width="48" height="20" rx="10" transform="rotate(-18 32 32)" fill={a} stroke={ink} strokeWidth={sw} />
      <ellipse cx="51" cy="24" rx="5" ry="9" transform="rotate(-18 51 24)" fill={b} stroke={ink} strokeWidth={sw} />
      <path d="M20 38 40 31" stroke={ink} strokeWidth="2" strokeLinecap="round" opacity=".5" />
    </>
  ),
  pav: (
    <>
      <path d="M10 34c0-10 10-16 22-16s22 6 22 16Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <rect x="10" y="34" width="44" height="7" rx="3" fill={b} stroke={ink} strokeWidth={sw} />
      <path d="M10 41h44c0 5-4 8-9 8H19c-5 0-9-3-9-8Z" fill={a} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx="26" cy="25" r="1.4" fill={ink} /><circle cx="34" cy="23" r="1.4" fill={ink} /><circle cx="40" cy="27" r="1.4" fill={ink} />
    </>
  ),
  drink: (
    <>
      <path d="M18 14h28l-4 40H22Z" fill="#fff" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M20 28h24l-2.6 26H22.6Z" fill={a} />
      <path d="M18 14h28l-4 40H22Z" fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M38 6 34 30" stroke={b} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  thali: (
    <>
      <circle cx="32" cy="32" r="25" fill={a} stroke={ink} strokeWidth={sw} />
      <circle cx="22" cy="24" r="6" fill={b} stroke={ink} strokeWidth="2" />
      <circle cx="38" cy="20" r="6" fill="#fff" stroke={ink} strokeWidth="2" />
      <circle cx="43" cy="35" r="6" fill={b} stroke={ink} strokeWidth="2" />
      <path d="M16 38c6 8 18 10 22 6" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

const KEYWORDS: [RegExp, ArtKey][] = [
  // South Indian tiffin and meals: a plate with bowls of sambar and chutney.
  [/dosa|idli|uttapam|appam|idiyappam|pongal|upma|sadya|meals/i, 'thali'],
  [/parotta|porotta/i, 'bread'],
  [/naan|roti|paratha|kulcha|bread|bhatura/i, 'bread'],
  [/tikka|kabab|kebab|seekh|tandoori chicken|skewer/i, 'kebab'],
  [/rice|biryani|pulao|khichdi/i, 'rice'],
  [/jamun|kulfi|halwa|kheer|payasam|rasmalai|dessert|sweet|mithai|ice cream|gola/i, 'sweet'],
  [/coffee|cappuccino|latte|espresso|brew|chai|tea/i, 'coffee'],
  [/croissant|bread|cake|bake|muffin|cookie|toast/i, 'bakery'],
  [/omelette|egg|anda/i, 'egg'],
  [/puri|chaat|papdi|bhel|golgappa/i, 'chaat'],
  [/roll|wrap|frankie|kathi/i, 'roll'],
  [/pav|burger|vada|sandwich|fries/i, 'pav'],
  [/chaas|lassi|juice|soda|cooler|drink|shake|lemonade|nimbu/i, 'drink'],
  [/dal|curry|masala|makhani|maas|korma|paneer|chicken|mutton|sabzi|bhaji/i, 'curry'],
  [/granola|bowl|salad/i, 'rice'],
];

/** Best-guess illustration for a dish, by its name and then its category. */
export function artFor(...names: (string | null | undefined)[]): ArtKey {
  for (const name of names) {
    if (!name) continue;
    for (const [re, key] of KEYWORDS) if (re.test(name)) return key;
  }
  return 'thali';
}

export function FoodArt({ art, title, ...props }: { art: ArtKey; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title && <title>{title}</title>}
      {ART[art]}
    </svg>
  );
}

export const ART_KEYS = Object.keys(ART) as ArtKey[];
