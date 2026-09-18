import type { Certification } from '../../src/types';
import { DATA_FILES, readRecords } from '../store';
import { aggregate } from './index';

const { rankings, referenceDate } = aggregate();
const byId = new Map(readRecords<Certification>(DATA_FILES.certifications).map((c) => [c.id, c]));

console.log(
  `Aggregated ${rankings.length} certifications (reference date ${referenceDate.toISOString().slice(0, 10)})`,
);

if (rankings.length === 0) {
  console.log('No records yet — run `npm run crawl` first.');
} else {
  console.log('\n  #  certification           jobs   comm.   growth    score');
  rankings.slice(0, 10).forEach((ranking, index) => {
    const cert = byId.get(ranking.certificationId);
    console.log(
      [
        String(index + 1).padStart(3),
        (cert?.shortName ?? ranking.certificationId).padEnd(22),
        String(ranking.metrics.jobs).padStart(5),
        String(ranking.metrics.communityMentions).padStart(7),
        (ranking.metrics.growth12m === null
          ? '—'
          : `${ranking.metrics.growth12m > 0 ? '+' : ''}${ranking.metrics.growth12m.toFixed(1)}%`
        ).padStart(8),
        ranking.scores.overall.toFixed(1).padStart(8),
      ].join(' '),
    );
  });
}
