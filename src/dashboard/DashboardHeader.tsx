import { Database, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Theme } from '../hooks/useTheme';
import { ElapsedSince } from '../components/Elapsed';
import { Logo } from '../components/Logo';
import { formatDateTime } from '../utils/format';

interface DashboardHeaderProps {
  lastCrawledAt: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSources: () => void;
  filters: ReactNode;
}

export function DashboardHeader({
  lastCrawledAt,
  theme,
  onToggleTheme,
  onOpenSources,
  filters,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo size={30} className="shrink-0" />
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-ink">
                IT Cert Trend
              </h1>
              <p className="text-2xs text-muted">
                Vietnam · Singapore · Japan · Global — demand, community and growth
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="hidden text-right text-2xs leading-tight text-faint sm:block"
              title={lastCrawledAt ? `Last crawl finished at ${lastCrawledAt}` : undefined}
            >
              {lastCrawledAt ? (
                <>
                  <span className="block text-muted">Last crawl</span>
                  <span className="num block">{formatDateTime(lastCrawledAt)}</span>
                  <ElapsedSince value={lastCrawledAt} className="num block" />
                </>
              ) : (
                'No crawl recorded'
              )}
            </span>
            <button type="button" className="control" onClick={onOpenSources}>
              <Database size={13} />
              <span className="hidden sm:inline">Data sources</span>
            </button>
            <button
              type="button"
              className="control px-2"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>

        {filters}
      </div>
    </header>
  );
}
