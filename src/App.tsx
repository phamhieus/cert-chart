import { useCallback, useEffect, useMemo, useState } from 'react';
import { RankBarChart } from './charts/RankBarChart';
import { TrendChart, type TrendMetric, type TrendRange } from './charts/TrendChart';
import { SERIES_PALETTE } from './charts/theme';
import { BootstrapScreen } from './dashboard/BootstrapScreen';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DataSourcesDialog } from './dashboard/DataSourcesDialog';
import { RankingTable } from './dashboard/RankingTable';
import { StatsDetailDialog, type StatsDetailKind } from './dashboard/StatsDetailDialog';
import { StatsRow } from './dashboard/StatsRow';
import { CertificationDialog } from './dialogs/CertificationDialog';
import { FilterBar } from './filters/FilterBar';
import { useAppData } from './hooks/useAppData';
import { useDebounce } from './hooks/useDebounce';
import { useRankings } from './hooks/useRankings';
import { useTheme } from './hooks/useTheme';
import type { DashboardFilters, ModalTab } from './types';
import { PERIOD_LABELS } from './constants/ranking';
import { regionLabel } from './utils/regions';

const INITIAL_FILTERS: DashboardFilters = {
  region: 'vietnam',
  category: 'all',
  period: 'all',
  search: '',
};

export default function App() {
  const { theme, toggle } = useTheme();
  const { phase, dataset, progress, crawlUnavailable, error, refresh } = useAppData();

  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 180);
  const [openCert, setOpenCert] = useState<{ id: string; tab: ModalTab } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [statsDetail, setStatsDetail] = useState<StatsDetailKind | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('jobs');
  const [trendMonths, setTrendMonths] = useState<TrendRange>(12);
  const [trendIds, setTrendIds] = useState<string[]>([]);

  const effectiveFilters = useMemo<DashboardFilters>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const { rows, totals, records, recomputed } = useRankings(dataset, effectiveFilters);

  // Compare the current top certifications until the reader picks their own set.
  useEffect(() => {
    setTrendIds((current) => {
      if (current.length > 0) return current;
      return rows.slice(0, 4).map((row) => row.certification.id);
    });
  }, [rows]);

  const patchFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const openCertification = useCallback((id: string, tab: ModalTab) => {
    setOpenCert({ id, tab });
  }, []);

  const toggleTrend = useCallback((id: string) => {
    setTrendIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(-8),
    );
  }, []);

  const activeRow = useMemo(
    () => rows.find((row) => row.certification.id === openCert?.id) ?? null,
    [rows, openCert],
  );

  const crawling = phase === 'crawling' || progress?.state === 'running';
  const hasData = Boolean(dataset && (dataset.jobs.length > 0 || dataset.community.length > 0));

  if (!hasData) {
    return (
      <BootstrapScreen
        phase={phase}
        progress={progress}
        crawlUnavailable={crawlUnavailable}
        error={error}
        onRetry={refresh}
      />
    );
  }

  const scopeLabel = `${regionLabel(effectiveFilters.region)} · ${PERIOD_LABELS[effectiveFilters.period]}`;

  return (
    <div className="min-h-[100dvh]">
      <DashboardHeader
        lastCrawledAt={dataset?.sources.map((s) => s.lastCrawledAt).sort().at(-1) ?? null}
        theme={theme}
        onToggleTheme={toggle}
        onOpenSources={() => setSourcesOpen(true)}
        onRefresh={refresh}
        canRefresh={!crawlUnavailable}
        crawling={crawling}
        filters={<FilterBar filters={filters} onChange={patchFilters} />}
      />

      <main className="mx-auto flex max-w-[110rem] flex-col gap-4 px-4 py-4 sm:px-6">
        {error && hasData ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {error}
          </p>
        ) : null}

        <StatsRow totals={totals} scopeLabel={scopeLabel} onOpen={setStatsDetail} />

        <section className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-baseline gap-2">
              <h2 className="card-title">Certification ranking</h2>
              <span className="text-2xs text-faint">{scopeLabel}</span>
            </div>
            <span className="text-2xs text-faint">
              {recomputed ? 'scored from filtered records' : 'pre-aggregated scores'}
            </span>
          </div>
          <RankingTable rows={rows} onOpen={openCertification} />
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Top certifications by job demand</h2>
              <span className="text-2xs text-faint">postings · click to inspect</span>
            </div>
            <div className="px-2 py-3">
              <RankBarChart
                rows={rows}
                metric={(row) => row.metrics.jobs}
                valueName="job postings"
                theme={theme}
                onSelect={(id) => openCertification(id, 'jobs')}
              />
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Top certifications by community interest</h2>
              <span className="text-2xs text-faint">mentions · click to inspect</span>
            </div>
            <div className="px-2 py-3">
              <RankBarChart
                rows={rows}
                metric={(row) => row.metrics.communityMentions}
                valueName="mentions"
                theme={theme}
                color={SERIES_PALETTE[1]}
                onSelect={(id) => openCertification(id, 'community')}
              />
            </div>
          </section>
        </div>

        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Trend comparison</h2>
            <span className="text-2xs text-faint">monthly, {trendMonths}-month window</span>
          </div>
          <div className="p-4">
            <TrendChart
              rows={rows}
              selectedIds={trendIds}
              onToggle={toggleTrend}
              metric={trendMetric}
              onMetricChange={setTrendMetric}
              months={trendMonths}
              onMonthsChange={setTrendMonths}
              theme={theme}
            />
          </div>
        </section>

        <footer className="pb-6 text-2xs leading-relaxed text-faint">
          Scores combine job demand, community activity, holder counts where published, and growth.
          Every figure links back to the postings, threads and course pages it came from — open a
          certification to inspect them.
        </footer>
      </main>

      <StatsDetailDialog
        kind={statsDetail}
        onOpenChange={(open) => !open && setStatsDetail(null)}
        rows={rows}
        records={records}
        scopeLabel={scopeLabel}
        onOpenCertification={(id, tab) => {
          setStatsDetail(null);
          openCertification(id, tab);
        }}
      />

      {dataset ? (
        <DataSourcesDialog
          open={sourcesOpen}
          onOpenChange={setSourcesOpen}
          sources={dataset.sources}
          progress={progress}
          crawling={crawling}
          onRefresh={refresh}
          canRefresh={!crawlUnavailable}
        />
      ) : null}

      {dataset && activeRow && openCert ? (
        <CertificationDialog
          key={activeRow.certification.id}
          dataset={dataset}
          row={activeRow}
          tab={openCert.tab}
          onTabChange={(tab) => setOpenCert((current) => (current ? { ...current, tab } : current))}
          onClose={() => setOpenCert(null)}
          initialRegion={effectiveFilters.region}
          initialPeriod={effectiveFilters.period}
          theme={theme}
        />
      ) : null}
    </div>
  );
}
