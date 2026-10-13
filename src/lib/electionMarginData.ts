// Build-only: omit topology, incumbents and council seats from the interactive payload.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapArea, MapLayer } from './mapTypes';
import type { MarginArea, MarginDataset } from './electionMargin';

export function loadMarginData(): MarginDataset {
  const dir = join(process.cwd(), 'public/data/map');
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const national = read('national.json') as MapLayer;
  const pick = ({ code, name, chiefOffice, race }: MapArea): MarginArea => ({ code, name, chiefOffice, race });
  return {
    year: read('meta.json').electionYear,
    counties: national.areas.map(county => ({
      ...pick(county),
      towns: county.childFile ? (read(county.childFile) as MapLayer).areas.map(pick) : [],
    })),
  };
}
