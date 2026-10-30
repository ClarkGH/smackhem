import type {
    AttackId,
    BattleOutcome,
    EncounterId,
    Enemy,
    PartyMember,
} from '../combat';
import type { GameMode } from '../gameState';
import type { BattleLayout } from './battleField';
import type { Vec3 } from '../../types/common';

export type CombatantId = string; // 'party:0', 'enemy:0'

export interface Combatant {
    id: CombatantId;
    side: 'party' | 'enemy';
    unit: PartyMember | Enemy; // owned for now, the party points at GameState later (flag 8)
    // Where they are on the field right now: the billboard's base, in world space. Moves while they run.
    // Battle-only, the world's Npc is never moved (W-1)
    position: Vec3;
    // Their spot in the line, where they start and run back to
    home: Vec3;
    // The ATB gauge, 0..1, filled from sim time (T-1). Full means queued to act, and it empties when they set off.
    atb: number;
}

export type BattleLogEntry =
    | { kind: 'battle_started'; encounterId: EncounterId }
    | { kind: 'attacked'; actorId: CombatantId; targetId: CombatantId; attackId: AttackId; damage: number }
    | { kind: 'defeated'; id: CombatantId }
    | { kind: 'battle_ended'; outcome: Exclude<BattleOutcome, 'ongoing'> };

// Run has no target: the whole party leaves, if the encounter allows it
export type BattleCommand =
    | { kind: 'attack'; targetId: CombatantId }
    | { kind: 'run' };

/**
 * One actor's turn, in order: choosing (the party only, the menu is open), advancing (running to the target,
 * the confirmed command waiting to land), acting (the hit has landed, its beat plays), returning (running home).
 * An enemy skips choosing. Interact skips whatever is playing.
 * Between turns, waiting: nobody's gauge is full yet, so nobody is acting (ATB).
 */
export type BattlePhase =
    | { kind: 'waiting' }
    | { kind: 'choosing'; actingId: CombatantId }
    // Only attacks run anywhere: Run is resolved where it's chosen
    | { kind: 'advancing'; actingId: CombatantId; command: Extract<BattleCommand, { kind: 'attack' }> }
    | { kind: 'acting'; actingId: CombatantId; beatRemaining: number } // seconds of sim time
    | { kind: 'returning'; actingId: CombatantId };

export interface BattleState {
    encounterId: EncounterId;
    npcId: string; // who started it
    combatants: Combatant[];
    outcome: BattleOutcome; // 'ongoing' until decided. Anything else ends the battle
    returnMode: GameMode; // where to go back to
    // The field: where the NPC stood (its base), and the yaw the party faces the enemies along, the way you
    // faced the NPC. Fixed for the whole fight, so the battle camera frames it steadily while people move.
    center: Vec3;
    facing: number;
    // A copy of the Debug layout at the start, so sliders moved mid-fight apply to the next fight, camera and lines alike
    layout: BattleLayout;
    phase: BattlePhase;
    readyQueue: CombatantId[]; // who acts next, front first: pushed as each gauge fills
    log: BattleLogEntry[]; // newest last, pushed once per action (M-1)
}

export const findCombatant = (battle: BattleState, id: CombatantId): Combatant | undefined => {
    const { combatants } = battle;
    for (let i = 0; i < combatants.length; i += 1) {
        if (combatants[i].id === id) return combatants[i];
    }
    return undefined;
};
