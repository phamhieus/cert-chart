import { CalendarRange, Layers, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { Select, type SelectOption } from '../components/Select';
import { SearchInput } from '../components/SearchInput';
import { CATEGORIES, PERIOD_LABELS } from '../constants/ranking';
import type { CertCategory, DashboardFilters, PeriodKey, RegionFilterValue } from '../types';
import { buildRegionOptions } from '../utils/regions';

interface FilterBarProps {
  filters: DashboardFilters;
  onChange: (patch: Partial<DashboardFilters>) => void;
}

const PERIOD_OPTIONS: Array<SelectOption<PeriodKey>> = (
  Object.keys(PERIOD_LABELS) as PeriodKey[]
).map((key) => ({ value: key, label: PERIOD_LABELS[key] }));

const CATEGORY_OPTIONS: Array<SelectOption<CertCategory | 'all'>> = [
  { value: 'all', label: 'All categories' },
  ...CATEGORIES.map((category) => ({ value: category, label: category })),
];

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const regionOptions = useMemo<Array<SelectOption<RegionFilterValue>>>(
    () => buildRegionOptions().map(({ value, label, depth }) => ({ value, label, depth })),
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.region}
        options={regionOptions}
        onChange={(region) => onChange({ region })}
        icon={<MapPin size={13} />}
        ariaLabel="Region"
      />
      <Select
        value={filters.category}
        options={CATEGORY_OPTIONS}
        onChange={(category) => onChange({ category })}
        icon={<Layers size={13} />}
        ariaLabel="Category"
      />
      <Select
        value={filters.period}
        options={PERIOD_OPTIONS}
        onChange={(period) => onChange({ period })}
        icon={<CalendarRange size={13} />}
        ariaLabel="Period"
      />
      <SearchInput
        value={filters.search}
        onChange={(search) => onChange({ search })}
        placeholder="Search name, code or vendor…"
        ariaLabel="Search certification"
        className="w-full sm:w-64"
      />
    </div>
  );
}
