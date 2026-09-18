import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';
import { cn } from '../utils/format';

interface VirtualListProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateSize?: number;
  className?: string;
  empty?: ReactNode;
}

/** Keeps long job/discussion lists at a few dozen DOM nodes regardless of dataset size. */
export function VirtualList<T>({
  items,
  keyOf,
  renderItem,
  estimateSize = 108,
  className,
  empty,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  return (
    <div ref={scrollRef} className={cn('scroll-thin flex-1 overflow-y-auto', className)}>
      {items.length === 0 ? (
        empty
      ) : (
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={keyOf(item)}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderItem(item)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
