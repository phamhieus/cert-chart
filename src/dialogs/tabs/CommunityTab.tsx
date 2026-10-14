import { ExternalLink, MessagesSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/Badge';
import { TitleLink } from '../../components/TitleLink';
import { EmptyState } from '../../components/Feedback';
import { Select, type SelectOption } from '../../components/Select';
import { VirtualList } from '../../components/VirtualList';
import type { CommunityPost } from '../../types';
import { filterCommunity } from '../../utils/filters';
import { cn, formatCompact, formatDate, formatDateTime, formatNumber } from '../../utils/format';
import { locationLabel } from '../../utils/regions';

type SortKey = 'mentions' | 'comments' | 'views' | 'engagement' | 'newest';

const SORT_OPTIONS: Array<SelectOption<SortKey>> = [
  { value: 'mentions', label: 'Most mentions' },
  { value: 'comments', label: 'Most comments' },
  { value: 'views', label: 'Most views' },
  { value: 'engagement', label: 'Most engagement' },
  { value: 'newest', label: 'Newest' },
];

const SORT_VALUE: Record<SortKey, (post: CommunityPost) => number> = {
  mentions: (post) => post.mentions,
  comments: (post) => post.comments,
  views: (post) => post.views ?? -1,
  engagement: (post) => (post.reactions ?? 0) + post.comments + (post.views ?? 0) / 100,
  newest: (post) => new Date(post.publishedAt).getTime(),
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-2xs text-faint">
      <span className="num text-muted">{value}</span> {label}
    </span>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  return (
    <article className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={post.title}>
          <TitleLink href={post.source.url}>{post.title}</TitleLink>
        </h4>
        {post.unverified ? (
          <Badge tone="warn" title="Suggested by DeepSeek and not checked against the source">
            Unverified
          </Badge>
        ) : null}
        <Badge>{post.source.name}</Badge>
      </div>
      {post.excerpt ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted">{post.excerpt}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stat label="mentions" value={formatNumber(post.mentions)} />
        <Stat label="comments" value={formatNumber(post.comments)} />
        {post.views !== null ? <Stat label="views" value={formatCompact(post.views)} /> : null}
        {post.reactions !== null ? (
          <Stat label="reactions" value={formatCompact(post.reactions)} />
        ) : null}
        {post.uniqueAuthors !== null ? (
          <Stat label="authors" value={formatNumber(post.uniqueAuthors)} />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-faint">
        <span>{locationLabel(post.location)}</span>
        <span title={`Crawled ${formatDateTime(post.crawledAt)}`}>
          Published {formatDate(post.publishedAt)}
        </span>
        <a
          href={post.source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="link text-2xs"
        >
          Open discussion
          <ExternalLink size={10} />
        </a>
      </div>
    </article>
  );
}

interface CommunityTabProps {
  certificationId: string;
  /** Posts already narrowed by the modal's period filter. */
  posts: CommunityPost[];
  now: Date;
}

export function CommunityTab({ certificationId, posts, now }: CommunityTabProps) {
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState<SortKey>('mentions');

  // Posts per community for this certification, busiest first.
  const bySource = useMemo(() => {
    const certPosts = filterCommunity(posts, {
      certificationId,
      period: 'all',
      source: 'all',
      now,
    });
    const counts = new Map<string, number>();
    for (const post of certPosts) counts.set(post.source.name, (counts.get(post.source.name) ?? 0) + 1);
    return {
      total: certPosts.length,
      sources: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    };
  }, [posts, certificationId, now]);

  const sourceOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: `All sources (${formatNumber(bySource.total)})` },
      ...bySource.sources.map(([name, count]) => ({
        value: name,
        label: `${name} (${formatNumber(count)})`,
      })),
    ],
    [bySource],
  );

  const visible = useMemo(() => {
    const value = SORT_VALUE[sort];
    return filterCommunity(posts, { certificationId, period: 'all', source, now }).sort(
      (a, b) => value(b) - value(a),
    );
  }, [posts, certificationId, source, sort, now]);

  const totals = useMemo(
    () => ({
      mentions: visible.reduce((sum, post) => sum + post.mentions, 0),
      comments: visible.reduce((sum, post) => sum + post.comments, 0),
    }),
    [visible],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Select value={source} options={sourceOptions} onChange={setSource} ariaLabel="Community source" />
        <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Sort discussions" />
        <span className="text-2xs text-faint" title="Community records carry no author location, so the region filter does not apply to them">
          all markets
        </span>
        <span className="num ml-auto text-2xs text-faint">
          {formatNumber(visible.length)} threads · {formatCompact(totals.mentions)} mentions ·{' '}
          {formatCompact(totals.comments)} comments
        </span>
      </div>

      {bySource.sources.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {bySource.sources.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setSource(source === name ? 'all' : name)}
              aria-pressed={source === name}
              className={cn(
                'rounded border px-2 py-0.5 text-2xs transition-colors',
                source === name
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:text-ink',
              )}
            >
              {name} <span className="num text-faint">{formatNumber(count)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <VirtualList
        items={visible}
        keyOf={(post) => post.id}
        estimateSize={116}
        renderItem={(post) => <PostCard post={post} />}
        empty={
          <EmptyState
            icon={<MessagesSquare size={18} />}
            title="No discussion matches these filters"
            description="Try a different source or widen the period — community records are never narrowed by region."
          />
        }
      />
    </div>
  );
}
