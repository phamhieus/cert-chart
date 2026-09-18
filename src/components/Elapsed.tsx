import { useEffect, useState } from 'react';
import { formatElapsed } from '../utils/format';

interface ElapsedSinceProps {
  /** ISO-8601 instant to count from. */
  value: string | null | undefined;
  className?: string;
}

/**
 * Ticks once a second so the counter stays exact instead of freezing at the
 * value it had when the dataset loaded. Its own state keeps the re-render to
 * this leaf.
 */
export function ElapsedSince({ value, className }: ElapsedSinceProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!value) return null;
  return <span className={className}>{formatElapsed(value, now)}</span>;
}
