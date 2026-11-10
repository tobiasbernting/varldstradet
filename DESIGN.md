# Sagan om Världsträdet: design

This is the design of the game as it is built. Code and tests are the source of truth; where a file is named it holds the
numbers. Swedish names and strings are quoted as they appear in the game (all of them live in
`packages/shared/src/sv.ts`). Running the game is in [README.md](README.md); adding content is in
[CONTRIBUTING.md](CONTRIBUTING.md).

The game grew out of a family farm game, "Lilla Gården", and kept its server, protocol and art pipeline; the farm, the open
world and the native client that were tried in between are gone. Hence the `@lilla-garden/*` package names.

Code comments and tests refer to sections by number (for example "DESIGN.md 5.7"); keep the numbers stable when editing.

## 1. The game and the loop

A co-op Norse-mythology roguelike in the browser for a family. The players are kids (the youngest is 7) with their friends
on tablets, and adults on computers; touch, keyboard and gamepad all work; the UI is Swedish. The design rules that
follow from that:

- **A 7-year-old can win.** Mycket lätt is tuned for a clumsy child alone with the Hirdmannen (section 5.4).
- **Nothing bleeds, monsters poof, nothing you own is lost.** A wipe ends the run at most; everything earned in a run is
  paid out at once and kept.
- **Gear and hero levels give no power.** Power comes from the class, the run's runor and path, and the sagaträd. Gear,
  looks and levels are for show (sections 4.4 and 7.3).
- **No reading required to play.** Big pictures, one short sentence on every card, an info card for everything
  (section 9).

```
  GÅRDEN (the lobby)                          A RUN (färd): one dungeon, ten rows
  ───────────────────                         ──────────────────────────────────
  Völvan Sigrun: saga chapter                 Flock ▸ ... ▸ MELLANBOSS ▸ path chosen ▸ ... ▸ Vilosten ▸ BOSS
  Kämpastenen: pick a class                   per stop: fight / event / Köpman / rest / Skatt / Stark vakt
  Färdporten: dungeon + level + pet           personal runor, shared hacksilver, Sagoandar
  Yggdrasil shoot: plant sagafrön  ◀────────  sagafrön, looks, pet gear, trophy, hero xp
  Wardrobe, house, kennel, Smed-Stina
```

What a player keeps between runs: sagafrön and the nodes planted in the sagaträd (section 6), the chapters cleared
(a dungeon is runnable when it is cleared or is the next one in the saga's order, `runnableDungeons`), looks and pet gear
(section 7), pets, boss trophies and titles, hero experience, and the family's best time per dungeon. A run itself is never
saved.

Chapters (`SAGA_CHAPTERS` in `saga.ts`): eleven, told by Völvan Sigrun: "Völvans dröm" (choose a class), the nine dungeon chapters
(section 2.4), and "Viskningar i mörkret" (listen) as the fifth.

## 2. The run

### 2.1 Shape and stop kinds

A run is one dungeon (a chapter) as a route: a graph of ten rows of stops, one to three lanes wide
(`generateRoute` in `runmap.ts`, deterministic from the seed). The route only decides which stops there are; the level does
not change the map.

| Row | Stop |
| --- | --- |
| 1 | a Flock, always (one lane) |
| 2, 3 | 2 or 3 lanes (45 % three), free lanes |
| 4 | 2 or 3 lanes, one of them always a Vilosten, reachable from every stop of row 3 |
| 5 | the Mellanboss, always (one lane) |
| 6, 7 | 2 or 3 lanes, free lanes |
| 8 | 2 or 3 lanes, one always a Vilosten, reachable from every stop of row 7 |
| 9 | a Vilosten, always (one lane) |
| 10 | the Boss, always (one lane) |

Wings: rows 1 to 4 "Första vingen", 5 to 8 "Andra vingen", 9 to 10 "Hallen" (`wingOf`). A Vilosten also turns up on rows 2
and 6 now and then (30 %), never on rows 3 and 7. Every stop has a way in and a way on, so every stop can be reached and
leads to the boss.

Each free lane starts as a roll: 18 % Händelse, 10 % Skatt, 12 % Stark vakt (from row 3, and only on levels Medel and up),
7 % Köpman, otherwise Flock. Fix-ups follow: never two Händelser in the same row, every row keeps a Flock or a Vilosten, and each
of the first two wings gets a Köpman, so one is reachable on every route.

| Kind (`NodeKind`) | Swedish | What happens |
| --- | --- | --- |
| `flock` | Flock | Two rooms of packs and a gate that opens when the required packs are down. Pays sagafrön (1 a pack, 3 for the stop), hacksilver, and one runa offer each. |
| `elite` | Stark vakt | Fewer, bigger packs with two big monsters, 1.25 times the health (`ELITE_HP`). Pays double sagafrön for the stop, 12 hacksilver, and a better runa offer. Not on Mycket lätt or Lätt (a plain Flock there). |
| `treasure` | Skatt | A smaller fight (two or three packs of 3 to 4). Pays 20 hacksilver and a better runa offer. |
| `mini` | Mellanboss | The dungeon's mid-boss in its own hall. Pays 5 sagafrön for the mid-boss and 3 for the stop, 40 hacksilver; then every hero chooses a path (4.2) and gets runa cards, and the whole party gets a *sällsynt* party runa. |
| `rest` | Vilosten | No monsters. Heals everyone 40 % of their health and gets up all who had fallen (`VILOSTEN_HEAL`). Each hero then chooses once: *Vila* (a quarter of their health more) or *skärp en runa* (3.3). No cards, no sagafrön. |
| `shop` | Köpman | Bram's camp, no monsters (3.4). |
| `event` | Händelse | A glade with a picture, a story line and two or three choices (2.5). Never costs health. |
| `boss` | Boss | The dungeon's boss with all its telegraphs (2.4). |

### 2.2 Choosing the way on

When a stop is cleared and the cards are taken, one **väg-runa** (a glowing disc, `run_exit`) appears on the floor of the exit
room for each stop the next row leads to. A rune glows in a colour by the kind of stop and carries a label with the stop's
picture and name and the names of whoever stands on it. Players walk onto the one they want (`tickRoute` in `runsim.ts`):

- A player counts on a rune within 1 tile of its middle after 1 s on it (`ROUTE_DWELL_MS`), so crossing a rune is no vote;
  using it (the action key) counts at once, for key and pad players.
- The vote ends when every online human in the stop is on a rune, or 20 s after the first player stepped onto one
  (`ROUTE_VOTE_MS`); it waits for ever while nobody is on one.
- The rune with most players wins. A tie goes to the **Stigfinnare**, the human whose turn it is (party order, one step on
  after every vote, shown with a compass over their head) if they stand on one of the tied runes, else to the rune
  someone stood on first. Hirdmannen and offline players never vote.

`tally` in `run.ts` is the one counting rule behind every vote of a run (cards, events, the way on): a strict majority ends it
at once, so does everyone having voted, and so does the clock. The time to vote on cards, paths and events is 60 s on Mycket
lätt and Lätt and 30 s otherwise (`runPickMs`). A player who does not choose gets the first card, the class's first path, or an
event's first free choice, so a slow friend never holds the party.

### 2.3 What a stop is

Each stop is its own 64 by 64 tile map, built by `buildStop` in `runmap.ts` with the same builder as the saga's dungeons
(`sagamap.ts`), in the dungeon's own look (floor, walls, light, decor and monsters). The party is moved in by an instant
swap and the old map is dropped.

| Stop | Layout |
| --- | --- |
| Flock, Stark vakt, Skatt | One of seven room templates (`ZONE_TEMPLATES`: skog, trask, berg, strand, svamp, is, vulkan; mirrored at random): start room, two rooms of packs, exit room behind the gate. |
| Vilosten | Start room, a room with the rest stone, and the exit room. No gate, no packs. |
| Köpman, Händelse | The same, but the middle room is a glade with no stone and nobody fights. |
| Mellanboss | Start room, a room of three packs (two on Mycket lätt and Lätt), the dungeon's own mid-boss hall, the exit room behind the gate it opens. |
| Boss | Start room, a room of three packs, the boss hall. On a replay with the *Vakten* modifier a guard room comes before the hall. |

Packs in a Flock: three in each of the two rooms, 4 to 5 members each (a pack is never more than 6); from the second wing the
second room has one big monster. On Mycket lätt and Lätt: 2 and 2 to 3 packs of 3 to 4 (`LATT_FLOCK_PACKS`). Monster health
by wing is `WING_HP` = 1.85, 2.3, 2.7 (rows 1 to 4, 5 to 8, 9 to 10) on top of the fighter scaling in 5.1. The gate of a
Flock opens when its required packs are down; the Mellanboss opens its own.

When a stop is cleared: sagafrön and hacksilver are paid, a banner says so, then (Flock, Stark vakt, Skatt, Mellanboss) every
hero gets cards, then the runes appear. A Händelse goes straight to its vote; a Vilosten and a Köpman straight to the runes.

### 2.4 The nine dungeons

One chapter is one dungeon is one run. The order is the saga's (`DUNGEON_IDS`); a run may be started on any cleared dungeon
and on the next one. Every dungeon has three monster species (a fast swarmer, a big brute, often a shooter), a mid-boss and a
boss (`SAGA_BOSSES`). Bifrost's monsters are Loke's illusions of the earlier packs.

| # | Dungeon (id) | Mellanboss: attacks | Boss: attacks (`!` interruptible, `@n` from phase n) | Phases of the boss |
| --- | --- | --- | --- | --- |
| 1 | Draugkryptan (`draug`) | Gravväktaren: slam | Draugkungen Hrolf: cleave, rain@1, nova! | 0.66 / 0.33 |
| 2 | Frostjättens borg (`frost`) | Isbjörnen Kall: charge | Rimtursen: cleave, rain, freeze, nova!@1 | 0.5 |
| 3 | Surts smedja (`surt`) | Smeden Glöd: slam, pools | Surt: cleave, pools, nova!@2 | 0.7 / 0.4 |
| 5 | Helheim (`hel`) | Garm: charge, summon | Hel: pull, nova!, rain@1 | 0.66 / 0.33 |
| 6 | Svartalfheims gruvor (`dvarg`) | Järnväktaren: line, slam | Fafner: cleave, pools, mend!@1 | 0.6 / 0.3 |
| 7 | Havsormens tempel (`orm`) | Bläckis: pools, line | Jörmungandr: line, pull, nova!, rain@1 | 0.66 / 0.33 |
| 8 | Alvernas lund (`alv`) | Spindeldrottningen: freeze, rain | Nattmaran: nova!, pools, mend!@1, summon@2 | 0.6 / 0.3 |
| 9 | Fenrisklyftan (`fenrir`) | Sköll: charge, nova! | Fenrisulven: charge, cleave, summon@1, nova!@2 | 0.7 / 0.4 |
| 10 | Bifrost (`loke`) | Lokes skugga: rain, nova! | Loke: cleave, nova!@1, pools@2, mend!@2, pull@3, nova!@3, line@4 | 0.8 / 0.6 / 0.4 / 0.2 |

(The number is the saga chapter; chapters 1 to 3, 5 to 10.) Every boss attack is telegraphed on the ground for a warning time
before it lands, so the whole fight is readable. What the marks mean and what to do (the text is in `BossAbility.text` and
shown in the journal, "Dagboken"):

| Move | What it is | What you do |
| --- | --- | --- |
| `slam`, `rain`, `pools` | A circle (rain: one under each player; pools: burning ground that lingers) | Walk out of it |
| `cleave` | A cone in front of the boss | Go behind or beside it |
| `charge`, `line` | A strip or a rush at one player | Step off the strip or the circle |
| `freeze` | A friend is frozen (or webbed) in a block | Break the block |
| `pull` | Pulls everyone in | Run out |
| `summon` | Helpers appear | Switch to them |
| `nova!`, `mend!` | A cast with a long warning (a mend heals the boss) | Interrupt it: Sköldslag, Stormsteg or Isspjut, or run far from a nova |

Rules of the fights: a boss never gets angrier because you are slow (no enrage timer); a boss calls fewer helpers for a smaller
party. On the **first clear** of a chapter (not a replay), a boss with three or more attacks leaves out one of its later
attacks (never the first and never the interruptible one); a replay uses them all. On Mycket lätt and Lätt every boss and
mid-boss uses only its first two attacks (`RUN_LEVELS[l].bossMoves`).

The mid-boss and boss each have a chest. A boss's chest gives its full loot (coins, stars, an item, sometimes a pet or mount
by chance) once per in-game day per player, and a smaller chest after that (a third of the coins and a potion).
Chest items that are gear do nothing in a fight.

### 2.5 Events (Händelser)

Ten events, in `events.ts`; the stop picks one by the seed, never one already met in the run. The party votes (same rule as
elsewhere). **No choice takes health, a runa you hold, or progress**; a choice may cost hacksilver, and every event has a free
choice, which is also what the clock picks.

| Event (id) | Choices | Outcome |
| --- | --- | --- |
| Den hungriga trollungen (`trollunge`) | Ge bröd (20) · Smyg förbi | a *sällsynt* party runa · 10 hacksilver |
| Önskebrunnen (`brunn`) | Kasta 10 · Kasta 30 · Gå vidare | a *vanlig* party runa · a *sällsynt* one · 5 hacksilver |
| Den vilsna kråkan (`kraka`) | Följ kråkan · Jaga bort den | 30 hacksilver · 10 hacksilver and everyone heals 20 % |
| Runstenen som viskar (`runsten`) | Vänstra runan · Högra runan | an *ovanlig* party runa tagged liv or sköld · tagged åska or tur |
| Spökets skatt (`spoke`) | Öppna kistan · Prata med spöket | everyone gets their own cards (Skatt weights) · everyone heals 25 % and gets a potion |
| Gamla smedjan (`smedja`) | Skärp runor · Vässa vapnen | everyone sharpens one runa · everyone's spells +6 % for the run |
| Kistan med lås (`lasning`) | Dyrka upp den (15) · Slå sönder den | cards (Skatt weights) · 25 hacksilver |
| Den vandrande skalden (`skald`) | Lyssna · Klappa händerna | cooldowns 5 % faster for the run · 20 hacksilver |
| Sagoanden (`ande`) | Sköldanden · Hjärtanden · Spara anden | armor +5 % · health +8 % · one more Sagoande (at most 5) |
| Honungsträdet (`honung`) | Plocka honung · Klappa björnen | 2 potions each · everyone heals fully |

### 2.6 Starting, joining and ending a run

- A hero with a class stands at the färdport (the lobby's arch) and opens its window ("Färdporten"): dungeon (a ◀ ▶ row), level
  (five buttons; levels above a party member's cap are marked with a lock and who is capped), the Hirdmannen toggle when one
  would come, and the pet. **Starta!** takes everyone with a class within 6 tiles of the arch (`RUN_JOIN_RADIUS`), up to the
  party size (4.3). A start message with no level is Medel. There is one run at a time per server.
- Someone who arrives later can join a running run from the lobby (a free seat, a class, a level under their cap): they are put
  at the last lit rest stone of the stop, and a Hirdmannen steps aside for a real friend. Someone who joins while cards are out
  enters the next stop. Anyone can leave (they are sent home and the run goes on); the run ends when the last human leaves, or
  60 s after the last human went offline (`RUN_OFFLINE_END_MS`). A player who drops and comes back is put at the stop's last rest
  stone.
- **Time.** Thirty minutes is a target, not a limit (`RUN_MAX_MS`). While someone is online the clock runs: a gentle banner at
  25:00, "Dags att gå hem?" at 30:00 and every 10 minutes after. Nothing ends a run because of the clock.
- **Win.** When the boss falls the stop turns to a victory phase for 90 s (`RUN_VICTORY_MS`) to open the chest, then everyone is
  sent home to the arch. The chapter is cleared, the trophy and looks are awarded (section 7), the best time is recorded.
- **Loss.** See the Sagoandan in 4.5. When a run ends for any reason, what is left in Färdkassan becomes sagafrön (3.4) and
  everyone is sent home with what they earned; the run, its maps and the Hirdmannen are deleted.
- After a server restart a run is gone; players who reconnect are put in front of the arch.

## 3. Runor and hacksilver

### 3.1 Runor

A **runa** is a boon that lasts for the run (`runor.ts`; names and one-sentence texts in `sv.ts`: `RUNA_NAMES`, `RUNA_TEXT`).
68 exist: 14 for each class and 12 for the whole party.

- **Rarity** (`RunRarity`): vanlig, ovanlig, sällsynt, legendarisk (shown with ★ to ★★★★ and a coloured border). Of the 56 class
  runor: 21 vanlig, 20 ovanlig, 11 sällsynt, 4 legendarisk (one per class).
- **Class runor** help only that class and are offered only to it. **Party runor** (`cls` left out, 12 of them) help everyone,
  the Hirdmannen included. They never come from a personal offer but from events, the Mellanboss (a *sällsynt* one), and the
  Köpman.
- **Tags** (one or two on each runa): Eld 🔥, Is ❄️, Åska ⚡, Sköld 🛡️, Liv 💚, Hugg 🪓, Tur 🍀, Djur 🐾. Counting a hero's own runor and
  the party's, **two** of a tag give a small set bonus and **four** a bigger one (they add up):

| Tag | Two | Four (in addition) |
| --- | --- | --- |
| Eld | "Glöden": spells +3 % | "Brasan": spells +4 %, life steal 2 % |
| Is | "Frostskalet": take 3 % less | "Glaciären": take 3 % less, cooldowns 3 % faster |
| Åska | "Gnistan": cooldowns 3 % faster | "Åskstormen": 3 % faster and 3 % more crits |
| Sköld | "Skyddet": armor +3 % | "Fästningen": armor +2 %, health +5 % |
| Liv | "Livsgnistan": healing +5 %, regeneration | "Livets träd": healing +6 %, quicker rest and revive |
| Hugg | "Skärpan": crits +3 % | "Mästarhugget": crits +3 %, spells +3 % |
| Tur | "Lyckan": crits +3 %, coins +20 % | "Guldregnet": coins +25 %, sagafrön +10 % |
| Djur | "Flocken": health +4 % | "Vildmarken": health +4 %, regeneration |

- What a runa can do (`RunEffect` in `run.ts`): more spell power, a shorter cooldown, health, armor, less damage taken, healing,
  regeneration, threat, life steal, crits, quicker revival, coins, and per-spell effects (`SpellMod`: burn, slow, stun, chain
  to a neighbour, shields, heal over time, larger radius). Every number an effect can carry is covered by a test that it
  changes something.

### 3.2 Offers and picks

- After a Flock, a Stark vakt, a Skatt and the Mellanboss **every human gets their own three cards**, drawn from their class
  pool (`offerFor`). Taking a card is tapping it (it can be changed until everyone has chosen or the clock ends). Whoever has not
  chosen at the end gets their first card.
- The rarity of each card is rolled by weights per source (`OFFER_WEIGHTS`), then a runa of that rarity is drawn. A rarity the
  class has run out of gives way to the next one down. A runa already held is never offered again.

| Source | Vanlig | Ovanlig | Sällsynt | Legendarisk |
| --- | --- | --- | --- | --- |
| Flock | 60 | 30 | 10 | 0 |
| Stark vakt, Skatt (and the cards of two events) | 30 | 40 | 25 | 5 |
| Mellanboss | 0 | 30 | 50 | 20 |

- **Pity:** after two offers in a row without an ovanlig or better (`PITY_AFTER`), one card of the next offer is at least ovanlig.
- **Path lean:** after the Mellanboss a runa tagged for the hero's path is drawn 2.5 times as often (`PATH_LEAN`; `PATH_TAGS`).
- **Luck:** the sagaträd node Runlycka (`h7`) raises the weights of the rarer cards: a rarity k steps up counts (1 + 0.25 k)
  times as much.
- **Reroll:** with the node Omval (`g3`) each hero may ask for new cards once per run.

### 3.3 Skärpa

A runa a hero holds can be sharpened: each step makes it 1.25 times as strong (`SKARPA_MUL`), and a *vanlig* may be sharpened
twice, an *ovanlig* once, up to *sällsynt*; legendariska cannot. Sources: the Vilosten choice (once per hero and stop), the event
Gamla smedjan, and the Köpman (50 hacksilver).

### 3.4 Hacksilver and the Köpman

**Hacksilver** is the run's currency: one purse for the whole party ("Färdkassan"), shown to all. It exists only in the run.

| Source | Hacksilver |
| --- | --- |
| A pack | its size, at least 3 and at most 6 |
| Stark vakt / Skatt / Mellanboss | 12 / 20 / 40 |
| Events | from 5 to 30 (2.5) |

On Mycket lätt and Lätt the hacksilver from packs, Stark vakt, Skatt and the Mellanboss is multiplied by 1.5 (`silverFor`), so a child's Köpman has
something to sell.

What is left in the purse at the end of a run (win, wipe or leaving) becomes sagafrön, one for every 12 (`SILVER_PER_SEED`), the same
for everyone in the party.

**The Köpman** ("Köpmannen Bram") has the same prices every visit. Anyone in the party may spend from the purse; everyone sees what was
bought.

| Wares | Price |
| --- | --- |
| A runa for each hero (their class): up to three slots, vanlig / sällsynt / legendarisk; the legendary slot only on row 5 and later | 40 / 90 / 160 |
| A party runa (*ovanlig* or better) | 110 |
| A healing potion (three in stock) | 25 |
| Skärpa on one runa | 50 |
| A Sagoande (once per visit; not if the level's maximum is reached) | 150 |

## 4. Heroes

### 4.1 Classes

Chosen at Kämpastenen in the lobby (Völvan Sigrun gives the first chapter); a hero can change class later and keeps one
wardrobe per class. Spells are on buttons 1 to 4 (5 is a healing potion); they are cast
on release (section 9), aimed at the target the hero has tapped or the closest one.

| Class | Role | Health | Spells (cooldown) |
| --- | --- | --- | --- |
| Väktare | tank | 200 | Svärdshugg (0.8 s), Utmana! (8 s: every monster within 5 tiles must fight you for 4 s), Sköldslag (6 s: stuns 1.5 s, interrupts), Sköldmur (20 s: much less damage for 6 s) |
| Helare | healer | 120 | Läkerunan (1.5 s: heals a friend), Ljuspil (1.1 s: a bolt), Läkekrets (12 s: heals everyone near for 6 s), Väck upp! (15 s: gets a fallen friend up) |
| Krigare | melee damage | 150 | Yxhugg (0.9 s), Stormsteg (9 s: charges, stuns 1 s, interrupts), Virvelvind (6 s: hits everything near), Bärsärkaraseri (24 s: harder, faster, life steal for 8 s) |
| Magiker | ranged damage | 110 | Eldboll (1.3 s), Isspjut (4 s: slows, interrupts), Åskregn (9 s: area), Blink (10 s: jump a few steps) |

A fighter who falls lies down (`DOWN_MS`, 10 s) and gets up at the last rest stone, sooner with a Helare's Väck upp!. A hero
standing out of a fight regains health on its own after 5 s (`CALM_MS`), and much faster by a rest stone.

### 4.2 Paths (väg)

After the Mellanboss each hero chooses one of their class's two or three paths (`paths.ts`; data, read generically by `castSpell`).
Roles stay: a Väktare path is still a tank. A path changes each of the class's four spells and adds a small trait or bonus. The
choice is made in a window with a clock; the hired Hirdmannen gets one at random, a hero who is late gets the class's first.

| Class | Path (id) | What it does |
| --- | --- | --- |
| Magiker | Eld (`eld`) | Eldboll burns on, Isspjut burns, Åskregn is larger and burns, Blink recharges faster and jumps further |
| Magiker | Frost (`frost`) | Eldboll slows, Isspjut freezes the monster fast and gives a shield, Åskregn slows everyone it hits, Blink gives an ice shell |
| Magiker | Åska (`aska`) | Eldboll and Isspjut jump to another monster (Isspjut to two), faster cooldowns, larger Åskregn, a faster and longer Blink |
| Krigare | Bärsärk (`barsark`) | Yxhugg, Stormsteg, Virvelvind and Raseri hit harder or sooner; life steal 2 %; below half health +25 % power and quicker cooldowns |
| Krigare | Vapenmästare (`vapen`) | Yxhugg much stronger but slower, Stormsteg stuns long, Virvelvind dizzies, Raseri shorter but recharges fast; crits +4 % |
| Väktare | Murvakt (`murvakt`) | Hugg, Sköldslag and Utmana! give shields, Sköldmur lasts longer and shields all near; armor +2 %; friends within 7 tiles take 5 % less |
| Väktare | Hämnare (`hamnare`) | Hugg and Sköldslag hit much harder, Utmana! hurts and reaches further, Sköldmur recharges faster; threat +8 %; monsters that hit you take 30 % of it back |
| Helare | Ljus (`ljus`) | Läkerunan heals much more but recharges slower, Ljuspil hits harder, Läkekrets is larger, Väck upp! is quick and far-reaching; healing +2 % |
| Helare | Natur (`natur`) | Läkerunan heals a little at once and more over time, Ljuspil snares with vines, Läkekrets lasts longer, Väck upp! heals afterwards; regeneration +10 % |

### 4.3 The Hirdmannen and party size

A run has up to **three** heroes (`RUN_PARTY_MAX`). The code has a fourth seat for a lobby with a longhouse (`longhall`), which the
lobby cannot build, so in practice it is three (see section 12).

A small party is never alone. The **Hirdmannen** is one fighter the server runs, with the careful bot's brain, in a starter set, at
the hero level of the first human (`hireCompanion`, `companionClass`):

| Humans | The Hirdmannen is |
| --- | --- |
| 1 | a Helare, or a Väktare for a Helare |
| 2 | a Helare if the pair has none, else a Väktare if it has none, else nobody |
| 3 | nobody |

He wears the class outfit, has 3 healing potions, shares the party-wide runor and blessings but takes no loot, no sagafrön, no
runor, and does not vote. The arch window can turn him off. The sagaträd node Hirdens lön (`g5`) makes him 20 % stronger. For one
human with the Hirdmannen, monster health is multiplied by 0.75 (`SOLO_MERCY`).

### 4.4 Hero levels

Experience comes from monsters in a run (5 for a monster, 2 for a helper, 40 for a mid-boss, 100 for a boss; `SAGA_XP`), from a
chapter told and from a villager's quest. Every party member gets the experience. Levels run from 1 to 20
(`XP_LEVELS`: 60, 150, 280, ... 7800). **A level gives no power.** It gives something to look at (`LEVEL_REWARDS`): clothes to the
wardrobe at levels 2, 4, 6, 8, 10, 12, 16, 18 and 20 (Vandrarmanteln, Glödkransen, Glödmanteln, Stjärnkronan, Stjärnmanteln,
Norrskenshjälmen, Eldmanteln, Solkronan, Bifrostmanteln), amulets at 9 and 19 (Hjältemärket, Yggdrasils löv), the pet Lyktfén at 5,
the mount Ljushjorten at 15, titles at 3, 7, 13, 17 and 20 (Vandrare, Hjälte, Stor hjälte, Legend, Midgårds väktare), and a glow
around the hero from level 10 and a rainbow glow at 20 (`auraOf`).

### 4.5 The Sagoandan and wipes

When every fighter is down (after a 4 s pause, `WIPE_MS`), a **Sagoandan** ("a spirit") can save the run: everyone is up at the
last rest stone with 50 % health (`SAGOANDAN_HP`), the stop's fighting monsters reset, and the count goes down. The star on the HUD
shows how many are left. After the boss has fallen no spirit is used. The levels differ (5.7): on Mycket lätt and Lätt a wipe never
ends the run (with none left everyone just gets up, at full health, free); on Medel and Svår the wipe after the last spirit ends
the run; on Extrem there is none, so the first wipe ends it. More spirits come from the event Sagoanden, from the Köpman (150), and
on Mycket lätt and Lätt one more arrives with every stop after the first (at most 5).

### 4.6 Replay modifiers

A replay of a cleared dungeon (a cleared dungeon chosen at the arch, or "replay" at random) gets one modifier for each earlier
clear, up to three, chosen by the seed (`MODIFIERS`): *Fler monster* (one more in each pack), *Segare monster* (+25 % health),
*Hårda slag* (+20 % damage), *Vakten* (the Mellanboss guards the way to the boss), *Snabba fötter* (monsters notice you from
further), *Dimma* (fog, monsters follow further). Each modifier pays +15 % sagafrön (`MODIFIER_SEEDS`). On a replay the boss uses all its
attacks. A boss's first-clear sagafrön is 20; a replay's is 12.

### 4.7 Särdrag

Svår has one särdrag, Extrem two, drawn by the seed after any replay modifiers (`AFFIXES`); the levels' own sagafrön multiplier
pays for them. Four exist:

| Särdrag | Effect |
| --- | --- |
| Stålhud | Packs have 20 % more health |
| Stormig | Bosses and mid-bosses +20 % health, bosses +10 % damage |
| Stärkande | Each fallen pack member makes the rest hit 10 % harder |
| Jakten | A monster below a quarter health is 1.4 times as fast and quick |

## 5. Difficulty and balance

### 5.1 How monsters scale

Monsters are scaled by the fighters present in the stop (humans plus the Hirdmannen) when the fight starts
(`saga.ts`): monster health 0.4 + 0.45 per fighter (`mobHpScale`); boss health 0.6 for one fighter, else 0.3 + 0.7 per fighter
(`bossHpScale`); monster damage ×0.4, 0.7, 0.9, 1 for one, two, three, four fighters (`mobDmgScale`); a boss's helpers
scale with the party (`addCount`). On top come the wing (`WING_HP`, section 2.3), the level (5.7), a Stark vakt (×1.25), the särdrag and
replay modifiers, and `SOLO_MERCY` (×0.75, one human with the Hirdmannen).

### 5.2 Pack sizes

See 2.3. The tables are `FLOCK_PACKS`, `ELITE_PACKS`, `TREASURE_PACKS`, `MINI_PACKS`, `BOSS_PACKS` and their `LATT_*` versions in `run.ts`. They are
tuned by the bots; change them with `runtune.ts` open (section 8).

### 5.3 The gentle levels

Mycket lätt and Lätt (`isEasy`) have fewer and smaller packs (2.3), no Stark vakt, only the first two attacks of a boss, a boss
warning time 1.8 or 1.4 times as long, 60 s to choose instead of 30, 1.5 times the hacksilver, and a wipe that never ends the run
(4.5). They pay less sagafrön (×0.35 and ×0.5), so they are a place to learn and not a way to farm; the first clear still counts for
the chapter, so a child is never blocked from the story.

### 5.4 Balance targets

A human is slower than a careful bot and faster than a clumsy one: an adult is about 1.7 times the careful bot, a 9-year-old about the
clumsy bot, a 7-year-old about the `kid7` bot. The targets are the bands the tests hold (so they cannot drift unnoticed); all use
Draugkryptan and level-3 heroes unless noted.

| Party | Level | Bot | Target (test) |
| --- | --- | --- | --- |
| One hero alone (any class) or Krigare + Magiker | Mycket lätt | `kid7` | at least 95 % won (6 seeds), no run ends on a wipe, average win 14 to 40 min (`run.latt.test.ts`) |
| same | Lätt | clumsy | same, 14 to 34 min |
| same | Medel | clumsy | at least 5 of 6 won, average win 20 to 42 min (`run.solo.test.ts`) |
| Krigare + Magiker | Svår | careful | 8 to 12 of 16 won (`run.hard.test.ts`) |
| Krigare + Magiker | Extrem | careful | 3 to 6 of 16 won |
| One hero + Hirdmannen | Medel | careful / clumsy | careful always wins, clumsy at least 2 of 3; averages 9 to 18 / 20 to 36 min (`run.bots.test.ts`) |
| Väktare + Helare | Medel | careful / clumsy | same; 17 to 32 / 36 to 58 min (no one to deal damage: the slow pair) |
| Three heroes (Väktare, Helare, Magiker) | Medel | careful / clumsy | 13 to 26 / 28 to 46 min |
| Four heroes | Medel | careful / clumsy | 11 to 22 / 24 to 41 min |
| Any chapter, one Krigare | Medel | careful | no stall: every dungeon ends in a win or a wipe inside 60 min |

The hard-level bands are for a party without a tank; parties with a Väktare are not pinned by a test. A test also asserts that a run is
different each time (three seeds give three routes, three sets of stops and three card offers). The soft 30 minutes (2.6) are the
design target; the bots' averages are the evidence, and a real child on a real tablet is the final check (section 12).

### 5.5 Pacing

Rows 1 to 4 and 5 to 8 are a wing each; a Vilosten on rows 4 and 8 means a rest is always one step away, and the last rest is row 9,
just before the boss. `runtune.ts` prints how many Flocks and Vilosten the routes its bots walked held.

### 5.6 What the bots measure

The bots (`runbot.ts`, `runplay.ts`) play whole runs in memory with `applyMove`, `castSpell` and `performAction`, nothing else, so
they find what a person at a keyboard could do. A party is made with `makeParty(classes, { style, seed, level, longhall, lane, pet })`
and played with `playRun`. Styles (`BotStyle`):

- `careful`: walks to the next monster, uses its class the way a person would (the tank taunts and shields, the healer heals and
  wakes friends, the warrior whirls, the mage fires from afar), steps out of marks, interrupts big casts, and takes the safe lane
  (a Vilosten when it or a friend is hurt, else a fight).
- `clumsy`: the same with pauses between moves, misses, and a random lane.
- `kid7`: clumsy with a 1.2 times longer pause and 40 % misses.

The same brain runs the Hirdmannen (careful).

### 5.7 The five levels

Chosen at the arch and fixed for the run (`RUN_LEVELS` in `run.ts`; names, blurbs and pictures in `sv.ts`:
`T.runLevelName`, `runLevelBlurb`, `runLevelIcon`).

| Level | Hp | Damage | Boss warning | Sagoandar (start, +per stop, max) | Wipe | Sagafrön | Rare finds / rarer gear | Särdrag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 Mycket lätt | ×0.4 | ×0.3 | ×1.8 | 5, +1, 5 | never ends the run | ×0.35 | ×0.6 / none | 0 |
| 1 Lätt | ×0.6 | ×0.5 | ×1.4 | 3, +1, 5 | never ends the run | ×0.5 | ×1 / none | 0 |
| 2 Medel | ×1 | ×1 | ×1 | 1 | ends the run after the one | ×1 | ×1 / none | 0 |
| 3 Svår | ×1.65 | ×1.6 | ×0.8 | 1 | as Medel | ×1.5 | ×1.5 / +0.5 weight per rarity step | 1 |
| 4 Extrem | ×1.9 | ×1.6 | ×0.65 | none | the first wipe ends it | ×2 | ×2 / +1.0 weight per rarity step | 2 |

"Hp" and "damage" multiply a monster's, a boss's and what a boss calls in. "Rare finds" multiplies the chance of a chest's rare
items (including pets); "rarer gear" adds weight to a chest's better pieces. Nothing anybody owns is ever lost on any level. A
parent can cap the highest level per character (section 10). Svår and Extrem also unlock the colourway and title of the dungeon
(7.3), and pets help less there (7.4).

## 6. Sagafrön and the sagaträd

**Sagafrön** (seeds) are the permanent currency, saved on the player. They are planted at the **Yggdrasil shoot** beside the färdport,
one node at a time, in the **sagaträd**.

| What | Sagafrön (before multipliers) |
| --- | --- |
| A pack | 1 |
| A Flock cleared | 3 (a Stark vakt 6) |
| The Mellanboss | 5, and 3 for the stop |
| A chest opened (the side-room kind) | 2 |
| The boss | 20 on a first clear, 12 on a replay |
| Left over hacksilver | 1 for every 12 |

Multiplied by the level (5.7), plus the bonuses of runor and nodes (`seeds`), the +15 % of each replay modifier, and a pet that digs
(7.4). Whole seeds are paid and the remainder is carried to the next payment.

The tree has 19 nodes in three branches, 502 sagafrön in all (`SEED_TREE`). A node needs its parent. The shoot grows
visibly from the whole family's planted nodes: stages at 0, 3, 8, 14 and 24 nodes (`TREE_STAGES`).

| Branch | Node (id, cost): effect |
| --- | --- |
| Hjälten | Starkare skott (`h1`, 10): spells +3 % · Tjockare skinn (`h2`, 12): health +5 % · Segerviljan (`h3`, 20): crits +4 % · Hård hud (`h4`, 25): armor +3 % · Heltens ande (`h5`, 30): healing potions heal 10 % more · Evig låga (`h6`, 45): cooldowns 4 % faster · Runlycka (`h7`, 40): rarer runa cards |
| Gemenskapen | Starkare band (`g1`, 10): rest stones heal 25 % faster · Mjukt uppvaknande (`g2`, 15): fallen get up 20 % faster · Omval (`g3`, 30): one card reroll per run · Delad glädje (`g4`, 25): healing +8 % · Hirdens lön (`g5`, 35): the Hirdmannen is 20 % stronger · Frögåva (`g6`, 40): sagafrön +10 % |
| Gården | Större matsäck (`f1`, 15) · Gyllene skörd (`f2`, 20) · Djurens vänskap (`f3`, 30) · Extra flaskor (`f4`, 15): one more potion at the start · Rikare kistor (`f5`, 35): coins from chests +25 % · Världsträdets rot (`f6`, 50): the boss gives 5 sagafrön more to the one who planted it |

The tree adds breadth and small numbers; no node makes the run trivial. (`f1` to `f3` act on dishes and farm animals, see section 12.)

## 7. The lobby, houses, cosmetics and pets

### 7.1 Gården (the lobby)

One 64 by 64 tile map (`generateWorld`, `LOBBY` in `map.ts`), a Norse homestead inside a forest nobody can leave. Nothing in
it can be built or broken. What is there:

| Place | Does |
| --- | --- |
| Völvan Sigrun and the Kämpastenen | She tells the saga chapter by chapter (`saga chapter`); the stone chooses the class |
| The färdport (arch) | Opens the run window (2.6) |
| The Yggdrasil shoot | Opens the sagaträd (section 6) |
| Smed-Stina | Her window sends you to the wardrobe's sets tab |
| The wardrobe ("Garderoben") | Opens the looks window (7.3) |
| The kennel | One free pet each, once: a dog or a cat (7.4) |
| The house door | Stepping on it asks whose house to visit (7.2) |

Players see each other, chat (a line is cleaned and limited to one every 0.6 s; the last 20 lines go to whoever arrives), use
emotes, and can talk with voice ("Röstprat"): devices in the same room (same address) share one speaker, others connect device to
device with WebRTC (`voice.ts`); voice is never stored, and the parent chooses nobody, family, or family and guests.
The lobby map (`M`) shows where everyone stands.

### 7.2 Houses

Every character has a house, a small map of its own (`house:<player id>`, made the first time anyone goes in, saved with the
other maps): a longhouse of wooden walls with a hearth and a starter set (bed, table, chair, lamp). The owner decorates it: tap a
piece to pick it up into the bag (it is selected, so a tap on the floor puts it down), tap the floor to place one. A visitor
may walk and look but not move anything. What stands in a house:

- **Boss trophies**, one per dungeon boss (9). A win gives the trophy for that boss at the level it was won on, or makes the one you
  have finer when the level is higher (wood, bronze, silver, gold, gold with gems for Mycket lätt to Extrem; `TROPHY_LEVEL_NAMES`,
  `awardTrophy`). It goes into the bag, or stands in the house at once when the bag is full.
- **Norse decor**, ten pieces (`NORSE_DECOR`): viking shield, rune stone, weapon rack, drinking horn, viking banner, bear rug, mead
  barrel, candle stick, yggdrasil sapling, raven perch. They are drops from dungeon chests.
- **The gear stand**, which shows a look from the owner's collection (or a weapon, shield or amulet from the bag).

### 7.3 Looks (cosmetics)

A **look** is one piece of a set worn in a slot. It gives no power (`looks.ts`). Seven slots: hat, shoulders, shirt, cloak, weapon,
offhand, amulet (`LOOK_SLOTS`).

| Set (id) | Dungeon | Class | Pieces |
| --- | --- | --- | --- |
| Draugkungens vakt (`draugvakt`) | Draugkryptan | Väktare | hat, shirt, offhand, weapon |
| Frostväktarens bröst (`frostbrost`) | Frostjättens borg | Väktare | hat, shirt, shoulders, offhand |
| Smedens glöd (`smedensglod`) | Surts smedja | Krigare | hat, shirt, shoulders, weapon |
| Skuggornas hatt (`skuggornas`) | Helheim | Magiker | hat, shirt, cloak, weapon |
| Hugin och Munin (`huginmunin`) | Helheim | any | hat, shirt, shoulders, cloak, amulet |
| Åskmagikern (`askmagiker`) | Svartalfheims gruvor | Magiker | hat, shirt, amulet, weapon |
| Havets völva (`havsvolva`) | Havsormens tempel | Helare | hat, shirt, amulet, weapon |
| Völvans ljus (`volvaljus`) | Alvernas lund | Helare | hat, shirt, cloak, weapon |
| Björnbärsärken (`bjornbarsark`) | Fenrisklyftan | Krigare | hat, shirt, shoulders, weapon |
| Lokes lek (`lokeslek`) | Bifrost | any | hat, shirt, cloak, offhand, amulet |

Plus four **signature weapons**, worn by any class and always at full shine: Mjölner (Svartalfheims gruvor), Gungner (Helheim), Frostbett
(Frostjättens borg), Surts eldsvärd (Surts smedja).

- **Shine tiers** 1 to 5: Vanlig, Kantad, Glödande, Gnistrande, Strålande: plain, trimmed, glowing, one particle effect (tier 4), the full
  effect with an aura (tier 5, `FX_TIER`, `FX_FULL_TIER`).
- **Earning.** Completing a dungeon at *any* level gives each party member one new piece of that dungeon's sets (the hero's own class set
  first, then an any-class one) while one is missing, and +1 shine on every piece they already own from it. A four-piece set is whole
  after four clears and fully shining after eight. The signature weapon comes with a 10 % chance per clear and for certain at the 8th
  (`SIGNATURE_CHANCE`, `SIGNATURE_AFTER`). The dice are seeded by player, dungeon and clear count, so they never move the sim's own.
- **Svår and Extrem** each add an exclusive colourway per dungeon (a palette swap, not flashier) and a title (`LOOK_TITLES`), earned by
  completing the dungeon on exactly that level.
- **Wearing.** A class set is worn only by its class. What is worn is stored per class; the wardrobe (key G, the HUD's shirt button, or Smed-
  Stina's window) dresses any class. It is free and instant, anywhere.
- **Effects** (`FxId`: embers, smoke, frost, lightning, glitter, runepulse, dripping, trail, leaves, tendrils, aurora) are a pooled
  vocabulary drawn under the dungeon's telegraphs, capped at 8 particles per player and 120 overall. "Effekter: Alla / Mindre / Av" is a
  device setting; the system's reduced-motion choice cuts Alla to Mindre.

### 7.4 Pets

One table, `PETS` in `pets.ts`; the kennel, the arch window, the HUD frame, the drops and the saves all read it. A pet never dies
or hurts; one that takes too much gets scared, runs to its owner and is out for some seconds (`courage`). A pet is worth about a
tenth of a hero. **One pet comes on a run**, chosen at the arch or the kennel, and it cannot be swapped mid-run. Out in the lobby
the one button summons it in or out (out, it neither helps nor blocks).

| Pet (id) | Species | Role, trick | Rarity | How it is had |
| --- | --- | --- | --- | --- |
| Hund (`hund`) | `dog` | attack: bites the monster you fight (6 damage every 1.8 s) | common | the kennel, free |
| Katt (`katt`) | `cat` | heal: purrs 10 health into the hero most hurt (below 85 %) every 4.5 s | common | the kennel, free |
| Räv (`rav`) | `pet_fox` | utility: digs up 12 % more sagafrön after the fights of a run | rare | first clear of Draugkryptan |
| Korp (`korp`) | `pet_korp` | utility: marks a monster, +20 % damage taken for 6 s every 9 s | rare | 30 % in Draugkungens chest |
| Björn (`bjorn`) | `pet_bear` | guard: soaks 30 % of hits on its owner; roars at a monster after a weak friend | epic | 30 % in Isbjörnens chest |
| Varg (`varg`) | `pet_wolf` | attack: bites fast; a howl gives the party +10 % attack for 6 s every 24 s | epic | 30 % in Sköll's chest |
| Get (`get`) | `pet_goat` | utility: rams a monster, 12 damage and a 1.5 s stun (a boss only takes the damage) | rare | 30 % in Surts chest |
| Lodjur (`lodjur`) | `pet_lynx` | attack: hides, then one big pounce (28) at the start of a fight, then small bites | epic | 30 % in Nattmarans chest |

The kennel gives exactly one of Hund or Katt, once. A chest drop never repeats a pet the player has. Pets help less on the hard levels
(`PET_LEVEL_MUL`: ×1, 1, 1, 0.35, 0.15 for levels 0 to 4). The trick kinds are `bite`, `purr`, `guard`, `mark`, `find`, `ram`, `howl`, `ambush`;
each is implemented once in `petsim.ts` and each is used by at least one pet.

**Pet gear** is cosmetic, like looks: six small sets of two pieces (Draugkryptan, Frostjättens borg, Surts smedja, Helheim, Alvernas lund,
Fenrisklyftan; `PET_LOOK_SETS`), worn at the pet's head, neck or back, by any pet kind. A dungeon cleared at any level with a pet along
gives one new piece of that dungeon's pet set and +1 shine on those owned, with the same tiers and colourways as the hero sets.

**How to add a pet** (`pets.test.ts` checks all of it):

1. One entry in `PETS`: id, name, blurb, `trickText`, `howText`, `species`, emoji, role, rarity, `courage`, `source` (`kennel`,
   `clear` or `drop`), one `trick` (an existing kind and its numbers), `anchors` (head, neck, back, on both walk frames), `size`, and
   `face` (the eyes and muzzle that gear must not cover).
2. The art in `packages/art` (`petanimals.ts`): a draw function for `species` with two walk frames facing right, registered in `DRAW`.
3. The species in `ANIMALS` (`data.ts`) with `pet: true`, and its name in `SPECIES_NAMES` (`sv.ts`).

A new trick kind is a new variant of `PetTrick`, its row in `PET_TRICK_KINDS` and its implementation in `petsim.ts`.

## 8. Tuning with the bots

`packages/shared/src/runtune.ts` plays bot runs and prints a row per party: wins, runs that ended on a wipe, Sagoandar used, minutes until the
boss falls, and the Flocks and Vilosten the route held:

```
node --experimental-transform-types packages/shared/src/runtune.ts --level 2 --style clumsy --seeds 20 [--from 1]
     [--dungeon draug] [--parties solo|duo|pair|all] [--lane safe|random] [--limit 60]
```

The loop for a change to a number (`WING_HP`, the pack tables, a level's multipliers, a runa): run `runtune` at the levels it touches
with `careful` and `clumsy` (and `kid7` for levels 0 and 1), check the result against the bands in 5.4, and if a band moves on
purpose, change the test in the same commit. The tests (`run.bots.test.ts`, `run.solo.test.ts`, `run.latt.test.ts`, `run.hard.test.ts`)
are slow, so they are separate files that run side by side in CI. Keep new route tests short (`it.each` over a few seeds with caps).

## 9. Accessibility standard

The layer is in `packages/client/src/a11y.ts`, `a11y.css` and `ui/settings.ts`, `ui/info.ts`, `fxprefs.ts`. Preferences are stored on the
device (`varldstradet.a11y` in local storage) and applied as classes and CSS variables on `<html>`.

**Numbers every window and HUD element must meet** (the audit checks them):

| Rule | Value |
| --- | --- |
| Touch target (buttons, tabs, cards, slots) | at least 48 by 48 px (`--tap`); the close button and the kids' main buttons 56 px (`--tap-big`) |
| Gap between targets | at least 8 px; between spell buttons at least 12 px |
| Text | at least 16 px (`--fs` = 16 px × the text size); text sizes Vanlig ×1, Stor ×1.25, Extra stor ×1.5; on a screen under 480 px high the biggest size stops at Stor |
| Contrast | at least 4.5:1 for text (7:1 over a busy or see-through background); large text (24 px, or 18.66 px bold) at least 3:1 |
| Every control has a name | a visible label or an accessible name |
| Focus | the same ring everywhere for keyboard and gamepad: a 4 px white outline with a 7 px blue shadow (`--ring`, `--ring-in`) |

**Behaviour:**

- **Info cards.** Anything that needs explaining is marked with `cards.info(el, icon, name, text)`. A long press (300, 450 or 700 ms, a
  setting), keyboard focus, the gamepad's focus ring, mouse hover, and a tap while "Förklara" is on all show the same big card:
  icon, name, one sentence, a speaker button. A press that opened a card does not use the thing when it is released.
- **Release, not press.** Buttons fire on pointer-up (`onTap` in `ui/dom.ts`), and a press that opened an info card does not fire when it
  is released. Spells are cast the same way, on release.
- **Settings** ("Inställningar", the gear on the HUD): text size, strong contrast, effects (Alla / Mindre / Av), calm screen (no loops
  or flashes; follows the system's reduced-motion choice until the player chooses), screen shake, colour-blind-safe telegraphs, how long
  to hold to read, left-handed buttons, reading aloud (the device's Swedish voice; hidden if there is none).
- **Input.** Touch (stick on the left half, a big hand button, tap on a tile), keyboard (arrows or WASD, E or space, 1 to 5 for spells and
  the potion, Tab to aim, Q bag, F emotes, B or J the journal, H help, T chat, M map, G wardrobe), gamepad (Xbox, PlayStation and
  Switch layouts; the stick and d-pad move a highlight in menus, A selects, B closes). In a fight X, Y, B and RB are spells 1 to 4 and LB
  the potion. Votes can be made with keys 1 to 3 in a Händelse and at the Köpman.
- **Colour is never the only signal.** Low health is a mark and stripes as well as red; telegraphs have a colour-blind variant with other
  colours and stripes; the cards have a star count as well as a border colour.

**Checklist for a new window:**

1. A `.modal` dialog like the others; Escape and the gamepad's B close it; the focus comes back to what opened it.
2. Every control is a real button (or has a role) with a name; use `onTap`, not `click`.
3. Targets 48 px, close 56 px, gaps 8 px; sizes in real pixels, not in the HUD's `--u` unit.
4. Text at `var(--fs)` or larger. Add the stylesheet to the list in `scripts/a11y-fontfloor.mjs` and run it.
5. One short Swedish sentence with a number per card, a picture beside every word, and an info card on everything that is not obvious. The
   strings go in `sv.ts`.
6. It works at 640 by 360 and at 1280 by 720, at text size Extra stor, with calm screen on, and with the high-contrast class.
7. Nothing depends on colour alone, and nothing blinks or loops when `calm()` is true.
8. Add a scene for it to `scripts/a11y-audit.cjs`, run the audit at the four viewports (1024 by 768, 768 by 1024, 1280 by 720, 640 by 360),
   and leave it with zero small targets, gaps, tiny text, unnamed controls and low contrast.

## 10. Access control

Nobody plays without a parent having said yes; `ACCESS=open` turns all of it off for a home network. Details for users are in the README
("Access control and the parent page"). The design in short:

- **Devices, not accounts.** A device is a browser with an approved cookie. A parent makes **join codes** for a named person or family
  (guest or family, 1 to 5 devices, 1 hour to 30 days, let in directly or approved one by one). Only a hash of the code is stored.
- **Guests play only their own characters**; family devices play everyone. "Öppna igen" gives a device that lost its cookie a
  one-time code.
- **The parent** (password, optional authenticator app) can close the game, allow family only or family and guests, set play hours,
  pause or remove a device, set the character limit and the voice policy, rename or delete a character, and set the **highest difficulty**
  per character. The cap is enforced in `startRun` and `joinRun` (a capped player cannot start or join a run above it, and the starter is
  told who is capped) and is mirrored on each player as `levelCap` so the arch window can lock the buttons before Starta.
- The parent page is at `/admin`, or on its own listener (`ADMIN_PORT`) that can be bound where the internet cannot reach.
- Everything that matters is rate limited, origin-checked and logged on the parent page; push notifications go through ntfy.

Code: `access.ts` (rules and state), `http.ts` (routes, cookies, the WebSocket upgrade), `pages.ts` (the gate and parent pages), `admin.ts`,
`db/accessStore.ts`.

## 11. Architecture

```
 browser                                           server (Node)                     Postgres
 clientljs (LittleJS view) + client (HUD) ◀─ ws ─▶ Game: authoritative tick 20 Hz ──▶ players, areas, world, settings,
 shared (rules, types, strings) ◀──── imported by both ────▶ shared                    access tables
```

- **Shared rules.** `packages/shared` has no I/O and is used by the server for everything that matters and by the client for types, names
  and prediction-free helpers. The simulation functions take a `WorldState` and a `SimCtx` and return `Change[]`; nothing in them
  touches a socket or a database. This is also why the bots and the tests can play whole runs in memory.
- **The tick.** `Game` (`game.ts`) ticks every 50 ms (`TICK_HZ` = 20) with the elapsed time (capped at 250 ms): `tick` in `sim.ts` advances the
  lobby, every other map that has players in it (houses, and a run's stops with their fights in `sagasim.ts` and their pets), the
  house door, and the run itself (`tickRuns` in `runsim.ts`). It collects `Change`s and broadcasts them. Positions go out every 100 ms as a `state` message. The world is flushed to the store every second (dirty parts
  only).
- **Protocol** (`protocol.ts`, JSON over one WebSocket at `/ws`). The client says `hello` with its character id and gets `welcome`
  (the whole lobby state). From then on the server sends `state` (positions of players, animals, npcs, and the fight snapshots), and
  `changes`: a list of typed deltas (`player`, `object`, `animal`, `banner`, `hit`, `spell`, `zone`, `loot`, `run`, `seed`, `open`, `toast`, ...).
  A change with a `to` goes only to that player; the rest go to everyone. The client sends intents (`move`, `act`, `cast`, `potion`,
  `run`, `seed`, `look`, `pet`, `house`, `saga`, `chat`, `emote`, `voice`, `ping`); the server decides. Movement is reported by the client
  and clamped to what the legs allow (`applyMove`), because a tablet cannot wait for a round trip.
- **One connection per character.** A second `hello` for the same character closes the first. A device may only say `hello` for characters it
  may play (access control).
- **Maps.** Everything is a `WorldState` with an `area` key: the lobby, `house:<id>`, and a run's stops (`saga:<run>z<node>`). Changes
  carry the area they belong to.
- **Persistence.** Postgres through Drizzle (`db/schema.ts`; migrations in `packages/server/drizzle`, applied on boot). The world row (day,
  family best times), the lobby's objects, each player as one JSON record (`PlayerState`: class and saga progress, hero experience, looks,
  pets and pet gear, run save with sagafrön and the tree, titles, trophies, wardrobe), the other maps (houses), and the access tables
  (devices, join codes, log, settings). `MemoryStore` is the same interface without a database. A **run is never saved**: it lives in
  memory, what players earn is paid out at once, and a restart ends it.
- **The client.** `clientljs` draws with LittleJS from the state in `client/src/state.ts` (the protocol folded into one object) and the art
  in `packages/art`; the HUD and every window are plain DOM from `packages/client/src/ui/` over the canvas. Sound is synthesized
  (`sound.ts`, `sounds.ts`). The game is a PWA.
- **Strings.** All player-facing text is Swedish and lives in `shared/src/sv.ts` (`T`, `RUN_T`, `RUN_UI`, `A11Y_T`, `LOOK_T`, names and texts per
  runa, event, path, tree node, pet and look).

## 12. Known gaps and open questions

- **Four seats are not real.** `RUN_PARTY_MAX` is 3; a fourth place exists only for a lobby that has a longhouse (`RUN_PARTY_MAX_LONGHALL`), and the
  lobby cannot build one. Decide whether four should be free for everyone (the bot tests already play four-hero parties).
- **One run at a time per server.** A second party waits (`RUN_T.already`). Fine for one family; a household with two groups needs more.
- **Farm leftovers in the run.** Dishes ("färdkost" from the old cooking), farm animals and old buildings still add bonuses through
  `farmEffect`, and the sagaträd branch Gården (`f1` to `f3`) acts on them. The lobby cannot produce any of it, so for a new character those
  nodes do nothing. Replace or remove them.
- **Four särdrag.** More would need new ground effects in the fight sim (a periodic circle under each player, orbs to pop, a slow that
  stacks, a puddle where monsters fall).
- **Pack roles.** Packs are drawn from the dungeon's three species. Monsters pick targets by threat (the tank's spells make more, Utmana!
  forces it), but the snapshot does not say whom a monster chases, so the client draws no line to show it. There is no patrol and no
  monster that heals or shields others. Telegraphs and the journal carry the teaching.
- **Balance is only bots.** Nobody has timed a real 7-year-old; the bands in 5.4 are proxies. The clumsy bot is about 1.9 times as slow as
  the careful one, so the two cannot both sit on the same human estimate; the levers if a run feels long are `WING_HP`, the pack tables,
  and the length of the corridors (the Flock layouts are the old seven templates).
- **Hard levels and tanks.** A Väktare in the party makes Svår and Extrem much easier than the bands pinned for Krigare + Magiker.
- **No short run.** A run is ten rows. A school-night option (rows 1 to 3 plus the Mellanboss and the Boss) is not built.
- **No weekly rotation or keys.** Levels are chosen freely at the arch; there is no key that rises or medal timer.
- **Cosmetic breadth.** Pet sets exist for six of nine dungeons (not Svartalfheims gruvor, Havsormens tempel, Bifrost). Pet gear and looks
  have no trading or gifting.
- **Voice** needs `https` for the microphone, and a TURN relay for mobile data and strict networks.
