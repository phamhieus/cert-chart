import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, TrendValue } from '../components/Badge';
import { EmptyState, ScoreBar } from '../components/Feedback';
import type { ModalTab, RankedCertification } from '../types';
import { cn, formatCompact, formatNumber, formatScore } from '../utils/format';

export type SortKey = 'rank' | 'jobs' | 'community' | 'courses' | 'holders' | 'growth' | 'score';

interface RankingTableProps {
  rows: RankedCertification[];
  onOpen: (certificationId: string, tab: ModalTab) => void;
}

const VALUE_OF: Record<SortKey, (row: RankedCertification) => number> = {
  rank: (row) => -row.scores.overall,
  jobs: (row) => row.metrics.jobs,
  community: (row) => row.metrics.communityMentions,
  courses: (row) => row.metrics.courses,
  holders: (row) => row.metrics.estimatedHolders ?? -1,
  growth: (row) => row.metrics.growth12m ?? Number.NEGATIVE_INFINITY,
  score: (row) => row.scores.overall,
};

interface ColumnDef {
  key: SortKey;
  label: string;
  className?: string;
}

const NUMERIC_COLUMNS: ColumnDef[] = [
  { key: 'jobs', label: 'Job demand' },
  { key: 'community', label: 'Community' },
  { key: 'courses', label: 'Courses' },
  { key: 'holders', label: 'Holders' },
  { key: 'growth', label: '12M growth' },
  { key: 'score', label: 'Score' },
];

const TAB_FOR_COLUMN: Partial<Record<SortKey, ModalTab>> = {
  jobs: 'jobs',
  community: 'community',
  courses: 'courses',
};

export function RankingTable({ rows, onOpen }: RankingTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'score', desc: true });

  const sorted = useMemo(() => {
    const value = VALUE_OF[sort.key];
    return [...rows].sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));
  }, [rows, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'rank' },
    );
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No certification matches these filters"
        description="Try a wider region, a longer period, or clear the search box."
      />
    );
  }

  return (
    <>
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
              <th className="w-12 px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Certification</th>
              <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Vendor</th>
              <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Category</th>
              {NUMERIC_COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors hover:text-ink',
                      sort.key === column.key && 'text-ink',
                    )}
                  >
                    {column.label}
                    {sort.key === column.key ? (
                      sort.desc ? (
                        <ArrowDown size={11} />
                      ) : (
                        <ArrowUp size={11} />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.certification.id}
                onClick={() => onOpen(row.certification.id, 'overview')}
                className="group cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-elevated"
              >
                <td className="px-3 py-2.5">
                  <span className="num text-xs text-faint">{row.rank}</span>
                </td>
                <td className="max-w-[22rem] px-3 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-ink group-hover:text-accent">
                      {row.certification.shortName}
                    </span>
                    {row.certification.code ? (
                      <span className="num text-2xs text-faint">{row.certification.code}</span>
                    ) : null}
                  </div>
                  <p className="truncate text-2xs text-muted">{row.certification.name}</p>
                </td>
                <td className="hidden px-3 py-2.5 text-muted lg:table-cell">
                  {row.certification.vendor}
                </td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  <Badge>{row.certification.category}</Badge>
                </td>

                {NUMERIC_COLUMNS.map((column) => {
                  const tab = TAB_FOR_COLUMN[column.key];
                  const content =
                    column.key === 'jobs'
                      ? formatNumber(row.metrics.jobs)
                      : column.key === 'community'
                        ? formatCompact(row.metrics.communityMentions)
                        : column.key === 'courses'
                          ? formatNumber(row.metrics.courses)
                          : column.key === 'holders'
                            ? formatCompact(row.metrics.estimatedHolders)
                            : null;

                  if (column.key === 'growth') {
                    return (
                      <td key={column.key} className="px-3 py-2.5 text-right">
                        <TrendValue direction={row.direction} value={row.metrics.growth12m} />
                      </td>
                    );
                  }

                  if (column.key === 'score') {
                    return (
                      <td key={column.key} className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ScoreBar value={row.scores.overall} className="hidden xl:inline-flex" />
                          <span className="num font-semibold text-ink">
                            {formatScore(row.scores.overall)}
                          </span>
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={column.key} className="px-3 py-2.5 text-right">
                      {tab ? (
                        <button
                          type="button"
                          className="metric-button"
                          title={`Open ${column.label.toLowerCase()} evidence`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(row.certification.id, tab);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <span
                          className="num text-muted"
                          title={
                            row.metrics.estimatedHolders === null
                              ? 'No source publishes a holder count for this market'
                              : undefined
                          }
                        >
                          {content}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {sorted.map((row) => (
          <li key={row.certification.id}>
            <button
              type="button"
              onClick={() => onOpen(row.certification.id, 'overview')}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-elevated"
            >
              <span className="num mt-0.5 w-5 text-xs text-faint">{row.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {row.certification.shortName}
                  </span>
                  <span className="num text-[13px] font-semibold">
                    {formatScore(row.scores.overall)}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                  <span>{formatNumber(row.metrics.jobs)} jobs</span>
                  <span>{formatCompact(row.metrics.communityMentions)} mentions</span>
                  <TrendValue
                    direction={row.direction}
                    value={row.metrics.growth12m}
                    className="text-2xs"
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
