import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/format';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-faint', className)} />;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="text-faint">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex h-1 w-12 overflow-hidden rounded-full bg-line', className)}>
      <span
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </span>
  );
}
