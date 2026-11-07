# GAME2.md: Färden, version 2 — the runs are the game

Written 2026-11-07, design only (no code changes). Replaces the *shape* of the run in `GAME.md` (approved 2026-11-06) and
keeps everything under it: the fight rules of `sagasim.ts`, the classes, spells, bosses and telegraphs of `saga.ts`, the
farm. Where this file says "today" it means the code in `packages/shared/src/run.ts`, `runmap.ts`, `runsim.ts`,
`runbot.ts`. Same promise as before: nothing bleeds, monsters poof, falling costs nothing you own.

**Why now.** The owner soloed a run today and failed: "it was hard soloing". Reading the code, that is no accident. A lone
player gets **no companion** unless a longhouse is built (`hireCompanion` only runs for one human *with* `longhall`), and
then also gets no `SOLO_MERCY`. The zones multiply monster health by 1.35 / 1.5 / 1.7 (`ZONE_HP`) on top of
`mobHpScale(1) = 0.85`. A Krigare (150 hp) or Magiker (110 hp) alone has no tank to hold the pack and no healer, only
two potions at most. The bots that tuned the numbers always had a companion. So the first fix is not balance, it is
**never being alone**. The new direction (runs are the focus; Tape to Tape for the roguelite layer, WoW for the dungeons)
then gives the run more to do than three hallways and a vote.

**Decisions in one place** (each is argued below; the open ones are in section 9):

| Question | Decision |
| --- | --- |
| What is a run? | One **dungeon** (chapter) as a **branching route** of about 10 stops, ending in its mid-boss and boss. Not three random biomes any more. |
| Length | Still ~30 min soft target (nudges at 25:00 / 30:00 stay). Careful adult ≈ 20–28 min, kids ≈ 28–35. |
| Route choice | Walk onto one of up to three **väg-runor** at the end of a stop. The party's majority decides. |
| Runor (boons) | **Personal**: each player gets their own three cards after fights. Rarities, tags and set bonuses. Shared "party" runor come from events and bosses. |
| Currency | **Hacksilver**, one shared purse per run, spent at the **Köpman**. Left-overs turn into sagafrön. |
| Roles | Tank / healer / dps are real. **Hirdfolk** (followers) fill the missing tank and healer **for free, always**, up to 3 fighters. |
| Ladder | **Nivå 0 "Lätt"** for the kids, **Nivå 1** base, then a Mythic+-style climb with **nycklar** (keys), **särdrag** (affixes), and a soft medal timer. |
| Meta | Keep **sagafrön and the sagaträd**, re-skin and extend it with unlocks (new runor, talents, node types). Farm feeds the run as today, simplified. |
| Forgiveness | Every run gets one **Sagoandan** (a free "everyone up" after a wipe); Lätt gets three and a wipe never ends the run. |

---

## 0. What we take from the two references

Honest note on sources: the web has little detail on Tape to Tape's economy; I cite what I could find and mark the rest
as design judgement, not a claim about the game.

**Tape to Tape** (Excellent Rectangle, hockey roguelite). From the store pages and reviews
([Steam](https://store.steampowered.com/app/1566200/Tape_to_Tape?l=swedish),
[PC Gamer preview](https://pcgamer.com/pc-gaming-just-got-a-new-hockey-game-and-its-a-roguelike),
[early-access impressions](https://eip.gg/news/tape-to-tape-early-access-impressions/),
[steamdata listing](https://steamdata.ai/en-US/game/1566200/tape-to-tape)): a run is a **path across a small map**, usually
two destinations to choose between; each stop is a game, a **training option** or a **random event**; the path ends in a
**boss team**; a loss means starting over; **three acts**; you hire players, find **synergies** between them, pick unique
abilities, buy off referees, and pick up **artifacts** with silly rule-bending effects; the designer says the aim is
"impactful power ups while avoiding being grindy". Reviews praise the tight core game and the roguelite layer as the
replay driver, and complain about weak AI teammates and no online play — a warning for our followers (section 5).
What we take: the **short map with two or three doors per step**, **stops of different kinds**, **synergies that make a
build** rather than a stat pile, **artifacts that change rules** (our rare runor), **bosses with a gimmick you must read**,
and three-act pacing. What we do not take: hockey, team management, the grind.
Tape to Tape's map shape is the same one **Slay the Spire** made standard
([map locations](https://slaythespire.wiki.gg/wiki/Map_Locations)): a procedural branching graph with a few fixed
anchors, a rest site before the boss, elites that are risk-for-reward, an event "?" that is sometimes a fight, a shop and a
treasure. The design lesson reviewers draw (see [this analysis](https://saschb2b.github.io/game-mechanics/concepts/branching-dag-map)):
some nodes are obvious wins, some obvious traps, the rest real trade-offs; if elites are always right, the map collapses
into "find elites". We copy the anchors (fixed rest before the boss, no elite in the first rows).

**World of Warcraft dungeons**, from what is public and well known
([follower dungeons](https://www.pcgamer.com/world-of-warcraft-wow-follower-dungeons/),
[Mythic+ keystones and timers](https://www.techinafrica.com/keystone-levels-timers-and-score-a-technical-guide-to-mythic-for-africas-growing-wow-community/),
[group comps](https://raider.io/news/686-mythic-plus-group-comps-dungeon-success-rates-week-8)):
the **trinity** (tank holds the monsters, healer keeps people alive, dps kills in the right order); dungeons are chains of
**trash packs you pull on purpose**, with some **patrols**, then a **mini-boss**, then **bosses with readable mechanics and
phases**; the **Dungeon Journal** lists every boss's abilities before you meet them; **loot** drops from bosses with gear
that raises your power; **Mythic+** is a ladder: a **keystone** for a dungeon, each level makes monsters stronger
(about +10 % health and damage a level), **affixes** (Fortified, Tyrannical, Bolstering, Quaking …) join from level 4 and 7,
there is a **timer** and a *timed* run upgrades the key (a key one level higher), a late run keeps the level or lowers it.
**Follower dungeons** fill the empty slots with NPCs (tank, healer, dps) with decent AI, so one player can run a dungeon
without a group. What we take: all of that, with kid-friendly names, a soft timer, no key *loss*, and followers that are
there from the first minute.

---

## 1. The loop in one picture

```
  ┌──────────────────────────  GÅRDEN (the farm)  ──────────────────────────┐
  │  cook färdkost · feed animals · forge · plant sagafrön · pick a Nivå     │
  │  stand at the färdport: choose dungeon + level + who comes (Hirdfolk)    │
  └───────────────┬─────────────────────────────────────────▲───────────────┘
                  ▼                                         │ loot, sagafrön, nycklar,
   FÄRDEN: one dungeon as a branching route                 │ recipes, pets, decor, titles
   start ▸ ▸ ▸ ▸ MELLANBOSS ▸ ▸ ▸ ▸ VILA ▸ BOSS ──────────────┘
   fight · event · köpman · vilosten · skatt  (≈10 stops, ≈30 min)
   runor and Hacksilver exist only in the run
```

**Why the family returns tomorrow** — four reasons, in the order the kids feel them:
1. **"One more key."** Finishing a dungeon gives a *nyckel* one level higher for it (section 4.6). Nobody wants the 7-year-old's
   dungeon to stay at Nivå 1 when the 9-year-old's is at 3.
2. **Every run is a different story**: a new route, new runor, new events, two different särdrag. The same dungeon plays
   differently twice in a row (Tape to Tape's replay driver, the Spire's map).
3. **The tree grows**: sagafrön buy permanent things and the Yggdrasil visibly gets bigger for the whole family.
4. **The farm matters**: tonight's dinner is tomorrow's `färdkost`, and a happy pig is +1 % health for everyone.

---

## 2. The route (Färdkartan)

### 2.1 Shape

A run is **one dungeon** (a chapter of the saga; section 2.4). Its map is a **node graph** of 10 rows, three lanes wide
at most. Rows are *stops*; a stop is a small instanced area (section 2.3).

```
 row 1   ⚔ Flock                         always, one lane
 row 2   ⚔ / ❓ / ⚔                       2–3 lanes, you choose
 row 3   ⚔ / 🪙 / ⚔⚔(Stark vakt)          Stark vakt not before row 3
 row 4   ❓ / ⛺ / ⚔                       one lane is always safe (⛺ Vilosten or 🪙 Köpman)
 row 5   🛡 MELLANBOSS                    always, lanes converge, a gate behind it
 row 6   ⚔ / 💎 / ❓
 row 7   ⚔⚔ / 🪙 / ⚔
 row 8   ❓ / ⚔ / ⛺                       one lane is always safe
 row 9   ⛺ Sista vilan (+ 🪙 maybe)       always
 row 10  👑 BOSS                          always
```

Wings (Tape to Tape's three acts, in three lines of text): rows 1–4 **Första vingen**, 5–8 **Andra vingen**, 9–10 **Hallen**.

**Node types** (the icon is on the rune, the name is one or two words):

| Node | Swedish | What happens | Share of free lanes |
| --- | --- | --- | --- |
| ⚔ | **Flock** | A room with 1–2 packs, a gate that opens when they are down. Pays Hacksilver and one runa offer. | ~45 % |
| ⚔⚔ | **Stark vakt** (elite) | One bigger pack with a **särdrag** (a trait shown over their heads) and a "mini-boss" member. Pays 2× and a better runa offer. Not before row 3. | ~12 % |
| 🛡 | **Mellanboss** | The chapter's mid-boss (`SagaDungeonDef.mini`). The gate behind it is the half-way mark. Epic runa offer. | fixed, row 5 |
| ❓ | **Händelse** | A small glade with a picture, a short text and 2–3 choices (section 2.5). Never costs health. | ~18 % |
| 🪙 | **Köpman** | The merchant's camp (section 3.4). No monsters. | ~7 % |
| ⛺ | **Vilosten** | Heal 40 % of the party and get up all fallen, **and** one choice: *Vila* (extra +25 % heal) or *Skärp en runa* (section 3.3). | ~8 % |
| 💎 | **Skatt** | A chest guarded by one pack; opens as a rarity roll (section 4.7). | ~10 % |
| 👑 | **Boss** | The chapter's boss with all telegraphs; chest and clear. | fixed, row 10 |

Hard rules for the generator: at least one ⛺ and one 🪙 **reachable** in each wing; never two ❓ in a row on every lane;
no ⚔⚔ in rows 1–2; rows 4 and 8 always have a safe lane. Deterministic from the seed like `generateRun`.

### 2.2 How a route is chosen (co-op)

At the end of a stop, once the gate is open, the exit room shows **up to three väg-runor** on the floor — glowing discs
(the `run_exit` rune disc already exists), each with the next stop's icon. A player **walks onto the one they want**; their
name tag floats over it. When **all online humans stand on a rune**, or **20 s** after the first one stepped on one, the
rune with most players wins; ties go to the **Stigfinnare** (path-finder): the party member whose turn it is, rotating each
row and shown with a small compass on their head (so the 7-year-old gets to decide too). Nobody is pulled by a window; the
vote is spatial and visible, which suits kids better than a menu. Followers never vote.

This reuses the machinery of `offerRunor`'s vote (strict majority, 20 s, ties to the first), moved from cards to discs.

### 2.3 What a stop is (WoW feel, small maps)

A stop is a small instanced area built by `sagamap.buildDungeon` from the **chapter's dungeon look** (walls, torches,
ambient light, decor; `Data.zone_look` already borrows these). Sizes: Flock 1 room + gate room (≈ 14 × 12 tiles), Stark
vakt one 16 × 14 room, Mellanboss and Boss use the dungeon's own hall from `DUNGEONS[...].rooms`, events and Köpman
a 10 × 8 glade/camp. The seven biome templates of `ZONE_TEMPLATES` become **room layouts**, no longer "the zone". The
transition between stops is the same instant swap `enterZone` does today (build map, move everyone, drop the old map).
A stop takes a Flock ≈ 2 min for a careful adult and 3–4 for kids; time is measured by the bots (section 8).

Within a Flock the WoW part happens: monsters stand as **packs** with roles (section 4.1), a **pull** is you stepping into
their sight, and a room may hold a **patrol** (4.2).

### 2.4 The nine chapters as nine runs

One chapter = one dungeon = one run. The order is the saga's (`DUNGEON_IDS`). Each dungeon *teaches one thing*, taken from
its bosses' moves in `SAGA_BOSSES`, so the Journal (4.4) reads as a curriculum:

| # | Dungeon (id) | Mellanboss → Boss | What the run teaches | Pack roles (from `SAGA_MOBS`) |
| --- | --- | --- | --- | --- |
| 1 | Draugkryptan (`draug`) | Gravväktaren → Draugkungen Hrolf | step out of a circle (slam), stay behind a cone (cleave), **stop the Draugropet** | swarm: gravrotta · brute: skelett · shooter: draugbage |
| 2 | Frostjättens borg (`frost`) | Isbjörnen Kall → Rimtursen | dodge a charge, free a frozen friend (freeze) | isvarg · frosttroll · isande (slows) |
| 3 | Surts smedja (`surt`) | Smeden Glöd → Surt | leave burning ground (pools) | eldimp · lavagolem · eldhund |
| 4 | Helheim (`hel`) | Garm → Hel | adds on a call (summon), being pulled in (pull) | helhund · gengangare · benspindel |
| 5 | Svartalfheims gruvor (`dvarg`) | Järnväktaren → Fafner | dodge a line (line), **stop the Guldsömn** (mend) | guldbagge · gruvtroll · stengolem |
| 6 | Havsormens tempel (`orm`) | Bläckis → Jörmungandr | lines + pull + rain together | manet · sjödraug · jättekrabba |
| 7 | Alvernas lund (`alv`) | Spindeldrottningen → Nattmaran | webs, two interrupts at once | skuggalv · jättespindel · svampvakt |
| 8 | Fenrisklyftan (`fenrir`) | Sköll → Fenrisulven | charge, summon pack, interrupt under pressure | ulv · rimtroll · bergsjätte |
| 9 | Bifrost (`loke`) | Lokes skugga → Loke | everything from 1–8, four phases (`phases: .8 .6 .4 .2`) | illusions of all the earlier packs |

(The saga's chapter 1 is "Völvans dröm", choosing a class; Draugkryptan is the first dungeon run.)

Chapter progression stays: the first uncleared dungeon is the "story" run, a cleared one is a replay at any unlocked
level. **Biome variety does not disappear**: the farm map's seven biomes keep their *ground and weather* as the look of
the first-row approach (a short "Vägen dit" intro) and the open world (`OPEN_WORLD.md`, in flight) is where the arches
stand. Mixed-biome routes become a **late-game ladder mode** ("Sagans stege", section 4.6) where the dungeon is random.

### 2.5 Events (Händelser): kid-friendly choices

Two or three big pictures, one line each, no reading required to guess. **No choice ever takes health, items you own or
progress.** Costs are Hacksilver or "a harder fight for a better prize". Each event is a glade with the choices as objects
to walk to (same spatial vote as the route).

| Event (Swedish) | Choices | Outcomes |
| --- | --- | --- |
| **Den hungriga trollungen** 🧌 | give bread (use a färdkost / 20 Hacksilver) · sneak by | bread: a rare runa for the tank; sneak: nothing, but a 30 % chance he follows and you get a free **Flock** with a bonus chest |
| **Önskebrunnen** ⛲ | throw 10 / 30 / 60 Hacksilver | the more, the better the rarity of a party runa (a gamble the family can see: three coins = a glowing well) |
| **Den vilsna kråkan** 🐦‍⬛ | follow it · shoo it | follow: leads to a hidden **Skatt** next row; shoo: +15 Hacksilver |
| **Runstenen som viskar** 🪨 | read the left rune · read the right rune | a choice of two *party* runor of different tags (this is the way party runor enter) |
| **Spökets skatt** 👻 | open the chest · talk to the ghost | chest: a Flock of ghosts guards it (better loot); talk: the ghost heals you 25 % and gives a hint of the boss (a Journal page) |
| **Gammal smedja** 🔨 | skärp one runa · skärp the whole party's weapons | one runa upgraded, or +6 % spell power for the rest of this wing |
| **Kista med lås** 🔒 | the key (a 🗝 you got from an earlier stop) · smash it | key: epic chest; smash: common chest and a Flock wakes up |
| **Vandrande skald** 🎶 | listen · clap | listen: all cooldowns −5 % this wing; clap: a pet or mount fragment chance (only the first time) |
| **Sagoandan** 🌟 | pick a spirit (3 pictures: sköld, hjärta, blixt) | one-time buff for the party this wing; or save it as the run's free revive (4.5) |

About 16 events at launch: these nine, plus seven themed on a dungeon (a frozen traveller in Frostjättens borg, a smith's
ghost in Surts smedja, and so on). Texts go in `sv.ts`. Each event fits in 60 s.

---

## 3. Run-only upgrades: runor, Hacksilver, the Köpman

### 3.1 Runor as relics

Today `RUNOR` is 38 flat boons picked by a party vote between zones. In v2 runor are the Slay-the-Spire relic / Tape-to-Tape
artifact layer: **many of them, with rarity, tags and set bonuses**.

* **Rarity** (the colours already exist in `RARITY_COLORS`): **Vanlig** (white), **Ovanlig** (green), **Sällsynt** (blue),
  **Episk** (purple), **Sagorun** (orange, from bosses only). A runa's effect grows with rarity (×1, ×1.25, ×1.5, ×2) or
  is a different, more interesting one at rare+.
* **Tags** (one or two per runa, a picture on the card): 🔥 *Eld*, ❄️ *Is*, ⚡ *Åska*, 🛡 *Sköld*, 💚 *Liv*, 🪓 *Hugg*, 🍀 *Tur*,
  🐾 *Djur*. The tag sits in the top corner of the card and a **tag bar** under the HUD counts them.
* **Set bonuses (synergies).** At 2 runor of one tag a small bonus, at 4 a big one; shown as "🔥 2/4" on a card so the
  child sees what taking this one does. Examples: 🔥×2 *Glöden*: fire damage leaves a 3-second glowing patch; 🔥×4 *Brasan*:
  every 5th spell is free. 💚×2: your heals also shield for 10 %; ❄️×2: slowed monsters take +10 %. 🛡×4: Sköldmur reflects.
* **Kombo-runor** (Sällsynt/Episk, offered only when you already hold the two tags): *Ångmoln* (🔥+❄️: Eldboll that hits a
  slowed monster leaves a steam cloud that blinds), *Åskstorm* (⚡+🛡: your shield pulses lightning), *Livets träd* (💚+🐾:
  your pet or mount heals). The text is a single sentence and a picture, like every spell button.
* **Class runor and party runor** both stay: a class runa only works for that class, a **gemensam runa** works for all and is
  the way a team gets a shared build. Party runor only come from events, the Köpman, mid-boss and boss — they are *treats*.

Starting set: the current 38 stay as the pool of Vanlig/Ovanlig/Sällsynt (names, ids and numbers unchanged, tagged),
plus ≈ 40 new ones (rare+ and kombos) over the phases in section 8, aiming at **~80 runor** with the run being the
sum of 8–12 picks.

### 3.2 When you get cards, and who picks

* After each **Flock**, **Stark vakt**, **Skatt** and **Mellanboss**: **every human player gets their own offer of 3**, drawn
  from *their* class pool, with a pity rule (Ovanlig+ guaranteed within three picks) and rarity weights by stop:

| Stop | Vanlig | Ovanlig | Sällsynt | Episk |
| --- | --- | --- | --- | --- |
| Flock | 60 | 30 | 10 | – |
| Stark vakt / Skatt | 30 | 40 | 25 | 5 |
| Mellanboss | – | 30 | 50 | 20 |

* **Personal, not a vote.** The current vote (a card for everyone) is a good design for 2 adults and a slow one for a 7-year-old
  and a 9-year-old fighting over a flame. In v2 a kid picks their own card; adults do not wait for each other. The offer is a
  **non-blocking overlay**: the party walks on, the card window sits at the side with a 30 s bar, and idle auto-picks the
  first card. (The "hero stands still while it is open" rule of `run_pick.gd` goes: the overlay is picked during the walk
  to the next stop, or at the exit.) A *reroll* (once per run, plus the tree's `g3`) stays and is per player.
* **Party runor are voted** by walking to a card in the glade (event) or by the Stigfinnare in the Köpman. Nobody loses a
  personal card by it.
* **Cards a kid can read**: icon (96 px), name ≤ 4 words, the tag corner, "2/4" set progress, and **one line with a number**
  ("+25 % 🔥"). The rarity is the card's border colour and the card's glow. Nothing else on it.

### 3.3 Skärpa (upgrading a runa)

At a ⛺ Vilosten or the *Gammal smedja* event a player may **skärp** one of their runor: Vanlig→Ovanlig→Sällsynt (effect ×1.25
each step). One upgrade, no cost. This is the Spire's "smith" and keeps a pick from being dead in late run.

### 3.4 Hacksilver and the Köpman

* **Hacksilver** 🪙 is the run currency: 3–6 from each monster pack depending on size, 12 from a Stark vakt, 20 from a
  Skatt, ~15 per event win, 40 from the Mellanboss. A normal run earns ≈ 220–280. It is **one shared purse for the party**
  ("Färdkassan"): sharing avoids kids fighting over who got the coins, and the Köpman sells to a specific player anyway.
* **Köpmannen Bram** (a camp node; a fat friendly troll with a cart): sells, with prices that are the same each visit in a run:

| Wares | Price | Notes |
| --- | --- | --- |
| a **runa** for each player (their class), 3 per player, one slot each Vanlig / Sällsynt / Episk | 40 / 90 / 160 | the Episk slot only appears if the run is past row 4 |
| a **gemensam runa** | 110 | party-wide, shown to the Stigfinnare |
| a **healing potion** | 25 | everyone still has the farm's 2–3 |
| **Skärpa** a runa | 50 | when no ⛺ was passed |
| **Nytt kort** (reroll for one player's next offer) | 30 | |
| a **Sagoandan** (extra free revive) | 150 | once |
| a **färdkost** of tonight's dinner | 60 | for kids who forgot to cook |

* **Leftover Hacksilver** at the end of a run turns into **sagafrön** at 1 per 12 (rounded down), so spending is always
  good and nothing is wasted.

---

## 4. WoW dungeon design

### 4.1 Packs, roles and pulls

Today a pack is 3–4 of a few species picked from a biome list. In v2 a pack is **composed** from the dungeon's three mob
roles (every dungeon already has them in `SAGA_MOBS`: a fast **swarmer**, a **brute**, a **shooter**):

| Role | Swedish | Behaviour | Example |
| --- | --- | --- | --- |
| Svärmare | swarmer | fast, weak, many; goes for the *squishiest* (lowest-hp) player, not the tank | gravrotta, isvarg, eldimp |
| Bryte | brute | slow, big, hits hard; stays on the *tank* by threat | skelett, frosttroll, lavagolem |
| Skytt | shooter | stands back and shoots (some slow); kill first or hide | draugbage, isande, benspindel |
| **Besvärjare** *(new)* | caster | **heals or shields the others** (a small green rune over them), has an interruptible cast bar | new per dungeon, a retinted `skuggalv`-like |
| **Vaktare** *(new)* | elite | a bigger brute with a särdrag (below) | one per Stark vakt |

Pack recipes (3–5 members): *"Tre svärmare och en skytt"*, *"Bryte + Besvärjare + 2 svärmare"* (the first one that asks the
tank to hold and the dps to kill the caster first), *"Två brytar och en skytt"*. A **pull** is the party stepping into
sight range; the pack walks to the tank by **threat** (`threat` already exists: the tank's spells make 4× threat and
`utmana` taunts 4 s). Skill the family learns: *the tank goes first, the dps waits a second, the healer stays behind*.
The kid's reading of this needs one thing the client does not have yet: a **threat arrow** (`HANDOFF.md` item 4: put
the target id in `SagaSnap.m`) — a thin line from each monster to the player it is chasing, red if it is you.

**Särdrag of a Stark vakt** (shown as a small icon over the head, listed in the Journal): *Sköldbärare* (frontal hit is
blocked, hit from behind), *Larmhorn* (calls a second pack after 5 s if not killed), *Stormfot* (charges the farthest player
once), *Eldhud* (leaves burning ground when it dies). These are the "trash mechanics" that make a WoW dungeon more than
bags of HP, in four sentences.

### 4.2 Patrols and room design

* **Patrol** (from row 3): one pack walks a short loop in a larger room along a **visible dotted line** and aggros anyone it
  touches; pulling it at the wrong time brings a second pack to the first fight. Counter-play is visible: wait, or pull it
  to a corner. Max one per Flock, never in rows 1–2 or on Lätt.
* **Sleeping packs** (from row 2): a pack that is *asleep* (z-icon) has half the sight range. Kids who creep can pick packs apart;
  kids who run through wake two. (Existing `sight` multiplier from `RunPlan`, no new rule.)
* **Gates** open when the *required* packs are down (as today). **Hidden packs** next to the route are optional bonus
  Hacksilver, for the greedy; sagafrön for the pack stays 1.

### 4.3 Bosses: the mechanics language

The telegraph system stays as is (`BossAbility`: ground marks with a warn time, interrupts, phases, adds). v2 only
**names** the language the Journal and the HUD use, so a 7-year-old can learn it once and use it on all 18 bosses:

| Mark on the ground | Swedish | What you do | Moves in `BossMove` |
| --- | --- | --- | --- |
| red circle | **Ring** | walk out | slam, rain, pools, nova (small) |
| orange wedge | **Båge** | go behind the boss or to the side | cleave |
| long strip | **Strimma** | step off the strip | line, charge |
| purple ring + cast bar | **Avbryt!** | tank Sköldslag, mage Isspjut, warrior Stormsteg — or run far | nova (`interrupt`), mend |
| a friend in ice/web | **Fångad** | break the block | freeze |
| green arrow inwards | **Dra** | run away from the middle | pull |
| little monsters appear | **Hjälp!** | the dps switches to the adds | summon |

Phases (the `phases` array) stay; the Journal shows them as tabs ("Del 1/2/3") and the boss's yell says when it starts
(already in `yells`). **Enrage/soft-timer** — none: a boss never gets angry for being slow (family rule). Every boss gets
one **lesson phase**: in the first 20 s only one move is used (the `first`/`every` fields already allow this), so a kid sees
each move alone before they overlap.

### 4.4 Äventyrsboken (the Dungeon Journal)

The `BossAbility.text` field is already "for the dungeon journal"; it has no window yet. v2 builds it:

* Opens from the färdport and from a rest stone in a run. One page per dungeon: map of the **route**, a list of **pack
  recipes** and their särdrag, then each boss as a page with the ability icons in the language above, one sentence each
  (`text`), and "what to bring" ("Ta med en Avbrytare: Väktare, Magiker eller Krigare").
* **Unlocks by meeting.** A page fills in as the monster is seen or a boss is met (the first attack and the first interruptible
  one are already always unlocked on a first clear in `GAME.md` §1.2 point 5; the Journal shows locked ones as "?"). Seeing
  a new page gives **1 sagafrö** (a reason to read).
* **A "Ledtråd" event** (ghost, §2.5) opens one boss page early.

### 4.5 Roles in a party and the Sagoandan

Roles are the saga's. What changes is how visible and how forgiving:

* **Role icons** on the party list: 🛡 / 💚 / ⚔. A party without a tank shows a faint "Ingen tank" hint on the first Flock
  (helpful for the kids, not shouting).
* **Sagoandan** 🌟 — one per run (two with the tree node `g3`, three on Lätt): when everyone is down, the party is up at the
  last rest stone with 50 % health and the room's monsters reset, instead of the run ending. This is the roguelite "extra
  life" Tape to Tape does not need (a lost game is a short loss there) but a 30-minute family run does. It does not mean
  failing is free: the pack's progress is lost. Visible as a glowing star on the HUD.
* A single player falling still gets up at the last rest stone after `DOWN_MS` (10 s), faster with a healer's `Väck upp!`.

### 4.6 Loot and gear

* **Gear** stays what `saga.ts` has: weapon, offhand, amulet; five rarities; forge to +5 at Smedjan. v2 adds **where** drops
  come from: bosses and the **Skatt** and **Stark vakt** nodes roll the dungeon's `SAGA_LOOT`/`SAGA_TREASURE` with a
  **rarity weight that grows with the level (Nivå)**: Nivå 1 as today, +3 percentage points toward Sällsynt/Episk per level, a
  Legendarisk chance only from Nivå 6 (the WoW "item level climbs with keystone level" loop, in a table the kids can see:
  each Nivå badge shows the best rarity it can drop).
* **Pity**: a boss chest always has at least one thing you can use (a class-fit item or a pet). The `found` rules stay (no
  repeats of pets, mounts, clothes).
* **Sets** — not yet. Eight sets of three would be a real WoW feel, but items are separate from runor now; revisit when the
  ladder has been played (open question 8).

### 4.7 The ladder: Nivåer, nycklar, särdrag and a soft timer

* **Nivå 0 "Lätt"** — the kids' level (section 5.3).
* **Nivå 1 "Vanlig"** — base. First clear of each dungeon. No särdrag.
* **Nivå 2…10** — the Mythic+ climb. Per level: monster health **+8 %**, damage **+6 %** (compounded: Nivå 5 = ×1.36 / ×1.26,
  Nivå 10 = ×1.99 / ×1.69). Telegraph warn times shrink **−2 % per level** down to 80 %.
* **Nyckel (Runnyckel) 🗝** — per dungeon. Finishing a dungeon at Nivå *n* **in time** (medal Guld) gives a key for Nivå *n+1* for
  that dungeon; Silver or Brons keeps the key at *n* (**never lower**: the family rule — the WoW key can drop, ours does
  not). A nyckel is a number on the färdport per dungeon.
* **Soft timer ("Medaljtid")**: each dungeon has a par time (30 min for the first, scaled by route length). It never ends a run
  (GAME.md's nudges stay). At the end the run says **Guld** (≤ par), **Silver** (≤ par × 1.3), **Brons** (any finish). It only
  changes the key and a loot weight (+1 roll for Guld). The 25:00/30:00 banners stay, as written.
* **Särdrag (affixes)** — two at Nivå 3+, three at Nivå 6+, **rotating weekly** (Europe/Stockholm calendar, like the seasons).
  Kid names, all fair:

| Särdrag | WoW cousin | Effect |
| --- | --- | --- |
| **Stålhud** | Fortified | packs +20 % health |
| **Stormig** | Tyrannical | bosses +20 % health, +10 % damage |
| **Stärkande** | Bolstering | when a pack member dies the others grow +10 % — kill them together |
| **Glödpölar** | Sanguine | dead monsters leave a glowing puddle (burns, not bleeds) |
| **Skälvning** | Quaking | every ~25 s a circle under each player, a short warning |
| **Sprängbär** | Explosive | little orbs appear in fights — pop them with any attack within 4 s |
| **Mörkret** | Necrotic | monsters hit for stacking slow instead of damage — keep moving |
| **Jakten** | Raging | below 25 % health a monster speeds up — burst them |

(Not "Bursting"/"Volcanic"/"Spiteful": too punishing for kids; see open question 9.)

* **Sagans stege**: once all nine are cleared, a mode with **random dungeon and mixed biomes**, three wings of
  the *seven biome* layouts and a random boss: the endless v1-flavour for the late game. Counts toward the same keys.

---

## 5. Solo and small parties

### 5.1 Why the owner failed, and the principle

The principle: **a run must be winnable alone by a careful adult at Nivå 1 without any building, and by a clumsy
9-year-old at Lätt.** Today it is not: a lone Krigare or Magiker has no healer, and the longhouse that unlocks the companion
asks for 60 wood and 20 stone *before* the game is playable alone.

### 5.2 Hirdfolk (followers)

* **Fighters on the field = humans + Hirdfolk, always 3, up to 4 with four humans** ("Fyra platser, tre med följe").
  The followers fill **the missing roles in this order: tank, healer, dps**, until the party has 3 fighters. So:
  1 human Krigare or Magiker → Väktare + Helare. 1 human Väktare → Helare + Magiker. 1 human Helare → Väktare + Krigare.
  2 humans, Väktare + Helare → a dps. 2 humans, two dps → a tank (the healer is then missing; the toggle below lets them
  choose a healer instead). 3 or 4 humans: no followers. The färdport window has a toggle,
  **"Hirdfolk: Auto / Helare / Väktare / Ingen"**, for families that want something else.
* **Always available.** The longhouse requirement is dropped. The longhouse (`longhall`) is kept as the building that makes
  the **Hird better**: +20 % follower power (today's tree node `g5` becomes the Långhus bonus; the rest of §5.2 numbers are
  with it off) and lets you **name and dress** your Hirdfolk. Party max becomes 4 for everyone (open question 1).
* **Who they are** (kid-friendly names; sprites reuse the player model with the class outfits from `CLASSES[...].outfit`):
  **Bjarne Sköld** (Väktare), **Ylva Läkerot** (Helare), **Torgil Yxe** (Krigare), **Maja Gnista** (Magiker). A short bark when
  they join ("Jag tar framför!").
* **Power.** They level with the *average of the humans*, wear the starter set plus the average human rarity, and carry the
  party-wide runor the humans took; **never** class runor from the humans. Follower damage/healing × `FOLLOWER_POWER` = **0.8**
  so a human is always the star. They take **no loot, no sagafrön, no runor picks**, and are gone when the run ends (as
  Hirdmannen is today: `bot: true`, never saved).
* **Brain.** Today's `botStep` plays a careful bot. Improvements the Tape-to-Tape complaint ("incompetent AI teammates")
  tells us to make, in `runbot.ts`:
  1. **Tank**: taunts on a pull, keeps `utmana` for the shooter pack, Sköldslag on every purple ring, holds position until the
     healer is in range, never chases away from the party.
  2. **Healer**: heals the lowest friend under 70 %, keeps `Läkekrets` for packs, wakes a fallen friend first, never stands
     in a mark, stays within 7 tiles of the group.
  3. **Dps followers**: wait one second after the tank's pull, kill the Besvärjare then shooters, switch to adds on a call.
  4. **Reaction**: leave a red ring at 70 % of warn time; stop an interruptible cast if the follower has the spell and the
     human did not start it.
  5. **"Samla / Attackera" pings**: the human can ping the ground (a key) and followers gather there; ping a monster and they
     focus it. One button, an emote for the kids.
  6. **Fair mistakes**: followers sometimes (10 %) take a slow turn, so they do not feel like a perfect machine; on Lätt it is 0 %.

### 5.3 Scaling and Lätt

Monster scaling is by **fighters**, not humans, with followers counting less so a solo player's damage still matters:

```
fightersEff = humans + 0.6 × followers
mobHp  = mobHpScale(fightersEff) × levelHp(Nivå) × wingHp(row)         (keeps 0.4 + 0.45 f)
mobDmg = mobDmgScale(round(fightersEff))                              (0.4 / 0.7 / 0.9 / 1.0)
pack   = addCount(base, round(fightersEff))                           (packs have 3–4 members at 3 fighters)
boss   = bossHpScale(fightersEff)
```

`wingHp` replaces `ZONE_HP`: ×1.0 for rows 1–4, ×1.15 for rows 5–8, ×1.3 for 9–10 (the later wings are tougher, but
less than v1's ×1.35…1.7 which, with the mercy, hit a solo adult hard). `SOLO_MERCY` goes away (followers are the mercy).
The numbers above are the **starting values**; section 8 tunes them with the bots.

| Level | Monster hp | Monster dmg | Telegraph warn | Wipe | Sagoandan | Followers | Hint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Lätt** (Nivå 0) | ×0.6 | ×0.5 | +40 % longer | never ends the run — back at the last stone, monsters reset | 3 + free after each stop | on, 0 % mistakes | big hints; route has no Stark vakt, no patrol, no särdrag; boss uses its first 2 moves only |
| **Vanlig** (Nivå 1) | ×1.0 | ×1.0 | as today | ends the run | 1 | on, 10 % mistakes | – |
| Nivå 2–10 | +8 % / level | +6 % / level | −2 % / level | as Vanlig | 1 | as Vanlig | särdrag from 3 |

(Lätt gives **half sagafrön** and no key, so that Lätt is a place to learn and not a way to farm; the first clear still counts
for the chapter, so the 7-year-old is never blocked from the story.)

### 5.4 Target numbers (what the bots must reproduce)

A human is slower than a *careful* bot and faster than a *clumsy* one; calibrate: **adult ≈ 1.7 × careful, 9-year-old ≈
clumsy, 7-year-old ≈ 1.2 × clumsy**.

| Party (first dungeon, Draugkryptan) | Level | Careful bot | Clumsy bot | Human estimate | Win rate target |
| --- | --- | --- | --- | --- | --- |
| 1 human + 2 Hirdfolk (the owner's case) | Vanlig | 11–15 min | 22–28 | adult 20–27 min | careful ≥ 90 %, clumsy ≥ 60 % |
| 1 human + 2 Hirdfolk | Lätt | 8–11 | 15–20 | child 20–28 min | all ≥ 95 % (and no run ends on a wipe) |
| 2 humans + 1 Hirdfolk | Vanlig | 11–15 | 22–28 | 22–30 min | careful ≥ 90 %, clumsy ≥ 70 % |
| 3 humans | Vanlig | 11–15 | 22–28 | 22–30 min | careful ≥ 90 %, clumsy ≥ 70 % |
| 4 humans | Vanlig | 10–14 | 20–26 | 20–28 min | careful ≥ 90 %, clumsy ≥ 75 % |

(Today's bot times, GAME.md §9, are 6–13 min careful because the run had 4 stops of fighting; the new route has ~10 stops
and events, which is the point: 20–28 min with a careful adult.)

---

## 6. Meta-progression between runs

**Keep** sagafrön and the sagaträd (it works, the farm sees the tree grow, and `Yggdrasil` as an object exists). **Change**
what it gives so the run's *new* layers are what you grow:

* Earnings (`RUN_SEEDS`): pack 1, stop (instead of zone) **3**, chest 2, mid-boss 5, boss first clear 20 / replay 12, Guld +4,
  Nivå × 10 % (not 15 % per modifier), leftover Hacksilver (§3.4), a Journal page 1. About 55–65 per run at Nivå 1.
* The tree gets a **fourth branch**, *Runor* (Sagans bok), with the unlocks. The 18 nodes stay as they are (462); 8 new nodes
  (≈ 300 more) so a family has ≥ 15 runs of growth.

| Branch | New nodes (cost) | What they unlock |
| --- | --- | --- |
| **Runor** | *Fler runor 1–3* (20/40/70), *Kombo-runor* (60), *Sagorun-chans* (80), *Vänlig skatt* (40) | pool of rare+ runor grows (§3.1); combo runor appear; extra reroll |
| **Talanger** | *Väktarens val*, *Helarens val*, *Krigarens val*, *Magikerns val* (30 each ×2 tiers) | each class picks 1 of 2 *talanger* per tier — a permanent small variation (the tank can pick "Utmana pulls from further" over "Sköldslag stuns +1 s") |
| **Karta** | *Köpmannen kommer oftare* (30), *Hemlig väg* (50: a 4th lane at one row), *Ledtråden* (30: one boss page open at the start) | new route options |
| **Prydnad** | cosmetics (*färdport-ljus*, *titlar*, *Hirdfolkets kläder*) | no power |

* **Titles and cosmetics**: a title for each dungeon's first Guld, each Nivå milestone (5, 10), 'Ensam' (a solo clear), 'Hela
  hirden' (all four classes cleared a dungeon); a mount/pet from boss rare rolls as today.
* **What stays out of the tree**: no node ever makes *the run* easier to a point where the ladder is trivial; the tree is
  breadth (more choices) more than height (more numbers). The existing hero branch's +3…+5 % nodes are small and stay.
* **Chapters and Völvan** — the story is unchanged: Völvan gives the chapters, the first clear of a dungeon completes it.

**The farm feeds the run** (simplified from `GAME.md` §4): keep **färdkost** (1 slot, 2 with `f1`), animals/mounts as
companions (**+3 % each**, double when cared for), **Gårdsglädje**, **Örtagård**, **Smedja**, **Stall**, **Kämpastenen**.
Move or drop: the *longhouse* stops gating the fourth player and the companion (§5.2), the **Smedjan/forge** (Smed-Stina) stays
as is, and *färdkost* is also sold by the Köpman. One extra: **"Kökets dagens"** — the dish cooked today gives +10 % more
(the reason to cook before a run). Nothing else is added: the farm keeps its own fun separate from the run.

**The run feeds the farm** — as before (loot, crop seeds, decor, rare pets/mounts, chapter clears) plus **nycklar** and
**medals** displayed on the färdport (a row of nine dungeon badges with a Nivå number each).

---

## 7. What changes versus what is built

| System (file) | Verdict | Change |
| --- | --- | --- |
| `run.ts` constants (`RUN_MAX_MS` and nudges) | **keep** | the 30:00 soft target and the banners stay |
| `ZONES_PER_RUN = 3`, `ZONE_HP`, `ZONE_PACKS`, `SOLO_MERCY` | **replace** | route rows, `wingHp`, followers instead of mercy (§5.3) |
| `ZONE_TEMPLATES`, `RunBiome` (`run.ts`) | **change** | become *room layouts* for stops; biomes only look/ground in the world |
| `generateRun` (`runmap.ts`) | **replace** | `generateRoute(seed, {dungeon, level})` returns a graph of nodes (§2); `buildZone` becomes `buildStop` |
| `RunPlan`, `ZonePlan`, modifiers (`fler`, `segare`, …) | **change** | modifiers → levels and särdrag; plan carries the graph |
| `RunState` / `runsim.ts` `startRun` / `enterZone` / `tickRuns` | **change** | phases `zone|pick|victory|ended` → `stop|route|…`; route vote by position; Hacksilver, Sagoandan, levels |
| `offerRunor` and the vote (`pickRuna`, `rerollOffer`) | **change** | personal offers (§3.2); vote machinery reused for routes and party runor |
| `RUNOR` (38) and `EFFECT_KEYS` | **keep + extend** | add `tags`, `rarity`; new effect kinds for combos (small) |
| `SEED_TREE` (18) | **keep + extend** | fourth branch and talents; `g3` gives a 2nd Sagoandan |
| Sagafrön (`RUN_SEEDS`) | **change** | new earnings (§6) |
| `hireCompanion` / Hirdmannen | **replace** | Hirdfolk: 0–2 followers by missing role (§5.2); longhouse no longer a gate |
| `runbot.ts` `botStep` | **extend** | better tank/healer brains, pings; also the test bot (`careful`/`clumsy`) |
| Färdkost, farm effects, `effectFor` | **keep** | one more source: Kökets dagens |
| `longhall`, `smithy`, `herb_garden`, `stall` | **keep** (longhouse **change**) | longhouse = better Hird, not a gate |
| Saga chapters + Völvan | **keep** | chapters = runs of dungeons in order; Völvan tells which key you have |
| `DUNGEONS[...]` rooms | **change use** | halls for Mellanboss/Boss; room sizes for stops; `packs` define the roles |
| `SAGA_BOSSES` moves | **keep** | add an optional `lesson?: boolean` to the first phase if wanted; add Journal text |
| `SAGA_MOBS` | **extend** | add `role` and a caster per dungeon (`Besvärjare`); Stark vakt särdrag as a `trait` |
| `sagasim.ts` | **extend** | `RunBuffs` unchanged; add särdrag hooks (pools on death, quaking, orbs, bolstering) and threat target id in the snapshot |
| Loot (`SAGA_LOOT`, `SAGA_TREASURE`) | **keep + weight** | rarity by Nivå (§4.6) |
| Forge, gear, levels | **keep** | |
| Protocol | **change** | `run` `route` choice, offers per player, `purse`, `keys`, `journal`, followers in the party list |
| Godot windows | see below | |

**Godot windows that change:** `run_window.gd` (the arch: dungeon + Nivå + key + Hirdfolk toggle + färdkost), `run_pick.gd`
(→ a non-blocking personal card overlay), `run_hud.gd` (route rail along the top: row dots with icons, the Färdkassa, the
Sagoandan star, the tag bar), `run_end.gd` (medal, key, seed breakdown), `seed_window.gd` (fourth branch), **new**:
`route_view.gd` (väg-runor in the exit room and a full map overlay), `shop_window.gd`, `event_view.gd`,
`journal_window.gd`. The dungeon view (`dungeon_view.gd`) stays; `zone_props.gd` gets the stop kinds.

---

## 8. A phased plan of small PRs

Each is playable and checked by the existing bots (`pnpm test` in `shared`; the `bot-check.mts` run pair; the dungeon
pairs and boss shows in the Godot job). Keep every CI job under ~9 min: bots simulate in memory at 20 Hz without the client,
so extra routes are `it.each` over seeds with caps (the generator test at 200 seeds already runs ~120 s: do not add more
than ~60 s of new route tests), and the Godot workflow gains **one** short bot step per phase, not a new long one.

1. **R1 — never alone.** *The quickest win for the owner's case.* (`runsim.ts`, `run.ts`, `runbot.ts`, `run.test.ts`; no new
   systems.) Hire Hirdmannen for **any** single human without `longhall`, add a *second* follower when the human is not
   a Väktare/Helare, drop the longhouse gate on the fourth player (party max 4), keep `SOLO_MERCY` 0.75 for the first
   follower and 0.7 with two. Tests: the solo-hire test flips (no longhouse is fine), the party-max test updates; the bots
   (careful and clumsy) must win a solo run in 10–16 / 18–28 min. **Done when** the owner can solo Draugkryptan without
   building anything. ~1 evening.
2. **R2 — Lätt and the Sagoandan.** A `level` on the start message (`0|1`); Lätt multipliers (hp ×0.6, dmg ×0.5, warn +40 %);
   Sagoandan as a one-shot revive-all on a wipe; half sagafrön on Lätt. Bots: the clumsy solo bot wins Lätt ≥ 95 %.
3. **R3 — the route.** `generateRoute` + `buildStop`; stops of kind Flock, Mellanboss, Boss, Vilosten only; the walk-onto-a-
   rune vote; the HUD rail. Keep the v1 zone templates as layouts. The bots walk the graph (`runbot.ts` learns "pick the lane
   with the safe icon / random lane"). 10 rows ~28 min target; tune row sizes.
4. **R4 — runor v2.** Personal offers, rarities and tags, the card overlay, set bonuses, ~30 new runor (the combo tags come
   later). Test: every runa still "changes something" (the existing `every effect` test), plus a distribution test of rarity
   weights.
5. **R5 — Hacksilver and the Köpman, Händelser, Skatt, Stark vakt.** The other node kinds, ~10 events, the shop window;
   leftover → sagafrön.
6. **R6 — dungeon craft.** Pack recipes with roles, the Besvärjare, särdrag of a Stark vakt, patrols, the threat arrow
   (`SagaSnap.m`). Bots learn "kill the caster first".
7. **R7 — Nivåer, nycklar, medals, särdrag (affixes).** The ladder, the weekly rotation, the key per dungeon on the
   färdport; the end summary with medal.
8. **R8 — Äventyrsboken** (Journal) and the mechanics-language icons on the HUD and telegraphs; sagafrön for pages.
9. **R9 — the tree v2.** The Runor/Talanger/Karta/Prydnad nodes; talents; titles. The nine dungeons each get its first run
   check (the existing M6 jobs play the 8 dungeons + boss shows).
10. **R10 — the late game.** Sagans stege (random dungeon), the sets of gear if the owner wants them, more events.

**Tuning with the bots.** `runbot.ts` already has `careful` and `clumsy`. Extend with (a) a `kid7` style (clumsy plus 1.2×
pause and 40 % misses), (b) a tuning script `pnpm --filter shared run:tune --party 1h2f --level 1 --dungeon draug --runs 20`
that prints the table in §5.4 (time per route stop, win rate, wipes per stop, Sagoandan used). Acceptance for each PR is the
row in that table; the numbers in §5.3 are the first guess. The generator test (200 seeds, walkable, every stop reachable,
every gate opens) is kept and extended with "every route has a Vilosten and a Köpman reachable per wing".

---

## 9. Open questions for the owner (with a recommendation each)

1. **Party size and the longhouse.** Make the fourth player free for everyone, and the longhouse "better Hirdfolk"?
   *Recommend yes*: the gate protects nothing and caused the solo failure.
2. **Followers fill dps too, or only tank/healer?** *Recommend* tank and healer first, a dps only if the human is also not a dps
   (so a solo Krigare gets Väktare + Helare; a solo Väktare gets Helare + Magiker).
3. **Run length: ~30 min?** *Recommend* keep ~30 as a soft target but add a **"Kort färd"** option (rows 1–3 + Mellanboss + Boss,
   ~15 min) in the färdport for school nights, shipped after R3. Without it a 30-min run is hard to fit on a school day.
4. **Wipe: ends the run (Vanlig) or always back to the stone?** *Recommend* Sagoandan then end: a roguelite needs a lose
   condition, but the family promise is "nothing is lost", which the sagafrön already honour.
5. **Runor personal or voted?** *Recommend personal*, with voting only for the route and party runor (§3.2).
6. **Shared purse or individual coins?** *Recommend shared* (fewer fights over loot, simpler for the 7-year-old).
7. **Timer: medals only, or also a key drop for slow runs?** *Recommend* medals only; keys never go down.
8. **Gear sets (WoW feel) now or later?** *Recommend later* (R10): runor already give the build identity.
9. **Särdrag severity: include "Bursting"/"Spiteful"-style punishing ones?** *Recommend no*; keep the list in §4.7 and add only
   if the ladder (Nivå 7–10) is too easy for the adults.
10. **What happens to the biome variety and the 7 zone looks?** *Recommend* the dungeon-per-chapter run of §2.4, with biome
    layouts reused as room shapes and the mixed-biome route moved to Sagans stege (R10), so no art is lost.
11. **Do we keep the open-world arches?** `OPEN_WORLD.md` is in flight; this design only needs the **färdport** to remain the
    entry and the world arches (one per dungeon) to open the same window with that dungeon pre-chosen. *Recommend yes.*
12. **Does the kid-readability bar hold?** 80 runor, 8 tags, 8 affixes, 16 events is a lot of text for a 7-year-old. *Recommend* play-test R4
    with both kids before R5, and cut any card that needs the parent to explain it.
