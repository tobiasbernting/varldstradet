// Writes packages/godot/assets/sv.json from packages/shared/src/sv.ts, so every Swedish string the native client
// shows comes from the same file as the browser's. Run `pnpm godot:strings` (Node 22.18+ runs the TypeScript as it
// is) and commit the result; the Godot workflow fails if the json is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_NAMES } from '../../shared/src/biomes.ts';
import { OBJECT_NAMES, SEASON_NAMES, SPECIES_NAMES, T, WEATHER_EMOJI, WEATHER_NAMES } from '../../shared/src/sv.ts';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/sv.json');
const data = {
  _comment: 'Generated from packages/shared/src/sv.ts by `pnpm godot:strings`. Do not edit; edit sv.ts and run the script.',
  T,
  SEASON_NAMES,
  WEATHER_NAMES,
  WEATHER_EMOJI,
  BIOME_NAMES,
  OBJECT_NAMES,
  SPECIES_NAMES,
};
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), out)}: ${Object.keys(T).length} strings`);
