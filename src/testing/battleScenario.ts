import type { NpcJSON } from '../core/chunkLoader';
import type { BattleState } from '../core/battle/battle';
import { setHp } from '../core/combat';
import type { Scenario } from './scenario';

/**
 * Shared steps for battle scenario specs, so a change in how a turn plays out (like the run-up)
 * is updated in one place. Each step is real input through the real GameLoop.
 */

// Dead ahead of the player (at the origin, looking down -z), in reach. The circle has 20 HP, the evil circle 10.
export const HOSTILE: NpcJSON = {
    id: 'npc_evil_circle_1',
    sprite: 'evil_circle_idle_1',
    pos: [0, 0, -1.5],
    size: 1,
    line: 'Me Fight! You want figh?!',
    encounterId: 'npc_evil_circle_1',
};

// Talks, answers Yes (selected by default), and waits the frame for battle_requested
export const startFight = (scenario: Scenario): BattleState => {
    scenario.press({ interact: true });
    scenario.press({ interact: true });
    scenario.tick();
    const { battle } = scenario.gameState.discrete;
    if (!battle) throw new Error('The fight did not start');
    return battle;
};

// Interact skips whatever is playing: a run there, a beat, a run back
export const skip = (scenario: Scenario): void => scenario.press({ interact: true });

// Attack, then the target: the party member sets off running, the command waiting to land
export const confirmAttack = (scenario: Scenario): void => {
    scenario.press({ interact: true });
    scenario.press({ interact: true });
};

// Confirms an attack and skips the run, so the hit lands. Its beat is playing after this.
export const landAttack = (scenario: Scenario): void => {
    confirmAttack(scenario);
    skip(scenario);
};

/**
 * From the party's choice, a quick win: the enemy is left on 2 HP, so the party's hit finishes it,
 * then the last beat is skipped and play goes back where it was.
 */
export const winFight = (scenario: Scenario): void => {
    const { battle } = scenario.gameState.discrete;
    if (!battle) throw new Error('No fight to win');
    setHp(battle.combatants[1].unit, 2);
    landAttack(scenario);
    skip(scenario);
};

/**
 * From the party's choice, a quick loss: the party is left on 2 HP. Its hit lands, its beat and run home
 * are skipped, the enemy runs over and its hit finishes the party, and that last beat is skipped.
 * The fight is over, and game_over_requested waits for the next flush.
 */
export const loseFight = (scenario: Scenario): void => {
    const { battle } = scenario.gameState.discrete;
    if (!battle) throw new Error('No fight to lose');
    setHp(battle.combatants[0].unit, 2);
    landAttack(scenario);
    for (let i = 0; i < 4; i += 1) skip(scenario);
};

// Ticks through ATB's waiting, until somebody's gauge fills and their turn starts. Bounded, so a stuck gauge fails loudly.
export const waitForTurn = (scenario: Scenario): void => {
    for (let i = 0; i < 600; i += 1) {
        const { battle } = scenario.gameState.discrete;
        if (!battle || battle.phase.kind !== 'waiting') return;
        scenario.tick();
    }
    throw new Error('Nobody\'s turn came in 10 seconds');
};

/**
 * One whole round from the party's choice, everything skippable skipped and ATB waited out: the party's hit
 * lands, its beat, its run home, the enemy's run, hit, beat and run home. Back to the party choosing,
 * unless the fight was decided on the way.
 */
export const playRound = (scenario: Scenario): void => {
    landAttack(scenario);
    for (let i = 0; i < 20; i += 1) {
        const { battle } = scenario.gameState.discrete;
        if (!battle || battle.phase.kind === 'choosing') return;
        if (battle.phase.kind === 'waiting') waitForTurn(scenario);
        else skip(scenario);
    }
};
