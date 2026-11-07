# GAME.md: the run (färd), runor, sagafrön and how the farm and the run feed each other

Written 2026-11-02 for milestone M5b of `PLAN.md`. This is the design the owner reads and approves or changes; the rules
it describes are built in `packages/shared/src/run.ts`, `runmap.ts`, `runsim.ts` and `runbot.ts` and tested in
`run.test.ts`. Everything here is the family's game with the same promise as the saga: nothing bleeds, monsters poof,
falling costs nothing. Where a number is written here it is the number in the code; the ones the bots tuned are marked
*(tuned)* and explained in the pull request.

**Decisions in one place (change any of these and say so):**

| Question | Decision |
| --- | --- |
| Length | Three zones and a boss, about **30 minutes** as a soft target on the server's clock: nudges at 25:00 and 30:00 and every 10 minutes after, never a forced end (owner, 2026-11-06: "should not be a hard cap, we can adjust later"). |
| Zones | One of seven biomes each, never repeating in a run. 4–6 rooms, one rest stone, an exit. |
| Runor pick | The party gets **one offer of three cards** and **votes**; a strict majority wins at once, otherwise the most votes after 20 s, ties go to the card voted first. |
| Sagafrön | Paid to every party member the moment they are earned, so nothing can be lost. Planted at the Yggdrasil shoot. |
| Party | 1–4. A fourth player needs a **långhus** (longhouse) built on the farm. The hired companion (Hirdmannen) does **not**: one or two players get it from the start (owner, 2026-11-07: "it was hard soloing"). |
| Falling | A wipe ends the run and everyone is back at the farm with everything they picked up. |

---

## 1. A run (färd)

A run starts at the **färdport** (the run arch), a 3 × 2 arch that the server puts on the farm beside the Yggdrasil
shoot. Whoever stands at the arch and uses it starts; the family members standing within 6 tiles of it come along, and
the rest can join (section 6).

### The shape

```
 färdport ─▶ zone 1 ─▶ [pick 1] ─▶ zone 2 ─▶ [pick 2] ─▶ zone 3 ─▶ [pick 3] ─▶ boss ─▶ farm
 (arch)     5–8 min                5–8 min                5–8 min             5–8 min
 färdkost                                                                       the chest, the run ends
```

* **Zone.** A walled map of 4–6 rooms built by `sagamap.ts` (the same builder as the nine dungeons): a start room, one
  or two rooms of monster packs, one **rest stone** room, an **exit** room and sometimes a side room with a treasure
  chest guarded by a pack. When every pack on the way is down, the **gate** in front of the exit room opens, exactly as
  the dungeon's gate opens when the mid-boss falls. Using the exit starts the pick.
* **Boss zone.** A start room, one pack room, a rest stone and the boss's hall. The boss is the chapter's boss with all
  of its telegraphed attacks (section 1.3).
* **Time.** The clock runs on the server while at least one party member is online. Thirty minutes is the **target the
  numbers are tuned to** and a gentle nudge, not a wall: the owner decided on 2026-11-06 that it "should not be a hard
  cap" and that "we can adjust later". At 25:00 everyone gets a banner ("Snart dags att gå hem"), at 30:00 another
  ("Dags att gå hem?": finish what you are doing and walk home from the next rest stone or the boss), and the same
  reminder again every 10 minutes (40:00, 50:00, ...). The clock never ends a run. A run ends only when the boss
  falls, when everyone is down (a wipe), when a player leaves on their own (that player is at the farm with
  everything), or when no human has been online for 60 s. `timeouts` in the save counts the runs that went past the
  30:00 mark (counted once, when the first nudge goes out).
  The numbers were tuned with bot parties (section 9): the careful bots reach the boss in 8–12 minutes, the clumsy
  bots, who are about as slow as kids (2.2–2.5 times the careful ones), in 14–25 minutes, plus a short vote at each
  exit. So the 30 minutes is a target we meet with room to spare.
* **Rooms are not saved.** Like a dungeon, a run exists only while it is played: a server restart puts everyone back on
  the farm, and what they earned was already paid out.

### 1.1 Zone templates

Every biome has one **template**: a hand-drawn layout of six rooms (so the generator can drop the optional ones and
keep 4–6), the monsters of that biome in three strengths, and its look. The look is borrowed from the dungeon whose
arch stands in that biome, so the art already exists (walls, torches, decor, ambient light); only the ground is the
biome's own.

| Biome (id) | Name | Layout (rooms are start, pack, pack, rest, exit, side) | Floor | Monsters (small, medium, big) | Look of |
| --- | --- | --- | --- | --- | --- |
| Skog (`skog`) | Skogsstigen | a zigzag west to east, the rest stone in the north-east, the exit in the south-east | grass | gravrotta, skelett, draugbage · ulv · rimtroll | Draugkryptan, grove walls |
| Träsk (`trask`) | Kärret | a descent from the top, a side bog in the west | mud | benspindel, helhund, gengangare | Helheim |
| Berg (`berg`) | Bergspasset | a climb from the bottom left to the top right | gravel | guldbagge, gruvtroll, stengolem | Svartalfheims gruvor |
| Strand (`strand`) | Stranden | along the shore, the rest stone and exit on the far side of the bay | sand | manet, sjodraug, jattekrabba | Havsormens tempel |
| Svampskog (`svamp`) | Svampskogen | a cluster around a glade | moss | skuggalv, jattespindel, svampvakt | Alvernas lund |
| Is (`is`) | Isfjället | a spiral that ends high up | snow | isande, isvarg, frosttroll | Frostjättens borg |
| Vulkan (`vulkan`) | Lavastigen | two roads round a lava lake that meet at the rest stone | ash | eldimp, eldhund, lavagolem | Surts smedja |

The seven layouts are in `ZONE_TEMPLATES` (`run.ts`) as room rectangles on the 64 × 64 map and links between them. Each
can be **flipped** left-right and top-bottom by the seed, which gives four versions of every layout without a new plan.

### 1.2 How the chain is chosen

`generateRun(seed, { boss })` (`runmap.ts`) is deterministic:

1. The boss is the **chapter's boss**: the first dungeon the starter has not cleared (the same order as the saga). If the
   starter has cleared all nine, it is a **replay**: a random cleared boss, picked by the seed.
2. Three different biomes are drawn from the seven (never repeating; the biome of the boss's own dungeon may appear).
3. For each zone the seed picks the flip, which of the optional rooms (the side room, and in the first zone the first
   pack room) are kept, and the packs from the biome's list *(tuned, `ZONE_PACKS`)*: the first pack room has 2 packs in
   the first zone, 2 or 3 in the second and 3 in the third; the second pack room has 3 packs in every zone (so does a
   lone pack room, when the first was dropped). Packs are groups of 3–4 (a modifier adds members; the side room's guard is
   2–3), and the third zone puts one big monster in one of the second room's packs. Monster health climbs with the zone *(tuned)*: × 1.35, × 1.5, × 1.7 on top of the saga's own party scaling.
4. The seed also picks the **weather** of each zone (sun, cloudy, rain, fog, wind; snow in the ice zone, ash wind in
   the volcano): it is carried in the run state for the client to draw (M5c) and has no effect on the rules.
5. The boss's attacks: the first attack and the first stoppable attack are always unlocked; the seed locks one of the
   others on a first clear. A replay unlocks everything. (That is "which boss moves are unlocked".)
6. **Modifiers.** A first clear has none. Each replay of a chapter adds one (up to three) from the table below. Modifiers
   give 15 % more sagafrön each.

| Modifier (id) | Swedish | Effect |
| --- | --- | --- |
| `fler` | Fler monster | one more member in every pack (never above 6) |
| `segare` | Segare monster | monster health × 1.25 |
| `harda` | Hårda slag | monster damage × 1.2 |
| `vakten` | Vakten | the chapter's mid-boss guards the way to the boss (second mid-boss) |
| `snabba` | Snabba fötter | monsters notice you from further away (sight × 1.4) |
| `dimma` | Dimma | fog: monsters in packs give up less easily (leash + 6 tiles) and the zone is drawn foggy |

What randomizes in total: the three biomes and their order, the flip, the optional rooms, the packs, which boss moves
are unlocked, the weather, the modifiers and the runor offers.

### 1.3 The boss

Unchanged: `SAGA_BOSSES`, telegraphs, interrupts, phases and helpers, `bossHpScale(party)`. A boss falling gives its
usual chest (`SAGA_LOOT`) and clears the chapter for everyone in the party. After the boss falls the party has 90 seconds
to open the chest and then walks out the way a rest stone would have: back to the farm.

---

## 2. Runor (boons)

Between zones the party gets **one offer of three runor** and picks one by a vote. Runor last the run only. The offer is
drawn from the party-wide runor and from the runor of the **classes in the party**: the seed first gives one card to
each of up to two classes present (so a duo or a trio sees their own classes), and fills the rest with party-wide
runor and, if there is room, more class runor. A solo player sees their class and the party-wide ones.

* **The vote.** Every online member taps a card. A card with a strict majority wins at once. Otherwise the vote ends
  when everyone has voted or after 20 s: most votes wins, a tie goes to the card voted first; no votes at all picks the
  first card. A solo player's tap decides. Members who join during a pick vote too.
* **Class runor** help only the members of that class; **party-wide** runor help everyone. They stack for the run.
* The numbers are *additions* to the hero's own numbers (gear and level stay as in the saga): `+25 %` on a spell is
  25 % more of that spell's power, `-30 %` cooldown is 30 % shorter.

### Väktare (tank)

| Id | Swedish name | Effect |
| --- | --- | --- |
| `v_tjock` | Tjock sköld | armor +0.08 |
| `v_hugg` | Tyngre hugg | Svärdshugg +25 % |
| `v_ropet` | Högt rop | Utmana cooldown −30 % |
| `v_mur` | Järnmur | Sköldmur cooldown −25 % |
| `v_slag` | Dunderslag | Sköldslag +40 % |
| `v_hjarta` | Stort hjärta | health +15 % |
| `v_trots` | Trotsig | threat +30 % |
| `v_lugn` | Lugn i stormen | damage taken −10 % |

### Helare (healer)

| Id | Swedish name | Effect |
| --- | --- | --- |
| `h_runa` | Starkare läkerunor | Läkerunan +25 % |
| `h_ring` | Större ring | Läkekrets +35 % |
| `h_pil` | Skinande pil | Ljuspil +40 % |
| `h_vack` | Mjuk väckning | Väck upp! brings the friend up with +25 % more health |
| `h_snabb` | Snabba händer | all cooldowns −12 % |
| `h_flod` | Läkeflod | all healing +15 % |
| `h_ro` | Inre ro | health regeneration +50 % |
| `h_skydd` | Skyddande ljus | armor +0.06 |

### Krigare (melee damage)

| Id | Swedish name | Effect |
| --- | --- | --- |
| `k_yx` | Vässad yxa | Yxhugg +30 % |
| `k_storm` | Stormigare steg | Stormsteg cooldown −35 % |
| `k_virvel` | Vildare virvel | Virvelvind +35 % |
| `k_raseri` | Längre raseri | Bärsärkaraseri cooldown −30 % |
| `k_glupsk` | Glupsk yxa | a tenth of the damage you do comes back as health (8 %) |
| `k_hjarta` | Bärsärkens hjärta | health +12 % |
| `k_kraft` | Bärsärkens kraft | all spells +10 % |
| `k_egg` | Skarp egg | critical hits +10 percentage points |

### Magiker (ranged damage)

| Id | Swedish name | Effect |
| --- | --- | --- |
| `m_eld` | Hetare eld | Eldboll +30 % |
| `m_is` | Kallare is | Isspjut +35 % |
| `m_ask` | Åskmoln | Åskregn +35 % |
| `m_blink` | Kvickt hopp | Blink cooldown −40 % |
| `m_snabb` | Snabb magi | all cooldowns −12 % |
| `m_kraft` | Runkraft | all spells +10 % |
| `m_tur` | Lyckoträff | critical hits +12 percentage points |
| `m_skal` | Magiskt skal | damage taken −8 % |

### The whole party

| Id | Swedish name | Effect |
| --- | --- | --- |
| `p_hjarta` | Gemensamt hjärta | everyone's health +10 % |
| `p_vila` | Vilostenarnas sång | rest stones heal 60 % faster |
| `p_kraft` | Sagans kraft | all spells +8 % for everyone |
| `p_flaska` | Fler flaskor | two healing potions each, and potions heal 15 % more |
| `p_vakna` | Snabb uppvaknande | a fallen friend gets up 40 % sooner |
| `p_fro` | Frörikedom | sagafrön earned +25 % |

---

## 3. Sagafrön and the Yggdrasil shoot

**Sagafrön** (saga seeds) are the meta-currency. They are paid to *each* party member the moment they are earned and kept
on the player (`PlayerState.run.seeds`), so a wipe, a time-out, a dropped connection or a leave costs nothing.

| Earned for | Sagafrön |
| --- | --- |
| a pack cleared | 1 |
| a zone cleared (the gate opens) | 4 |
| a treasure chest opened | 2 |
| the second mid-boss (modifier `vakten`) | 3 |
| the boss, first clear of the chapter | 20 |
| the boss, a replay | 12 |

Bonuses are added to these: `p_fro` +25 %, each modifier +15 %, tree nodes (section 3.1). Only whole sagafrön are paid, but the
fraction a bonus leaves over is carried from one payment to the next (per player, over the run), so a pack that pays 1 still
adds up: over a run the total is the sum of each payment × (1 + bonus), within one sagafrö. A normal run gives about 50
sagafrön (the bots, who skip the side rooms, got 49–51); the whole tree costs 462, so it is some nine runs of growing,
not a grind.

### The Yggdrasil shoot

The server puts the **Yggdrasil shoot** (`yggdrasil`) on the farm next to the arch (the family's own, if they already
planted one, stays where it is and the arch is put beside it). Using it opens the **sagaträd**: the tree below. Planting
a node costs its sagafrön and is permanent; nodes need the node above them.

### 3.1 The upgrade tree (18 nodes, three branches)

*Hjälte* (hero) nodes make the planter stronger. *Gemenskap* (party) nodes help **the whole party while the planter is in
it** (the strongest value of each effect among the party counts; they do not add up between players). *Gård* (farm) nodes
turn what the farm makes into more for the run.

| Id | Branch | Swedish name | Cost | Needs | Effect |
| --- | --- | --- | --- | --- | --- |
| `h1` | Hjälte | Starkare skott | 10 | – | all spells +3 % |
| `h2` | Hjälte | Tjockare skinn | 12 | h1 | health +5 % |
| `h3` | Hjälte | Segerviljan | 20 | h1 | critical hits +4 points |
| `h4` | Hjälte | Hård hud | 25 | h2 | armor +0.03 |
| `h5` | Hjälte | Heltens ande | 30 | h3 | potions heal 10 % more |
| `h6` | Hjälte | Evig låga | 45 | h4 | all cooldowns −4 % |
| `g1` | Gemenskap | Starkare band | 10 | – | rest stones heal 25 % faster |
| `g2` | Gemenskap | Mjukt uppvaknande | 15 | g1 | fallen friends get up 20 % sooner |
| `g3` | Gemenskap | Omval | 30 | g1 | the party may ask for a **new offer** once per run |
| `g4` | Gemenskap | Delad glädje | 25 | g2 | all healing +8 % |
| `g5` | Gemenskap | Hirdens lön | 35 | g3 | the hired companion is 20 % stronger |
| `g6` | Gemenskap | Frögåva | 40 | g4 | sagafrön earned +10 % |
| `f1` | Gård | Större matsäck | 15 | – | a second färdkost slot |
| `f2` | Gård | Gyllene skörd | 20 | f1 | färdkost buffs 25 % stronger |
| `f3` | Gård | Djurens vänskap | 30 | f1 | animal buffs 50 % stronger |
| `f4` | Gård | Extra flaskor | 15 | – | one more healing potion at the start |
| `f5` | Gård | Rikare kistor | 35 | f2 | coins from the run's chests +25 % |
| `f6` | Gård | Världsträdets rot | 50 | f3 | the boss gives 5 more sagafrön *(to the planter only)* |

Total 462 sagafrön for everything.

### How the tree looks

The shoot is an object with a **variant** that grows with the family's progress, counted as all nodes planted by every
player of the farm: variant 0 the shoot (0–2 nodes), 1 a sapling (3–7), 2 a young tree (8–13), 3 a big tree with leaves
(14–23) and 4 the Världsträd, glowing (24 and more). The server updates the object whenever a node is planted, so the
whole family sees it grow. (The art for variants 1–4 is M5c; the client draws variant 0 until then.)

---

## 4. The farm feeds the run

| Farm thing | What it gives in a run |
| --- | --- |
| **Färdkost** (bag items handed in at the arch) | One slot (two with `f1`); the item is used up. Bread: health +6 %. Plättar: cooldowns −5 %. Morotskaka: spells +5 %. Pumpapaj: armor +0.04. Jordgubbssylt: regeneration +40 %. Fisksoppa: damage taken −6 %. Tryffelpasta: spells +8 %. Hjortronsylt: rest stones +40 %. Blåbärspaj: health +8 %, healing +5 %. Läkedryck: three healing potions. Styrkedryck: spells +6 %. All ×1.25 with `f2`. |
| **Companions** (the player's own animals) | A pet that follows (hund, katt…) gives spells +3 %, a mount (horse…) armor +0.02 and health +3 %. An animal with **4 or more hearts** counts double ("cared for"). `f3` makes them 50 % stronger again. Mounts wait at the arch (as in dungeons today) but their buff comes along. |
| **Livestock** (cow, sheep, hen, rabbit, pig in their houses) | **Gårdsglädje**: the average hearts of the farm's animals give health +1 % per heart (0–5 %) to everyone who starts the run. A well-kept farm is a stronger party. |
| **Smedjan** (Smed-Stina's forge, as today) | Forged gear counts through `gearStats`, unchanged. |
| **Smedja** (building) | A built smithy: your weapon is "tempered": spells +4 %. |
| **Stall** (the existing stable) | Mounts count as companions. Without a stall, only pets do. |
| **Örtagård** (herb garden, building) | Two more healing potions at the start, and potions heal 10 % more. |
| **Långhus** (longhouse, building) | The fourth party slot. (It used to unlock the hired companion too; since 2026-11-07 the companion needs nothing.) |
| **Kämpastenen** (as today) | Picks the class and with it the four spells and the class's runor. |
| **Yggdrasil shoot** | Where sagafrön become the tree (section 3). |

The three new buildings are built at the workbench like the stall: `smithy` (Smedja: 30 stone, 10 wood, 3 gold),
`herb_garden` (Örtagård: 10 wood, 20 fiber) and `longhall` (Långhus: 60 wood, 20 stone). The server reads the farm for
them when a run starts (`unlocksOf`).

### Choosing färdkost at the arch

Before the run starts, each player sees the arch window: their class, the färdkost slots (the dishes they carry, as
pictures), and a big **Starta färden** button. The `fardkost` message names the items; the server takes them out of the
bag when the run starts. Nothing chosen is fine.

---

## 5. The run feeds the farm

* **Loot** comes from the tables that exist: zone treasure chests use the biome's dungeon table (`SAGA_TREASURE`), a boss's
  chest its `SAGA_LOOT`, and the `found` rules keep pets, mounts and clothes from repeating. A replay of a boss the same
  game day gives the smaller replay chest, as today.
* **Seeds of crops**: winning gives each player 3–6 seeds of a crop they grow, as a first step; the crops of the next
  chapters come with M6.
* **Decor**: the chapter rewards (`hels_lykta` and the rest) are given when the chapter is cleared, as today.
* **Rare pets and mounts** are the `rare` rolls in the boss tables, as today.
* **Chapters** are cleared by finishing their run: the boss falling puts the dungeon in `cleared` for everyone in the
  party, which is what Völvan's chapters read.
* **Replays are harder**: modifiers (section 1.2), 15 % more sagafrön for each, and a second mid-boss with `vakten`.
* **Statistics** on the player: runs started, won, wiped, timed out, best time per chapter, sagafrön earned in all.

---

## 6. Co-op and solo

* **Starting.** Whoever stands at the arch and uses it starts the run. Family members within 6 tiles of the arch who have
  a class come along. A run cannot start without a class ("Du behöver välja en väg först").
* **Joining.** Anyone who has a class can send `join` at any time while the run lives and there is room (3 players, 4
  with a longhouse). They appear at the **last lit rest stone of the zone** (the start of the zone before any is lit).
  Joining during a pick votes in that pick and appears in the next zone. A joiner who has not cleared the earlier
  chapters can still come: the chapter they help clear is cleared for them (nothing is locked behind anyone).
* **Leaving.** `leave` at any time puts you back at the farm in front of the arch with everything you have. A run with no
  human left ends.
* **Scaling.** Exactly the saga's: `mobHpScale`, `bossHpScale`, `addCount`, `mobDmgScale` by the number of fighters in
  the zone. One human with the hired companion counts as two fighters, so monsters get `SOLO_MERCY` = 0.75 of their
  health on top, which made a solo run winnable with every class *(tuned)*.
* **The hired companion** (no longhouse needed): **Hirdmannen**, a fighter the server runs with the same brain as the
  test bots (`runbot.ts`). `companionClass` in `run.ts` chooses its class from what the humans lack: one human gets a
  healer (a tank for a healer); two humans get one only when the pair has no healer (a healer) or no tank (a tank), so
  tank + healer goes alone and two damage dealers get a healer; three or four never get one. It is the first human's
  level, wears the starter set, follows, stands out of telegraphs, interrupts, heals and revives, never takes loot or
  sagafrön and is gone when the run ends. A friend who joins sends it home (the party is then real people; the party is
  not re-balanced with a new hire). `g5` makes it 20 % stronger. A player can still start without it (`companion:
  false` on `run start`), which is the plain, much harder one-fighter run. Monsters count it as a fighter (a duo with it
  is three fighters), only a single human with the hired companion gets `SOLO_MERCY`.

---

## 7. Falling and ending

* A single player who falls gets up at the last rest stone after 10 s, or sooner if a healer wakes them: the saga's rule.
* **A wipe** (everyone down) is a four second pause and then the run ends: a banner, and everyone is back at the farm in
  front of the arch, full health, with their bag, their coins and the sagafrön they earned so far. Nothing is taken.
* **Victory** (the boss falls): the banner, the chest, 90 seconds, then the farm.
* **Time** does not end a run. At 30:00 (and every 10 minutes after) a banner suggests going home; the party decides
  (owner, 2026-11-06). The only ways a run ends are the boss, a wipe, leaving and the 60 s with no human online.
* **Leaving** and a **dropped connection** (an offline member stays a quiet member for the rest of the run; when the last
  human is offline for 60 s the run ends).
* Every end writes the run's statistics and sends the same summary: outcome, time, sagafrön earned, zones cleared.

---

## 8. Kid rules

* Short texts, a picture for every action. Nothing in the run needs reading: the arch window is the class picture, the
  dish pictures and one big button; the pick is **three big cards**, each a large icon (the runa's picture), its Swedish
  name in four words or fewer, and a one-line effect with a number in the picture ("+25 %" under a flame). The card the
  most people tapped glows; there is no timer bar the 7-year-old can lose to, only a gentle one; the first card is the
  fallback.
* Every card has an `icon` (an emoji, drawn by the client's emoji sheet) and a `text` (at most 40 characters).
* Falling, the wipe and the time-out say "Ni vaknar vid vilostenen", and the time nudges say "Snart dags att gå hem" and "Dags att gå hem?" with a kind line, and never anything about losing or being too slow; they are short and in Swedish like everything else.
* The same safety as the saga: nothing bleeds, monsters poof, the party is always at the farm again with what it has.
* A parent's play hours, pause and remove work as before: they take the member's device offline, and the run treats that as a
  dropped connection (section 7). It goes on for the others with that member offline, and ends after 60 seconds with no
  human online. They are not a `leave`: the member stays in the run's party until it ends.

---

## 9. What the bots found (the numbers behind the numbers)

Bot parties (`runbot.ts`, played by `runplay.ts`, checked in `run.test.ts`) play whole runs at hero level 3 in the starter
set, chapter 1. *Careful* bots step out of telegraphs and stop the boss's big attacks; *clumsy* bots do neither, think for
a moment between moves and miss a third of their chances, which makes them about 2.2–2.5 times slower, like the kids.
Minutes until the boss falls (3 runs each):

| Party | Careful | Clumsy |
| --- | --- | --- |
| 1 player + Hirdmannen | 6–7 min | 12–14 min |
| 2 players | 11–13 min | 22–25 min |
| 2 players without a healer + Hirdmannen (healer) | 8–11 min | 16–19 min |
| 3 players | 9–12 min | 19–26 min |
| 4 players (longhouse) | 7–9 min | 15–19 min |

**Solo, measured 2026-11-07 (level 3, chapter 1, seeds 1–20 for both the farm and the run; wins per 20; minutes are for the runs that won).** The
owner could not win alone: without the companion (no longhouse) a lone player wins almost never, and with a longhouse a
clumsy lone player wins almost always, so the fix was to give everybody the companion, not to retune the monsters.

| Alone | Careful, no companion | Clumsy, no companion | Careful + Hirdmannen | Clumsy + Hirdmannen |
| --- | --- | --- | --- | --- |
| Väktare | 0/20 (dies in zone 2) | 0/20 (zone 2) | 20/20, 9.9 min | 20/20, 17.7 min |
| Helare | 19/20, 20.6 min | 17/20, 34.2 min | 20/20, 10.1 min | 19/20, 16.1 min |
| Krigare | 9/20, 7.2 min | 4/20, 17.1 min | 20/20, 7.0 min | 20/20, 13.9 min |
| Magiker | 0/20 | 0/20 | 19/20, 11.1 min | 20/20, 18.0 min |

Pairs of two damage dealers were the other hole (a pair with no healer): Krigare + Magiker won 4/20 careful and 0/20
clumsy; with the Hirdmannen as their healer 20/20 and 20/20 (9.2 and 17.3 min). Väktare + Helare is unchanged (20/20,
12.7 and 24.8 min, no companion). Level 1 and 2 heroes, clumsy, with the companion: 18–20 of 20 on every class. The
monsters' numbers were **not** changed: `ZONE_HP`, `ZONE_PACKS`, `SOLO_MERCY` and the saga's scaling stay as they were,
and three- and four-player parties play exactly as before.

The exact table from the last run of the tests is in the pull request. Tuned: `ZONE_HP`, `ZONE_PACKS`, `SOLO_MERCY` and
the hired companion's class (`companionClass` in `run.ts`: a healer if the humans have none, else a tank, else nobody).

`run.test.ts` also has the clumsy solo bot win at least 7 of 10 runs on every class and in the two-damage-dealer pair, with
no longhouse, in 10–30 minutes. The tests fail if a careful party ever stops
winning, if any party gets stuck or takes longer than the 30 minutes to reach the boss (the tuning target; the game itself no longer stops there), or if the careful trio's time leaves 4–15 minutes.
