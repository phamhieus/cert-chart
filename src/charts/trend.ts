import type { TrendPoint } from '../types';

/**
 * The slice bounds (end-exclusive) that drop the all-zero months at both ends
 * of a trend window, so the axis starts where the data actually does.
 *
 * Interior zero months are kept on purpose: removing those would space the
 * axis unevenly and draw a line straight across a month that really was empty.
 * Only the ends are trimmed, which is what makes the job series readable —
 * boards publish live postings only, so a first crawl has nothing older than a
 * few months and most of the 36 points are a flat zero line that says nothing
 * except "we had not started crawling yet".
 *
 * A series that is zero everywhere keeps its full window rather than
 * collapsing to nothing: an empty chart would read as a loading failure.
 */
export function nonEmptyRange(totals: number[]): [number, number] {
  const first = totals.findIndex((value) => value > 0);
  if (first === -1) return [0, totals.length];
  let last = totals.length - 1;
  while (last > first && totals[last] === 0) last -= 1;
  return [first, last + 1];
}

/**
 * Per-month totals across every series sharing one axis. A month only counts
 * as empty when it is empty for all of them — trimming on one certification
 * would silently cut months another one has data for.
 */
export function monthTotals(series: TrendPoint[][], valueOf: (point: TrendPoint) => number): number[] {
  const longest = series.reduce((max, points) => Math.max(max, points.length), 0);
  return Array.from({ length: longest }, (_, index) =>
    series.reduce((sum, points) => sum + (points[index] ? valueOf(points[index]) : 0), 0),
  );
}
