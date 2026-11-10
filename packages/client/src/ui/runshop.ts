// The Köpman's window and the Händelse window of a run (GAME2.md 3.4 and 2.5), next to ui/run.ts so that file stays what it was.
// Every ware is a card with a picture, a name, one sentence and a price in silver coins; a price is never only a colour (a card you cannot
// afford says so in words); a Händelse is a story and two or three big choices, everyone votes, nobody is punished for a choice.
import { EVENT_CHOICES, EVENT_TEXT, RUN_T, RUN_UI, canSharpen, eventDef, fmt, type RunSnap } from '@lilla-garden/shared';
import { h } from './dom.ts';
import { runaCard, type PickHost } from './runpick.ts';

export interface ShopActions {
  buy(item: 'runa' | 'party' | 'potion' | 'spirit' | 'sharpen', slot?: number, id?: string): void;
}

/** Which shelf was open (kept while the window redraws after a purchase). */
let shopTab: 'runor' | 'wares' = 'runor';
const coin = (n: number): string => `🪙 ${n}`;

/** A ware's price line: the coins, and in words when the purse cannot pay (never only a colour). */
function priceTag(price: number, purse: number, bought: boolean): HTMLElement {
  const poor = !bought && price > purse;
  return h('span', { class: `price${poor ? ' poor' : ''}${bought ? ' sold' : ''}`, 'aria-label': bought ? RUN_UI.bought : fmt(RUN_UI.silver, { n: price }) }, bought ? `✔ ${RUN_UI.bought}` : `${coin(price)}${poor ? ` · ${RUN_UI.tooPoor}` : ''}`);
}

/** The Köpman's camp: the purse, my runor, the whole party's runa, potions, a Sagoande and skärpa. Anyone may buy; the purse is shared and the window says so. */
export function renderShopWindow(host: PickHost, body: HTMLElement, run: RunSnap, me: string, act: ShopActions): void {
  const shop = run.shop;
  body.append(h('p', { class: 'intro' }, RUN_UI.shopIntro));
  body.append(h('div', { class: 'purse-line', role: 'status' }, h('b', null, `${coin(run.purse)}`), ` ${RUN_UI.purse}`));
  if (!shop) {
    body.append(h('p', { class: 'intro' }, RUN_T.shopNone));
    return;
  }
  const ware = (icon: string, name: string, text: string, price: number, bought: boolean, onBuy: () => void, extra?: string): HTMLElement => {
    const poor = !bought && price > run.purse;
    const el = h(
      'button',
      { class: `ware${bought ? ' sold' : ''}${poor ? ' poor' : ''}`, 'aria-label': `${name}. ${text}. ${bought ? RUN_UI.bought : fmt(RUN_UI.silver, { n: price })}${poor ? `. ${RUN_UI.tooPoor}` : ''}` },
      h('span', { class: 'ic' }, icon),
      h('span', { class: 'nm' }, name),
      h('span', { class: 'tx' }, text),
      extra ? h('span', { class: 'tx' }, extra) : null,
      priceTag(price, run.purse, bought),
    );
    host.tap(el, onBuy);
    host.info(el, icon, name, `${text} ${fmt(RUN_UI.silver, { n: price })}.`);
    return el;
  };
  // two tabs so the whole shelf is one tap away on a tablet: the runor (mine and the party's) and the wares (potions, a Sagoande, skärpa)
  const tabs = h('div', { class: 'shop-tabs', role: 'group' });
  const runorPane = h('div', { class: 'shop-pane' });
  const waresPane = h('div', { class: 'shop-pane' });
  const tabRunor = h('button', { class: 'alt pg', type: 'button' }, `🎴 ${RUN_UI.shopTabRunor}`);
  const tabWares = h('button', { class: 'alt pg', type: 'button' }, `🪙 ${RUN_UI.shopTabWares}`);
  const show = (t: 'runor' | 'wares'): void => {
    shopTab = t;
    runorPane.hidden = t !== 'runor';
    waresPane.hidden = t !== 'wares';
    tabRunor.classList.toggle('on', t === 'runor');
    tabWares.classList.toggle('on', t === 'wares');
    tabRunor.setAttribute('aria-pressed', String(t === 'runor'));
    tabWares.setAttribute('aria-pressed', String(t === 'wares'));
  };
  host.tap(tabRunor, () => show('runor'));
  host.tap(tabWares, () => show('wares'));
  host.info(tabRunor, '🎴', RUN_UI.shopTabRunor, RUN_UI.shopTabRunorText);
  host.info(tabWares, '🪙', RUN_UI.shopTabWares, RUN_UI.shopTabWaresText);
  tabs.append(tabRunor, tabWares);
  body.append(tabs, runorPane, waresPane);
  // my runor, and the whole party's, in one row
  const mine = shop.slots[me] ?? [];
  const cards = h('div', { class: 'runa-cards shop-cards' });
  mine.forEach((s, i) => {
    const wrap = h('div', { class: 'shop-slot' });
    const card = runaCard(host, 'button', { id: s.id, key: i + 1, path: run.paths[me], chosen: s.bought }, () => act.buy('runa', i));
    if (s.bought) card.setAttribute('aria-disabled', 'true');
    wrap.append(card, priceTag(s.price, run.purse, s.bought));
    cards.append(wrap);
  });
  const party = shop.party;
  if (party) {
    const wrap = h('div', { class: 'shop-slot' });
    wrap.append(runaCard(host, 'button', { id: party.id, party: true }, () => act.buy('party')), priceTag(party.price, run.purse, party.bought));
    cards.append(wrap);
  }
  runorPane.append(h('div', { class: 'sect' }, `🎴 ${RUN_UI.yourRunor} · 👪 ${RUN_UI.forParty}`), cards);
  const items = h('div', { class: 'wares' });
  items.append(ware('🧪', RUN_UI.itemPotion, RUN_UI.itemPotionText, 25, shop.potions <= 0, () => act.buy('potion'), shop.potions > 0 ? `× ${shop.potions}` : RUN_UI.leftSale));
  if (shop.spirit !== null) items.append(ware('🌟', RUN_UI.itemSpirit, RUN_UI.itemSpiritText, 150, shop.spirit === false, () => act.buy('spirit')));
  waresPane.append(h('div', { class: 'sect' }, `🪙 ${RUN_UI.shopOpen}`), items);
  // skärpa: one of my runor a step better
  const mineHeld = (run.hold[me] ?? []).filter((x) => canSharpen(x));
  if (mineHeld.length) {
    waresPane.append(h('div', { class: 'sect' }, `⚒️ ${RUN_UI.itemSharpen}`));
    const row = h('div', { class: 'runa-cards shop-cards' });
    for (const x of mineHeld) {
      const wrap = h('div', { class: 'shop-slot' });
      wrap.append(runaCard(host, 'button', { id: x.id, up: x.up, held: true }, () => act.buy('sharpen', undefined, x.id)), priceTag(50, run.purse, false));
      row.append(wrap);
    }
    waresPane.append(row);
  }
  show(shopTab);
}

/** The Händelse: a picture, the story and the choices; everyone votes, the most votes wins and the clock picks the free choice. Returns the clock. */
export function renderEventWindow(host: PickHost, body: HTMLElement, run: RunSnap, me: string, vote: (i: number) => void): { fill: HTMLElement; text: HTMLElement } | null {
  const ev = run.event;
  const def = ev ? eventDef(ev.id) : undefined;
  if (!ev || !def) return null;
  const names = new Map(run.party.map((p) => [p.id, p.name]));
  body.append(h('div', { class: 'event-pic', 'aria-hidden': 'true' }, def.icon), h('p', { class: 'intro' }, EVENT_TEXT[ev.id] ?? ''), h('div', { class: 'purse-line' }, h('b', null, coin(run.purse)), ` ${RUN_UI.purse}`));
  const mine = ev.votes[me];
  const list = h('div', { class: 'event-choices' });
  def.choices.forEach((c, i) => {
    const [name, text] = EVENT_CHOICES[ev.id]?.[c.id] ?? [c.id, ''];
    const cost = ev.choices[i]?.cost ?? c.cost ?? 0;
    const poor = cost > run.purse;
    const who = Object.entries(ev.votes)
      .filter(([, v]) => v === i)
      .map(([pid]) => names.get(pid) ?? '');
    const el = h(
      'button',
      { class: `event-choice${mine === i ? ' mine' : ''}${poor ? ' poor' : ''}`, 'aria-pressed': String(mine === i), 'aria-label': `${name}. ${text}. ${cost ? fmt(RUN_UI.eventNeeds, { n: cost }) : RUN_UI.eventFree}${poor ? `. ${RUN_UI.tooPoor}` : ''}` },
      h('span', { class: 'key' }, String(i + 1)),
      h('span', { class: 'ic' }, c.icon),
      h('span', { class: 'nm' }, name),
      h('span', { class: 'tx' }, text),
      h('span', { class: 'price' }, cost ? `${coin(cost)}${poor ? ` · ${RUN_UI.tooPoor}` : ''}` : RUN_UI.eventFree),
      h('span', { class: 'votes' }, who.length ? who.map((n) => h('span', { class: 'v' }, `✔ ${n}`)) : h('span', { class: 'none' }, '·')),
    );
    host.tap(el, () => vote(i));
    host.info(el, c.icon, name, text);
    list.append(el);
  });
  body.append(list);
  body.append(h('div', { class: 'hint' }, RUN_UI.eventDefault));
  const fill = h('i');
  const text = h('span');
  body.append(h('div', { class: 'offer-foot sticky' }, h('div', { class: 'timer' }, fill), text));
  return { fill, text };
}
