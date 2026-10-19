import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
export function Chart({
  labels,
  values,
  type = 'line',
  label,
}: {
  labels: string[];
  values: number[];
  type?: 'line' | 'bar';
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      grid: { left: 46, right: 20, top: 24, bottom: 34 },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: type === 'bar',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#8390a4', fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitNumber: 4,
        axisLabel: { color: '#8390a4', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(140,155,177,.14)', type: 'dashed' } },
      },
      series: [
        {
          name: label,
          type,
          data: values,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 3, color: '#447fe7' },
          itemStyle: { color: '#447fe7', borderRadius: [4, 4, 0, 0] },
          areaStyle:
            type === 'line'
              ? {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(68,127,231,.20)' },
                    { offset: 1, color: 'rgba(68,127,231,0)' },
                  ]),
                }
              : undefined,
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [labels, values, type, label]);
  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label={`${label}，共 ${values.length} 个数据点，末值 ${values.at(-1) ?? 0}`}
    />
  );
}
