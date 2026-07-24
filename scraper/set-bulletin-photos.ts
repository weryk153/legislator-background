// One-off: set photo_url for the 15 departed councilors whose photos could not be
// found via Wayback (see scraper/fixtures/council-photo-notes.md 已知限制) but were
// recovered from 111年地方公職人員選舉 選舉公報 PDFs (source list:
// scraper/fixtures/photo-attributions.md). Images already processed to 320px-wide
// jpg and copied to public/photos/councilors/<slug>.jpg by hand (photos-record.ts's
// downloader only supports http(s) — Node's fetch() rejects file:// URLs — so this
// mirrors what that script would do for the DB-update half of the pipeline).
// Idempotent: re-running just re-sets the same photo_url values.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';

loadEnv();

const IDS: [string, string][] = [
  ['13d60b47-f3c7-4b1d-95a2-ebfa4cbae560', 'c-吳亮慶-民進黨-屏東縣第02選舉區'],
  ['09cadc3e-9d81-4208-a7ab-710b095cb064', 'c-王景山-國民黨-屏東縣第02選舉區'],
  ['06d4e9f7-ff77-49d9-a342-44ffa7b59626', 'c-張振亮-民進黨-屏東縣第02選舉區'],
  ['a2be5ac5-67c2-4852-b991-2e0e501563f4', 'c-潘連周-無黨籍及未經政黨推薦-屏東縣第03選舉區'],
  ['862f19c5-8b27-4076-b611-330218a3570f', 'c-郭再添-無黨籍及未經政黨推薦-屏東縣第04選舉區'],
  ['ab302b26-683a-49fa-8005-9bf1e330633a', 'c-王啟敏-國民黨-屏東縣第05選舉區'],
  ['f606a9a3-7109-4db8-8a0f-de3c284140d3', 'c-莊淑如-國民黨-宜蘭縣第01選舉區'],
  ['5724e1ca-6573-455d-ac00-13b9c2cbf158', 'c-李茂豐-國民黨-宜蘭縣第10選舉區'],
  ['da21bfbf-9ba3-48dd-9a7b-5372b270d5ae', 'c-楊育菡-無黨籍及未經政黨推薦-金門縣第02選舉區'],
  ['24561f0c-64a8-46d6-b8ea-f43f46389381', 'c-黃碧妹-無黨籍及未經政黨推薦-臺東縣第16選舉區'],
  ['b6f22481-b91b-4059-b504-5633eeb0bf51', 'c-嚴惠美simoy．sapod-無黨籍及未經政黨推薦-臺東縣第11選舉區'],
  ['726e77eb-1192-4af5-93d7-5e1c723c4449', 'c-張正治-國民黨-花蓮縣第03選舉區'],
  ['69fbd013-9288-4a23-a1b7-faf2ddda586b', 'c-施嘉華-國民黨-彰化縣第03選舉區'],
  ['456309df-0e35-4e57-b08a-60e51d80e93f', 'c-蕭慧敏-無黨籍及未經政黨推薦-雲林縣第06選舉區'],
  ['c1092cff-a3ed-47e6-8296-d32939b122a9', 'c-陳德木-國民黨-新竹縣第02選舉區'],
];

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const [id, slug] of IDS) {
    const photoUrl = `/photos/councilors/${slug}.jpg`;
    const { error, data } = await sb.from('officials').update({ photo_url: photoUrl }).eq('id', id).select('name');
    if (error) throw new Error(`${slug}: ${error.message}`);
    console.log('updated', data?.[0]?.name, '->', photoUrl);
  }
  console.log('done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
