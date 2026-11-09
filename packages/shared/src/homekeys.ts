// A player's own house is a small map of its own, keyed `house:<player id>` (see house.ts).
// These helpers have no imports so that bath.ts (isIndoorKey) and the clients can use them freely.

export const homeKey = (ownerId: string): string => `house:${ownerId}`;
export const isHomeKey = (k: string | undefined): boolean => !!k && k.startsWith('house:');
export const ownerOfHome = (k: string): string => k.slice('house:'.length);

/** The house map's size and the room in it (tiles). Everything outside the room is dark. */
export const HOUSE_W = 22;
export const HOUSE_H = 17;
/** The room including its walls: x, y of the top-left wall, w and h in tiles. */
export const HOUSE_ROOM = { x: 2, y: 3, w: 18, h: 11 };
/** The door in the bottom wall; standing on it takes you out. */
export const HOUSE_EXIT = { x: HOUSE_ROOM.x + HOUSE_ROOM.w / 2 - 1, y: HOUSE_ROOM.y + HOUSE_ROOM.h - 1 };
