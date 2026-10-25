import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';
import type { NpcJSON } from '../../services/chunkLoader';
import { createScenario, type Scenario } from '../../testing/scenario';

// One unit ahead of where the player can stand, straight down the starting view (-z)
const NPC: NpcJSON = {
    id: 'npc_01', sprite: 'npc-lmao', pos: [0, 0, -2], size: 1, line: 'Hello',
};

const withSpawnChunk = (npcs: NpcJSON[]): Scenario => {
    const scenario = createScenario();
    scenario.addChunk({ npcs });
    return scenario;
};

// Walks forward for a second, far enough to pass the NPC's spot if nothing stops it
const walkForward = (scenario: Scenario): number => {
    scenario.input.setIntent({ move: { x: 0, y: 1 } });
    scenario.tick(60);
    scenario.input.reset();
    return scenario.gameState.interpolated.cameraPosition.z;
};

describe('NPC collision - scenario (stub platform)', () => {
    it('walks past the spot when there is no NPC', () => {
        const z = walkForward(withSpawnChunk([]));

        // Past the far side of where the NPC's box would be
        expect(z).toBeLessThan(-2.5);
    });

    it('stops the player at the NPC', () => {
        const z = walkForward(withSpawnChunk([NPC]));

        // Stopped short of the box's near face (z = -1.5)
        expect(z).toBeGreaterThan(-1.5);
        expect(z).toBeLessThan(0);
    });
});

// Lets the stub renderer's texture promise resolve
const settleLoads = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('NPC billboard - scenario (stub platform)', () => {
    const isNpcTexture = (id: string): boolean => id.startsWith('stub_texture_npc-lmao');

    it('loads its texture once, and draws nothing until it has', async () => {
        const scenario = withSpawnChunk([NPC]);
        const load = vi.spyOn(scenario.renderer, 'loadTexture');
        const draw = vi.spyOn(scenario.renderer, 'drawTexturedQuad');

        scenario.tick(3);
        expect(load.mock.calls.filter(([id]) => id === 'npc-lmao')).toHaveLength(1);
        expect(draw).not.toHaveBeenCalled();

        await settleLoads();
        scenario.tick(3);
        expect(load.mock.calls.filter(([id]) => id === 'npc-lmao')).toHaveLength(1);
        // One quad per frame, all with the NPC's texture
        expect(draw).toHaveBeenCalledTimes(3);
        expect(draw.mock.calls.every(([texture]) => isNpcTexture(texture.id))).toBe(true);
    });

    it('stands on its base, facing the camera', async () => {
        const scenario = withSpawnChunk([NPC]);
        const draw = vi.spyOn(scenario.renderer, 'drawTexturedQuad');
        scenario.tick();
        await settleLoads();
        scenario.tick();

        const [, model, , normal] = draw.mock.calls[0];
        const m = model.elements;
        // Centered half its size above its base, at its spot
        expect([m[12], m[13], m[14]]).toEqual([0, 0.5, -2]);
        // Upright and full size
        expect(m[9]).toBe(1);
        // The camera is straight down +z from it
        expect(normal?.x).toBeCloseTo(0, 6);
        expect(normal?.z).toBeCloseTo(1, 6);
    });
});
