import type { GeoLocation, MarketId } from '../../src/types';
import { normalizeText } from '../../src/utils/certAliases';

interface Rule {
  match: string[];
  location: GeoLocation;
}

const CITY_RULES: Rule[] = [
  {
    match: ['ha noi', 'hanoi', 'hn'],
    location: { country: 'VN', market: 'vietnam', city: 'Hanoi' },
  },
  {
    match: ['ho chi minh', 'hcmc', 'hcm', 'sai gon', 'saigon', 'thu duc', 'tp hcm'],
    location: { country: 'VN', market: 'vietnam', city: 'Ho Chi Minh City' },
  },
  {
    match: ['da nang', 'danang'],
    location: { country: 'VN', market: 'vietnam', city: 'Da Nang' },
  },
  { match: ['singapore', 'sg'], location: { country: 'SG', market: 'singapore', city: 'Singapore' } },
  { match: ['tokyo', 'shibuya', 'shinjuku'], location: { country: 'JP', market: 'japan', city: 'Tokyo' } },
  { match: ['osaka'], location: { country: 'JP', market: 'japan', city: 'Osaka' } },
  { match: ['yokohama'], location: { country: 'JP', market: 'japan', city: 'Yokohama' } },
  { match: ['fukuoka'], location: { country: 'JP', market: 'japan', city: 'Fukuoka' } },
  { match: ['kyoto'], location: { country: 'JP', market: 'japan', city: 'Kyoto' } },
];

/** Vietnamese places outside the three tracked cities still belong to the VN market. */
const VN_OTHER_CITIES = [
  'hai phong',
  'bac ninh',
  'can tho',
  'hue',
  'nha trang',
  'binh duong',
  'dong nai',
  'quang ninh',
  'vinh phuc',
  'thai nguyen',
  'quang nam',
  'binh dinh',
  'long an',
  'vung tau',
];

const MARKET_RULES: Array<{ match: string[]; market: MarketId; country: string }> = [
  { match: ['viet nam', 'vietnam', 'vn'], market: 'vietnam', country: 'VN' },
  { match: ['japan', 'nihon', 'nippon'], market: 'japan', country: 'JP' },
  { match: ['remote', 'anywhere', 'worldwide', 'global', 'distributed'], market: 'global', country: 'GLOBAL' },
];

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const UNKNOWN_LOCATION: GeoLocation = {
  country: 'GLOBAL',
  market: 'global',
  scope: 'unknown',
};

/**
 * Maps a free-text place from a posting to a market/city. Nothing is guessed from
 * user profiles — only from the text the source itself publishes.
 */
export function resolveLocation(raw: string | undefined | null): GeoLocation {
  if (!raw) return UNKNOWN_LOCATION;
  const text = normalizeText(raw);
  if (!text) return UNKNOWN_LOCATION;

  for (const rule of CITY_RULES) {
    if (rule.match.some((needle) => new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(text))) {
      return { ...rule.location };
    }
  }

  for (const city of VN_OTHER_CITIES) {
    if (text.includes(city)) return { country: 'VN', market: 'vietnam', city: titleCase(city) };
  }

  for (const rule of MARKET_RULES) {
    if (rule.match.some((needle) => new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(text))) {
      return { country: rule.country, market: rule.market };
    }
  }

  return UNKNOWN_LOCATION;
}

export function marketLocation(market: MarketId, scope: 'national' | 'unknown' = 'national'): GeoLocation {
  const country =
    market === 'vietnam' ? 'VN' : market === 'singapore' ? 'SG' : market === 'japan' ? 'JP' : 'GLOBAL';
  return { country, market, scope };
}
