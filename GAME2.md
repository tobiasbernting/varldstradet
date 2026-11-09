# GAME2.md: Färden, version 2 — the runs are the game

Written 2026-11-07, design only (no code changes); R1, R2 and R3 of section 8 are built since (marked there; what R3 built and measured is section 5.6). Replaces the *shape* of the run in `GAME.md` (approved 2026-11-06) and
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

*R3 built the rules that apply to the kinds it has (Flock, Mellanboss, Vilosten, Boss): section 5.6 lists them. The Köpman, Händelse, Skatt and Stark vakt lanes come with R5.*

### 2.2 How a route is chosen (co-op)

At the end of a stop, once the gate is open, the exit room shows **up to three väg-runor** on the floor — glowing discs
(the `run_exit` rune disc already exists), each with the next stop's icon. A player **walks onto the one they want**; their
name tag floats over it. When **all online humans stand on a rune**, or **20 s** after the first one stepped on one, the
rune with most players wins; ties go to the **Stigfinnare** (path-finder): the party member whose turn it is, rotating each
row and shown with a small compass on their head (so the 7-year-old gets to decide too). Nobody is pulled by a window; the
vote is spatial and visible, which suits kids better than a menu. Followers never vote.

This reuses the machinery of `offerRunor`'s vote (strict majority, 20 s, ties to the first), moved from cards to discs (R3: `tally` in `run.ts` is the one rule of both votes; the exact rules of the discs are in section 5.6).

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
* **Sagoandan** 🌟 — one per run (two with the tree node `g3`, three on Lätt; **built in R2 without `g3`**, section 5.5): when everyone is down, the party is up at the
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

### 5.5 What R2 built, and what the bots measured

**Built** (`run.ts`, `runsim.ts`, `sagasim.ts`, `saga.ts`, `protocol.ts`; the Godot arch window, HUD and end summary):

* `run start` takes `level: 0 | 1` (left out = Vanlig, so old clients are unchanged). Anything else (`2`, `"0"`, `0.5`, `null`) is
  refused with a toast and starts nothing. The level is fixed for the run and is in the `RunSnap` (`level`, `spirit`,
  `spiritUsed`) and in the end summary (`level`, `spiritUsed`).
* **Lätt** (`LATT` in `run.ts`): monster hp ×0.6 and boss hp ×0.6 (the zone's own multipliers stay under it), damage ×0.5, the
  boss's telegraph warnings ×1.4 (`warnMul`: the ground marks, the cast timer and the snapshot's `warn` all use it), the boss
  and the zones' guards use only their first two attacks (`lattMoves()`: indices 0 and 1, whatever a first run's plan has locked), and what the boss calls in (phase adds, summons, the ice and web blocks) is ×0.6 too (`levelHp`), half the sagafrön (`pay` multiplies by 0.5; the
  bonuses of runor and the tree still count, and the remainder is carried), and a wipe never ends the run. Followers were
  already 0 % mistakes (the Hirdmannen is a careful bot). No Stark vakt, patrols or särdrag exist yet.
* **The Sagoandan** (`SAGOANDAN`): Vanlig 1, Lätt 3, and on Lätt one more each time a zone is entered after the first ("after each
  stop"). On a wipe the pause (`WIPE_MS`) shows a gold banner "Sagoandan hjälper er!" (kind `level`, not the sad `wipe`), then
  everyone is up at the last rest stone with **50 %** health (`SAGOANDAN_HP`), fighting monsters reset, the count goes down.
  A Lätt wipe with none left is the same banner "Ingen fara!", everyone up at full health, and nothing is counted off:
  Lätt never ends on a wipe. On Vanlig the next wipe ends the run as before. After the boss has fallen a Sagoandan is no longer used: on Vanlig a wipe then
  ends the run as a win (as before); on Lätt everyone just gets up free and the run goes on to the chest. The star on the HUD shows the count (and the word Lätt); the end summary has "Sagoandar använda".
* The tree node `g3` ("two Sagoandar") of section 4.5 is **not** built: `g3` is still the reroll node until the tree v2 (R9).
* The arch window has two big buttons, **Lätt** and **Vanlig** (Vanlig lit by default; the choice is remembered while the game
  runs), each with one line of text: "Snällare monster. Alla reser sig igen om ni faller." / "Som vanligt. En Sagoande hjälper er en gång."
* `runbot.ts`: a fighter whose target is close but behind a wall (no line of sight) now walks round to see it instead of
  standing still. Before this, a solo Magiker on Lätt got stuck for 40 minutes on 2 of 20 seeds (4 and 13: a sjödraug against a
  wall that nobody could hit, a stalemate that on Vanlig showed up as a wipe); it was a bot defect, not a number.
* Tuning script: `node --experimental-transform-types packages/shared/src/runtune.ts --level 0 --style clumsy --seeds 20 [--from 1]`
  prints the table below (`run.test.ts` keeps the CI versions: 12 seeds per Lätt party). (GAME2 section 8 called it `run:tune`.)

**Measured** (level-3 heroes in the starter set, Draugkryptan, the Hirdmannen hired, no longhouse; the human is the bot style named;
wins per run, "wipes" is runs that *ended* on a wipe; minutes are until the boss falls, for the won runs):

| Party | Level | Style | Seeds | Wins | Ended on wipe | Minutes (avg, min–max) |
| --- | --- | --- | --- | --- | --- | --- |
| ensam väktare | Lätt | clumsy | 1–40 | 40/40 | 0 | 13.3 (10.3–16.8) |
| ensam helare | Lätt | clumsy | 1–40 | 40/40 | 0 | 11.4 (9.3–13.9) |
| ensam krigare | Lätt | clumsy | 1–40 | 40/40 | 0 | 10.8 (8.3–13.7) |
| ensam magiker | Lätt | clumsy | 1–40 | 40/40 | 0 | 13.1 (9.9–15.5) |
| krigare + magiker | Lätt | clumsy | 1–40 | 40/40 | 0 | 12.7 (9.7–16.3) |
| väktare + helare | Lätt | clumsy | 1–40 | 40/40 | 0 | 18.0 (14.0–21.5) |
| ensam väktare / helare / krigare / magiker | Lätt | careful | 1–20 | 20/20 each | 0 | 6.3 / 6.4 / 4.6 / 6.4 |
| ensam väktare / helare / krigare / magiker | Vanlig | clumsy | 1–20 | 20/20 each | 0 | 17.5 / 16.3 / 13.9 / 17.4 |
| ensam väktare / helare / krigare / magiker | Vanlig | careful | 1–20 | 20/20 each | 0 | 9.9 / 10.1 / 6.9 / 10.6 |
| krigare + magiker / väktare + helare | Vanlig | clumsy | 1–20 | 20/20 each | 0 | 17.3 / 24.3 |

Two things to read honestly. (1) The bots **never wipe** on Lätt, so the Sagoandan and the free Lätt wipe are exercised by the
unit tests (`Lätt and the Sagoandan` in `run.test.ts`), not by the bot runs; Lätt is much easier than the target of 95 %.
Only a real kid on the MacBook can say whether it is *too* easy. (2) The minutes are the three-zone run of today (about
10–18 min for a clumsy solo bot, against the 15–20 of the §5.4 target); the 10-stop route of R3 is what lengthens it. The Vanlig
numbers are the clumsy and careful rows of GAME.md section 9 measured again after the line-of-sight fix above (every solo class 20/20;
GAME.md had 19/20 for the careful Magiker and the clumsy Helare); the Vanlig monsters did not change.

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

### 5.6 What R3 built, and what the bots measured

**Built** (`run.ts`, `runmap.ts`, `runsim.ts`, `runbot.ts`, `saga.ts`, `protocol.ts`; the Godot HUD rail, `route_view.gd`, the arch window, the end summary and the run pair bot):

* **The route** (`generateRoute(seed, {dungeon, level})`): ten rows, node kinds `flock | mini | rest | boss` (the others come with R5). Row 1 is one Flock, row 5 the Mellanboss, row 9 the last Vilosten, row 10 the Boss; rows 2–4 and 6–8 have two or
  three lanes (45 % three); rows 4 and 8 always have **one** Vilosten (the safe lane), and every stop of the row before can walk to it; rows 2 and 6 have one now and then (30 %); rows 3 and 7 never (no two in a row). Every
  stop has a way in and a way on (so all can be reached and all lead to the boss), a node leads to the nearest lane of the next row and sometimes to its neighbour as well. The generator test makes 300 routes (every dungeon)
  and checks all of that and that a Vilosten can be reached in each wing; the level does not change the map.
* **The stops** (`generateRun` adds the plan of every node; `buildStop(plan, node, key)` builds one map with `sagamap.buildDungeon`): the chapter's own floor, walls, light and decor and its monsters (`dungeonMobs`: the dungeon's
  species by health, the weakest as "small", the strongest as "big"). A **Flock** is laid out in the start room, the two rooms of packs and the exit room of one of the seven biome templates (the rest stone and the side room go; the exit room
  is behind the gate); 3 + 3 packs of 4–5 (Lätt 2 + 2–3 packs of 3–4). A **Vilosten** is start, the stone's room and the exit room (no gate, no packs). The **Mellanboss** stop is start, a room of three packs, the dungeon's own mid-boss hall and the
  exit room behind the gate it opens. The **Boss** stop is start, a room of three packs and the dungeon's own boss hall (with the replay modifier `vakten`, a guard before it). Monster health by wing is `WING_HP` = 1.6 / 1.75 / 1.95 (rows 1–4,
  5–8, 9–10) on top of the saga's party scaling, times `SOLO_MERCY` for one human with the Hirdmannen (kept: the `fightersEff` scaling of §5.3 is later work).
* **The flow of a stop**: fight → the gate opens (a Flock) or the Mellanboss falls → sagafrön for the stop (3, the mid-boss 5, a pack still 1) → the **cards** of a runa as before (`pick`, started at once now, not by using the exit; a Vilosten has none) → the
  **väg-runor** appear on the floor of the exit room (`run_exit`, one for each stop the next row leads to, the object's variant is the kind of stop and decides the glow) → the vote → the next stop.
* **The vote on the way on** (`tickRoute`): a player counts on the rune within 1 tile of its middle, after **1 s** on it (so crossing a rune on the way to another is no vote; pressing the action key on it counts at once, for key and pad
  players); the vote ends when **every online human in the stop** is on a rune, or **20 s after the first** player stepped onto one (it waits for ever with nobody on one); the rune with **most players** wins and a **tie goes to the Stigfinnare**
  if they stand on one of the tied runes, else to the rune stood on first. The Stigfinnare is the human whose turn it is, in party order, one step on after every vote; followers and offline players never vote; a friend who joins during the cards waits
  on the farm and is brought into the next stop; one who joins during the vote is put at the stone and is asked. `tally` (`run.ts`) is the one rule of both votes. The state names the runes, who stands on each and the seconds left; the client shows
  the stop's picture and the names on each rune, a ring that fills while I stand on one and a 🧭 over the Stigfinnare's head (when two humans or more play).
* **The Vilosten**: when the party arrives it gets 40 % of its maximum health back and everyone who had fallen up (`VILOSTEN_HEAL`); the stone in its middle heals as any rest stone does. No cards and no sagafrön for the stop. (The choice
  Vila / Skärp en runa waits for R4.)
* **A run is one dungeon**: `run start` takes `dungeon` (an id); a player may run the dungeons they have cleared and the next in the saga's order (`runnableDungeons`), anything else is refused with a toast (`RUN_T.badDungeon`); left out it is the player's
  current chapter (or, with `replay`, a cleared one at random, as before). The arch window has a ◀ ▶ row for it (the default is the current chapter). PR 31's world arches were not on main when R3 began, so the window only offers
  `RunWindow.preset` (set it to a dungeon id before opening the window, and the window starts with that dungeon chosen); the arches should set it.
* **Lätt**: the Sagoandan after each stop comes up to **5** at a time (the route has ten stops: `SAGOANDAN_LATT_MAX`), and Lätt has smaller packs (`LATT_*_PACKS`), on top of R2's multipliers.
* **Earnings**: a pack 1, a stop 3 (was 4 for a zone), the mid-boss 5 (the old guard's 3), the boss 20/12 as before (`RUN_SEEDS`).
* **The client**: the **rail** on the clock panel (a picture for each of the ten rows: the stops walked, the one now lit and larger, the mid-boss, last rest and boss to come, a dot for the rest, and "Steg 3 av 10 · Första vingen"), the **map**
  (R, or the pad's misc button: ten columns, the three wings, the walked path in gold, the ways on in green, where we are ringed; the world goes on behind it), the rune marks and the compass above, the glow of a rune by the stop it leads to
  (teal Flock, green Vilosten, amber Mellanboss, red Boss), the route taken on the summary, the ◀ ▶ dungeon row. `Data.zone_look` is the chapter's dungeon for every stop.
* **Bots**: `BotMind.lane` — the careful bot takes the safe lane (a Vilosten when it or a friend is below 70 %/60 % health or there is no fight to take, else a fight), the clumsy bot a random lane; both walk onto the rune and stay. At a Vilosten they rest to 90 %
  first. The run pair bot of the Godot job takes `--lane=rest` (the Vilosten whenever one is offered) and stops at `--rows=5`, the first wing walked.

**Measured** (level-3 heroes in the starter set, Draugkryptan, the Hirdmannen hired, no longhouse, seeds 1–20 for the one-hero rows; the human is the bot style named; "min" is until the boss falls; `runtune.ts`):

| Party | Level | Style | Wins | Ended on wipe | Minutes (avg, min–max) |
| --- | --- | --- | --- | --- | --- |
| ensam väktare / helare / krigare / magiker | Vanlig | careful | 20/20 each | 0 | 19.6 (17.6–22.5) / 18.4 (15.9–21.9) / 13.2 (11.6–15.9) / 17.5 (15.2–20.9) |
| ensam väktare / helare / krigare / magiker | Vanlig | clumsy | 20/20 each | 0 | 35.9 (31.8–40.3) / 31.2 (26.1–35.5) / 27.3 (22.3–32.5) / 32.8 (27.4–38.7) |
| krigare + magiker | Vanlig | careful / clumsy | 20/20 / 20/20 | 0 | 16.3 (14.0–17.4) / 33.3 (28.1–38.5) |
| väktare + helare (no follower) | Vanlig | careful / clumsy | 20/20 / 20/20 | 0 | 24.3 (20.3–29.1) / 47.6 (39.9–54.9) |
| ensam väktare / helare / krigare / magiker | Lätt | careful | 20/20 each | 0 | 10.4 (8.8–11.6) / 10.5 (8.9–11.7) / 7.8 (6.7–8.4) / 9.2 (7.8–9.9) |
| ensam väktare / helare / krigare / magiker | Lätt | clumsy | 20/20 each | 0 | 24.6 (20.3–28.6) / 21.2 (18.5–23.6) / 20.4 (17.2–23.0) / 23.0 (19.1–25.5) |
| krigare + magiker / väktare + helare | Lätt | clumsy | 20/20 each | 0 | 23.2 (19.7–26.3) / 32.4 (25.7–38.3) |
| tre spelare (väktare, helare, magiker) | Vanlig | careful / clumsy | 3/3 each (seeds 1–3, the CI test) | 0 | 19.0 (17.6–19.8) / 37.0 (34.9–39.7) |
| fyra spelare (all four classes) | Vanlig | careful / clumsy | 3/3 each (seeds 1–3, the CI test) | 0 | 16.1 (14.9–16.7) / 32.4 (29.3–36.8) |

The route a bot walks has on average 5.3–6.6 Flocks and 1.4–2.8 Vilosten (row 9 always one) of its ten stops. The careful bot takes a Vilosten when it or a friend is hurt (so 1.8–2.8 Vilosten on Vanlig and fewer on Lätt, where it is seldom hurt), the clumsy bot a random lane.
The other eight dungeons run through too: the careful solo bots (level-3 heroes in the starter set, seeds 1–2) finish every one of them, in 15–46 minutes when they win (Frostjättens borg 15.5–27.3, Surts smedja 17.2–33.7, Helheim 17.9–25.1, Svartalfheims gruvor 20.7–34.4,
Havsormens tempel 22.0–34.3, Alvernas lund 33.0–35.8, Fenrisklyftan 32.4–46.1, Bifrost 25.0–33.7); a solo Krigare or Magiker wipes a run in Alvernas lund and Fenrisklyftan, where a level-3 hero is weak. This is the stall check (no run hangs; `run.bots.test.ts` runs it for all nine), not a tuning of those chapters.
A sagafrön count: a careful Krigare earns **93 per run on Vanlig** (79–107) and **49 on Lätt**; GAME2 §6 aimed at 55–65, because a Flock has 6 packs (1 each) and a stop pays 3. Left as it is for the owner to decide; `RUN_SEEDS.pack` at ⅓ would give about 60.

**Reading this honestly.**

1. *The two time targets cannot both hold with these bots.* R3's brief asked for the careful bot in about 20–28 minutes and the clumsy bot in 28–35. The clumsy bot is about 1.9 times the careful one (its pauses between moves and its misses make it walk and fight far slower), so the two
   ranges are 1.4 times apart and cannot be met together. The numbers here put the **clumsy bot (the 9-year-old) at 27–36 (avg 32)** and the **careful bot at 13–20 (avg 17)**, which with §5.4's own calibration (an adult is about 1.7 times the careful bot) is **an adult at 22–33 minutes**,
   against §1's "careful adult 20–28". A real adult is the thing to measure on the MacBook. The levers are `WING_HP` and `FLOCK_PACKS`; raising the careful bot to 20 minutes would put the clumsy one near 38. Lätt: the careful bot 8–11 (as §5.4's 8–11), the clumsy bot 20–25 (§5.4 wanted 15–20; R2's 11–18 was for three zones).
2. *The Flock is not "1–2 packs".* GAME2 §2.3 imagined a Flock of two minutes for a careful adult; the bots need ten stops to take 15–35 minutes, so a Flock has 6 packs here, and a route has about 6 Flocks, 2 Vilosten, the Mellanboss and the Boss. Fewer, smaller Flocks and more stop kinds
   (Händelse, Köpman, Skatt, R5) are the way back to the design's idea; the tables will need re-tuning then.
3. *A tank and a healer together are slow.* Two humans who are Väktare and Helare get no follower (`companionClass`) and their damage is small: the clumsy pair needs about 48 minutes (the careful pair 24). GAME2 §5.2 gives them a dps follower; that is not built yet and is the first thing to build for a parent
   and a child who play those two.
4. *The Lätt bot rows* never wipe, as in R2: the Sagoandan and the free Lätt wipe are exercised by the unit tests, not by the bot runs.
5. *Where the time goes.* A good part of a clumsy run is walking (64 × 64 tile maps with long corridors; the Flock layouts are the templates of v1, and the clumsy bot pauses between steps). Shorter corridors would shorten the run without touching a monster, and are the first lever if the kids find it long.

### 5.7 Five levels per run (L1), and what the bots measured

The arch chooses one of five levels (`RUN_LEVELS` in `run.ts`; names, one-line blurbs and pictures in `sv.ts`: `T.runLevelName/Blurb/Icon[level]`; `RUN_LEVEL_IDS`). Lätt and Medel are exactly the old Lätt (R2) and Vanlig; a start message with no `level` is **Medel (2)**.

| Level | Hp | Dmg | Warning | Sagoandar (start, +per stop, max) | Wipe | Sagafrön | Rare finds / rarer gear | Särdrag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 Mycket lätt | ×0.4 | ×0.3 | ×1.8 | 5, +1, 5 | never ends the run | ×0.35 | ×0.6 / – | 0 |
| 1 Lätt | ×0.6 | ×0.5 | ×1.4 | 3, +1, 5 | never ends the run | ×0.5 | ×1 / – | 0 |
| 2 Medel | ×1 | ×1 | ×1 | 1 | ends the run after the one | ×1 | ×1 / – | 0 |
| 3 Svår | ×1.65 | ×1.6 | ×0.8 | 1 | as Medel | ×1.5 | ×1.5 / +0.5 weight per rarity step | 1 |
| 4 Extrem | ×1.9 | ×1.6 | ×0.65 | none | the first wipe ends the run | ×2 | ×2 / +1.0 weight per rarity step | 2 |

Levels 0 and 1 use only the boss's first two attacks and the small packs of Lätt. "Rare finds" multiplies the chance of a chest's rare items; "rarer gear" adds weight to a piece of gear for every step above common (uncommon 1 … legendary 4). Nobody loses anything they own on any level.

**Särdrag** (`AFFIXES`, in `plan.modifiers` and so in `RunSnap.modifiers`, named by `MODIFIER_NAMES/TEXT/ICON`; drawn from the seed, after any replay modifiers): **Stålhud** (packs +20 % health), **Stormig** (bosses and mid-bosses +20 % health, bosses +10 % damage), **Stärkande** (each fallen pack member makes the rest hit 10 % harder), **Jakten** (a monster below 25 % health is 1.4 times as fast and quick, and hits 15 % harder). Skälvning, Sprängbär, Mörkret, Glödpölar are still to do (they need new effects on the ground).

**Measured** (`runtune.ts --level n --style careful|clumsy|kid7`, level-3 heroes in the starter set, the Hirdmannen hired where the party allows, Draugkryptan; the `kid7` bot is clumsy with 1.2 times the thinking pause and 40 % misses):

| Party | Level | Bot | Seeds | Wins | Minutes (avg) |
| --- | --- | --- | --- | --- | --- |
| ensam väktare / helare / krigare / magiker | 0 | kid7 | 1-8 | 8/8 each, no wipe | 24.5 / 22.7 / 21.4 / 24.6 |
| ensam (all four) | 1 | clumsy | 1-6 | 6/6 each | 25.0 / 21.6 / 21.0 / 23.5 |
| ensam (all four) | 2 | careful | 1-6 | 6/6 each | 18.6 / 18.8 / 13.2 / 17.5 |
| krigare + magiker | 3 | careful | 1-16 | 11/16 (69 %) | 27.1 |
| väktare + krigare | 3 | careful | 1-12 | 12/12 | 27.9 (at hp 1.7, dmg 1.6) |
| krigare + magiker | 4 | careful | 1-16 | 3/16 (19 %) | 32.0 |
| väktare + krigare / helare + magiker | 4 | careful | 1-12 | 9/12 / 8/12 | 31.5 / 37.3 |

The damage multiplier is a cliff: at ×1.5 the Krigare + Magiker pair wins every Svår run, at ×1.8 it wins 3 of 8; the numbers above sit just on the right side of it. **A Väktare in the party makes the hard levels much easier** (taunt and shield): the pair with a tank wins Svår always and Extrem about 70-75 %, so the 50-75 % and 15-40 % targets hold for the party without a tank (the fragile case: two adults who play Krigare and Magiker) and are missed upward for parties with one. A tank-aware tuning (more damage per tank, or a särdrag that ignores taunt) is the next lever. `run.hard.test.ts` keeps Svår (3-7 wins of 8) and Extrem (1-4 of 8) for Krigare + Magiker; `run.latt.test.ts` keeps level 0 (kid7) and 1 (clumsy) at 6/6 with no wipe.

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
| `ZONES_PER_RUN = 3`, `ZONE_HP`, `ZONE_PACKS`, `SOLO_MERCY` | **replace** | route rows, `wingHp`, followers instead of mercy (§5.3). **R3 did** `ZONES_PER_RUN` → `ROUTE_ROWS`, `ZONE_HP` → `WING_HP`, `ZONE_PACKS` → `FLOCK_PACKS`; `SOLO_MERCY` stays until the `fightersEff` scaling (§5.3) is built |
| `ZONE_TEMPLATES`, `RunBiome` (`run.ts`) | **change** | become *room layouts* for stops; biomes only look/ground in the world |
| `generateRun` (`runmap.ts`) | **replace** | `generateRoute(seed, {dungeon, level})` returns a graph of nodes (§2); `buildZone` becomes `buildStop`. **Done in R3**; `generateRun` stays as the wrapper that adds the plan of every stop |
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

1. **R1 — never alone.** **Done (PR 34).** *The quickest win for the owner's case.* (`runsim.ts`, `run.ts`, `runbot.ts`, `run.test.ts`; no new
   systems.) Hire Hirdmannen for **any** single human without `longhall`, add a *second* follower when the human is not
   a Väktare/Helare, drop the longhouse gate on the fourth player (party max 4), keep `SOLO_MERCY` 0.75 for the first
   follower and 0.7 with two. Tests: the solo-hire test flips (no longhouse is fine), the party-max test updates; the bots
   (careful and clumsy) must win a solo run in 10–16 / 18–28 min. **Done when** the owner can solo Draugkryptan without
   building anything. ~1 evening.
2. **R2 — Lätt and the Sagoandan.** **Done (2026-11-07).** A `level` on the start message (`0|1`); Lätt multipliers (hp ×0.6, dmg ×0.5, warn +40 %);
   Sagoandan as a one-shot revive-all on a wipe; half sagafrön on Lätt. Bots: the clumsy solo bot wins Lätt ≥ 95 %.
   What was built and measured is in section 5.5.
3. **R3 — the route.** **Done (2026-11-07).** What was built and measured is section 5.6. `generateRoute` + `buildStop`; stops of kind Flock, Mellanboss, Boss, Vilosten only; the walk-onto-a-
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

## 9. Looks: cool gear that is only for show (built)

Gear gives no power: damage, healing, health and armor come from the class, the hero level (+1.5 % per level) and a flat base
(`BASE_POWER/ARMOR/HP` in saga.ts, what the starter set used to give, so the bot tables of 5.6 did not move). The forge's levels and the
chest's weapons/shields/amulets are gone. Instead (`shared/src/looks.ts`, art in `packages/art/src/looks.ts`, effects in
`packages/clientljs/src/looksfx.ts`, window in `packages/client/src/ui/looks.ts`):

- Ten Norse sets (two per class, two for any class; Helheim gives two), four pieces each over seven slots (hat, shoulders, shirt, cloak,
  weapon, offhand, amulet), plus the signature weapons Mjölner, Gungner, Frostbett and Surts eldsvärd (any class).
- Shine tier 1-5 (plain, trimmed, glowing, one effect, full effect with an aura). Each completed dungeon, at ANY level, gives each
  member a new piece or +1 shine (never a duplicate; 4 + 16 clears fill a set). The signature weapon: 10 % per clear, certain at the 8th.
- Svår and Extrem add one exclusive colourway and a title per dungeon (palette swaps, not flashier).
- Class sets are worn only by their class (wear is stored per class); Garderoben (key G, the HUD's shirt button) dresses any class.
- Effects are a pooled vocabulary with a cap of 8 particles per player and 120 overall, drawn under the dungeon's telegraphs;
  "Effekter: full / mindre / av" is stored on the device (reduced motion forces "mindre").
