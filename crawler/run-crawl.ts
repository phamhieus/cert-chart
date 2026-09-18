/**
 * CLI entry point: `npm run crawl [-- source-id ...]`
 * Crawls the enabled sources, merges the results into public/data and rebuilds rankings.
 */
import { ALL_CRAWLERS, runCrawl } from './pipeline';

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const known = new Set(ALL_CRAWLERS.map((crawler) => crawler.id));
const unknown = requested.filter((id) => !known.has(id));

if (unknown.length > 0) {
  console.error(`Unknown crawler id(s): ${unknown.join(', ')}`);
  console.error(`Available: ${[...known].join(', ')}`);
  process.exit(1);
}

console.log('Starting crawl\n');

const progress = await runCrawl({ only: requested.length > 0 ? requested : undefined });

console.log('\nSummary');
for (const outcome of progress.outcomes) {
  const status = outcome.status === 'ok' ? 'ok     ' : outcome.status === 'skipped' ? 'skipped' : 'FAILED ';
  console.log(`  ${status} ${outcome.name.padEnd(24)} ${String(outcome.records).padStart(5)} records`);
  if (outcome.error) console.log(`          ${outcome.error}`);
}

if (progress.state === 'failed') {
  console.error(`\n${progress.error}`);
  process.exit(1);
}
