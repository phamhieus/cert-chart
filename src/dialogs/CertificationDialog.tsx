import * as Tabs from '@radix-ui/react-tabs';
import { CalendarRange, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Modal, ModalDescription, ModalTitle } from '../components/Modal';
import { Select, type SelectOption } from '../components/Select';
import { PERIOD_LABELS } from '../constants/ranking';
import type { Theme } from '../hooks/useTheme';
import type { Dataset } from '../services/dataRepository';
import type {
  ModalTab,
  PeriodKey,
  RankedCertification,
  RegionFilterValue,
} from '../types';
import { filterCommunity, filterCourses, filterJobs } from '../utils/filters';
import { cn, formatCompact, formatNumber } from '../utils/format';
import { buildRegionOptions } from '../utils/regions';
import { CommunityTab } from './tabs/CommunityTab';
import { CoursesTab } from './tabs/CoursesTab';
import { JobsTab } from './tabs/JobsTab';
import { OverviewTab } from './tabs/OverviewTab';

interface CertificationDialogProps {
  dataset: Dataset;
  row: RankedCertification;
  tab: ModalTab;
  onTabChange: (tab: ModalTab) => void;
  onClose: () => void;
  initialRegion: RegionFilterValue;
  initialPeriod: PeriodKey;
  theme: Theme;
}

/** `hidden` must win over the flex display, so the panel is flex only when active. */
const TAB_PANEL = 'hidden min-h-0 flex-1 flex-col outline-none data-[state=active]:flex';

const PERIOD_OPTIONS: Array<SelectOption<PeriodKey>> = (
  Object.keys(PERIOD_LABELS) as PeriodKey[]
).map((key) => ({ value: key, label: PERIOD_LABELS[key] }));

export function CertificationDialog({
  dataset,
  row,
  tab,
  onTabChange,
  onClose,
  initialRegion,
  initialPeriod,
  theme,
}: CertificationDialogProps) {
  // Independent from the dashboard filters on purpose: changing them here must
  // not move the ranking behind the modal.
  const [region, setRegion] = useState<RegionFilterValue>(initialRegion);
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  // Tabs render on first visit and stay mounted, so switching back keeps the
  // filters a reader set without paying for all four up front.
  const [visited, setVisited] = useState<Set<ModalTab>>(() => new Set([tab]));

  const selectTab = (next: ModalTab) => {
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    onTabChange(next);
  };

  const regionOptions = useMemo<Array<SelectOption<RegionFilterValue>>>(
    () =>
      buildRegionOptions(['national', 'unknown']).map(({ value, label, depth }) => ({
        value,
        label,
        depth,
      })),
    [],
  );

  const certificationId = row.certification.id;
  const now = dataset.datasetNow;

  const jobs = useMemo(
    () => filterJobs(dataset.jobs, { certificationId, region, period, now }),
    [dataset.jobs, certificationId, region, period, now],
  );

  const posts = useMemo(
    () => filterCommunity(dataset.community, { certificationId, region, period, now }),
    [dataset.community, certificationId, region, period, now],
  );

  const courses = useMemo(
    () => filterCourses(dataset.courses, { certificationId, region }),
    [dataset.courses, certificationId, region],
  );

  const cert = row.certification;

  const tabItems: Array<{ value: ModalTab; label: string; count?: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'jobs', label: 'Jobs', count: formatNumber(jobs.length) },
    { value: 'community', label: 'Community', count: formatCompact(posts.length) },
    { value: 'courses', label: 'Courses', count: formatNumber(courses.length) },
  ];

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} label={cert.name}>
      <Tabs.Root
        value={tab}
        onValueChange={(next) => selectTab(next as ModalTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="border-b border-line px-4 pb-0 pt-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
            <div className="min-w-0">
              <ModalTitle className="text-base font-semibold leading-snug text-ink">
                {cert.name}
              </ModalTitle>
              <ModalDescription asChild>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {cert.code ? <span className="num">{cert.code}</span> : null}
                  <span>{cert.vendor}</span>
                  <Badge>{cert.category}</Badge>
                  <Badge>{cert.level}</Badge>
                  <span className="num text-faint">rank #{row.rank}</span>
                </div>
              </ModalDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={region}
                options={regionOptions}
                onChange={setRegion}
                icon={<MapPin size={13} />}
                ariaLabel="Region inside this certification"
              />
              <Select
                value={period}
                options={PERIOD_OPTIONS}
                onChange={setPeriod}
                icon={<CalendarRange size={13} />}
                ariaLabel="Period inside this certification"
              />
            </div>
          </div>

          <Tabs.List className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {tabItems.map((item) => (
              <Tabs.Trigger
                key={item.value}
                value={item.value}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px]',
                  'text-muted transition-colors hover:text-ink',
                  'data-[state=active]:border-accent data-[state=active]:text-ink',
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span className="num text-2xs text-faint">{item.count}</span>
                ) : null}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </header>

        <Tabs.Content value="overview" className={TAB_PANEL}>
          {visited.has('overview') ? (
            <OverviewTab
              row={row}
              jobs={jobs}
              posts={posts}
              courses={courses}
              holders={dataset.holdersByCertification.get(certificationId) ?? null}
              vendorHolders={dataset.holdersByVendor.get(row.certification.vendor) ?? null}
              theme={theme}
            />
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="jobs" className={TAB_PANEL}>
          {visited.has('jobs') ? (
            <JobsTab certificationId={certificationId} jobs={jobs} now={now} />
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="community" className={TAB_PANEL}>
          {visited.has('community') ? (
            <CommunityTab certificationId={certificationId} posts={posts} now={now} />
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="courses" className={TAB_PANEL}>
          {visited.has('courses') ? (
            <CoursesTab certificationId={certificationId} courses={courses} region={region} />
          ) : null}
        </Tabs.Content>
      </Tabs.Root>
    </Modal>
  );
}
