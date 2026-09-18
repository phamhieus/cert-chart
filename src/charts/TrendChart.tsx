import { useMemo } from 'react';
import type { Theme } from '../hooks/useTheme';
import type { RankedCertification, TrendPoint } from '../types';
import { cn, formatMonth } from '../utils/format';
import { EChart, type EChartsOption } from './EChart';
import { SERIES_PALETTE, chartTheme, tooltipStyle } from './theme';

export type TrendMetric = 'jobs' | 'community';

/** Windows over the 36-month series the ranking builds. */
export const TREND_RANGES = [12, 24, 36] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

interface TrendChartProps {
  rows: RankedCertification[];
  selectedIds: string[];
  onToggle: (certificationId: string) => void;
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  months: TrendRange;
  onMonthsChange: (months: TrendRange) => void;
  theme: Theme;
  height?: number;
}

const METRIC_LABELS: Record<TrendMetric, string> = {
  jobs: 'Job postings',
  community: 'Community mentions',
};

export function TrendChart({
  rows,
  selectedIds,
  onToggle,
  metric,
  onMetricChange,
  months,
  onMonthsChange,
  theme,
  height = 300,
}: TrendChartProps) {
  const selected = rows.filter((row) => selectedIds.includes(row.certification.id));

  const option = useMemo<EChartsOption>(() => {
    const palette = chartTheme(theme);
    // The series is always built 36 months wide; the selector is a window on it,
    // so switching range never refetches or rescores anything.
    const window = (points: TrendPoint[]): TrendPoint[] => points.slice(-months);
    const axis = window(selected[0]?.trend ?? []).map((point) => point.month);

    return {
      grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle(palette),
        axisPointer: { type: 'line', lineStyle: { color: palette.line } },
      },
      legend: {
        show: false,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: axis.map(formatMonth),
        axisLine: { lineStyle: { color: palette.line } },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: METRIC_LABELS[metric],
        nameTextStyle: { color: palette.muted, fontSize: 11, align: 'left' },
        splitLine: { lineStyle: { color: palette.line } },
        axisLabel: { color: palette.muted, fontSize: 11 },
      },
      series: selected.map((row, index) => ({
        type: 'line',
        name: row.certification.shortName,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: SERIES_PALETTE[index % SERIES_PALETTE.length] },
        itemStyle: { color: SERIES_PALETTE[index % SERIES_PALETTE.length] },
        data: window(row.trend).map((point) =>
          metric === 'jobs' ? point.jobs : point.community,
        ),
      })),
    };
  }, [selected, metric, months, theme]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-line p-0.5">
          {(['jobs', 'community'] as TrendMetric[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onMetricChange(option)}
              className={cn(
                'rounded px-2 py-1 text-2xs font-medium transition-colors',
                metric === option ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink',
              )}
            >
              {METRIC_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="flex rounded-md border border-line p-0.5">
          {TREND_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onMonthsChange(option)}
              className={cn(
                'rounded px-2 py-1 text-2xs font-medium transition-colors',
                months === option ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink',
              )}
            >
              {option}m
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {rows.slice(0, 12).map((row, index) => {
            const active = selectedIds.includes(row.certification.id);
            const color = SERIES_PALETTE[selected.findIndex((s) => s.certification.id === row.certification.id) % SERIES_PALETTE.length];
            return (
              <button
                key={row.certification.id}
                type="button"
                onClick={() => onToggle(row.certification.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
                  active
                    ? 'border-transparent bg-elevated text-ink'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: active
                      ? color
                      : SERIES_PALETTE[index % SERIES_PALETTE.length] + '55',
                  }}
                />
                {row.certification.shortName}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <p className="py-16 text-center text-xs text-muted">
          Pick one or more certifications to compare.
        </p>
      ) : (
        <EChart option={option} height={height} />
      )}
    </div>
  );
}
