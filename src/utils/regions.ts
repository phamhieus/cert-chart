import {
  CITY_BY_ID,
  CITY_BY_NAME,
  MARKETS,
  MARKET_BY_ID,
  MARKET_LABELS,
} from '../constants/regions';
import type { GeoLocation, MarketId, RegionFilterValue } from '../types';

export function isMarketId(value: string): value is MarketId {
  return MARKET_BY_ID.has(value as MarketId);
}

export function toCityId(name: string | undefined): string | null {
  if (!name) return null;
  const direct = CITY_BY_NAME.get(name.trim().toLowerCase());
  if (direct) return direct.id;
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return CITY_BY_ID.has(slug) ? slug : null;
}

interface MatchOptions {
  /**
   * Market-wide records (forum threads with no city) count as a match for a city
   * filter inside that market. Job postings always carry a place, so callers that
   * filter jobs turn this off.
   */
  includeNational?: boolean;
}

export function matchesRegion(
  location: GeoLocation | undefined,
  filter: RegionFilterValue,
  { includeNational = true }: MatchOptions = {},
): boolean {
  if (filter === 'all') return true;
  if (!location) return filter === 'unknown';

  if (filter === 'national') return location.scope === 'national';
  if (filter === 'unknown') return location.scope === 'unknown';

  if (isMarketId(filter)) return location.market === filter;

  const city = CITY_BY_ID.get(filter);
  if (!city) return false;
  if (toCityId(location.city) === city.id) return true;
  return includeNational && location.scope === 'national' && location.market === city.market;
}

export function regionLabel(filter: RegionFilterValue): string {
  if (filter === 'all') return 'All markets';
  if (filter === 'national') return 'Market-wide';
  if (filter === 'unknown') return 'Unknown';
  if (isMarketId(filter)) return MARKET_LABELS[filter];
  return CITY_BY_ID.get(filter)?.name ?? filter;
}

export function locationLabel(location: GeoLocation | undefined): string {
  if (!location) return 'Unknown';
  if (location.city) return location.city;
  if (location.scope === 'national') return `${MARKET_LABELS[location.market]} (nationwide)`;
  if (location.scope === 'unknown') return 'Unknown';
  return MARKET_LABELS[location.market];
}

export interface RegionOption {
  value: RegionFilterValue;
  label: string;
  depth: number;
}

export function buildRegionOptions(extras: RegionFilterValue[] = []): RegionOption[] {
  const options: RegionOption[] = [{ value: 'all', label: 'All markets', depth: 0 }];
  for (const market of MARKETS) {
    options.push({ value: market.id, label: market.label, depth: 1 });
    for (const city of market.cities) {
      options.push({ value: city.id, label: city.name, depth: 2 });
    }
  }
  for (const extra of extras) {
    options.push({ value: extra, label: regionLabel(extra), depth: 1 });
  }
  return options;
}
