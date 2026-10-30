import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import {
    HOSTILE,
    loseFight,
    startFight,
    winFight as winQuickly,
} from '../../testing/battleScenario';

// HOSTILE stands dead ahead of where the player starts, its box from z = -2 to -1

const withHostile = (): Scenario => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [HOSTILE] });
    return scenario;
};

// Talks, answers Yes, and wins straight away (testing/battleScenario.ts)
const winFight = (scenario: Scenario): void => {
    startFight(scenario);
    winQuickly(scenario);
    expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
};

const isThere = (scenario: Scenario): boolean => scenario.world.findNpc('npc_evil_circle_1') !== undefined;

describe('Defeated means defeated - scenario (stub platform)', () => {
    it('removes the NPC on a win, and records it', () => {
        const scenario = withHostile();

        winFight(scenario);
        scenario.tick();

        expect(isThere(scenario)).toBe(false);
        expect(scenario.gameState.discrete.defeatedNpcIds).toEqual(['npc_evil_circle_1']);
        expect(scenario.gameState.discrete.interactTarget).toBeNull();
    });

    it('takes its collision box away too, so you can walk through where it stood', () => {
        const scenario = withHostile();
        winFight(scenario);

        scenario.input.setIntent({ move: { x: 0, y: 1 } });
        scenario.tick(60);

        // Past the far side of where its box was
        expect(scenario.gameState.interpolated.cameraPosition.z).toBeLessThan(-2.5);
    });

    it('stays gone when its chunk unloads and loads again', () => {
        const scenario = withHostile();
        winFight(scenario);

        scenario.world.removeChunk('0,0');
        scenario.addChunk({ npcs: [HOSTILE] });
        scenario.tick();

        expect(isThere(scenario)).toBe(false);
        expect(scenario.gameState.discrete.interactTarget).toBeNull();
    });

    it('stays when the fight is lost', () => {
        const scenario = withHostile();
        startFight(scenario);

        loseFight(scenario);

        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(isThere(scenario)).toBe(true);
        expect(scenario.gameState.discrete.defeatedNpcIds).toEqual([]);
    });

    it('comes back for a new run after quitting to the main menu', () => {
        const scenario = withHostile();
        winFight(scenario);

        scenario.press({ menu: true });
        scenario.click('Quit to Main Menu');
        scenario.click('Yes, quit');

        expect(scenario.gameState.discrete.defeatedNpcIds).toEqual([]);
        expect(isThere(scenario)).toBe(true);
    });
});

describe('Duplicate NPC ids - scenario (stub platform)', () => {
    it('warns once when a chunk brings an id another loaded chunk already has', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const scenario = createScenario();
        scenario.addChunk({ npcs: [HOSTILE] });

        scenario.addChunk({ npcs: [HOSTILE] }, 1, 0);

        expect(warn.mock.calls.filter(([message]) => String(message).startsWith('Duplicate NPC id'))).toHaveLength(1);
    });

    it('does not warn when the same chunk loads again', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const scenario = createScenario();
        scenario.addChunk({ npcs: [HOSTILE] });

        scenario.world.removeChunk('0,0');
        scenario.addChunk({ npcs: [HOSTILE] });

        expect(warn.mock.calls.filter(([message]) => String(message).startsWith('Duplicate NPC id'))).toHaveLength(0);
    });
});
