// Build councilor (縣市議員 + 直轄市議員) target entries from the 中選會 static
// election data (2022 / 民國111 local elections) and merge them into targets.json.
//
// Method (confirmed): db.cec.gov.tw serves static JSON. We discover themes from the
// list files, enumerate cities from the C-level area file, then pull each city's
// "tickets" file and keep winners (is_victor in '*' / '!').
//
// Run: node scraper/scripts/build-councilors.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const targetsPath = join(here, '..', 'targets.json');
const BASE = 'https://db.cec.gov.tw/static/elections';
const UA = { headers: { 'user-agent': 'legislator-background-bot/1.0 (public-data)' } };

const partyMap = { '中國國民黨': '國民黨', '民主進步黨': '民進黨', '台灣民眾黨': '民眾黨', '臺灣民眾黨': '民眾黨' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function slugify(name, party, area) {
  // councilor names collide across the island; qualify with party+area for uniqueness.
  const base = `c-${name}-${party}-${area}`.toLowerCase().replace(/\s+/g, '');
  return base;
}

async function main() {
  const out = [];
  const seenSlug = new Map();

  for (const subjectId of ['T1', 'T2']) { // T1 直轄市議員, T2 縣市議員
    const list = await getJson(`${BASE}/list/ELC_${subjectId}.json`);
    const themes = (list[0]?.theme_items ?? list.theme_items ?? []).filter((t) => Number(t.session) === 111);
    for (const theme of themes) {
      const legis = theme.legislator_type_id;
      const themeId = theme.theme_id;
      // C-level area file → list of cities/counties for this theme
      const cities = await getJson(`${BASE}/data/areas/ELC/${subjectId}/${legis}/${themeId}/C/00_000_00_000_0000.json`);
      const cityList = Array.isArray(cities) ? cities : (cities.areas ?? Object.values(cities)[0] ?? []);
      for (const city of cityList) {
        const prv = city.prv_code, cc = city.city_code;
        const cityName = (city.area_name ?? '').trim();
        const code = `${prv}_${cc}_00_000_0000`;
        let ticketObj;
        try {
          ticketObj = await getJson(`${BASE}/data/tickets/ELC/${subjectId}/${legis}/${themeId}/A/${code}.json`);
        } catch (e) {
          console.warn(`skip ${cityName} (${code}): ${e.message}`);
          continue;
        }
        // the tickets file is keyed; the candidate array is the (single) value
        const rows = Array.isArray(ticketObj) ? ticketObj : (Object.values(ticketObj).find(Array.isArray) ?? []);
        for (const c of rows) {
          if (c.is_victor !== '*' && c.is_victor !== '!') continue;
          const name = (c.cand_name ?? '').trim();
          if (!name) continue;
          const party = partyMap[c.party_name] || (c.party_name || '無黨籍').trim();
          const district = `${cityName}${(c.area_name ?? '').trim()}`;
          let slug = slugify(name, party, district);
          const n = (seenSlug.get(slug) || 0) + 1; seenSlug.set(slug, n);
          if (n > 1) slug = `${slug}-${n}`;
          const birthYear = String(c.cand_birthyear ?? '').trim();
          out.push({ id: slug, name, party, district, office: 'councilor', birthYear, profession: '', keywords: [], aliases: [] });
        }
        await sleep(150);
      }
    }
  }

  const existing = JSON.parse(readFileSync(targetsPath, 'utf8'));
  // Replace all councilor entries (re-runnable): keep non-councilors, then add the
  // freshly-built councilor roster (now carrying birthYear).
  const nonCouncilor = existing.filter((t) => t.office !== 'councilor');
  const merged = nonCouncilor.concat(out);
  writeFileSync(targetsPath, JSON.stringify(merged, null, 2) + '\n');

  const byOffice = merged.reduce((m, t) => ((m[t.office] = (m[t.office] || 0) + 1), m), {});
  console.log(`councilor winners found: ${out.length} (replaced existing councilor entries)`);
  console.log(`targets total: ${merged.length}`, JSON.stringify(byOffice));
  console.log('uniq ids:', new Set(merged.map((t) => t.id)).size);
}

main().catch((e) => { console.error(e); process.exit(1); });
