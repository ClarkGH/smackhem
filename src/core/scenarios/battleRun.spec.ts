import { describe, it, expect } from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import type { EncounterId } from '../combat';
import { setHp } from '../combat';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    landAttack,
    skip,
    startFight,
} from '../../testing/battleScenario';

const DOWN = { navigate: { x: 0, y: -1 } } as const;

const withEncounter = (encounterId: EncounterId = 'npc_evil_circle_1'): Scenario => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    const npc: NpcJSON = { ...HOSTILE, encounterId };
    scenario.addChunk({ npcs: [npc] });
    return scenario;
};

// Down to Run on the command list, and confirm: no target to pick
const chooseRun = (scenario: Scenario): void => {
    scenario.press(DOWN);
    scenario.press({ interact: true });
};

const rows = (scenario: Scenario) => scenario.battleOverlay.lastView?.commands?.items ?? [];

describe('Running away - scenario (stub platform)', () => {
    it('offers Run under Attack', () => {
        const scenario = withEncounter();

        startFight(scenario);

        expect(rows(scenario).map((row) => row.label)).toEqual(['Attack', 'Run']);
        expect(rows(scenario)[1].disabled).toBe(false);
    });

    it('gets away: logged and worded, the beat plays, then back to the world', () => {
        const scenario = withEncounter();
        const battle = startFight(scenario);

        chooseRun(scenario);
        expect(battle.outcome).toBe('fled');
        expect(battle.log.at(-1)).toEqual({ kind: 'battle_ended', outcome: 'fled' });
        expect(scenario.battleOverlay.lastView?.log.at(-1)).toBe('You got away!');
        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');

        skip(scenario);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
        expect(scenario.gameState.discrete.battle).toBeNull();
    });

    it('leaves the enemy standing, not defeated, and no game over', () => {
        const scenario = withEncounter();
        startFight(scenario);

        chooseRun(scenario);
        skip(scenario);
        scenario.tick(3);

        expect(scenario.gameState.discrete.defeatedNpcIds).toEqual([]);
        expect(scenario.world.findNpc('npc_evil_circle_1')).toBeDefined();
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
    });

    it('disables Run where the encounter can\'t be fled, and the cursor skips it', () => {
        const scenario = withEncounter('debug_cornered');
        const battle = startFight(scenario);
        expect(rows(scenario)[1]).toMatchObject({ label: 'Run', disabled: true });

        scenario.press(DOWN);
        scenario.press({ interact: true });

        // Still on Attack, so that press opened the target list instead
        expect(scenario.battleOverlay.lastView?.commands?.selected).toBe(0);
        expect(battle.outcome).toBe('ongoing');
        expect(scenario.battleOverlay.lastView?.enemies[0].isTargeted).toBe(true);
    });

    it('goes Attack, Run, Attack as the cursor wraps', () => {
        const scenario = withEncounter();
        startFight(scenario);

        scenario.press(DOWN);
        expect(scenario.battleOverlay.lastView?.commands?.selected).toBe(1);
        scenario.press(DOWN);
        expect(scenario.battleOverlay.lastView?.commands?.selected).toBe(0);
    });
});

describe('Enemies that keep their damage - scenario (stub platform)', () => {
    // Fights the boss, lands one hit (30 -> 28), runs, and walks back up to it
    const hitAndRun = (scenario: Scenario): void => {
        startFight(scenario);
        landAttack(scenario);
        skip(scenario);
        skip(scenario);
        // The boss's turn: its run, hit, beat and run home
        for (let i = 0; i < 4; i += 1) skip(scenario);
        // Back to the party, once its gauge fills
        while (scenario.gameState.discrete.battle?.phase.kind === 'waiting') scenario.tick();
        chooseRun(scenario);
        skip(scenario);
    };

    it('starts the next fight with the damage it took before you ran', () => {
        const scenario = withEncounter('debug_boss');

        hitAndRun(scenario);
        expect(scenario.gameState.discrete.keptEnemyHp).toEqual({ debug_boss: 28 });

        const battle = startFight(scenario);
        expect(battle.combatants[1].unit.hp).toBe(28);
    });

    it('forgets it once the boss is beaten', () => {
        const scenario = withEncounter('debug_boss');
        hitAndRun(scenario);

        const battle = startFight(scenario);
        setHp(battle.combatants[1].unit, 2);
        landAttack(scenario);
        skip(scenario);

        expect(scenario.gameState.discrete.keptEnemyHp).toEqual({});
    });

    it('never applies to enemies that don\'t keep damage', () => {
        const scenario = withEncounter();
        startFight(scenario);
        landAttack(scenario);
        skip(scenario);
        skip(scenario);
        for (let i = 0; i < 4; i += 1) skip(scenario);
        while (scenario.gameState.discrete.battle?.phase.kind === 'waiting') scenario.tick();
        chooseRun(scenario);
        skip(scenario);

        expect(scenario.gameState.discrete.keptEnemyHp).toEqual({});
        const battle = startFight(scenario);
        expect(battle.combatants[1].unit.hp).toBe(10);
    });

    it('is thrown away with the run when you quit to the title', () => {
        const scenario = withEncounter('debug_boss');
        hitAndRun(scenario);

        scenario.press({ menu: true });
        scenario.click('Quit to Main Menu');
        scenario.click('Yes, quit');

        expect(scenario.gameState.discrete.keptEnemyHp).toEqual({});
    });
});
