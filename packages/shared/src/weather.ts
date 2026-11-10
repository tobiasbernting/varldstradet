// Weather. One sky for the lobby that drifts from one kind of weather to the next
// in a random pattern (more snow in winter, hardly any in summer).
import type { WeatherKind, WorldState } from './types.ts';
import type { Change } from './protocol.ts';
import { T, WEATHER_NEWS } from './sv.ts';
import type { SimCtx } from './sim.ts';
import { isSagaKey } from './saga.ts';

export const WEATHER_KINDS: WeatherKind[] = ['sun', 'cloudy', 'rain', 'storm', 'snow', 'hail', 'wind', 'fog'];

/** How long each kind lasts, in real minutes [min, max]. A game day is 10 minutes. */
const DURATION_MIN: Record<WeatherKind, [number, number]> = {
  sun: [3, 7],
  cloudy: [2, 4],
  rain: [2, 4],
  storm: [1, 2],
  snow: [2, 5],
  hail: [0.5, 1.5],
  wind: [1.5, 3],
  fog: [1.5, 3],
};

/** How likely snow is this month (0 = January): lots in winter, a rare surprise in summer. */
const SNOW_BY_MONTH = [4, 4, 2, 1, 0.3, 0.05, 0.05, 0.05, 0.3, 1, 2, 4];

/** What can follow each kind of weather (weights). `S` is replaced by the month's snow weight. */
const NEXT: Record<WeatherKind, Partial<Record<WeatherKind, number | 'S'>>> = {
  sun: { sun: 2, cloudy: 4, wind: 2, fog: 1 },
  cloudy: { sun: 3, rain: 3, snow: 'S', wind: 1, fog: 1, hail: 0.5 },
  rain: { cloudy: 3, rain: 1, storm: 1, sun: 1.5, hail: 0.5 },
  storm: { rain: 3, hail: 1, cloudy: 1 },
  snow: { snow: 1, cloudy: 3, sun: 1, wind: 0.5 },
  hail: { rain: 2, cloudy: 2 },
  wind: { sun: 2, cloudy: 2, rain: 1, snow: 'S' },
  fog: { sun: 2, cloudy: 2 },
};

export function weatherDuration(kind: WeatherKind, rnd: () => number): number {
  const [lo, hi] = DURATION_MIN[kind];
  return Math.round((lo + rnd() * (hi - lo)) * 60_000);
}

export function nextWeather(kind: WeatherKind, month: number, rnd: () => number): WeatherKind {
  const snow = SNOW_BY_MONTH[((month % 12) + 12) % 12] ?? 1;
  const options = Object.entries(NEXT[kind]).map(([k, w]) => [k as WeatherKind, w === 'S' ? snow : w] as const);
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = rnd() * total;
  for (const [k, w] of options) {
    r -= w;
    if (r < 0) return k;
  }
  return options[options.length - 1]![0];
}

/** Maps where the sky can't be seen: caves, the dungeons, and the moon (which has no weather). */
export const noWeatherHere = (area: string | undefined): boolean => isSagaKey(area);

export const isWet = (kind: WeatherKind): boolean => kind === 'rain' || kind === 'storm';

/** Sets the weather now (the parent page, tests) and tells everyone outside. */
export function setWeather(world: WorldState, kind: WeatherKind, ctx: SimCtx, forced = false): Change[] {
  const prev = world.weather?.kind;
  world.weather = { kind, since: ctx.now, until: ctx.now + weatherDuration(kind, ctx.rnd), ...(prev ? { prev } : {}), ...(forced ? { forced } : {}) };
  const out: Change[] = [];
  const news = prev && prev !== kind ? (isWet(prev) && kind === 'sun' ? T.weatherRainbow : WEATHER_NEWS[kind]) : undefined;
  if (news) {
    for (const p of Object.values(world.players)) if (p.online && !noWeatherHere(p.area)) out.push({ t: 'toast', to: p.id, text: news });
  }
  return out;
}

/** Rolls the weather on when its time is up. */
export function tickWeather(world: WorldState, ctx: SimCtx, out: Change[]): void {
  if (!world.weather) {
    world.weather = { kind: 'sun', since: ctx.now, until: ctx.now + weatherDuration('sun', ctx.rnd) };
    return;
  }
  if (ctx.now >= world.weather.until) out.push(...setWeather(world, nextWeather(world.weather.kind, new Date(ctx.now).getMonth(), ctx.rnd), ctx));
}
