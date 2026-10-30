import {
    describe, it, expect, beforeEach, vi,
} from 'vitest';
import type { BattleCommand } from '../battle/battle';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import {
    HOSTILE, landAttack, skip, startFight,
} from '../../testing/battleScenario';

// Today's AI always picks a valid target, so the only way to get a bad command is to replace it.
// vi.mock swaps the module for every import of it in this file's run, BattleSystem's included.
const enemyAi = vi.hoisted(() => ({ command: null as BattleCommand | null }));
vi.mock('../battle/enemyAi', async (importOriginal) => {
    const real = await importOriginal<typeof import('../battle/enemyAi')>();
    return {
        default: (...args: Parameters<typeof real.default>) => enemyAi.command ?? real.default(...args),
    };
});

// From the party's choice to the enemy's turn: the party's hit, its beat, its run home
const reachEnemyTurn = (scenario: Scenario): void => {
    landAttack(scenario);
    skip(scenario);
    skip(scenario);
};

describe('An enemy command the fight refuses - scenario (stub platform)', () => {
    let scenario: Scenario;

    beforeEach(() => {
        enemyAi.command = null;
        scenario = createScenario({ debugSettings: createDebugSettings() });
        scenario.addChunk({ npcs: [HOSTILE] });
        startFight(scenario);
    });

    it('throws, rather than leaving the enemy out of line for the rest of the fight', () => {
        enemyAi.command = { kind: 'attack', targetId: 'enemy:0' };

        expect(() => reachEnemyTurn(scenario)).toThrow('enemy:0');
    });

    it('never lets an enemy run away for the party', () => {
        enemyAi.command = { kind: 'run' };

        expect(() => reachEnemyTurn(scenario)).toThrow('enemy:0');
        expect(scenario.gameState.discrete.battle?.outcome).toBe('ongoing');
    });

    it('still plays the enemy\'s turn when its command is fine', () => {
        reachEnemyTurn(scenario);

        expect(scenario.gameState.discrete.battle?.phase).toMatchObject({ kind: 'advancing', actingId: 'enemy:0' });
    });
});
