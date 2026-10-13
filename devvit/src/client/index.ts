import type { CertStatRow, StatsResponse } from '../shared/api';

type SortKey = 'total' | 'last7' | 'last30' | 'trendPct' | 'name';

function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`missing #${id} in the dashboard markup`);
  }
  return node;
}

function inputElement(id: string): HTMLInputElement {
  const node = element(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error(`#${id} is not an input`);
  }
  return node;
}

function selectElement(id: string): HTMLSelectElement {
  const node = element(id);
  if (!(node instanceof HTMLSelectElement)) {
    throw new Error(`#${id} is not a select`);
  }
  return node;
}

const board = element('board');
const statusBox = element('status');
const subtitle = element('subtitle');
const totalMentions = element('total-mentions');
const footer = element('footer');
const search = inputElement('search');
const sortSelect = selectElement('sort');

let stats: StatsResponse | undefined;

const COLUMNS: { key: 'total' | 'posts' | 'comments' | 'last7' | 'last30'; label: string; short: string }[] = [
  { key: 'total', label: 'Total', short: 'Total' },
  { key: 'posts', label: 'Posts', short: 'Posts' },
  { key: 'comments', label: 'Comments', short: 'Comments' },
  { key: 'last7', label: '7d', short: 'Last 7 days' },
  { key: 'last30', label: '30d', short: 'Last 30 days' },
];

function setStatus(message: string | undefined): void {
  statusBox.hidden = message === undefined;
  statusBox.textContent = message ?? '';
}

function formatTrend(row: CertStatRow): { text: string; className: string } {
  if (row.trendPct === null) {
    return row.last7 > 0
      ? { text: 'new', className: 'trend trend--up' }
      : { text: '—', className: 'trend' };
  }
  if (row.trendPct > 0) {
    return { text: `+${row.trendPct}%`, className: 'trend trend--up' };
  }
  if (row.trendPct < 0) {
    return { text: `${row.trendPct}%`, className: 'trend trend--down' };
  }
  return { text: '0%', className: 'trend' };
}

function toSortKey(value: string): SortKey {
  switch (value) {
    case 'last7':
      return 'last7';
    case 'last30':
      return 'last30';
    case 'trendPct':
      return 'trendPct';
    case 'name':
      return 'name';
    default:
      return 'total';
  }
}

function sortRows(rows: CertStatRow[], key: SortKey): CertStatRow[] {
  return [...rows].sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (key === 'trendPct') {
      // Rows without a baseline sort below anything with a real trend.
      const left = a.trendPct ?? (a.last7 > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
      const right = b.trendPct ?? (b.last7 > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
      return right - left || b.total - a.total;
    }
    return b[key] - a[key] || a.name.localeCompare(b.name);
  });
}

function buildHeader(): HTMLElement {
  const head = document.createElement('div');
  head.className = 'row row--head';
  head.appendChild(document.createElement('div'));
  for (const column of COLUMNS) {
    const cell = document.createElement('div');
    cell.className = 'num';
    cell.textContent = column.label;
    head.appendChild(cell);
  }
  const trend = document.createElement('div');
  trend.className = 'num';
  trend.textContent = 'Trend';
  head.appendChild(trend);
  return head;
}

function buildRow(row: CertStatRow, maxTotal: number): HTMLElement {
  const element = document.createElement('div');
  element.className = 'row';

  const cert = document.createElement('div');
  cert.className = 'cert';

  const name = document.createElement('div');
  name.className = 'cert__name';
  name.textContent = row.name;

  const meta = document.createElement('div');
  meta.className = 'cert__meta';
  meta.textContent = `${row.shortName} · ${row.vendor}`;

  const bar = document.createElement('div');
  bar.className = 'cert__bar';
  const fill = document.createElement('span');
  fill.style.width = `${maxTotal > 0 ? Math.round((row.total / maxTotal) * 100) : 0}%`;
  bar.appendChild(fill);

  cert.append(name, meta, bar);
  element.appendChild(cert);

  for (const column of COLUMNS) {
    const cell = document.createElement('div');
    cell.className = column.key === 'total' ? 'num num--strong' : 'num';
    cell.dataset['label'] = column.short;
    const value = document.createElement('span');
    value.textContent = String(row[column.key]);
    cell.appendChild(value);
    element.appendChild(cell);
  }

  const trend = formatTrend(row);
  const trendCell = document.createElement('div');
  trendCell.className = trend.className;
  trendCell.dataset['label'] = 'Trend (7d vs prev 7d)';
  const trendValue = document.createElement('span');
  trendValue.textContent = trend.text;
  trendCell.appendChild(trendValue);
  element.appendChild(trendCell);

  return element;
}

function render(): void {
  if (!stats) {
    return;
  }

  const term = search.value.trim().toLowerCase();
  const filtered = stats.rows.filter(
    (row) =>
      term.length === 0 ||
      row.name.toLowerCase().includes(term) ||
      row.shortName.toLowerCase().includes(term) ||
      row.vendor.toLowerCase().includes(term)
  );
  const sorted = sortRows(filtered, toSortKey(sortSelect.value));
  const maxTotal = sorted.reduce((max, row) => Math.max(max, row.total), 0);

  board.replaceChildren();
  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No certification matches that filter.';
    board.appendChild(empty);
    return;
  }

  board.appendChild(buildHeader());
  for (const row of sorted) {
    board.appendChild(buildRow(row, maxTotal));
  }
}

function renderMeta(): void {
  if (!stats) {
    return;
  }
  subtitle.textContent = `r/${stats.subreddit} · ${stats.rows.length} certifications tracked`;
  totalMentions.textContent = stats.totalMentions.toLocaleString();

  const generated = new Date(stats.generatedAt).toLocaleString();
  const backfill = stats.scan.backfillComplete
    ? 'history scan complete'
    : 'history scan still running';
  footer.textContent = `Updated ${generated} · ${backfill} · a mention is one post or comment that names the certification at least once.`;
}

async function load(): Promise<void> {
  setStatus('Loading certification stats…');
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) {
      throw new Error(`stats request failed with ${response.status}`);
    }
    stats = await response.json();
    setStatus(undefined);
    renderMeta();
    render();
  } catch (error) {
    console.error(error);
    setStatus('Could not load certification stats. Try reopening the post.');
  }
}

search.addEventListener('input', render);
sortSelect.addEventListener('change', render);

void load();
