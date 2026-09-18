import type { Market, MarketId } from '../types';

/**
 * Vietnam is the primary market and the only one broken down by city.
 * Singapore, Japan and Global are tracked at market level for comparison.
 */
export const MARKETS: Market[] = [
  {
    id: 'vietnam',
    label: 'Vietnam',
    country: 'VN',
    cities: [
      { id: 'hanoi', name: 'Hanoi', market: 'vietnam' },
      { id: 'ho-chi-minh-city', name: 'Ho Chi Minh City', market: 'vietnam' },
      { id: 'da-nang', name: 'Da Nang', market: 'vietnam' },
    ],
  },
  { id: 'singapore', label: 'Singapore', country: 'SG', cities: [] },
  { id: 'japan', label: 'Japan', country: 'JP', cities: [] },
  { id: 'global', label: 'Global / Remote', country: 'GLOBAL', cities: [] },
];

export const MARKET_IDS: MarketId[] = MARKETS.map((m) => m.id);

export const MARKET_BY_ID = new Map(MARKETS.map((m) => [m.id, m]));

export const CITIES = MARKETS.flatMap((m) => m.cities);

export const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

export const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));

export const MARKET_LABELS: Record<MarketId, string> = Object.fromEntries(
  MARKETS.map((m) => [m.id, m.label]),
) as Record<MarketId, string>;
