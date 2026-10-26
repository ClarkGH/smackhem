# Battle Spike: Enemies, Battle Log, Menu, and Party Display

Status: spike, pre-code. Nothing here is implemented. Snippets are illustrative, not 1:1 with code (same as [architecture.md](architecture.md)).

## Table of Contents

- [Goal](#goal)
- [Decisions so far](#decisions-so-far)
- [How it fits what exists](#how-it-fits-what-exists)
- [Battle log](#battle-log)
- [Battle menu](#battle-menu)
- [Characters and stats](#characters-and-stats)
- [Visual direction (draft)](#visual-direction-draft)
- [Proposed seams](#proposed-seams)
- [Contracts](#contracts)
- [Open flags](#open-flags)
- [Prototyping plan](#prototyping-plan)
- [Slice order](#slice-order)
- [Learning questions](#learning-questions)
- [Work log](#work-log)

## Goal

We have NPCs: billboards in the world you can talk to, and a speech bubble that owns the tick. We also have pure combat rules in [combat.ts](../src/core/combat.ts) and [combatSheets.ts](../src/core/combatSheets.ts) (sheets, HP, flat attacks, battle outcome). Next comes an aggressive NPC: an enemy that fights you.

This spike settles three things before any code is written:

1. The battle log
2. The battle menu
3. How the characters and their stats are shown

It also sets the seams that later slices hang off.

## Decisions so far

- **Stage: in the world, Chrono Trigger style.** There's no separate battle screen. The fight happens where you stand, as billboards. Enemies move and party members can change places.
  - Open for prototyping:
    - tilting the camera so the ground reads flatter and easier to see
    - limiting the area enemies can move in
- **Turns: ATB, with Active and Wait modes like Chrono Trigger.** Slice 1 runs one actor at a time. The seams are shaped so ATB can be added later without rewriting them.
- **Starting a fight: many ways, one seam.** The first slice uses Interact: some conversations end in a fight. Enemies that chase you come after slice 1. However a fight starts, it ends in the same "battle requested" event.
- **UI is prototyped before it's built.** Clark is drawing ideas and sharing them for feedback. They'll be judged against the [rubric](#judging-rubric) below.

## How it fits what exists

Most of the plumbing is already there. Where something exists, reuse it.

| Need | What exists | How it's reused |
| --- | --- | --- |
| Start a fight after talking | `GameLoop` closes `activeSpeech` on Interact or Back ([gameLoop.ts:275](../src/core/gameLoop.ts#L275)) | When the speaker has an `encounterId`, closing the conversation publishes `battle_requested` |
| Enemy placement in chunks | `NpcJSON` ([chunkLoader.ts:22](../src/core/chunkLoader.ts#L22)) and `Npc` ([world.ts](../src/core/world.ts)) | An optional `encounterId` field. A hostile NPC is still an NPC until the fight starts |
| What an encounter contains | Sheet tables in [combatSheets.ts](../src/core/combatSheets.ts) | An `ENCOUNTERS` table in the same `Readonly<Record<Id, Def>>` style |
| Rules | `applyAttack`, `getBattleOutcome`, `isLoss` in [combat.ts](../src/core/combat.ts) | The battle system calls them. It never redoes them |
| Battle music | `game_mode_changed` drives [modeAudio.ts](../src/core/audio/modeAudio.ts) | A new `'battle'` `GameMode` gets music without extra wiring |
| Modal tick ownership | The pause menu, then speech, each own the tick ([systems.md](systems.md#menu-system)) | Pause, then speech, then battle. A battle can still be paused |
| Things drawn over heads | `OverheadOverlays` projects with `RenderSystem.projectToViewport` ([overheadOverlays.ts](../src/core/overheadOverlays.ts)) | Damage numbers and the target cursor are placed the same way |
| UI as data | `MenuView` / `MenuOverlay`, rebuilt only on change ([menu.ts](../src/core/menu/menu.ts), [menuOverlay.ts](../src/services/menuOverlay.ts)) | `BattleView` / `BattleOverlay` follow the same pattern. Command rows reuse `MenuItemView` |
| Mouse without coordinates in core | `menuPointer { index, clicked }` | The platform hit-tests the battle sprites it drew and reports an index |

**Mode recommendation:** add a new `GameMode` `'battle'`, and save the mode to return to (`world_3d` or `instance_3d`). This follows the `savedCameraState` pattern. A boolean like `activeSpeech` would also work, but then battle music would need its own event.

**A new mode touches existing mode checks.** Code that branches on `gameMode` needs a look when `'battle'` lands:
- [overheadOverlays.ts:78](../src/core/overheadOverlays.ts#L78) only projects over heads in `world_3d`/`instance_3d`. Unless it accepts `'battle'`, damage numbers and the target cursor quietly draw nothing. **Fixed in slice 3**, together with the battle view.
- [modeAudio.ts](../src/core/audio/modeAudio.ts) has no `'battle'` case, so entering a fight leaves the ambience as it is. Leaving one restarts or stops it based on the mode you return to. **Battle audio is added once the mode exists**, and it doesn't block slice 2.
- The instance circle is drawn from the instance flags, not the mode ([renderSystem.ts:303](../src/core/lighting/renderSystem.ts#L303)). So it survives a fight that starts inside an instance.

## Battle log

The log has two separate jobs. The design depends on keeping them apart.

1. **The record:** what happened, as typed entries in core.

   ```ts
   type BattleLogEntry =
       | { kind: 'battle_started'; encounterId: string }
       | { kind: 'attacked'; actorId: CombatantId; targetId: CombatantId; attackId: AttackId; damage: number }
       | { kind: 'defeated'; id: CombatantId }
       | { kind: 'battle_ended'; outcome: BattleOutcome };
   ```

   Tests assert on entries, never on display strings. Text is built from entries when the view is built. That keeps wording out of core logic and makes translation possible later.

2. **The display:** how it's shown. These are the candidates to prototype, and every one reads the same entries:
   - **Chrono Trigger style:** the attack name in a banner at the top, plus damage numbers popping over the target's head. There's no history.
   - **Classic text log:** a box with the last N lines ("Goatee attacks! Circle takes 2 damage.").
   - **Both:** a banner and floating numbers by default, with the full log available on a button.

**Pacing:** each action resolves on its own beat, and the HP on screen changes on that beat. The alternative is to resolve a whole round instantly and then play it back. That makes the HP bars show the end-of-round values before the messages explaining them. With ATB, actions are one at a time anyway, so per-beat resolution is the natural fit.

**Beat length:** a fixed sim duration, which Interact can skip. Message speed could go in [settings](../src/core/settings/settings.ts) alongside `reducedMotion`.

## Battle menu

- **A separate `BattleMenu`, not more screens on `MenuSystem`.** The structure is the same: a stack where Back goes up one level, here Command → Target. But the pause menu has to keep working over a battle, so the two can't share selection or stack state. Pause sits above battle in tick ownership, as it does above speech.
- **Commands:** slice 1 has `Attack` only. Later: Tech, Item, Defend, Run. Each is a `MenuItemView`, so disabled rows (Run in a boss fight, say) already have a field.
- **Targeting points at the field, not a list.** In Chrono Trigger the cursor sits over the sprite. `navigate` moves it between valid targets. Core holds only the targeted `CombatantId`. The overlay draws the cursor at the projected position over that combatant's head.
- **Mouse:** the platform hit-tests the billboards it drew and sends back an index. It's the same path as `menuPointer`, and core never sees coordinates (I-1).
- **Active and Wait:**
  - In **Wait** mode, gauges stop while a command or target menu is open.
  - In **Active** mode, they never stop.
  - The setting lives in `Settings`.
  - Slice 1 has no gauges, so this is only a seam for now.

## Characters and stats

- **Party panel:** one row per member, showing:
  - name
  - HP current/max (a bar next to the number)
  - ATB gauge
  - later, MP and status icons

  Chrono Trigger puts it bottom-right. Drakkhen-style puts it as a strip. Both are worth prototyping.
- **Enemies:** name only by default (enemy HP hidden, the classic JRPG choice). Prototype a version that shows enemy HP too, since it's a feel question.
- **Names:** sheets don't have names yet. `PlayerSheet` and `EnemySheet` need a `name`. Duplicate enemies get a letter: "Goatee A", "Goatee B".
- **Flags, not looks:** a `CombatantView` carries `isActing`, `isTargeted` and `isDefeated`. The overlay and renderer decide how those look (outline, bounce, flash, grey-out). Core makes no GPU or DOM calls (R-1, P-1).
- **Battle positions are separate from world positions.** Each combatant gets its own battle `position`. When the party pops out of the leader into a line, or enemies reposition, the world's `Npc` data is never touched (W-1). When the fight ends, the world is as it was, minus whoever lost.

## Visual direction (draft)

From Clark's second round of mockups, 2026-10-25. This is the general direction, to be fine-tuned during the slices.

The target is a fixed-aspect game screen on desktop and console, played with a controller, keyboard or mouse. Phones and touch aren't a target, so the HUD scales with the screen and never rearranges itself.

- **Top banner:** a single banner across the full width of the top of the screen, shown only while something is being announced. It's the main log display. The compact log panel is optional.
  - In Active mode, banners are frequent.
  - Keep it thin, or move enemy name tags down while it shows.
- **Party panel:** one block per member, two rows:
  1. Two columns, HP and TP, with the numbers drawn inside each bar. The bars are half the width of the mockup's.
  2. Buff and debuff icons. The row is always there, even when empty, so the layout never jumps.
- **HP color:** green at full → yellow → gradually red → black near zero, loosely after Resident Evil.
  - Brightness must fall steadily along the ramp, so a color-blind player still reads "darker = worse".
  - The numbers and a static low-HP icon back it up.
  - Text inside the bar stays readable over both the filled and empty parts, e.g. drawn twice, clipped at the fill edge.
  - A minimum bar width set by text scale, so "9999/9999" fits at 2×. Max HP may reach 9999; modern resolutions leave room for it.
- **Always visible:** ATB and TP for every member.
- **ATB:** a border, probably around the portrait, that fills as the gauge charges and thickens when full (ready). "Acting" keeps its own signal (the lit row and the ring at the feet), since under ATB more than one member can be ready.
- **Portrait instead of name** in the party panel. The banner and log still use names, and enemies keep their name tags.
- **Colors are the overlay's choice.** Core sends `hp`/`maxHp`, and never a color (R-1).
- **Camera: looking down on the fight, Chrono Trigger-style.** The fight stays in the open world. The battle camera looks **15° down from 7 units away** (Clark's pick).
  - In the engine these are named, tunable constants, because debugging will move them.
  - Billboards still face you and get blob shadows on the ground.
  - Measured in the prototype:
    - At 15° the engine's upright billboards barely squash (106×104 px), so they work as they are.
    - At 7 units the perspective is strong: party cards are about 19% of the screen's height, enemies at the back about 42 px.
    - The party's heads reach the enemies' feet line, so spacing and movement keep them from covering each other.
- **Characters move in combat, Chrono Trigger-style.** Attackers and casters run to their target across the ground, act, and run back. Battle positions are real, changing state.
- **Idle pan, a comedy beat.** While the game waits on the player:
  1. The camera swings around and up to look straight down.
  2. The billboards stop facing the camera for a moment, so they go paper-thin and then show as flat cards from above.
  3. They flip back to face you as the camera returns.

  Any input cuts it short. Reduced motion skips it.
- **Nothing covers a character.** The HUD keeps to its own bands: the banner along the top, and the party panel and command menu along the bottom. Battle positions stay in the open field between them.
- **The command menu moves only when it has to.** It sits in one of a few fixed slots, beside the party panel by default (in the HUD band, off the field).
  - It moves to the next free slot only if it would cover the acting character.
  - It never follows a character. Under Active ATB characters keep moving, and a menu chasing them would jitter.
  - This replaces round 1's "anchored, not tied to a character". It's still anchored, but now to whichever slot is free.
- **Status icons:** an icon has a letter and an ▲/▼ for buff or debuff, not color alone. Low HP and KO get icons automatically. Tried in the [party panel prototype](prototypes/party-panel.html).
- **Statuses come in opposite pairs that cancel**, e.g. attack up and attack down, haste and slow. Applying one to someone with the other removes both, so a pair never shows at once.
- **Poison and regen are the exception.** In the rare case a member has both, both stay on, each ticking on its own clock, so you see HP drop and recover on the right ticks.

These status rules are combat rules, so they live in core when statuses arrive, not in the view.

## Proposed seams

Bare bones and illustrative. Clark writes the real ones.

```ts
// core/battle/battle.ts
type CombatantId = string; // e.g. 'party:0', 'enemy:1'

interface Combatant {
    id: CombatantId;
    side: 'party' | 'enemy';
    unit: PartyMember | Enemy; // from combat.ts, HP lives here
    position: Vec3; // battle position, not world position
    // No atb field until ATB (slice 5): a gauge with no gameplay effect is dead state
}

type BattlePhase = 'waiting' | 'choosing_command' | 'choosing_target' | 'acting' | 'ended';

type BattleCommand = { kind: 'attack'; targetId: CombatantId };

interface BattleState {
    encounterId: string;
    npcId: string; // who started it, removed from the world on a win
    combatants: Combatant[];
    readyQueue: CombatantId[]; // slice 1: fixed order. ATB: filled as gauges reach 1
    phase: BattlePhase;
    actingId: CombatantId | null;
    // No command field: confirming resolves in the same tick, so it would never be seen.
    // It comes back when a wind-up between choosing and landing makes it real state.
    log: BattleLogEntry[];
    outcome: BattleOutcome; // 'ongoing' until decided, from combat.ts, so no null is needed
    returnMode: GameMode;
}

// core/events.ts
| { type: 'battle_requested'; encounterId: string; npcId: string }

// services/battleOverlay.ts
interface CombatantView {
    id: CombatantId;
    name: string;
    hp: number | null; // null when hidden (enemies). May become a named visibility policy (scans, bosses)
    maxHp: number | null;
    isActing: boolean;
    isTargeted: boolean;
    isDefeated: boolean;
}

interface BattleView {
    party: CombatantView[];
    enemies: CombatantView[];
    log: string[]; // already worded, newest last
    commands: { items: MenuItemView[]; selected: number } | null; // null when no menu is open
    textScale: number;
}

interface BattleOverlay {
    render(view: BattleView | null); // null hides it
}
```

**`BattleView` isn't frozen.** It's the starting contract for the prototypes. Judging them is expected to change it. The [visual direction](#visual-direction-draft) means `CombatantView` will gain the following, each only in the slice that makes it real:
- `portraitId` (asset ID, A-1)
- `tp` / `maxTp`, when Tech exists. The sheets have no TP yet
- `atb` (slice 5)
- `statusIds`, when buffs and debuffs exist
- A screen anchor for each combatant (`x`, `y`, 0..1 across the viewport, like `SpeechView`), so the menu can tell which slots would cover the actor. Core already projects over-head points this way. Who picks the slot (core, so it's testable, or the overlay) is decided in slice 3

**Why `readyQueue` instead of "whose turn":** in slice 1 the queue is just filled in a fixed order (party, then enemies). Under ATB, a combatant is pushed onto it when its gauge fills. Everything that reads from the queue stays the same, and only the code that fills it changes.

**Later triggers:** chase, contact, random encounters and scripted fights all publish the same `battle_requested`. When ambush and preemptive starts arrive, they become an `initiative` field. It's not added now (YAGNI).

## Contracts

Settled by Clark on 2026-10-25, after review. Every one of these gets a scenario test in the slice that builds it.

**Who owns what**
- `BattleState` lives in `GameState.discrete` and is the battle's true state:
  - combatants and HP
  - phase
  - the ready queue and the current actor
  - the log
  - the outcome
- `BattleMenu` owns the choice before it's confirmed: the selected command row, the Command → Target stack, and the target cursor.
- **The menu reports, and the battle system resolves.** Confirming hands a `BattleCommand` to the battle system, which checks it (is the target still standing, is it this actor's turn?) and resolves it exactly once. The menu never applies combat rules.
- `BattleView` is built from both and never written back. The UI never decides on its own that an attack has happened. It shows what core says happened.

**Starting a fight**
- Only Interact starts it. Back closes a hostile conversation without a fight. The enemy stays and can be talked to again.
- Once `battle_requested` is handled, speech is closed and stays closed. It can't come back and compete with the battle for the tick.

**Pause during a battle**
- Pause suspends battle progress: no action resolves, no enemy acts, and no beat timer runs.
- It destroys nothing. The battle state and the menu state (including a half-chosen target) survive.
- Closing the pause menu hands control back to exactly where the battle was.

**Each turn (slice 2)**
1. Choose a command
2. Choose a target
3. Resolve
4. Update HP and append log entries
5. Wait for the beat to end, or for Interact to skip it
6. Move to the next actor, or end the battle

**One confirm, one resolution.** Leaving the choosing phase is what resolves the action, so a held button or an extra tick can't resolve it again. Test: one confirmed command produces exactly one `attacked` entry and one HP change.

**The log records resolved facts, in a fixed order.** An `attacked` entry means the attack landed, not that it was chosen. When an attack ends the fight, the order is always:
1. `attacked`
2. `defeated`
3. `battle_ended`

`battle_started` always comes first.

**Winning and losing**
- **Win:** the source NPC is marked defeated and disappears from the world.
- **Loss:** an explicit game-over step (its own state or event, not `quit_to_main_menu_requested`) that goes to the main menu on confirm. A loss never removes the enemy.

**Defeated means defeated**
- A serializable `defeatedNpcIds` list in discrete state, filtered out when chunks load.
- It's a marked stopgap until the event flag / quest system replaces it.
- Scenario test: win, walk far enough to unload the chunk, come back, and the enemy is still gone.

**Coming back is tested, not assumed**
- `returnMode` is the start of the return contract, not all of it.
- Scenario tests cover ending a fight from both `world_3d` and `instance_3d`, and check:
  - the camera
  - the instance flags and circle position
  - the interact target
  - that movement works again
- Today the instance's state lives in flags that a fight doesn't touch, so restoring the mode should be enough. The tests are what prove it.

**The camera doesn't move in a fight, for now**
- Slices 1 and 2 leave the camera alone, so there's nothing to restore.
- Tilting is decided from what the field prototype actually needs.
- If it happens, a battle gets its own camera snapshot. It never reuses `savedCameraState`, which the instance already owns.

## Open flags

Still open, and Clark's call per [CLAUDE.md](../CLAUDE.md).

1. **Allocation (M-1, M-2).** Chunk loading is currently the only allocation boundary. Should battle start be a second one, where combatants and the log are built?
   - The review recommends allocating encounter state at battle start and keeping per-tick work allocation-free.
   - It also recommends no ring buffer for the log until there's a known maximum size and lifetime, since entries come once per action, not once per tick.
2. **Seeded RNG.** Deferred until combat actually needs randomness (target choice with more than one party member, or damage variance). Fixed turn order and flat damage need none. When it arrives it has to be seeded, since `Math.random` breaks the determinism the fixed-step loop and scenario tests rely on.
3. **More log entry kinds:** healing, items, status, fleeing. They're added with the mechanic that needs them, not ahead of it.
4. **Poison and regen on the same tick.** When both land on one tick, which goes first? If poison goes first, it can KO a member that regen would have kept alive, and regen can't revive them. The other order changes who survives. The prototype goes poison first. Settle it when statuses arrive, and test it.
5. **Keeping characters in the open field without core knowing pixels.** Core can't know how tall the HUD is (that's the platform's business, and it changes with text scale). Two candidates:
   - The battle area's bounds and the battle camera's framing are chosen together, so the area always projects into the screen above a fixed HUD band, e.g. the bottom 30%.
   - Text scale has a ceiling for the battle HUD.

   Decide in slice 4, together with camera tilt. The prototype shows that at 2× with four members, the panel eats a lot of the field.

   A third candidate, from the camera prototype: an off-centre projection (lens shift) that puts the view's centre in the middle of the open field instead of the middle of the screen. With it at 40°, the party's feet land at y 248 and the area's near edge at 274, just above the panel (280 at 1×). At 62° the near edge (287) runs under the HUD.
6. **Billboards and shadows under a battle camera.**
   - Engine billboards only turn to face you and always stand straight up ([renderSystem.ts:119](../src/core/lighting/renderSystem.ts#L119)). Looking down squashes them: about 70% height at 40°, about 30% at 62°.
   - Options: tilt billboards toward the camera in battle (full height, but they lean back from their feet), or draw sprites for the angle the way Chrono Trigger does.
   - Shadows: the renderer already casts sun shadows. A flat card cast by a low sun gives a thin sliver. The prototype uses a blob shadow on the ground instead, which reads at any sun angle.

   Decide in slice 4. *Update:* at Clark's 15° the squash is negligible, so upright billboards stay. Shadows are still open.
7. **The idle pan, in engine terms.**
   - **Trigger:** "waiting on the player" probably means Wait mode, with a menu open and no input for a while (8 s in the prototype). In Active mode the fight never waits, so does it ever play there?
   - **Who owns what:** core declares the camera path and a "billboards keep their facing" flag. The renderer does the drawing (R-1).
   - **Cancelling:** input must cancel it immediately, with the camera snapping back. A controller press can't be eaten by a gag.
   - **Reduced motion:** skips it.

## Prototyping plan

**UI prototypes live in [docs/prototypes/](prototypes/) as standalone HTML files, opened locally.**

- They break the engine's hard rules on purpose: DOM everywhere, `Math.random`, allocating freely.
- That's fine because they sit outside `src/`. Lint and [projectStructure.spec.ts](../src/projectStructure.spec.ts) never see them, and nothing in the engine imports them.
- They're throwaway. When a design wins, its ideas move into the real overlay and the prototype can be deleted.
- This replaces the earlier idea of a separate prototype repo.

**The contract between a prototype and the engine is `BattleView`.** Prototypes render JSON fixtures of that shape. Whichever prototype wins carries straight over as a web `BattleOverlay`, and any field a prototype needs that isn't in `BattleView` shows up as a change to the seam.

**Prototype the whole screen, not widgets.** The party panel, target cursor and log compete for the same space around the field, so each design is judged with all three on screen at once. A great panel that hides the cursor fails.

**Prototyping doesn't block slices 1 and 2.** Both are headless. Only slice 3 (the view) waits for a winner.

### Fixtures

1. 1 vs 1 at the start of a fight (the goatee circle)
2. Mid-fight: the party member's turn, command menu open
3. Targeting: cursor on an enemy
4. Crowded: 4 party vs 5 enemies, names long enough to wrap
5. Danger: a party member at low HP, one defeated
6. Won, and lost
7. Each of the above at 2× text scale

### Judging rubric

Used to judge and rank the drawings and prototypes.

| Criterion | Question |
| --- | --- |
| Controller first | Can every step be done with a d-pad and two buttons (I-2)? |
| At a glance | Is it clear within a second whose turn it is, what's targeted, and who's in danger? |
| The field is the battle | Does the UI leave the fight visible? In this style, covering the field is a real cost |
| Text scale | Does it still work at 1.5× and 2× menu text size? |
| Reduced motion | Does it still read without floating numbers or bounces? |
| Scales | Does it work with 1 party member and with 4, and with 1 enemy and with 5? |
| Ports | Could it be drawn by a non-DOM renderer (no CSS-only tricks the native side can't match)? |
| Log | Can you tell what just happened if you looked away for a moment? |

## Slice order

One moving part per slice, tests green before the next.

1. **Start a fight:**
   - Interact closes a hostile NPC's conversation → `battle_requested` → mode `battle` → `BattleState` created.
   - Back closes it without a fight.
   - Pause still works.
   - Return-path tests from `world_3d` and `instance_3d`.
   - Scenario tests on the stub platform.
2. **Headless turn loop, fully playable without visuals before any field work:**
   - the turn steps in [Contracts](#contracts)
   - the enemy uses its basic attack
   - a win removes the enemy and records it in `defeatedNpcIds` (with the chunk-reload test)
   - a loss goes to game over
   - pausing mid-target changes nothing
   - one confirm resolves exactly once
   - log entries are asserted, in order
3. **View:**
   - `BattleView`, a `NullBattleOverlay` for stub, and a minimal web overlay based on the prototype that wins.
   - Over-head projection accepts `'battle'`.
4. **Field:** the party pops out to battle positions, enemy billboards, blob shadows, the target cursor over heads, and the battle camera (15°, 7 units, tunable).
   - Then characters run to their target and back. That run-up is the wind-up that brings back `BattleState.command`, since a confirmed command now lasts until the hit lands.
   - The idle pan comes after that.
5. **ATB:** the `atb` gauge field arrives here, filled from sim time (clock only, T-1), plus the Active/Wait setting.
6. **More ways in:** chase and contact triggers, initiative, Run.

## Learning questions

For Clark to answer first; discussed after.

1. What would go wrong if the battle resolved a whole round at once, and the overlay drew `combatant.unit.hp` directly?
2. What would go wrong if `BattleMenu` were just more screens added to `MenuSystem`, and you paused during target selection?
3. What would go wrong if winning removed the enemy with `world.removeNpc(id)` and nothing else, and you walked a few chunks away and came back?

## Work log

### 2026-10-25: Spike kickoff

**Read:**
- [combat.ts](../src/core/combat.ts), [combatSheets.ts](../src/core/combatSheets.ts), [combat.spec.ts](../src/core/combat.spec.ts) (the existing rules)
- [gameState.ts](../src/core/gameState.ts), [events.ts](../src/core/events.ts), [gameLoop.ts](../src/core/gameLoop.ts) (the speech-close path)
- [interaction.ts](../src/core/interaction.ts), [overheadOverlays.ts](../src/core/overheadOverlays.ts), [world.ts](../src/core/world.ts), [chunkLoader.ts](../src/core/chunkLoader.ts)
- [menu.ts](../src/core/menu/menu.ts) and the overlay services
- [instance.ts](../src/core/instance.ts), [scene.ts](../src/core/scene.ts), [services/input.ts](../src/services/input.ts)
- [INDEX.md](INDEX.md), [architecture.md](architecture.md), [systems.md](systems.md), [events.md](events.md), [LEARNING.md](LEARNING.md) (read only)

**Found:**
- Combat rules exist and are pure, but nothing runs a battle.
- Sheets have no names.
- `party.ts` is still a TODO.
- The "owns the tick" pattern (menu, speech) and the "view as data" pattern (`MenuView`) already cover most of what a battle needs.

**Decided with Clark:**
- In-world billboards, Chrono Trigger style.
- ATB with Active/Wait, starting one actor at a time.
- Interact as the first trigger, with chase later.
- Doc and seams first, then UI prototypes.

**Recommended, pending Clark:** the `'battle'` game mode, a separate `BattleMenu`, typed log entries, `BattleView` as the prototype contract, and a separate prototype repo. See [Open flags](#open-flags) for what's undecided.

### 2026-10-25: Review folded in

An outside review of this spike came in. It approved the spike as pre-code, on condition that state ownership, defeat persistence, and Back/loss/pause were settled first.

**Taken from the review:**
- `atb` dropped from the slice 1 seam (dead state until ATB).
- Losing never removes the enemy.
- Defeat persistence is a contract with a reload test, not just a flag.
- Pause behavior is spelled out.
- No ring buffer for the log yet.
- RNG is deferred.
- `BattleView` isn't frozen.
- Slice 2 must be playable without visuals before field work starts.

**Not taken:**
- *"Make `outcome` null until ended":* `BattleOutcome` already has `'ongoing'`, so `null` would be a second way to say "not over".
- *"The target ID lives in battle state":* split instead. The cursor belongs to `BattleMenu` until it's confirmed, and the confirmed `BattleCommand` belongs to `BattleState`.

**Decided by Clark:**
- Only Interact starts a fight.
- A loss is an explicit game-over step.
- `defeatedNpcIds` is the stopgap, with a reload test.
- `BattleState` lives in `discrete`.

See [Contracts](#contracts).

### 2026-10-25: Second review, implementation watch-points

**Taken:**
- "One confirm, one resolution", with a test.
- Log entries are resolved facts in a fixed order.
- The return path is covered by scenario tests rather than trusting `returnMode`.
- Prototype the whole screen together.

**Found while checking the return-path point:**
- [overheadOverlays.ts:78](../src/core/overheadOverlays.ts#L78) would silently hide over-head drawing in a `'battle'` mode.
- `modeAudio` has no `'battle'` case.
- The instance circle survives a fight because it's drawn from flags, not the mode.

**Raised as a result:** `BattleState.command` may be dead state in slice 2, and a battle camera would collide with `savedCameraState`. Both were settled in the next entry.

**Differs from the review's order:** the review puts prototyping before slice 1. Slices 1 and 2 are headless, so they can go ahead alongside prototyping. Only slice 3 waits.

### 2026-10-25: Seam settled

**Decided by Clark:**
- `BattleState.command` is dropped. It comes back only when a gameplay step needs a confirmed command to last, such as a wind-up before the attack lands.
- `BattleMenu` owns the unconfirmed choice and reports the confirmed one. The battle system checks it and resolves it exactly once.
- The camera stays put in slices 1 and 2. Any tilt is decided from the field prototype, and gets its own snapshot rather than `savedCameraState`.
- The over-head projection fix lands in slice 3. Battle audio lands once the mode exists, and neither blocks the headless work.

**Open flags remaining:** allocation at battle start, seeded RNG, and new log entry kinds.

**Next:** Clark writes the slice 1 seams.

### 2026-10-25: Mockup rounds 1 and 2

**Round 1:** a single in-world screen. Problems found:
- The acting marker and target marker looked the same.
- The picture's state contradicted itself (a defeated enemy was still standing and targeted).
- The UI was spread across three corners.
- The panel rows were cluttered.
- Only the easy case was shown.

**Round 2:** compact log vs banner, each at 1 vs 3 and 4 vs 5. Clark picked the general direction, recorded in [Visual direction](#visual-direction-draft): the full-width banner, the two-row party panel, the HP ramp, the ATB border, and portraits instead of names.

**Still to check against the rubric:** 2× text scale and the low-HP fixture. Neither round showed them.

### 2026-10-25: Party panel prototype

Built [prototypes/party-panel.html](prototypes/party-panel.html) with Claude. It's a self-contained page, and nothing in `src/` uses it.

**It covers:**
- The draft panel, with the HP ramp checked against brightness alone and color-vision filters.
- The 2× text scale and the "999/999" case.
- A fake fight to tell ready from acting.

**Clark kept:** the status icons. He added:
- Opposite statuses cancel.
- Poison and regen can both be on, ticking separately.

This raised [open flag 4](#open-flags) (same-tick order).

**Menu placement (Clark):** the menu moves so it never covers the acting character, and ideally nothing covers any character. The prototype gained:
- the command menu, in fixed slots
- draggable characters
- outlines on any character the HUD covers
- an "open field" overlay

This raised [open flag 5](#open-flags).

**Camera (Clark):** the fight stays in the open world, seen from a Chrono Trigger-like angle, with billboards facing you and shadows.

The prototype replaced its painted backdrop with:
- a 3D ground under an orbit camera, using the engine's 60° field of view
- angle presets
- the battle area drawn on the ground
- blob shadows
- a billboard mode toggle: upright, as the engine does today, or tilted to the camera

The numbers are in [open flags 5 and 6](#open-flags).

**Camera settled, movement and idle pan (Clark):**
- The battle camera is 15° down at 7 units, kept tunable.
- Characters run to their targets, Chrono Trigger-style.
- An idle pan where billboards briefly stop facing the camera and look like paper.
- Max HP may reach 9999.

The prototype now draws characters as real cards, so they go thin edge-on and mirror from behind. It also has:
- the idle pan, a turn slider and a freeze toggle
- attackers running to their target and back in the sim
- 9999-wide bars

This raised [open flag 7](#open-flags).

**Where prototypes live:** in this repo, as standalone HTML in `docs/prototypes/`, opened locally. There's no separate prototype repo. A hosted copy is published only when Clark wants a version to share.
