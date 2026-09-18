import { ExternalLink } from 'lucide-react';
import { Badge, TrendValue } from '../../components/Badge';
import { ScoreBar } from '../../components/Feedback';
import { EChart, type EChartsOption } from '../../charts/EChart';
import { chartTheme, tooltipStyle } from '../../charts/theme';
import { RANKING_WEIGHTS } from '../../constants/ranking';
import type { Theme } from '../../hooks/useTheme';
import type {
  CommunityPost,
  Course,
  HolderReport,
  Job,
  RankedCertification,
} from '../../types';
import {
  formatCompact,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatPercent,
  formatScore,
} from '../../utils/format';
import { useMemo } from 'react';

interface OverviewTabProps {
  row: RankedCertification;
  jobs: Job[];
  posts: CommunityPost[];
  courses: Course[];
  /** The published figure for this exam, when a vendor states one. */
  holders: HolderReport | null;
  /** The vendor's programme-wide figure, shown only as context. */
  vendorHolders: HolderReport | null;
  theme: Theme;
}

function Figure({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: string;
  hint?: string;
  bar?: number | null;
}) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="num mt-0.5 text-base font-semibold text-ink">{value}</p>
      {typeof bar === 'number' ? <ScoreBar value={bar} className="mt-1.5 w-16" /> : null}
      {hint ? <p className="mt-0.5 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <dt className="text-2xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * What the vendor publishes about how many people hold this credential.
 *
 * Almost no vendor publishes a per-exam number, so most certifications show
 * their vendor's programme-wide figure instead — clearly labelled as such,
 * because "1.05 million AWS Certified individuals" counts everyone holding any
 * AWS exam, not the holders of this one. The exact published sentence is the
 * tooltip so the number can be checked against its source.
 */
function HolderFigure({
  holders,
  vendorHolders,
}: {
  holders: HolderReport | null;
  vendorHolders: HolderReport | null;
}) {
  const report = holders ?? vendorHolders;
  if (!report) return <span className="text-muted">Not published by the vendor</span>;

  const noun = report.counts === 'people' ? 'people' : 'certifications issued';
  return (
    <a
      href={report.source.url}
      target="_blank"
      rel="noreferrer noopener"
      className="link"
      title={report.statement}
    >
      <span className="num font-medium text-ink">{formatCompact(report.holders)}</span> {noun}
      <span className="ml-1 text-2xs text-faint">
        {report.scope === 'certification'
          ? `(${report.vendor}, this certification)`
          : `(${report.vendor} programme-wide, not this exam)`}
      </span>
    </a>
  );
}

export function OverviewTab({ row, jobs, posts, courses,
  holders,
  vendorHolders, theme }: OverviewTabProps) {
  const { certification: cert, metrics, scores } = row;

  const option = useMemo<EChartsOption>(() => {
    const palette = chartTheme(theme);
    return {
      grid: { left: 4, right: 8, top: 16, bottom: 0, containLabel: true },
      tooltip: { trigger: 'axis', ...tooltipStyle(palette) },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: row.trend.map((point) => formatMonth(point.month)),
        axisLine: { lineStyle: { color: palette.line } },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: palette.line } },
          axisLabel: { color: palette.muted, fontSize: 10 },
        },
      ],
      series: [
        {
          name: 'Job postings',
          type: 'line',
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 4,
          areaStyle: { opacity: 0.12 },
          lineStyle: { width: 2 },
          itemStyle: { color: palette.accent },
          data: row.trend.map((point) => point.jobs),
        },
        {
          name: 'Community mentions',
          type: 'line',
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2, type: 'dashed' },
          itemStyle: { color: '#2FBF71' },
          data: row.trend.map((point) => point.community),
        },
      ],
    };
  }, [row.trend, theme]);

  const jobSources = [...new Set(jobs.map((job) => job.source.name))];
  const communitySources = [...new Set(posts.map((post) => post.source.name))];
  const lastCrawl = [...jobs.map((j) => j.crawledAt), ...posts.map((p) => p.crawledAt)]
    .sort()
    .at(-1);

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
        <Figure
          label="Overall score"
          value={formatScore(scores.overall)}
          bar={scores.overall}
          hint={`${Math.round(RANKING_WEIGHTS.jobs * 100)}% jobs · ${Math.round(RANKING_WEIGHTS.community * 100)}% community`}
        />
        <Figure label="Job demand" value={String(scores.jobDemand)} bar={scores.jobDemand} hint={`${formatNumber(metrics.jobs)} postings`} />
        <Figure
          label="Community"
          value={String(scores.community)}
          bar={scores.community}
          hint={`${formatCompact(metrics.communityMentions)} mentions`}
        />
        <Figure
          label="12-month growth"
          value={metrics.growth12m === null ? '—' : formatPercent(metrics.growth12m)}
          hint={
            metrics.growth12m === null
              ? 'not enough crawled history yet'
              : 'last 6 months vs the 6 before'
          }
          bar={scores.growth}
        />
      </div>

      <div className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Demand and interest over 12 months</h3>
            <TrendValue direction={row.direction} value={metrics.growth12m} className="text-xs" />
          </div>
          <div className="px-2 pb-2 pt-1">
            <EChart option={option} height={240} />
          </div>
        </section>

        <div className="space-y-5">
          <section className="card px-4 py-2">
            <dl>
              <Detail label="Name">{cert.name}</Detail>
              <Detail label="Short name">{cert.shortName}</Detail>
              <Detail label="Vendor">{cert.vendor}</Detail>
              <Detail label="Exam code">
                <span className="num">{cert.code ?? '—'}</span>
              </Detail>
              <Detail label="Category">
                <Badge>{cert.category}</Badge>
              </Detail>
              <Detail label="Level">{cert.level}</Detail>
              <Detail label="Estimated holders">
                {metrics.estimatedHolders === null ? (
                  <span className="text-muted" title="No source publishes a holder count for this market">
                    Not published
                  </span>
                ) : (
                  <span className="num">{formatNumber(metrics.estimatedHolders)}</span>
                )}
              </Detail>
              <Detail label="Training courses">
                <span className="num">{formatNumber(courses.length)}</span>
              </Detail>
              <Detail label="Official page">
                <a href={cert.officialUrl} target="_blank" rel="noreferrer noopener" className="link">
                  Certification page
                  <ExternalLink size={11} />
                </a>
              </Detail>
            </dl>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="card-title">Source coverage</h3>
            </div>
            <dl className="px-4 py-2">
              <Detail label="Job postings">
                <span className="num">{formatNumber(jobs.length)}</span> from{' '}
                {jobSources.length || 0} source{jobSources.length === 1 ? '' : 's'}
              </Detail>
              <Detail label="Requirement mix">
                <span className="num">
                  {metrics.requiredJobs}/{metrics.preferredJobs}/{metrics.mentionedJobs}
                </span>
                <span className="ml-1 text-2xs text-faint">req/pref/ment</span>
              </Detail>
              <Detail label="Discussions">
                <span className="num">{formatNumber(posts.length)}</span> from{' '}
                {communitySources.length || 0} source{communitySources.length === 1 ? '' : 's'}
              </Detail>
              <Detail label="Unique authors">
                <span className="num">
                  {metrics.communityAuthors > 0 ? formatNumber(metrics.communityAuthors) : '—'}
                </span>
              </Detail>
              <Detail label="Certified population">
                <HolderFigure holders={holders} vendorHolders={vendorHolders} />
              </Detail>
              <Detail label="Last crawl">
                <span className="num" title={lastCrawl ? `Crawled at ${lastCrawl}` : undefined}>
                  {formatDateTime(lastCrawl)}
                </span>
              </Detail>
            </dl>
            {jobSources.length > 0 || communitySources.length > 0 ? (
              <div className="flex flex-wrap gap-1 border-t border-line px-4 py-2.5">
                {[...jobSources, ...communitySources].map((name) => (
                  <Badge key={name}>{name}</Badge>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
