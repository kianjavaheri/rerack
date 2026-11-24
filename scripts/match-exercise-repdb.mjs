// Matches the exercise library (src/data/exerciseCatalog.json) to RepDB's free exercise dataset, whose flat
// illustrations are shown while MEDIA is 'repdb' (data/catalog.ts). Free Tier License v1.0: commercial use inside
// apps with a visible "Exercise data by RepDB (repdb.co)" credit (Settings → About); no republishing it as a dataset.
//
// Usage: node scripts/match-exercise-repdb.mjs <RepDB exercises.json> [report.json]
//   exercises.json from github.com/RepDB/exercise-dataset (pinned in data/catalog.ts REPDB). Writes
//   src/data/repdb.json ({ map: { [catalogId]: repdbId }, items: [id, name, equipments, single?][] }, the items also
//   for matching names you typed yourself in the app) and src/data/repdbInfo.json (what each works and how to do it,
//   loaded when an exercise's pictures are opened).

import { readFileSync, writeFileSync } from 'node:fs';
import { bestRepdbMatch, equipmentFor } from '../src/core/gifMatch.ts';

const [, , input, reportPath] = process.argv;
if (!input) {
  console.error('Usage: node scripts/match-exercise-repdb.mjs <exercises.json>');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(new URL('../src/data/exerciseCatalog.json', import.meta.url), 'utf8'));
const repdb = JSON.parse(readFileSync(input, 'utf8')).exercises;

function equipmentOf(e) {
  const q = e.equipment;
  if (!q) return e.is_bodyweight ? ['body weight'] : [];
  if (q === 'smith_machine') return ['smith machine'];
  if (q === 'ez_bar') return ['ez barbell'];
  if (q === 'trap_bar') return ['barbell'];
  if (q === 'resistance_band' || q === 'loop_band') return ['band'];
  if (q === 'stability_ball') return ['stability ball'];
  if (q === 'medicine_ball') return ['medicine ball'];
  if (['barbell', 'dumbbell', 'cable', 'kettlebell'].includes(q)) return [q];
  if (['flat_bench', 'pull_up_bar', 'dip_station', 'rings', 'plyo_box'].includes(q)) return ['body weight'];
  if (/machine|leg_press|hack_squat|pec_deck|leg_curl|leg_extension|glute_ham|sled/.test(q)) return ['leverage machine', 'sled machine'];
  return [q.replace(/_/g, ' ')];
}

const OVERRIDES = {
  Barbell_Squat: 'squat',
  Standing_Military_Press: 'ohp',
  Pullups: 'pull-up',
  Pushups: 'push-up',
  'Dips_-_Triceps_Version': 'dips',
  'Wide-Grip_Lat_Pulldown': 'lat-pulldown',
  Seated_Cable_Rows: 'seated-cable-row',
  Lying_Leg_Curls: 'leg-curl',
  Leg_Extensions: 'leg-extension',
  Side_Lateral_Raise: 'lateral-raise',
  Cable_Crossover: 'cable-fly',
  'One-Arm_Dumbbell_Row': 'single-arm-db-row',
};

const items = repdb.map((e) => {
  const flat = e.images?.flat ?? {};
  return [e.id, e.name_en.trim(), equipmentOf(e), ...(flat.main ? [1] : [])];
});
const known = new Set(items.map((i) => i[0]));

const map = {};
const report = [];
for (const c of catalog) {
  const fixed = OVERRIDES[c.id];
  if (fixed && known.has(fixed)) {
    map[c.id] = fixed;
    report.push({ ours: c.name, theirs: fixed, score: 'override' });
    continue;
  }
  if (fixed) console.warn(`Override for ${c.id} not in RepDB: ${fixed} (matching by name)`);
  const { match, best, score } = bestRepdbMatch(c.name, equipmentFor(c.name, c.equipment, c.kind === 'bodyweight'), items);
  report.push({ ours: c.name, theirs: best?.[1], score: Math.round(score * 100) / 100, used: !!match });
  if (match) map[c.id] = match[0];
}

const words = (m) => m.replace(/_/g, ' ');
const info = Object.fromEntries(
  repdb.map((e) => [e.id, { p: (e.primary_muscles ?? []).map(words), s: (e.secondary_muscles ?? []).map(words), steps: e.instructions_en ?? [] }]),
);

writeFileSync(new URL('../src/data/repdb.json', import.meta.url), JSON.stringify({ map, items }) + '\n');
writeFileSync(new URL('../src/data/repdbInfo.json', import.meta.url), JSON.stringify(info) + '\n');
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`Matched ${Object.keys(map).length} of ${catalog.length}`);
