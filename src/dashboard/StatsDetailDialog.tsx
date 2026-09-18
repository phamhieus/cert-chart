import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Modal, ModalDescription, ModalTitle } from '../components/Modal';
import { SearchInput } from '../components/SearchInput';
import { VirtualList } from '../components/VirtualList';
import type { RankingRecords } from '../hooks/useRankings';
import type {
  CommunityPost,
  Course,
  Job,
  ModalTab,
  RankedCertification,
} from '../types';
import { formatDate, formatNumber, formatPrice, relativeDays } from '../utils/format';
import { locationLabel } from '../utils/regions';

export type StatsDetailKind = 'certifications' | 'jobs' | 'community' | 'courses';

interface StatsDetailDialogProps {
  kind: StatsDetailKind | null;
  onOpenChange: (open: boolean) => void;
  rows: RankedCertification[];
  records: RankingRecords;
  scopeLabel: string;
  onOpenCertification: (id: string, tab: ModalTab) => void;
}

const TITLES: Record<StatsDetailKind, string> = {
  certifications: 'Certifications in scope',
  jobs: 'Job postings',
  community: 'Community discussions',
  courses: 'Courses',
};

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-line px-5 py-2.5 last:border-0">{children}</div>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-faint">
      {children}
    </div>
  );
}

function Source({ name, url }: { name: string; url: string }) {
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="link text-2xs"
      onClick={(event) => event.stopPropagation()}
    >
      {name}
      <ExternalLink size={10} />
    </a>
  ) : (
    <span>{name}</span>
  );
}

/**
 * The evidence behind a headline number. Every tile on the dashboard is a count
 * of records that exist in `public/data`, and this is where a reader checks
 * them — which postings, which threads, which courses, each linking out to the
 * page it was crawled from.
 */
export function StatsDetailDialog({
  kind,
  onOpenChange,
  rows,
  records,
  scopeLabel,
  onOpenCertification,
}: StatsDetailDialogProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const certName = useMemo(
    () => new Map(rows.map((row) => [row.certification.id, row.certification.shortName])),
    [rows],
  );

  const filtered = useMemo(() => {
    const match = (haystack: string): boolean =>
      needle === '' || haystack.toLowerCase().includes(needle);

    return {
      certifications: rows.filter((row) =>
        match(`${row.certification.name} ${row.certification.vendor} ${row.certification.category}`),
      ),
      jobs: records.jobs.filter((job) => match(`${job.title} ${job.company}`)),
      community: records.community.filter((post) => match(`${post.title} ${post.source.name}`)),
      courses: records.courses.filter((course) => match(`${course.name} ${course.provider.name}`)),
    };
  }, [needle, rows, records]);

  // Tile counts are per certification: a posting naming two tracked exams counts
  // twice there, but is one row here. Both numbers are shown rather than one
  // being quietly reconciled away.
  const subtitle = useMemo(() => {
    if (kind === 'jobs') {
      const mentions = rows.reduce((sum, row) => sum + row.metrics.jobs, 0);
      return `${formatNumber(filtered.jobs.length)} postings carrying ${formatNumber(mentions)} certification mentions`;
    }
    if (kind === 'community') {
      const mentions = rows.reduce((sum, row) => sum + row.metrics.communityMentions, 0);
      return `${formatNumber(filtered.community.length)} discussions carrying ${formatNumber(mentions)} mentions`;
    }
    if (kind === 'courses') return `${formatNumber(filtered.courses.length)} courses`;
    return `${formatNumber(filtered.certifications.length)} certifications`;
  }, [kind, rows, filtered]);

  if (!kind) return null;

  return (
    <Modal open onOpenChange={onOpenChange} label={TITLES[kind]} size="lg">
      <header className="border-b border-line px-5 py-4 pr-12">
        <ModalTitle className="text-sm font-semibold text-ink">{TITLES[kind]}</ModalTitle>
        <ModalDescription className="mt-0.5 text-xs text-muted">
          {subtitle} · {scopeLabel}
        </ModalDescription>
        <div className="mt-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter this list…" />
        </div>
      </header>

      {kind === 'certifications' ? (
        <VirtualList<RankedCertification>
          items={filtered.certifications}
          keyOf={(row) => row.certification.id}
          estimateSize={68}
          className="flex-1"
          empty={<p className="px-5 py-8 text-center text-xs text-muted">No certification matches.</p>}
          renderItem={(row) => (
            <Row>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onOpenCertification(row.certification.id, 'overview')}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink">
                    #{row.rank} {row.certification.name}
                  </span>
                  <span className="num text-xs text-muted">{row.scores.overall.toFixed(1)}</span>
                </div>
                <Meta>
                  <span>{row.certification.vendor}</span>
                  <Badge>{row.certification.category}</Badge>
                  <span>{row.certification.level}</span>
                  <span className="num">{formatNumber(row.metrics.jobs)} postings</span>
                  <span className="num">
                    {formatNumber(row.metrics.communityMentions)} mentions
                  </span>
                </Meta>
              </button>
            </Row>
          )}
        />
      ) : null}

      {kind === 'jobs' ? (
        <VirtualList<Job>
          items={filtered.jobs}
          keyOf={(job) => job.id}
          estimateSize={76}
          className="flex-1"
          empty={<p className="px-5 py-8 text-center text-xs text-muted">No posting matches.</p>}
          renderItem={(job) => (
            <Row>
              <p className="text-[13px] font-medium text-ink">{job.title}</p>
              <Meta>
                <span>{job.company}</span>
                <span>{locationLabel(job.location)}</span>
                <span className="num">
                  {formatDate(job.postedAt)} ({relativeDays(job.postedAt)})
                </span>
                {job.certifications.map((ref) => (
                  <Badge key={ref.id}>
                    {certName.get(ref.id) ?? ref.id} · {ref.requirement}
                  </Badge>
                ))}
                <Source name={job.source.name} url={job.source.url} />
              </Meta>
            </Row>
          )}
        />
      ) : null}

      {kind === 'community' ? (
        <VirtualList<CommunityPost>
          items={filtered.community}
          keyOf={(post) => post.id}
          estimateSize={72}
          className="flex-1"
          empty={<p className="px-5 py-8 text-center text-xs text-muted">No discussion matches.</p>}
          renderItem={(post) => (
            <Row>
              <p className="text-[13px] font-medium text-ink">{post.title}</p>
              <Meta>
                <Badge>{certName.get(post.certificationId) ?? post.certificationId}</Badge>
                <span className="num">{formatNumber(post.mentions)} mentions</span>
                <span className="num">{formatNumber(post.comments)} comments</span>
                {post.views === null ? null : (
                  <span className="num">{formatNumber(post.views)} views</span>
                )}
                <span className="num">{formatDate(post.publishedAt)}</span>
                <Source name={post.source.name} url={post.source.url} />
              </Meta>
            </Row>
          )}
        />
      ) : null}

      {kind === 'courses' ? (
        <VirtualList<Course>
          items={filtered.courses}
          keyOf={(course) => course.id}
          estimateSize={72}
          className="flex-1"
          empty={<p className="px-5 py-8 text-center text-xs text-muted">No course matches.</p>}
          renderItem={(course) => (
            <Row>
              <p className="text-[13px] font-medium text-ink">{course.name}</p>
              <Meta>
                <Badge>{certName.get(course.certificationId) ?? course.certificationId}</Badge>
                <Badge>{course.type}</Badge>
                <span>{locationLabel(course.location)}</span>
                <span className="num">{formatPrice(course.price, course.currency ?? 'USD')}</span>
                <Source name={course.provider.name} url={course.courseUrl} />
              </Meta>
            </Row>
          )}
        />
      ) : null}
    </Modal>
  );
}
