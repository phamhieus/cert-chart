import type { ReactNode } from 'react';
import type { RequirementType, TrendDirection } from '../types';
import { cn, formatPercent } from '../utils/format';

type Tone = 'neutral' | 'accent' | 'up' | 'down' | 'warn';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface text-muted',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  up: 'border-up/30 bg-up/10 text-up',
  down: 'border-down/30 bg-down/10 text-down',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium leading-none',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const REQUIREMENT_TONES: Record<RequirementType, Tone> = {
  required: 'down',
  preferred: 'accent',
  mentioned: 'neutral',
};

export function RequirementBadge({ requirement }: { requirement: RequirementType }) {
  return (
    <Badge tone={REQUIREMENT_TONES[requirement]} className="uppercase tracking-wide">
      {requirement}
    </Badge>
  );
}

const ARROWS: Record<TrendDirection, string> = { up: '↑', down: '↓', flat: '→' };
const TREND_CLASSES: Record<TrendDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-faint',
};

export function TrendValue({
  direction,
  value,
  className,
}: {
  direction: TrendDirection;
  value: number | null;
  className?: string;
}) {
  if (value === null) {
    return (
      <span
        className={cn('num text-faint', className)}
        title="Not enough crawled history to compare periods yet"
      >
        —
      </span>
    );
  }

  return (
    <span className={cn('num inline-flex items-center gap-1', TREND_CLASSES[direction], className)}>
      <span aria-hidden>{ARROWS[direction]}</span>
      {formatPercent(value)}
    </span>
  );
}
