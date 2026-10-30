import { describe, it, expect } from 'vitest';
import type { NpcJSON } from '../chunkLoader';
import { createDebugSettings } from '../settings/debugSettings';
import { createScenario, type Scenario } from '../../testing/scenario';
import { HOSTILE, skip } from '../../testing/battleScenario';

// Two units ahead of the player (at the origin, looking down -z): a second of walking reaches it
const TOUCHY: NpcJSON = {
    ...HOSTILE, pos: [0, 0, -2], startsFightOn: 'touch',
};

const withNpc = (npc: NpcJSON): Scenario => {
    const scenario = createScenario({ debugSettings: createDebugSettings() });
    scenario.addChunk({ npcs: [npc] });
    return scenario;
};

// Walks forward for a number of ticks, then lets go, and waits out the frame for battle_requested
const walk = (scenario: Scenario, ticks: number, y: 1 | -1 = 1): void => {
    scenario.input.setIntent({ move: { x: 0, y } });
    scenario.tick(ticks);
    scenario.input.reset();
    scenario.tick(2);
};

const DOWN = { navigate: { x: 0, y: -1 } } as const;

describe('Fights that start on touch - scenario (stub platform)', () => {
    it('starts the fight when you walk into the NPC, with no question asked', () => {
        const scenario = withNpc(TOUCHY);

        walk(scenario, 60);

        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
        expect(scenario.gameState.discrete.battle?.npcId).toBe('npc_evil_circle_1');
        expect(scenario.gameState.discrete.activeSpeech).toBeNull();
    });

    it('leaves a talk NPC alone when you walk into it', () => {
        const scenario = withNpc({ ...HOSTILE, pos: [0, 0, -2] });

        walk(scenario, 60);

        expect(scenario.gameState.discrete.battle).toBeNull();
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');
    });

    it('starts nothing before you actually reach it', () => {
        const scenario = withNpc(TOUCHY);

        // A tenth of a second at 10 units a second is 1 unit: still half a unit short of its box
        walk(scenario, 6);

        expect(scenario.gameState.discrete.battle).toBeNull();
    });

    it('doesn\'t start again while you still stand against it after running away, only once you step back in', () => {
        const scenario = withNpc(TOUCHY);
        walk(scenario, 60);
        // Run: down to the row, confirm, skip the beat
        scenario.press(DOWN);
        scenario.press({ interact: true });
        skip(scenario);
        expect(scenario.gameState.discrete.gameMode).toBe('world_3d');

        scenario.tick(30);
        expect(scenario.gameState.discrete.battle).toBeNull();

        walk(scenario, 30, -1);
        walk(scenario, 60);
        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
    });

    it('starts from the instance too, when the circle walks into it', () => {
        // The circle opens 3 units ahead, at (0, -3), and the instance only lets it go to about z = -3.67.
        // The NPC's box starts just past that, at z = -3.7.
        const scenario = withNpc({ ...TOUCHY, pos: [0, 0, -4.2] });
        scenario.press({ pause: true });
        scenario.tick(120);
        expect(scenario.gameState.discrete.instanceIsActive).toBe(true);

        walk(scenario, 60);

        expect(scenario.gameState.discrete.battle?.returnMode).toBe('instance_3d');
    });

    it('starts again in a new run that begins against the same NPC, after quitting while against it', () => {
        // Its box ends 0.35 units ahead of the spawn point, within contact range from the first tick
        const scenario = withNpc({ ...TOUCHY, pos: [0, 0, -0.85] });
        scenario.tick(2);
        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
        // Run, still against it
        scenario.press(DOWN);
        scenario.press({ interact: true });
        skip(scenario);
        scenario.press({ menu: true });
        scenario.click('Quit to Main Menu');
        scenario.click('Yes, quit');
        scenario.tick();

        scenario.click('New Game');
        scenario.tick(2);

        expect(scenario.gameState.discrete.gameMode).toBe('battle_25djrpg');
    });

    it('never starts a beaten NPC\'s fight', () => {
        const scenario = withNpc(TOUCHY);
        scenario.gameState.discrete.defeatedNpcIds.push('npc_evil_circle_1');
        scenario.world.setHiddenNpcs(scenario.gameState.discrete.defeatedNpcIds);

        walk(scenario, 60);

        expect(scenario.gameState.discrete.battle).toBeNull();
    });
});
