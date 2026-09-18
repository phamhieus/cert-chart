import { AlertTriangle, CheckCircle2, CircleSlash, Database, Terminal } from 'lucide-react';
import { Spinner } from '../components/Feedback';
import type { AppPhase } from '../hooks/useAppData';
import type { CrawlProgress } from '../types';
import { cn } from '../utils/format';

interface BootstrapScreenProps {
  phase: AppPhase;
  progress: CrawlProgress | null;
  crawlUnavailable: boolean;
  error: string | null;
  onRetry: () => void;
}

function CommandBlock({ command }: { command: string }) {
  return (
    <code className="block rounded-md border border-line bg-bg px-3 py-2 text-left text-xs text-ink">
      {command}
    </code>
  );
}

function OutcomeList({ progress }: { progress: CrawlProgress }) {
  if (progress.outcomes.length === 0) return null;

  return (
    <ul className="mt-4 space-y-1.5 text-left">
      {progress.outcomes.map((outcome) => (
        <li key={outcome.id} className="flex items-center gap-2 text-xs">
          {outcome.status === 'ok' ? (
            <CheckCircle2 size={13} className="shrink-0 text-up" />
          ) : outcome.status === 'skipped' ? (
            <CircleSlash size={13} className="shrink-0 text-faint" />
          ) : (
            <AlertTriangle size={13} className="shrink-0 text-down" />
          )}
          <span className="font-medium text-ink">{outcome.name}</span>
          <span className="text-muted">
            {outcome.status === 'ok'
              ? `${outcome.records} records`
              : outcome.status === 'skipped'
                ? 'disabled'
                : (outcome.error ?? 'failed')}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BootstrapScreen({
  phase,
  progress,
  crawlUnavailable,
  error,
  onRetry,
}: BootstrapScreenProps) {
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : phase === 'crawling'
        ? 5
        : 0;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2 text-faint">
          <Database size={15} />
          <span className="text-2xs font-semibold uppercase tracking-[0.18em]">
            IT Certification Market
          </span>
        </div>

        {phase === 'loading' ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner />
            Loading dataset…
          </div>
        ) : null}

        {phase === 'crawling' && progress ? (
          <div>
            <h1 className="text-lg font-semibold text-ink">Collecting data</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              No records were stored yet, so the app is crawling the sources enabled in
              <span className="num"> crawler/config.ts</span>. This runs once — later visits read the
              stored JSON directly.
            </p>

            <div className="mt-5 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.max(4, percent)}%` }}
              />
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <Spinner size={13} />
              {progress.currentSource ?? 'Starting…'}
              <span className="num text-faint">
                {progress.completed}/{progress.total}
              </span>
            </p>

            <OutcomeList progress={progress} />

            {progress.messages.length > 0 ? (
              <p className="mt-4 truncate text-2xs text-faint">
                {progress.messages[progress.messages.length - 1]}
              </p>
            ) : null}
          </div>
        ) : null}

        {phase === 'empty' ? (
          <div>
            <h1 className="text-lg font-semibold text-ink">No data yet</h1>
            {crawlUnavailable ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  This build is served as static files, so it cannot crawl by itself. Collect the
                  data once and reload:
                </p>
                <div className="mt-4 space-y-2">
                  <CommandBlock command="npm run crawl" />
                  <CommandBlock command="npm run aggregate" />
                </div>
                <p className="mt-3 text-2xs text-faint">
                  Running <span className="num">npm run dev</span> or{' '}
                  <span className="num">npm run serve</span> instead lets the dashboard trigger the
                  crawl itself.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  The crawl finished without storing any record that mentions a tracked
                  certification. Enable more sources in{' '}
                  <span className="num">crawler/config.ts</span> — or check that this machine can
                  reach them — and try again.
                </p>
                {progress ? <OutcomeList progress={progress} /> : null}
              </>
            )}
            {!crawlUnavailable ? (
              <button type="button" className="control mt-5" onClick={onRetry}>
                Run crawl again
              </button>
            ) : null}
          </div>
        ) : null}

        {phase === 'error' ? (
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <AlertTriangle size={16} className="text-down" />
              Could not load the dashboard
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">{error}</p>
            {progress ? <OutcomeList progress={progress} /> : null}
            <div className="mt-5 flex items-center gap-2">
              <button type="button" className="control" onClick={onRetry}>
                Try again
              </button>
              <span className={cn('flex items-center gap-1.5 text-2xs text-faint')}>
                <Terminal size={12} />
                or run <span className="num">npm run crawl</span> in a terminal
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
