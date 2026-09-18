import { Briefcase, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RequirementBadge } from '../../components/Badge';
import { EmptyState } from '../../components/Feedback';
import { SearchInput } from '../../components/SearchInput';
import { Select, type SelectOption } from '../../components/Select';
import { VirtualList } from '../../components/VirtualList';
import { REQUIREMENT_LABELS } from '../../constants/ranking';
import { useDebounce } from '../../hooks/useDebounce';
import type { Job, RequirementType } from '../../types';
import { filterJobs, jobRequirement, uniqueSourceNames } from '../../utils/filters';
import { formatDate, formatDateTime, formatNumber, relativeDays } from '../../utils/format';
import { locationLabel } from '../../utils/regions';

interface JobsTabProps {
  certificationId: string;
  jobs: Job[];
  /** Jobs already narrowed by the modal's region and period filters. */
  now: Date;
}

const REQUIREMENT_OPTIONS: Array<SelectOption<RequirementType | 'all'>> = [
  { value: 'all', label: 'Any requirement' },
  ...(Object.keys(REQUIREMENT_LABELS) as RequirementType[]).map((key) => ({
    value: key,
    label: REQUIREMENT_LABELS[key],
  })),
];

function JobCard({ job, certificationId }: { job: Job; certificationId: string }) {
  const requirement = jobRequirement(job, certificationId);

  return (
    <article className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-[13px] font-medium text-ink">{job.title}</h4>
        {requirement ? <RequirementBadge requirement={requirement} /> : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {job.company} · {locationLabel(job.location)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-faint">
        <span>Source: {job.source.name}</span>
        <span title={`Crawled ${formatDateTime(job.crawledAt)}`}>
          Posted {formatDate(job.postedAt)} ({relativeDays(job.postedAt)})
        </span>
        <a
          href={job.source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="link text-2xs"
          onClick={(event) => event.stopPropagation()}
        >
          View original job
          <ExternalLink size={10} />
        </a>
      </div>
    </article>
  );
}

export function JobsTab({ certificationId, jobs, now }: JobsTabProps) {
  const [requirement, setRequirement] = useState<RequirementType | 'all'>('all');
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const sourceOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All sources' },
      ...uniqueSourceNames(jobs).map((name) => ({ value: name, label: name })),
    ],
    [jobs],
  );

  const visible = useMemo(
    () =>
      filterJobs(jobs, {
        certificationId,
        region: 'all',
        period: 'all',
        requirement,
        source,
        search: debouncedSearch,
        now,
      }).sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    [jobs, certificationId, requirement, source, debouncedSearch, now],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Select
          value={requirement}
          options={REQUIREMENT_OPTIONS}
          onChange={setRequirement}
          ariaLabel="Requirement type"
        />
        <Select value={source} options={sourceOptions} onChange={setSource} ariaLabel="Job source" />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Company or job title…"
          className="w-full sm:w-56"
        />
        <span className="num ml-auto text-2xs text-faint">{formatNumber(visible.length)} jobs</span>
      </div>

      <VirtualList
        items={visible}
        keyOf={(job) => job.id}
        estimateSize={104}
        renderItem={(job) => <JobCard job={job} certificationId={certificationId} />}
        empty={
          <EmptyState
            icon={<Briefcase size={18} />}
            title="No job posting matches these filters"
            description="Widen the region or period, or clear the requirement and source filters."
          />
        }
      />
    </div>
  );
}
