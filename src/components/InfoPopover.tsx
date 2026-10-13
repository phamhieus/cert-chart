import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface InfoPopoverProps {
  /** Accessible name for the trigger, e.g. "How 12M growth is calculated". */
  label: string;
  children: ReactNode;
}

/**
 * A small "i" that opens an explanation on click. Click rather than hover so it
 * works on touch screens, where a tooltip never appears.
 */
export function InfoPopover({ label, children }: InfoPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={label}
        className="inline-flex rounded-sm text-faint transition-colors hover:text-ink
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        // Inside a sortable header: opening the explanation must not re-sort.
        onClick={(event) => event.stopPropagation()}
      >
        <Info size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-line bg-elevated p-3
            text-left text-xs normal-case leading-relaxed tracking-normal text-muted shadow-pop
            animate-slide-down"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
