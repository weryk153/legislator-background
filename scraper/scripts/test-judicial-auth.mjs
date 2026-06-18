// Test connectivity + auth to the 司法院 open-data judgment API.
// Reads JUDICIAL_API_USER / JUDICIAL_API_PASSWORD from .env (project root).
// NOTE: the API only serves 00:00–06:00 (Asia/Taipei). Outside that window it
// refuses, so run this during those hours.
//
// Run: node scraper/scripts/test-judicial-auth.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(here, '..', '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on real env */ }
}

async function main() {
  loadEnv();
  const user = process.env.JUDICIAL_API_USER;
  const password = process.env.JUDICIAL_API_PASSWORD;
  if (!user || !password) {
    console.error('Missing JUDICIAL_API_USER / JUDICIAL_API_PASSWORD in .env');
    process.exit(1);
  }

  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }));
  if (hour >= 6) console.warn(`⚠ Taipei hour is ${hour}; API only serves 00:00–06:00 — auth may be refused.`);

  console.log('POST https://data.judicial.gov.tw/jdg/api/Auth ...');
  let res;
  try {
    res = await fetch('https://data.judicial.gov.tw/jdg/api/Auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'legislator-background-bot/1.0' },
      body: JSON.stringify({ user, password }),
    });
  } catch (e) {
    console.error('NETWORK ERROR (host unreachable?):', String(e));
    process.exit(2);
  }
  const text = await res.text();
  console.log('HTTP', res.status);
  console.log('body:', text.slice(0, 400));

  try {
    const json = JSON.parse(text);
    if (json.Token) {
      console.log('✅ AUTH OK — token length', json.Token.length);
      // Optional: immediately try JList to confirm the change-feed responds.
      const jl = await fetch('https://data.judicial.gov.tw/jdg/api/JList', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: json.Token }),
      });
      const jlText = await jl.text();
      console.log('JList HTTP', jl.status, '— sample:', jlText.slice(0, 200));
    } else {
      console.log('❌ no token:', json.error ?? text.slice(0, 200));
    }
  } catch {
    console.log('(non-JSON response)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
