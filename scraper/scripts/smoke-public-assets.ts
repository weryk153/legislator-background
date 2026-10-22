// One live public declaration: index -> PDF -> pdftotext -> asset parser.
// No credentials, database, imports, published data writes, or deployment.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCyRows } from '../adapters/cy';
import { getDeclarationText, parseDeclaration } from '../lib/gazette';

const sourceUrl = 'https://priso.cy.gov.tw/layout/baselist';
const name = '韓國瑜';
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(), sourceUrl, success: false,
};
const requests: object[] = [];
report.requests = requests;
const networkFetch = globalThis.fetch;
// Observe real network responses and bound each request; never substitute fixture data.
globalThis.fetch = async (url, init = {}) => {
  const res = await networkFetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const body = Buffer.from(await res.clone().arrayBuffer());
  requests.push({ url: String(url), method: init.method ?? 'GET', status: res.status,
    contentType: res.headers.get('content-type'), bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex') });
  return res;
};

try {
  const res = await fetch('https://priso.cy.gov.tw/api/Query/QueryData', {
    method: 'POST',
    headers: { 'content-type': 'text/json', accept: 'application/json', referer: sourceUrl,
      'user-agent': 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)' },
    body: JSON.stringify({ Data: { Method: '', Type: 'name', Value: name }, Page: { PageNo: 1, PageSize: 10 } }),
  });
  if (!res.ok) throw new Error(`Public index HTTP ${res.status}`);
  const rows = parseCyRows(await res.text(), sourceUrl, String(report.checkedAt).slice(0, 10));
  const selected = rows.find(({ row }) => row.Name === name && row.PublishType?.includes('一般申報'));
  if (!selected) throw new Error('No matching public declaration row');
  report.declaration = { name: selected.row.Name, period: selected.row.Period,
    publishedDate: selected.row.PublishDate, publishType: selected.row.PublishType,
    pages: selected.row.PublishPage, year: selected.asset.year };
  const text = await getDeclarationText(selected.row.Id);
  const items = parseDeclaration(text, name);
  if (!text.includes(name)) throw new Error('Downloaded PDF does not contain target name');
  if (!items.length || items.some(item => !Number.isFinite(item.amount) || item.amount <= 0)) {
    throw new Error('No valid positive asset items parsed');
  }
  report.result = { textCharacters: text.length, namePresent: true,
    itemCount: items.length, categories: items.map(item => item.category) };
  report.success = true;
} catch (error) {
  report.error = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  process.exitCode = 1;
} finally {
  globalThis.fetch = networkFetch;
  const json = JSON.stringify(report, null, 2) + '\n';
  console.log(json);
  if (process.env.SMOKE_REPORT_PATH) writeFileSync(process.env.SMOKE_REPORT_PATH, json);
}
