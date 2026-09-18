import { Search, X } from 'lucide-react';
import { cn } from '../utils/format';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  ariaLabel,
}: SearchInputProps) {
  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      <Search size={14} className="pointer-events-none absolute left-2.5 text-faint" />
      <input
        type="search"
        value={value}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-7 text-[13px] text-ink
          placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
          [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1.5 rounded p-1 text-faint hover:bg-elevated hover:text-ink"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}
