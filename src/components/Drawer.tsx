import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/format';

const WIDTHS = {
  /** Evidence lists: wide enough for a job title and its metadata on one line. */
  lg: 'w-screen sm:w-[min(92vw,56rem)]',
  md: 'w-screen sm:w-[min(92vw,42rem)]',
} as const;

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}

/**
 * Right-hand slide-out panel. Used where a reader drills from a number into the
 * records behind it: the dashboard stays in view on the left, so the number and
 * its evidence can be read together.
 */
export function Drawer({ open, onOpenChange, label, width = 'lg', children }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          aria-label={label}
          className={cn(
            'fixed right-0 top-0 z-50 flex h-[100dvh] flex-col overflow-hidden',
            'border-l border-line bg-surface shadow-pop animate-slide-in-right',
            WIDTHS[width],
          )}
        >
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-faint transition-colors
              hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2
              focus-visible:ring-accent/40"
          >
            <X size={16} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const DrawerTitle = Dialog.Title;
export const DrawerDescription = Dialog.Description;
