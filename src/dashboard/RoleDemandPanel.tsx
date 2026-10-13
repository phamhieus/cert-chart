import { ClipboardList, Settings2, TestTube2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RoleDemand, RoleId } from '../types';
import { formatNumber } from '../utils/format';

interface RoleDemandPanelProps {
  roles: RoleDemand[];
}

const ROLE_ORDER: Array<{ id: RoleId; label: string; icon: ReactNode }> = [
  { id: 'qa', label: 'QA / QC / Tester', icon: <TestTube2 size={14} /> },
  { id: 'ba', label: 'Business Analyst', icon: <ClipboardList size={14} /> },
  { id: 'devops', label: 'DevOps / SRE', icon: <Settings2 size={14} /> },
];

interface RoleTotals {
  postings: number;
  withCertification: number;
  scanned: number;
}

/**
 * `scanned` is stored per (source, market, month) bucket and repeated on each
 * role row of that bucket, so summing it across roles would count the same
 * postings three times. The denominator is therefore taken from one role's
 * rows only.
 */
function totalsFor(roles: RoleDemand[], roleId: RoleId): RoleTotals {
  return roles
    .filter((row) => row.roleId === roleId)
    .reduce<RoleTotals>(
      (acc, row) => ({
        postings: acc.postings + row.postings,
        withCertification: acc.withCertification + row.withCertification,
        scanned: acc.scanned + row.scanned,
      }),
      { postings: 0, withCertification: 0, scanned: 0 },
    );
}

function share(part: number, whole: number): string {
  if (whole === 0) return '—';
  const pct = (part / whole) * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

export function RoleDemandPanel({ roles }: RoleDemandPanelProps) {
  if (roles.length === 0) return null;

  const markets = [...new Set(roles.map((row) => row.market))].sort();

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-baseline gap-2">
          <h2 className="card-title">Role demand</h2>
          <span className="text-2xs text-faint">
            postings by role — counted whether or not they name a certification
          </span>
        </div>
        <span className="text-2xs text-faint">{markets.join(' · ')}</span>
      </div>

      <div className="grid grid-cols-1 divide-line sm:grid-cols-3 sm:divide-x [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-line sm:[&>*]:border-b-0">
        {ROLE_ORDER.map(({ id, label, icon }) => {
          const totals = totalsFor(roles, id);
          return (
            <div key={id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 rounded-md border border-line bg-bg p-1.5 text-faint">
                {icon}
              </span>
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
                <p className="num text-lg font-semibold leading-tight text-ink">
                  {formatNumber(totals.postings)}
                </p>
                <p className="text-2xs leading-tight text-muted">
                  {share(totals.postings, totals.scanned)} of {formatNumber(totals.scanned)} postings
                  scanned
                </p>
                <p className="text-2xs leading-tight text-faint">
                  {totals.postings === 0
                    ? 'none found'
                    : `${formatNumber(totals.withCertification)} named a certification (${share(
                        totals.withCertification,
                        totals.postings,
                      )})`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="border-t border-line px-4 py-2 text-2xs leading-relaxed text-faint">
        Counted from job boards whose full listing is enumerated (ITviec, Vieclam24h, TokyoDev,
        Greenhouse and the remote boards). Boards that are searched per certification are excluded:
        their postings are already filtered by certification, so a role share taken from them would
        describe the query rather than the market. Market-level only — city filters do not narrow
        these figures.
      </p>
    </section>
  );
}
