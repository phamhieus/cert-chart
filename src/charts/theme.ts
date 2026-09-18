import type { Theme } from '../hooks/useTheme';

export const SERIES_PALETTE = [
  '#5B8DEF',
  '#2FBF71',
  '#E8A33D',
  '#D96570',
  '#8E7CE8',
  '#3FB6C4',
  '#C46FB3',
  '#7E8B9A',
];

export interface ChartTheme {
  text: string;
  muted: string;
  line: string;
  accent: string;
  tooltipBg: string;
  tooltipBorder: string;
}

export function chartTheme(theme: Theme): ChartTheme {
  return theme === 'dark'
    ? {
        text: '#ECEFF3',
        muted: '#9AA3AE',
        line: 'rgba(255,255,255,0.08)',
        accent: '#6096FF',
        tooltipBg: 'rgba(22,25,29,0.96)',
        tooltipBorder: 'rgba(255,255,255,0.12)',
      }
    : {
        text: '#111418',
        muted: '#5B636E',
        line: 'rgba(17,20,24,0.08)',
        accent: '#2563EB',
        tooltipBg: 'rgba(255,255,255,0.98)',
        tooltipBorder: 'rgba(17,20,24,0.1)',
      };
}

export function tooltipStyle(theme: ChartTheme) {
  return {
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: theme.text, fontSize: 12 },
    extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -8px rgba(0,0,0,.35);padding:8px 10px;',
  };
}
