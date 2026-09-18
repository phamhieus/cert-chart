import { ExternalLink, RefreshCw } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal, ModalDescription, ModalTitle } from '../components/Modal';
import { Spinner } from '../components/Feedback';
import type { CrawlProgress, DataSource, DataSourceType } from '../types';
import { ElapsedSince } from '../components/Elapsed';
import {
  formatClockTime,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
} from '../utils/format';

const TYPE_LABELS: Record<DataSourceType, string> = {
  'job-board': 'Job board',
  community: 'Community',
  'course-provider': 'Courses',
  'certification-body': 'Holder counts',
};

interface DataSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: DataSource[];
  progress: CrawlProgress | null;
  crawling: boolean;
  onRefresh: () => void;
  canRefresh: boolean;
}

export function DataSourcesDialog({
  open,
  onOpenChange,
  sources,
  progress,
  crawling,
  onRefresh,
  canRefresh,
}: DataSourcesDialogProps) {
  const failed = progress?.outcomes.filter((outcome) => outcome.status === 'failed') ?? [];
  const lastCrawledAt =
    sources
      .map((source) => source.lastCrawledAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const totalRecords = sources.reduce((sum, source) => sum + source.records, 0);
  const runMs =
    progress?.startedAt && progress.finishedAt
      ? new Date(progress.finishedAt).getTime() - new Date(progress.startedAt).getTime()
      : null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} label="Data sources" size="md">
      <header className="border-b border-line px-5 py-4 pr-12">
        <ModalTitle className="text-sm font-semibold text-ink">Data sources</ModalTitle>
        <ModalDescription className="mt-0.5 text-xs text-muted">
          Every number on the dashboard comes from these sources. Records are what is stored in
          <span className="num"> public/data</span> right now.
        </ModalDescription>
        <p className="mt-1.5 text-2xs text-faint">
          {lastCrawledAt ? (
            <>
              Last crawl finished{' '}
              <span className="num text-muted">{formatDateTime(lastCrawledAt)}</span> ·{' '}
              <ElapsedSince value={lastCrawledAt} className="num text-muted" />
            </>
          ) : (
            'No crawl recorded yet.'
          )}{' '}
          · <span className="num text-muted">{formatNumber(totalRecords)}</span> records across{' '}
          <span className="num text-muted">{formatNumber(sources.length)}</span> sources
          {runMs === null ? null : (
            <>
              {' '}
              · this session&rsquo;s run took{' '}
              <span className="num text-muted">{formatDuration(runMs)}</span>
            </>
          )}
        </p>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted">
            No source has been crawled yet.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-5 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Records</th>
                <th className="px-5 py-2 text-right font-medium">Last crawl</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="link font-medium"
                      >
                        {source.name}
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="font-medium text-ink">{source.name}</span>
                    )}
                    {source.notes ? (
                      <p className="mt-0.5 text-2xs text-muted">{source.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge>{TYPE_LABELS[source.type]}</Badge>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-muted">
                    {formatNumber(source.records)}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right text-muted"
                    title={`Finished at ${source.lastCrawledAt}`}
                  >
                    <span className="num block leading-tight">
                      {formatDate(source.lastCrawledAt)}
                    </span>
                    <span className="num block text-2xs leading-tight text-faint">
                      {formatClockTime(source.lastCrawledAt) === '—'
                        ? 'no clock time recorded'
                        : `${formatClockTime(source.lastCrawledAt)} local`}
                    </span>
                    {source.lastCrawlDurationMs === undefined ? null : (
                      <span className="num block text-2xs leading-tight text-faint">
                        took {formatDuration(source.lastCrawlDurationMs)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {failed.length > 0 ? (
          <div className="border-t border-line px-5 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-faint">
              Last run errors
            </p>
            <ul className="mt-1.5 space-y-1">
              {failed.map((outcome) => (
                <li key={outcome.id} className="text-xs text-muted">
                  <span className="font-medium text-ink">{outcome.name}</span> — {outcome.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="text-2xs text-muted">
          {canRefresh
            ? 'A refresh re-crawls every enabled source and rebuilds the ranking.'
            : 'Run `npm run crawl` to refresh this dataset.'}
        </p>
        <button
          type="button"
          className="control"
          onClick={onRefresh}
          disabled={!canRefresh || crawling}
        >
          {crawling ? <Spinner size={13} /> : <RefreshCw size={13} />}
          {crawling ? 'Crawling…' : 'Refresh data'}
        </button>
      </footer>
    </Modal>
  );
}
