import type { GameState } from '../gameState';
import type { TypeSafeEventBus, GameEvent } from '../events';
import type { World } from '../world';
import type {
    EncounterId,
    Enemy,
    EnemySheetId,
    PartyMember,
} from '../combat';
import type {
    BattleCommand,
    BattleState,
    Combatant,
    CombatantId,
} from './battle';
import type { PlayerIntent } from '../../services/input';
import type { Vec3 } from '../../types/common';
import type { Settings } from '../settings/settings';
import {
    applyAttack,
    createEnemy,
    createPartyMember,
    getBasicAttack,
    getBattleOutcome,
    isDefeated,
    isLoss,
    setHp,
} from '../combat';
import { ENCOUNTERS, ENEMY_SHEETS, PARTY_MEMBER_SHEETS } from '../combatSheets';
import { ENCOUNTER_YES } from '../interaction';
import BattleMenu, { isCommandEnabled } from './battleMenu';
import BattleScreen from './battleScreen';
import { findCombatant } from './battle';
import { facingFrom, placeCombatants, type BattleLayout } from './battleField';
import chooseEnemyCommand from './enemyAi';
import type { BattleView } from '../../services/battleOverlay';

// How long each action's beat lasts, in sim seconds, before the next actor goes. Interact skips it.
export const BATTLE_BEAT_SECONDS = 1;

// How much of an ATB gauge fills per second of sim time: empty to full in 3 seconds. Speed stats scale it later.
export const ATB_FILL_PER_SECOND = 1 / 3;

// Units per second a combatant runs across the field
export const BATTLE_RUN_SPEED = 8;

// How far short of its target an attacker stops: about a billboard apart, so they don't overlap
export const BATTLE_STRIKE_GAP = 0.9;

// Whether an NPC's encounterId (any string in chunk data) names a real encounter
const isEncounterId = (id: string): id is EncounterId => Object.prototype.hasOwnProperty.call(ENCOUNTERS, id);

// A command can only go at someone standing on the other side
const isValidTarget = (actor: Combatant, target: Combatant): boolean => target.side !== actor.side && !isDefeated(target.unit);

/**
 * Where an attacker stops: a strike gap short of the target, on the side it came from, written into out.
 * On the floor at the target's height. Its home is the "came from", so the spot doesn't drift as it runs.
 */
const strikeSpot = (actor: Combatant, target: Combatant, out: Vec3): Vec3 => {
    const dx = actor.home.x - target.position.x;
    const dz = actor.home.z - target.position.z;
    const length = Math.sqrt(dx * dx + dz * dz) || 1;
    // Written in place (M-1)
    out.x = target.position.x + (dx / length) * BATTLE_STRIKE_GAP;
    out.y = target.position.y;
    out.z = target.position.z + (dz / length) * BATTLE_STRIKE_GAP;
    return out;
};

/**
 * Moves position towards destination by one tick's run, in place. Arrives exactly, never overshoots.
 * skip arrives at once. True once it's there.
 */
const runTowards = (position: Vec3, destination: Vec3, dt: number, skip: boolean): boolean => {
    const dx = destination.x - position.x;
    const dy = destination.y - position.y;
    const dz = destination.z - position.z;
    const remaining = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const step = BATTLE_RUN_SPEED * dt;
    // Written in place (M-1)
    if (skip || remaining <= step) {
        position.x = destination.x;
        position.y = destination.y;
        position.z = destination.z;
        return true;
    }
    position.x += (dx / remaining) * step;
    position.y += (dy / remaining) * step;
    position.z += (dz / remaining) * step;
    return false;
};

/**
 * After a fight you walked away from, enemies that keep their damage remember their HP for next time.
 * After a win they're gone, so it's forgotten. Keyed by sheet: two of the same in one fight, the last one wins.
 */
const keepDamage = (kept: Partial<Record<EnemySheetId, number>>, battle: BattleState): void => {
    battle.combatants.forEach(({ unit }) => {
        if (unit.kind !== 'enemy' || !ENEMY_SHEETS[unit.sheetId].keepsDamage) return;
        // Writes shared state on purpose
        if (battle.outcome === 'won') {
            // eslint-disable-next-line no-param-reassign
            delete kept[unit.sheetId];
        } else {
            // eslint-disable-next-line no-param-reassign
            kept[unit.sheetId] = unit.hp;
        }
    });
};

/**
 * Starts fights, runs their turns, and ends them. See docs/battle.md.
 * GameLoop wires its events and hands it the tick while the mode is 'battle_25djrpg'.
 * The menu reports the party's command, the enemy AI picks the enemy's, and only this resolves them.
 */
export default class BattleSystem {
    private readonly menu = new BattleMenu();

    private readonly screen = new BattleScreen();

    // Scratch for the spot an attacker runs to, filled in place each tick (M-1)
    private readonly strike: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(
        private readonly eventBus: TypeSafeEventBus,
        private readonly world: World,
        // Shared with the menu and changed in place, so Active/Wait applies as soon as it's switched
        private readonly settings: Settings,
        // The Debug screen's layout, changed in place. Copied at each start, so a change applies to the next fight.
        private readonly layout: Readonly<BattleLayout>,
    ) {}

    /**
     * Yes to a hostile NPC's question asks for its fight. Any other answer, or a plain NPC, does nothing.
     * Published from here, battle_requested is handled on the next flush (one frame after Yes).
     */
    public answer(event: Extract<GameEvent, { type: 'choice_made' }>): void {
        if (event.optionIndex === ENCOUNTER_YES) this.requestFight(event.npcId);
    }

    // Walking into a touch NPC (InteractionSystem.findNewContact) asks for its fight, with no question first
    public touched(npcId: string): void {
        this.requestFight(npcId);
    }

    // However a fight starts, it ends in the same battle_requested (battle.md, Starting a fight)
    private requestFight(npcId: string): void {
        const encounterId = this.world.findNpc(npcId)?.encounterId;
        if (encounterId === undefined) return;
        if (!isEncounterId(encounterId)) {
            console.warn(`Unknown encounter "${encounterId}" on NPC ${npcId}, no fight`);
            return;
        }
        this.eventBus.publish({ type: 'battle_requested', encounterId, npcId });
    }

    /**
     * Builds the fight and switches to it. Battle start is an allocation boundary (M-1).
     * Only from exploration, never on top of a fight already running, and only while the NPC is still loaded.
     */
    public start(gameState: GameState, event: Extract<GameEvent, { type: 'battle_requested' }>): void {
        const discreteState = gameState.discrete;
        const previousMode = discreteState.gameMode;
        if (discreteState.battle || (previousMode !== 'world_3d' && previousMode !== 'instance_3d')) return;
        const npc = this.world.findNpc(event.npcId);
        if (!npc) {
            console.warn(`Battle requested with NPC ${event.npcId}, which isn't loaded, no fight`);
            return;
        }

        // Owned, so every fight starts at full HP until the party lives in GameState (battle.md, Battle state).
        // Positions are filled by placeCombatants below. Every gauge starts full, so the first round
        // goes in line order, party first, with no randomness (battle.md, Rules it follows).
        const combatants: Combatant[] = [{
            id: 'party:0',
            side: 'party',
            unit: createPartyMember(PARTY_MEMBER_SHEETS.circle),
            position: { x: 0, y: 0, z: 0 },
            home: { x: 0, y: 0, z: 0 },
            atb: 1,
        }];
        ENCOUNTERS[event.encounterId].enemies.forEach((sheetId, i) => {
            const unit = createEnemy(ENEMY_SHEETS[sheetId]);
            // An enemy that keeps its damage comes back as hurt as you left it
            const kept = discreteState.keptEnemyHp[sheetId];
            if (ENEMY_SHEETS[sheetId].keepsDamage && kept !== undefined) setHp(unit, kept);
            combatants.push({
                id: `enemy:${i}`,
                side: 'enemy',
                unit,
                position: { x: 0, y: 0, z: 0 },
                home: { x: 0, y: 0, z: 0 },
                atb: 1,
            });
        });

        // The field is the NPC's spot, faced the way the player faced it: the first-person camera
        // in the world, the circle in the instance (the same interactors that can talk)
        const { interpolated } = gameState;
        const from = previousMode === 'instance_3d' ? interpolated.instanceCharacterPosition : interpolated.cameraPosition;
        const center = { x: npc.position.x, y: npc.position.y, z: npc.position.z };
        const facing = facingFrom(from, center);
        const layout = { ...this.layout };
        placeCombatants(combatants, center, facing, layout);

        const battle: BattleState = {
            encounterId: event.encounterId,
            npcId: event.npcId,
            combatants,
            outcome: 'ongoing',
            returnMode: previousMode,
            center,
            facing,
            layout,
            // Replaced by startNextTurn below, before anything reads it
            phase: { kind: 'waiting' },
            // Everyone's full, so everyone's queued
            readyQueue: combatants.map((c) => c.id),
            log: [{ kind: 'battle_started', encounterId: event.encounterId }],
        };
        this.startNextTurn(battle);

        // Writes shared state on purpose
        discreteState.battle = battle;
        discreteState.gameMode = 'battle_25djrpg';
        this.eventBus.publish({ type: 'game_mode_changed', previousMode, currentMode: 'battle_25djrpg' });
    }

    /**
     * Every battle tick (never while paused, GameLoop checks pause first). Interact skips whatever is playing.
     * A beat plays out first, so the last hit is seen before a decided fight ends, and nobody runs home after it.
     */
    public update(gameState: GameState, intent: PlayerIntent, dt: number): void {
        const { battle } = gameState.discrete;
        if (!battle) return;
        const { phase } = battle;

        // Wait mode stops the clock while a command menu is open. Active never stops it.
        const waitingOnPlayer = phase.kind === 'choosing' && this.settings.battleMode === 'wait';
        if (battle.outcome === 'ongoing' && !waitingOnPlayer) this.fillGauges(battle, dt);

        if (phase.kind === 'acting') {
            // Writes shared state on purpose
            phase.beatRemaining = intent.interact ? 0 : phase.beatRemaining - dt;
            if (phase.beatRemaining > 0) return;
        }

        if (battle.outcome !== 'ongoing') {
            this.end(gameState, battle);
            return;
        }

        // Between turns: the first gauge to fill takes the next one
        if (phase.kind === 'waiting') {
            if (battle.readyQueue.length > 0) this.startNextTurn(battle);
            return;
        }

        const actor = findCombatant(battle, phase.actingId);
        if (!actor) throw new Error(`BattleSystem: the actor ${phase.actingId} isn't in the fight`);

        switch (phase.kind) {
            case 'choosing': {
                // The menu hands over a command only on the tick it's confirmed, so one confirm sets off once
                const command = this.menu.update(battle, intent);
                if (command) this.setOff(battle, actor, command);
                break;
            }
            case 'advancing': {
                // The command lands on arrival. The target might be gone by then (once ATB lets others act meanwhile).
                const target = findCombatant(battle, phase.command.targetId);
                if (!target || !isValidTarget(actor, target)) {
                    battle.phase = { kind: 'returning', actingId: actor.id };
                } else if (runTowards(actor.position, strikeSpot(actor, target, this.strike), dt, intent.interact === true)) {
                    this.resolve(battle, actor, target);
                }
                break;
            }
            case 'acting':
                // The beat is over
                battle.phase = { kind: 'returning', actingId: actor.id };
                break;
            case 'returning':
                if (runTowards(actor.position, actor.home, dt, intent.interact === true)) this.startNextTurn(battle);
                break;
            default:
                break;
        }
    }

    // What the battle screen shows this frame, built from the fight and the menu. Never written back.
    public getView(battle: BattleState, textScale: number): BattleView {
        return this.screen.build(battle, this.menu, textScale);
    }

    // The next standing combatant in the queue gets a turn: the party chooses, an enemy sets off at once.
    // Nobody ready means waiting for a gauge to fill.
    private startNextTurn(battle: BattleState): void {
        const actor = this.nextActor(battle);
        if (!actor) {
            // Writes shared state on purpose
            battle.phase = { kind: 'waiting' };
        } else if (actor.side === 'party') {
            // Writes shared state on purpose
            battle.phase = { kind: 'choosing', actingId: actor.id };
            this.menu.open();
        } else {
            // The enemy is already off the queue with a full gauge, and nothing queues a full gauge again,
            // so a refused command would leave it out of the fight for good. Loud instead, like chooseEnemyCommand.
            const command = chooseEnemyCommand(battle, actor.id);
            if (!this.setOff(battle, actor, command)) {
                throw new Error(`BattleSystem: ${actor.id}'s ${command.kind} command was refused`);
            }
        }
    }

    /**
     * A checked command, and the actor's gauge empties. An attack sends them running, the command waiting until
     * it lands. Run is resolved here and now. An invalid command (a downed target, the actor's own side, Run where
     * it's not allowed or by an enemy) is refused: false, and a party member keeps choosing.
     */
    private setOff(battle: BattleState, actor: Combatant, command: BattleCommand): boolean {
        if (command.kind === 'run') {
            // Fleeing ends the fight as the party getting away, so only the party can
            if (actor.side !== 'party' || !isCommandEnabled(battle, 'run')) return false;
            this.flee(battle, actor);
            return true;
        }
        const target = findCombatant(battle, command.targetId);
        if (!target || !isValidTarget(actor, target)) return false;
        // Writes shared state on purpose
        actor.atb = 0;
        battle.phase = { kind: 'advancing', actingId: actor.id, command };
        return true;
    }

    // The party gets away: chosen, not decided by HP. The beat still plays, then the fight ends with nobody defeated.
    private flee(battle: BattleState, actor: Combatant): void {
        // Writes shared state on purpose
        actor.atb = 0;
        battle.outcome = 'fled';
        battle.log.push({ kind: 'battle_ended', outcome: 'fled' });
        battle.phase = { kind: 'acting', actingId: actor.id, beatRemaining: BATTLE_BEAT_SECONDS };
    }

    // The front of the queue, skipping anyone downed since their gauge filled. Null when nobody is ready.
    private nextActor(battle: BattleState): Combatant | null {
        const { readyQueue } = battle;
        while (readyQueue.length > 0) {
            const actor = findCombatant(battle, readyQueue.shift() as CombatantId);
            if (actor && !isDefeated(actor.unit)) return actor;
        }
        return null;
    }

    /**
     * Fills every gauge by one tick of sim time (T-1), queueing each one that fills, in combatant order.
     * Not the downed, not whoever is mid-turn, and not anyone already full and queued.
     */
    private fillGauges(battle: BattleState, dt: number): void {
        const { combatants, phase } = battle;
        const actingId = phase.kind === 'waiting' ? null : phase.actingId;
        for (let i = 0; i < combatants.length; i += 1) {
            const c = combatants[i];
            if (c.atb < 1 && c.id !== actingId && !isDefeated(c.unit)) {
                // Writes shared state on purpose
                c.atb = Math.min(1, c.atb + ATB_FILL_PER_SECOND * dt);
                if (c.atb === 1) battle.readyQueue.push(c.id);
            }
        }
    }

    /**
     * The hit lands: carried out against a target already checked on arrival, then the actor's beat starts.
     * Log order is fixed: attacked, then defeated, then battle_ended.
     */
    private resolve(battle: BattleState, actor: Combatant, target: Combatant): void {
        const attack = getBasicAttack(actor.unit);
        const hpBefore = target.unit.hp;
        applyAttack(attack, target.unit);
        battle.log.push({
            kind: 'attacked',
            actorId: actor.id,
            targetId: target.id,
            attackId: attack.id,
            // What was actually lost, which is less than the attack's power on a last hit
            damage: hpBefore - target.unit.hp,
        });
        if (isDefeated(target.unit)) battle.log.push({ kind: 'defeated', id: target.id });

        // Writes shared state on purpose
        battle.outcome = this.decideOutcome(battle);
        if (battle.outcome !== 'ongoing') battle.log.push({ kind: 'battle_ended', outcome: battle.outcome });
        battle.phase = { kind: 'acting', actingId: actor.id, beatRemaining: BATTLE_BEAT_SECONDS };
    }

    // Split into sides for combat.ts, which owns the rule. Once per action, not per tick (M-1).
    private decideOutcome(battle: BattleState): BattleState['outcome'] {
        const party: PartyMember[] = [];
        const enemies: Enemy[] = [];
        battle.combatants.forEach(({ unit }) => {
            if (unit.kind === 'player') party.push(unit);
            else enemies.push(unit);
        });
        return getBattleOutcome(party, enemies);
    }

    /**
     * The fight is dropped. A win removes the NPC for good and play goes back where it was. Running away goes
     * back too, with nobody defeated. A loss never removes it, and goes to game over instead: the mode stays
     * battle for the one frame until game_over_requested is handled, and update has no fight to run in between.
     */
    private end(gameState: GameState, battle: BattleState): void {
        const discreteState = gameState.discrete;
        // Before the branch, so a loss's early return can't skip it
        this.screen.reset();
        if (isLoss(battle.outcome)) {
            // Writes shared state on purpose
            discreteState.battle = null;
            this.eventBus.publish({ type: 'game_over_requested' });
            return;
        }
        if (battle.outcome === 'won') {
            discreteState.defeatedNpcIds.push(battle.npcId);
            this.world.setHiddenNpcs(discreteState.defeatedNpcIds);
        }
        keepDamage(discreteState.keptEnemyHp, battle);
        // Writes shared state on purpose
        discreteState.gameMode = battle.returnMode;
        discreteState.battle = null;
        this.eventBus.publish({ type: 'game_mode_changed', previousMode: 'battle_25djrpg', currentMode: battle.returnMode });
    }
}
