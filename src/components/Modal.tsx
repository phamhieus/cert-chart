import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/format';

const SIZES = {
  lg: 'h-[100dvh] w-screen rounded-none sm:h-[85vh] sm:w-[85vw] sm:max-w-[85vw] sm:rounded-xl',
  md: 'max-h-[88dvh] w-[min(94vw,46rem)] rounded-xl',
} as const;

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  size?: keyof typeof SIZES;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, label, size = 'lg', children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          aria-label={label}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden',
            'border border-line bg-surface shadow-pop animate-scale-in',
            SIZES[size],
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

export const ModalTitle = Dialog.Title;
export const ModalDescription = Dialog.Description;
