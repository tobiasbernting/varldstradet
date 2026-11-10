// The client's mirror of the world: the player records the other maps carry.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerState, WorldState } from '@lilla-garden/shared';
import { applyChange, client, worldFor } from './state.ts';

const player = (id: string, area: string): PlayerState => ({ id, name: id, area, x: 0, y: 0, facing: 'down', moving: false, online: true, inventory: [], selected: 0 }) as unknown as PlayerState;
const world = (area: string, players: Record<string, PlayerState>): WorldState =>
  ({ area, players, objects: {}, drops: {}, animals: {}, terrain: new Array(64 * 64).fill(0), occupancy: {}, timeMs: 0, day: 1 }) as unknown as WorldState;

describe('player records on other maps', () => {
  beforeEach(() => {
    client.me = 'me';
    client.areas = {};
  });

  it('someone who arrives on the map I am on lands in that map\'s player list, by the farm\'s record', () => {
    const me = player('me', 'house:city');
    const other = player('other', 'farm');
    client.world = world('farm', { me, other });
    // I travel to the city: the server sends me the city with its players (only me so far)
    applyChange({ t: 'areaData', to: 'me', key: 'house:city', world: world('house:city', { me: { ...me } }) });
    applyChange({ t: 'player', id: 'me', player: me });
    expect(worldFor('house:city')!.players['other']).toBeUndefined();
    // the other player follows: everyone gets their record, only they get the map
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'house:city' } });
    const city = worldFor('house:city')!;
    expect(city.players['other']).toBe(client.world.players['other']);
    expect(city.players['other']!.area).toBe('house:city');
    // and leaves again: gone from the city's list, still on the farm's
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'farm' } });
    expect(city.players['other']).toBeUndefined();
    expect(client.world.players['other']!.area).toBe('farm');
  });

  it('a removed player leaves every list', () => {
    const me = player('me', 'saga:draug');
    const other = player('other', 'farm');
    client.world = world('farm', { me, other });
    applyChange({ t: 'areaData', to: 'me', key: 'saga:draug', world: world('saga:draug', { me: { ...me } }) });
    applyChange({ t: 'player', id: 'other', player: { ...other, area: 'saga:draug' } });
    expect(worldFor('saga:draug')!.players['other']).toBe(client.world.players['other']);
    applyChange({ t: 'player', id: 'other', player: null });
    expect(worldFor('saga:draug')!.players['other']).toBeUndefined();
    expect(client.world.players['other']).toBeUndefined();
  });
});
