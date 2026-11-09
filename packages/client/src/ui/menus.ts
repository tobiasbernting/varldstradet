// All in-game menus as HTML overlays: ryggsäck, kista, gårdsbutik, sälj, snickra, garderob, emotes, namn.
import {
  isVehicle,
  ANIMALS,
  isIndoorKey,
  FILTER_NAMES,
  HELP,
  HOUSE_T,
  homeKey,
  houseTitle,
  isHomeKey,
  ownerOfHome,
  INVENTORY_FILTERS,
  NPCS,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  ITEMS,
  RECIPES,
  SPECIES_NAMES,
  T,
  fmt,
  itemName,
  filterOf,
  itemMatches,
  normalizeQuery,
  type ClothingSlot,
  type ItemStack,
  type SlotRef,
  DAY_LENGTH_MS,
  isCallable,
  localWeather,
  noWeatherHere,
  talkNode,
  type Talk,
} from '@lilla-garden/shared';
import {
  portraitUrl,
  getArt,
} from '@art/textures.ts';
import {
  EMOTE_GLYPH,
} from '@art/world.ts';
import {
  net,
} from '../net.js';
import {
  activeWorld,
  bus,
  client,
  myPlayer,
} from '../state.js';
import {
  clear,
  h,
  icon,
  onTap,
} from './dom.js';
import {
  slotEl,
} from './hud.js';


import {
  SFX,
} from '../sound.ts';
import {
  FORGE_NPC,
  hasSagaQuests,
  sagaQuestRows,
} from './saga.ts';

export type MenuKind = 'inventory' | 'wardrobe' | 'emotes' | 'nameAnimal' | 'help' | 'npc' | 'kennel' | 'houses';

const SEARCH_KINDS: readonly MenuKind[] = ['inventory'];

/** The parts of a search menu that outlive a rerender. */
interface SearchFrame {
  kind: MenuKind;
  panel: HTMLElement;
  body: HTMLElement;
  search: HTMLInputElement;
  /** Filter chips by filter id ('all' included). */
  chips: Map<string, HTMLElement>;
  clearBtn: HTMLButtonElement;
  /** Shop tab row (catalogue only). */
  tabs: HTMLElement | null;
  /** "No match" line between toolbar and body (backpack/chest). */
  hint: HTMLElement;
  coins: HTMLElement | null;
}
export class Menus {
  private modal: HTMLElement | null = null;
  private kind: MenuKind | null = null;
  private animalId: number | null = null;
  private npcId: string | null = null;
  private picked: SlotRef | null = null;
  private wardrobeTab: ClothingSlot = 'hat';
  /** Villager conversation in progress (null: the greeting and quests). */
  private talk: Talk | null = null;
  /** What you said last, shown above the villager's answer. */
  private said = '';
  /** Search text and item filter shared by backpack/chest/shop/sell. Survives rerenders, cleared on close. */
  private query = '';
  private filter = 'all';
  /**
   * Backpack/chest/shop/sell keep one long-lived frame (header, search input, chips, tabs) per open();
   * only its body is rebuilt on search, filter and server updates, so the focused <input> is never
   * removed from the DOM (soft keyboards would dismiss, IME composition would be cancelled).
   */
  private frame: SearchFrame | null = null;
  onChange: (open: boolean) => void = () => {};

  constructor(private ui: HTMLElement) {
    bus.on('me', () => this.rerender());
    bus.on('open', (c) => {
      if (c.ui === 'nameAnimal') this.open('nameAnimal', c.id);
      else if (c.ui === 'kennel') this.open('kennel');
      else if (c.ui === 'saga' || c.ui === 'sagaClass') return; // the saga's own windows (ui/saga.ts)
      else if (c.ui === 'seed' || c.ui === 'run') return; // the run's windows (ui/run.ts)
      else if (c.ui === 'npc') {
        this.npcId = c.npc ?? null;
        this.open('npc');
      } else if (c.ui === 'wardrobe') this.open('wardrobe');
      else if (c.ui === 'houses') this.open('houses');
    });
    bus.on('connection', (s) => {
      if (s !== 'open') this.close();
    });
  }

  isOpen(): boolean {
    return this.kind !== null;
  }

  /** Opens a villager's window straight into a conversation (Völvan's "Prata"). */
  talkTo(npcId: string): void {
    this.npcId = npcId;
    this.open('npc');
    this.say(npcId, 'start', '');
  }

  toggle(kind: MenuKind): void {
    if (this.kind === kind) this.close();
    else this.open(kind);
  }

  open(kind: MenuKind, id?: number): void {
    this.close();
    this.kind = kind;
    this.picked = null;
    this.query = '';
    this.filter = 'all';
    if (kind === 'nameAnimal') this.animalId = id ?? null;
    this.modal = h('div', { class: 'modal' });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    this.ui.append(this.modal);
    this.rerender();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.frame = null;
    this.kind = null;
    this.animalId = null;
    this.talk = null;
    this.said = '';
    this.query = '';
    this.filter = 'all';
    this.onChange(false);
  }

  private rerender(resetScroll = false): void {
    if (!this.modal || !this.kind) return;
    const me = myPlayer();
    if (!me) return;
    // Search menus keep their frame (and the focused input) and only rebuild the body.
    if (this.frame && this.frame.kind === this.kind && this.frame.panel.parentElement === this.modal) {
      this.renderBody(resetScroll);
      return;
    }
    this.frame = null;
    const scrollTop = resetScroll ? 0 : (this.modal.querySelector<HTMLElement>('.body')?.scrollTop ?? 0);
    clear(this.modal);
    const title = {
      inventory: `🎒 ${T.inventory}`,
      wardrobe: `👕 ${T.wardrobe}`,
      emotes: '😊',
      nameAnimal: '🐾',
      help: `❓ ${T.help}`,
      kennel: `🐾 ${T.kennelTitle}`,
      houses: `🏠 ${HOUSE_T.whoseHouse}`,
      npc: this.npcId ? (NPCS[this.npcId]?.name ?? '') : '',
    }[this.kind];
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const head = h('h2', null, title, h('span', { class: 'spacer' }), closeBtn);
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: 'panel' }, head, body);
    if (SEARCH_KINDS.includes(this.kind)) {
      this.frame = this.buildFrame(panel, head, body, null);
      this.modal.append(panel);
      this.renderBody(true);
      return;
    }
    switch (this.kind) {
      case 'houses':
        this.renderHouses(body);
        break;
      case 'wardrobe':
        this.renderWardrobe(panel, body);
        break;
      case 'emotes':
        this.renderEmotes(body);
        break;
      case 'nameAnimal':
        this.renderName(body);
        break;
      case 'help':
        this.renderHelp(panel, body);
        break;
      case 'npc':
        this.renderNpc(body);
        break;
      case 'kennel':
        this.renderKennel(body);
        break;
    }
    this.modal.append(panel);
    if (scrollTop) body.scrollTop = scrollTop;
  }

  // ---- search & filter toolbar (backpack, chest, shop, sell) ----

  private hasFilter(): boolean {
    return this.filter !== 'all' || normalizeQuery(this.query) !== '';
  }

  /** A stack passes the active filter chip and search text. */
  private stackMatches(itemId: string): boolean {
    return (this.filter === 'all' || filterOf(itemId) === this.filter) && itemMatches(itemId, this.query);
  }

  private searchInput(): HTMLInputElement {
    const input = h('input', { type: 'text', class: 'search', placeholder: T.search, value: this.query, maxlength: '20', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    // keep the game's and the global shortcuts' hands off typed characters (same as renderName).
    // keyup must still reach the game, or a key held while clicking here would never be released.
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        input.blur();
        this.close();
      } else if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('input', (e) => {
      this.query = input.value;
      if ((e as InputEvent).isComposing) return; // settled on compositionend
      this.renderBody(true);
    });
    input.addEventListener('compositionend', () => {
      this.query = input.value;
      this.renderBody(true);
    });
    return input;
  }

  /** A chip/clear button: acts on tap without stealing focus from the search input. */
  private chipButton(attrs: Record<string, unknown>, text: string, fn: () => void): HTMLButtonElement {
    const b = h('button', attrs, text);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    onTap(b, fn);
    return b;
  }

  private buildFrame(panel: HTMLElement, head: HTMLElement, body: HTMLElement, coins: HTMLElement | null): SearchFrame {
    const kind = this.kind!;
    const search = this.searchInput();
    const chips = new Map<string, HTMLElement>();
    const mk = (id: string, text: string, name: string) => {
      chips.set(
        id,
        this.chipButton({ class: 'chip', title: name, 'aria-label': name }, text, () => {
          this.filter = this.filter === id ? 'all' : id;
          this.renderBody(true);
        }),
      );
    };
    mk('all', T.filterAll, T.filterAll);
    for (const f of INVENTORY_FILTERS) mk(f.id, f.emoji, FILTER_NAMES[f.id] ?? f.id);
    // always present (disabled when empty) so the toolbar doesn't change width while typing
    const clearBtn = this.chipButton({ class: 'chip', title: T.paintClear, 'aria-label': T.paintClear, disabled: true }, '✕', () => {
      if (this.query === '') return;
      this.query = '';
      this.renderBody(true);
    });
    const hint = h('div', { class: 'hint' });
    panel.insertBefore(h('div', { class: 'toolbar' }, search, ...chips.values(), clearBtn, this.sortButton(T.sort)), body);
    const tabs: HTMLElement | null = null;
    return { kind, panel, body, search, chips, clearBtn, tabs, hint, coins };
  }

  private sortButton(label: string, chest?: number): HTMLElement {
    const b = h('button', { class: 'alt', title: label }, `↕ ${label}`);
    onTap(b, () => {
      net.send(chest === undefined ? { t: 'sort' } : { t: 'sort', chest });
      this.picked = null;
    });
    return b;
  }

  /** Rebuild only what depends on state: coins, chip highlight, tabs, hint and body. The input is never touched. */
  private renderBody(resetScroll = false): void {
    const f = this.frame;
    const me = myPlayer();
    if (!f || !this.modal || !me) return;
    const scrollTop = resetScroll ? 0 : f.body.scrollTop;
    if (f.search.value !== this.query) f.search.value = this.query;
    for (const [id, el] of f.chips) el.classList.toggle('on', this.filter === id);
    f.clearBtn.disabled = this.query === '';
    f.hint.remove();
    clear(f.body);
    if (f.kind === 'inventory') this.renderInventory(f);

    if (scrollTop) f.body.scrollTop = scrollTop;
  }

  /** The lobby's house door: your own house first, then everyone else's, each with its owner's portrait. */
  private renderHouses(body: HTMLElement): void {
    const me = myPlayer()!;
    const cards = h('div', { class: 'cards' });
    const card = (id: string, label: string, p: typeof me, own: boolean) => {
      const c = h('div', { class: `card${own ? ' last' : ''}`, title: label }, h('img', { class: 'portrait', src: portraitUrl(p.appearance, p.outfit, 4) }), h('div', { class: 'nm' }, `${own ? '🏠 ' : ''}${label}`));
      onTap(c, () => {
        net.send({ t: 'house', a: 'enter', of: id });
        this.close();
      });
      cards.append(c);
    };
    card(me.id, HOUSE_T.myHouse, me, true);
    for (const p of Object.values(client.world?.players ?? {})) if (p.id !== me.id && !p.bot) card(p.id, houseTitle(p.name), p, false);
    body.append(cards);
  }

  // ---- the kennel: one free first pet ----

  private renderKennel(body: HTMLElement): void {
    body.append(h('p', { class: 'help-intro' }, T.kennelPick));
    const row = h('div', { class: 'kennel-row' });
    for (const [species, label, glyph] of [['dog', T.kennelDog, '🐶'], ['cat', T.kennelCat, '🐱']] as const) {
      const card = h('button', { class: 'kennel-card' }, h('span', { class: 'em' }, glyph), h('b', null, label));
      onTap(card, () => {
        net.send({ t: 'pet', a: 'adopt', species });
        this.close();
      });
      row.append(card);
    }
    body.append(row);
  }

  // ---- inventory & chest (tap one slot, then another to move) ----

  private renderInventory(f: SearchFrame): void {
    const { panel, body } = f;
    const me = myPlayer()!;
    const world = client.world!;
    const sameRef = (a: SlotRef, b: SlotRef) => a.slot === b.slot && a.chest === b.chest;
    const stackAt = (ref: SlotRef): ItemStack | null | undefined => (ref.chest === undefined ? me.inventory : world.objects[ref.chest]?.items)?.[ref.slot];
    const filtering = this.hasFilter();
    const dims = (s: ItemStack | null) => filtering && !!s && !this.stackMatches(s.item);
    const tap = (ref: SlotRef) => {
      if (!this.picked) {
        const s = stackAt(ref);
        if (!s || dims(s)) return;
        this.picked = ref;
      } else if (sameRef(this.picked, ref)) {
        this.picked = null;
      } else {
        net.send({ t: 'swap', a: this.picked, b: ref });
        this.picked = null;
      }
      this.rerender();
    };
    let anyMatch = false;
    const grid = (inv: (ItemStack | null)[], chest: number | undefined, from: number, to: number, keys: boolean) => {
      const g = h('div', { class: 'grid' });
      for (let i = from; i < to; i++) {
        const ref: SlotRef = chest === undefined ? { slot: i } : { chest, slot: i };
        const s = inv[i] ?? null;
        if (s && !dims(s)) anyMatch = true;
        g.append(
          slotEl(s, {
            selected: chest === undefined && me.selected === i,
            picked: !!this.picked && sameRef(this.picked, ref),
            dim: dims(s),
            key: keys ? String(i + 1) : undefined,
            onTap: () => tap(ref),
          }),
        );
      }
      return g;
    };
    const hint = f.hint;
    body.append(h('div', { class: 'hint' }, this.filter === 'all' ? T.inventory : `${T.inventory} · ${FILTER_NAMES[this.filter] ?? ''}`), grid(me.inventory, undefined, 0, HOTBAR_SIZE, true), grid(me.inventory, undefined, HOTBAR_SIZE, INVENTORY_SIZE, false));
    if (filtering && !anyMatch) {
      hint.textContent = T.noMatch;
      panel.insertBefore(hint, body);
    }
    const actions = h('div', { class: 'tabs' });
    const picked = this.picked ? stackAt(this.picked) : null;
    if (this.picked && picked) {
      actions.append(h('span', { class: 'picked-name' }, `${itemName(picked.item)}${picked.count > 1 ? ` × ${picked.count}` : ''}`));
    }
    if (this.picked && picked && this.picked.chest === undefined) {
      const slot = this.picked.slot;
      const s = picked;
      const useBtn = h('button', null, fmt(T.hold, { item: itemName(s.item) }));
      onTap(useBtn, () => {
        me.selected = slot;
        net.send({ t: 'select', slot });
        this.picked = null;
        this.close();
      });
      actions.append(useBtn);
    } else if (!picked) actions.append(h('span', { class: 'hint' }, T.moveHint));
    body.append(actions);
  }

  // ---- catalogue ----

  // ---- pizzeria ----

  // ---- bus stop / train station ----
  // ---- sell ----

  // ---- craft ----

  // ---- wardrobe ----

  private renderWardrobe(panel: HTMLElement, body: HTMLElement): void {
    const me = myPlayer()!;
    const slots: ClothingSlot[] = ['hat', 'shirt', 'pants', 'shoes'];
    const names: Record<ClothingSlot, string> = { hat: T.tabHats, shirt: T.tabShirts, pants: T.tabPants, shoes: T.tabShoes };
    const tabs = h('div', { class: 'tabs' });
    for (const s of slots) {
      const b = h('button', { class: this.wardrobeTab === s ? 'on' : '' }, names[s]);
      onTap(b, () => {
        this.wardrobeTab = s;
        this.rerender();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const grid = h('div', { class: 'wardrobe-grid' });
    if (this.wardrobeTab === 'hat') {
      const none = h('div', { class: `slot${!me.outfit.hat ? ' selected' : ''}` }, '🚫');
      onTap(none, () => net.send({ t: 'equip', slot: 'hat', item: null }));
      grid.append(none);
    }
    for (const id of me.wardrobe) {
      const d = ITEMS[id];
      if (!d?.clothing || d.clothing.slot !== this.wardrobeTab) continue;
      const el = slotEl({ item: id, count: 1 }, { selected: me.outfit[this.wardrobeTab] === id, onTap: () => net.send({ t: 'equip', slot: this.wardrobeTab, item: id }) });
      grid.append(el);
    }
    const preview = h('img', { class: 'portrait', src: portraitUrl(me.appearance, me.outfit, 4) });
    body.append(h('div', { style: { display: 'flex', gap: '2em', alignItems: 'flex-start' } }, preview, grid));
  }

  // ---- emotes ----

  private renderEmotes(body: HTMLElement): void {
    const grid = h('div', { class: 'emotes' });
    const me = myPlayer();
    const ridden = me?.riding !== undefined ? activeWorld()?.animals[me.riding] : undefined;
    if (ridden && isVehicle(ridden)) {
      const b = h('button', { title: T.honk }, T.honk);
      onTap(b, () => {
        net.send({ t: 'honk' });
        this.close();
      });
      grid.append(b);
    }
    for (const e of T.emotes) {
      const b = h('button', { title: e }, EMOTE_GLYPH[e] ?? e);
      onTap(b, () => {
        net.send({ t: 'emote', id: e });
        this.close();
      });
      grid.append(b);
    }
    body.append(grid);
  }

  // ---- world map ----

  // ---- gårdsbok ----

  // ---- villager dialogue ----

  private renderNpc(body: HTMLElement): void {
    const npc = this.npcId ? NPCS[this.npcId] : undefined;
    if (!npc) {
      this.close();
      return;
    }
    const saga = hasSagaQuests(npc.id);
    if (this.talk) {
      this.renderTalk(body, npc.id, saga);
      return;
    }
    const greeting = npc.greeting[(client.day + npc.name.length) % npc.greeting.length]!;
    body.append(h('div', { class: 'npc-talk' }, h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 4) }), h('div', { class: 'bubble-text' }, greeting)));
    const chat = h('button', null, '💬 Prata!');
    onTap(chat, () => this.say(npc.id, 'start', ''));
    body.append(h('div', { class: 'npc-actions' }, chat, this.forgeButton(npc.id)));
    // the saga's quests (ui/saga.ts)
    if (saga) body.append(sagaQuestRows(npc.id));
  }

  // ---- conversations (2D game) ----

  private say(npcId: string, node: string, said: string): void {
    const me = myPlayer();
    if (!me) return;
    if (!node) {
      this.close();
      return;
    }
    const pets: { name: string; species: string }[] = [];
    for (const w of [client.world, ...Object.values(client.areas)])
      for (const a of Object.values(w?.animals ?? {})) if (a.owner === me.id && isCallable(a) && a.name) pets.push({ name: a.name, species: a.species });
    const outdoors = !noWeatherHere(me.area) && !isIndoorKey(me.area);
    const weather = client.weather && outdoors ? localWeather(client.weather.kind, activeWorld()?.biome) : null;
    this.talk = talkNode(npcId, node, { name: me.name, weather, dayFraction: client.timeMs / DAY_LENGTH_MS, season: client.season, pets, rnd: Math.random });
    this.said = said;
    SFX.talk();
    this.rerender();
  }

  private renderTalk(outer: HTMLElement, npcId: string, hasQuests: boolean): void {
    const npc = NPCS[npcId]!;
    const t = this.talk!;
    // a fixed width, so the window does not jump around between answers
    const body = h('div', { class: 'talk' });
    outer.append(body);
    if (this.said) body.append(h('div', { class: 'talk-said' }, `Du: ${this.said}`));
    body.append(h('div', { class: 'npc-talk' }, h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 4) }), h('div', { class: 'bubble-text' }, t.say)));
    const opts = h('div', { class: 'talk-opts' });
    for (const o of t.options) {
      const b = h('button', { class: o.go === '' || o.go === 'bye' ? 'bye' : '' }, o.text);
      onTap(b, () => this.say(npcId, o.go, o.text));
      opts.append(b);
    }
    body.append(opts);
    const forge = this.forgeButton(npcId);
    if (hasQuests || forge) {
      let back: HTMLElement | null = null;
      if (hasQuests) {
        back = h('button', { class: 'alt' }, '📜 Uppdrag');
        onTap(back, () => {
          this.talk = null;
          this.said = '';
          this.rerender();
        });
      }
      body.append(h('div', { class: 'npc-actions', style: { marginTop: 'calc(2 * var(--u))' } }, back, forge));
    }
  }

  /** Smed-Stina's forge (ui/saga.ts): a button in her window, for everyone (anyone can own gear). */
  private forgeButton(npcId: string): HTMLElement | null {
    if (npcId !== FORGE_NPC) return null;
    const b = h('button', { class: 'forge-btn' }, T.forgeBtn);
    onTap(b, () => {
      this.close();
      document.dispatchEvent(new CustomEvent('lilla:forge'));
    });
    return b;
  }

  // ---- help ----

  private helpTopic = 'lobby';

  private helpText(text: string): string {
    return text
      .replace(/\{recipe:(\w+)\}/g, (_, id: string) => {
        const r = RECIPES.find((x) => x.id === id);
        return r ? r.in.map((i) => `${i.count} ${itemName(i.item).toLowerCase()}`).join(' + ') : id;
      })
      .replace(/\{price:(\w+)\}/g, (_, id: string) => `${ITEMS[id]?.buy ?? '?'} ${T.coins}`)
      .replace(/\{name:(\w+)\}/g, (_, id: string) => itemName(id));
  }

  private helpIcon(ref: string | undefined): HTMLElement {
    if (!ref) return h('span', { class: 'help-icon' });
    if (ref.startsWith('emoji:')) return h('span', { class: 'help-icon emoji' }, ref.slice(6));
    const [name, frame] = ref.split(':') as [string, string | undefined];
    const url = getArt().iconUrl[ref] ?? getArt().objects[name]?.frames[Number(frame ?? 0)]?.dataUrl();
    return url ? h('span', { class: 'help-icon' }, icon(url)) : h('span', { class: 'help-icon' });
  }

  private renderHelp(panel: HTMLElement, body: HTMLElement): void {
    const touch = document.body.classList.contains('touch');
    const tabs = h('div', { class: 'tabs' });
    const topics = HELP;
    for (const t of topics) {
      const b = h('button', { class: this.helpTopic === t.id ? 'on' : '' }, `${t.emoji} ${t.title}`);
      onTap(b, () => {
        this.helpTopic = t.id;
        this.rerender();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const topic = topics.find((t) => t.id === this.helpTopic) ?? topics[0]!;
    if (topic.intro) body.append(h('p', { class: 'help-intro' }, topic.intro));
    const list = h('ol', { class: 'help-steps' });
    for (const step of topic.steps) {
      if (step.only === 'touch' && !touch) continue;
      if (step.only === 'desktop' && touch) continue;
      list.append(h('li', null, this.helpIcon(step.icon), h('span', null, this.helpText(step.text))));
    }
    body.append(list);
    if (topic.houses) {
      const rows = h('div', { class: 'rows' });
      for (const a of Object.values(ANIMALS)) {
        const r = RECIPES.find((x) => x.id === a.house);
        const animalItem = ITEMS[`animal_${a.species}`];
        rows.append(
          h(
            'div',
            { class: 'row' },
            icon(getArt().iconUrl[a.house] ?? ''),
            h('span', { class: 'name' }, `${itemName(a.house)} → ${SPECIES_NAMES[a.species] ?? a.species}`, h('br'), h('span', { class: 'need' }, r ? r.in.map((i) => `${i.count} ${itemName(i.item).toLowerCase()}`).join(' + ') : '')),
            h('span', { class: 'price' }, `${animalItem?.buy ?? '?'} ${T.coins}`),
          ),
        );
      }
      body.append(h('p', { class: 'help-intro' }, 'Alla djurhus:'), rows);
    }
  }

  // ---- animal name ----

  private renderName(body: HTMLElement): void {
    const a = this.animalId !== null ? activeWorld()?.animals[this.animalId] : undefined;
    if (!a) {
      this.close();
      return;
    }
    const input = h('input', { type: 'text', maxlength: '14', value: a.name, autocomplete: 'off' });
    const ok = h('button', null, T.ok);
    const submit = () => {
      const name = input.value.trim();
      if (name && this.animalId !== null) net.send({ t: 'nameAnimal', id: this.animalId, name });
      this.close();
    };
    onTap(ok, submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      e.stopPropagation();
    });
    body.append(h('p', null, fmt(T.nameAnimal, { species: SPECIES_NAMES[a.species] ?? a.species })), input, h('div', { class: 'tabs' }, ok));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }
}
