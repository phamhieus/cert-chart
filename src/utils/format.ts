export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en-US');
const vnd = new Intl.NumberFormat('vi-VN');
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'shortOffset',
});
const clockTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return plain.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 10_000 ? compact.format(value) : plain.format(value);
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(1);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(value >= 100 || value <= -100 ? 0 : 1)}%`;
}

export function formatPrice(price: number | null, currency = 'VND'): string {
  if (price === null) return 'Not published';
  if (price === 0) return 'Free';
  return currency === 'VND' ? `${vnd.format(price)} VND` : `${plain.format(price)} ${currency}`;
}

/** Accepts both a full ISO instant and a legacy date-only `YYYY-MM-DD` value. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseTimestamp(value);
  if (!date) return value;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: DATE_ONLY.test(value) ? 'UTC' : undefined,
  });
}

/**
 * Exact instant, to the second, in the reader's own time zone — no "today", no
 * "a few minutes ago". Records written before timestamps carried a clock time
 * say so instead of pretending to a precision they do not have.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseTimestamp(value);
  if (!date) return value;
  if (DATE_ONLY.test(value)) return `${formatDate(value)} (no clock time recorded)`;
  return dateTime.format(date);
}

/** `18 Sep 2026, 21:07:43 GMT+7` collapsed to `21:07:43` for same-day rows. */
export function formatClockTime(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date || !value || DATE_ONLY.test(value)) return '—';
  return clockTime.format(date);
}

/** Exact elapsed time, counted in whole seconds — never rounded to "months". */
export function formatElapsed(value: string | null | undefined, now = new Date()): string {
  const date = parseTimestamp(value);
  if (!date) return '—';
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return 'in the future';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  if (days === 0) parts.push(`${seconds % 60}s`);
  return `${parts.join(' ')} ago`;
}

/** Wall-clock duration of a run, to a tenth of a second. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} m ${(seconds - minutes * 60).toFixed(1)} s`;
}

export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Whole days, counted exactly — no rounding up into "months". */
export function relativeDays(value: string, now = new Date()): string {
  const date = parseTimestamp(value);
  if (!date) return '—';
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 0) return 'not yet posted';
  if (days === 0) return '0 days ago';
  return `${plain.format(days)} ${days === 1 ? 'day' : 'days'} ago`;
}
