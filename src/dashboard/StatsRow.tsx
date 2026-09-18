import { Award, Briefcase, GraduationCap, MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RankingTotals } from '../hooks/useRankings';
import { formatNumber } from '../utils/format';

import type { StatsDetailKind } from './StatsDetailDialog';

interface StatsRowProps {
  totals: RankingTotals;
  scopeLabel: string;
  onOpen: (kind: StatsDetailKind) => void;
}

function Tile({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Show the ${label.toLowerCase()} behind this number`}
      className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors
        hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
        focus-visible:ring-accent/40"
    >
      <span
        className="mt-0.5 rounded-md border border-line bg-bg p-1.5 text-faint
          transition-colors group-hover:border-accent/40 group-hover:text-accent"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
        <p className="num text-lg font-semibold leading-tight text-ink">{value}</p>
        <p className="text-2xs leading-tight text-muted">{hint}</p>
      </div>
    </button>
  );
}

export function StatsRow({ totals, scopeLabel, onOpen }: StatsRowProps) {
  return (
    <div className="card grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*]:border-b-0">
      <Tile
        icon={<Award size={14} />}
        label="Certifications"
        value={formatNumber(totals.certifications)}
        hint={scopeLabel}
        onClick={() => onOpen('certifications')}
      />
      <Tile
        icon={<Briefcase size={14} />}
        label="Job postings"
        value={formatNumber(totals.jobs)}
        hint="mentioning a tracked cert"
        onClick={() => onOpen('jobs')}
      />
      <Tile
        icon={<MessagesSquare size={14} />}
        label="Community mentions"
        value={formatNumber(totals.communityMentions)}
        hint="across tracked forums"
        onClick={() => onOpen('community')}
      />
      <Tile
        icon={<GraduationCap size={14} />}
        label="Courses"
        value={formatNumber(totals.courses)}
        hint="official, centers and online"
        onClick={() => onOpen('courses')}
      />
    </div>
  );
}
