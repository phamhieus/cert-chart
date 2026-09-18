import { BarChart, LineChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import { cn } from '../utils/format';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  CanvasRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

interface EChartProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  /** Receives the `name` of the clicked item (certification id in these charts). */
  onItemClick?: (id: string) => void;
}

export function EChart({ option, height = 260, className, onItemClick }: EChartProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const clickHandler = useRef(onItemClick);
  clickHandler.current = onItemClick;

  useEffect(() => {
    if (!container.current) return;
    const chart = echarts.init(container.current, undefined, { renderer: 'canvas' });
    instance.current = chart;

    chart.on('click', (params: { data?: unknown; name?: string }) => {
      const data = params.data as { id?: string } | undefined;
      const id = data?.id ?? params.name;
      if (id) clickHandler.current?.(id);
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={container}
      className={cn('w-full', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
}
