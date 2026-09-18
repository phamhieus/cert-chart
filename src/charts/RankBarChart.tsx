import { useMemo } from 'react';
import type { Theme } from '../hooks/useTheme';
import type { RankedCertification } from '../types';
import { formatCompact } from '../utils/format';
import { EChart, type EChartsOption } from './EChart';
import { chartTheme, tooltipStyle } from './theme';

interface RankBarChartProps {
  rows: RankedCertification[];
  metric: (row: RankedCertification) => number;
  valueName: string;
  theme: Theme;
  limit?: number;
  color?: string;
  onSelect?: (certificationId: string) => void;
  height?: number;
}

export function RankBarChart({
  rows,
  metric,
  valueName,
  theme,
  limit = 10,
  color,
  onSelect,
  height = 280,
}: RankBarChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const palette = chartTheme(theme);
    const top = [...rows]
      .sort((a, b) => metric(b) - metric(a))
      .slice(0, limit)
      .reverse();

    return {
      grid: { left: 4, right: 48, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        ...tooltipStyle(palette),
        formatter: (params: { name?: string; value?: number }) =>
          `${params.name} — <b>${formatCompact(params.value ?? 0)}</b> ${valueName}`,
      },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: palette.line } },
        axisLabel: { color: palette.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: top.map((row) => row.certification.shortName),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.text, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { color: color ?? palette.accent, borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { opacity: 0.85 } },
          cursor: onSelect ? 'pointer' : 'default',
          label: {
            show: true,
            position: 'right',
            color: palette.muted,
            fontSize: 11,
            formatter: (params: { value?: number }) => formatCompact(params.value ?? 0),
          },
          data: top.map((row) => ({
            value: metric(row),
            id: row.certification.id,
            name: row.certification.shortName,
          })),
        },
      ],
    };
  }, [rows, metric, valueName, theme, limit, color, onSelect]);

  return <EChart option={option} height={height} onItemClick={onSelect} />;
}
