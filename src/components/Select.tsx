import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../utils/format';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Indentation level, used for the market → city hierarchy. */
  depth?: number;
}

interface SelectProps<T extends string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  className,
  ariaLabel,
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <RadixSelect.Root value={value} onValueChange={(next) => onChange(next as T)}>
      <RadixSelect.Trigger
        aria-label={ariaLabel ?? label}
        className={cn(
          'control min-w-0 max-w-full gap-2 data-[state=open]:bg-elevated',
          className,
        )}
      >
        {icon ? <span className="shrink-0 text-faint">{icon}</span> : null}
        {label ? <span className="shrink-0 text-faint">{label}</span> : null}
        <span className="truncate font-medium">{selected?.label ?? value}</span>
        <RadixSelect.Icon className="shrink-0 text-faint">
          <ChevronDown size={14} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(24rem,70vh)] min-w-[12rem] overflow-hidden rounded-lg border border-line
            bg-elevated shadow-pop animate-slide-down"
        >
          <RadixSelect.Viewport className="scroll-thin max-h-[min(24rem,70vh)] overflow-y-auto p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-3
                  text-[13px] text-ink outline-none data-[highlighted]:bg-accent/10
                  data-[highlighted]:text-accent"
                style={{ paddingLeft: `${1.75 + (option.depth ?? 0) * 0.75}rem` }}
              >
                <RadixSelect.ItemIndicator className="absolute left-2 text-accent">
                  <Check size={13} />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
