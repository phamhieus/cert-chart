import { Briefcase, CalendarRange, Layers, MapPin, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Select, type SelectOption } from '../components/Select';
import { SearchInput } from '../components/SearchInput';
import { CATEGORIES, PERIOD_LABELS } from '../constants/ranking';
import { ROLE_OPTIONS } from '../constants/roles';
import type { CertCategory, DashboardFilters, PeriodKey, RegionFilterValue } from '../types';
import { cn } from '../utils/format';
import { buildRegionOptions } from '../utils/regions';

interface FilterBarProps {
  filters: DashboardFilters;
  onChange: (patch: Partial<DashboardFilters>) => void;
  /** True when any select differs from its default; marks the collapsed toggle. */
  active?: boolean;
}

const PERIOD_OPTIONS: Array<SelectOption<PeriodKey>> = (
  Object.keys(PERIOD_LABELS) as PeriodKey[]
).map((key) => ({ value: key, label: PERIOD_LABELS[key] }));

const CATEGORY_OPTIONS: Array<SelectOption<CertCategory | 'all'>> = [
  { value: 'all', label: 'All categories' },
  ...CATEGORIES.map((category) => ({ value: category, label: category })),
];

/**
 * Phone grid cell: full width, label stretched so the chevron sits at the right
 * edge and the two columns line up. Desktop keeps the natural width.
 */
const SELECT_CELL = 'w-full sm:w-auto [&>span.truncate]:flex-1 [&>span.truncate]:text-left';

/**
 * On phones the four selects fold behind a "Filters" toggle beside the search
 * box — laid out in full they took two rows of a sticky header. From `sm` up
 * everything sits in one row, as before.
 */
export function FilterBar({ filters, onChange, active = false }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const regionOptions = useMemo<Array<SelectOption<RegionFilterValue>>>(
    () => buildRegionOptions().map(({ value, label, depth }) => ({ value, label, depth })),
    [],
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div
        id="dashboard-filters"
        className={cn(
          'grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center',
          open ? 'grid' : 'hidden',
        )}
      >
        <Select
          value={filters.region}
          options={regionOptions}
          onChange={(region) => onChange({ region })}
          icon={<MapPin size={13} />}
          ariaLabel="Region"
          className={SELECT_CELL}
        />
        <Select
          value={filters.role}
          options={ROLE_OPTIONS}
          onChange={(role) => onChange({ role })}
          icon={<Briefcase size={13} />}
          ariaLabel="Job role"
          className={SELECT_CELL}
        />
        <Select
          value={filters.category}
          options={CATEGORY_OPTIONS}
          onChange={(category) => onChange({ category })}
          icon={<Layers size={13} />}
          ariaLabel="Category"
          className={SELECT_CELL}
        />
        <Select
          value={filters.period}
          options={PERIOD_OPTIONS}
          onChange={(period) => onChange({ period })}
          icon={<CalendarRange size={13} />}
          ariaLabel="Period"
          className={SELECT_CELL}
        />
      </div>

      {/* First on phones, so the search box stays put while the panel opens below it. */}
      <div className="order-first flex items-center gap-2 sm:order-none">
        <SearchInput
          value={filters.search}
          onChange={(search) => onChange({ search })}
          placeholder="Search name, code or vendor…"
          ariaLabel="Search certification"
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
        />
        <button
          type="button"
          className={cn('control relative sm:hidden', open && 'text-ink')}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="dashboard-filters"
        >
          <SlidersHorizontal size={13} />
          Filters
          {active ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
              aria-label="Filters applied"
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}
