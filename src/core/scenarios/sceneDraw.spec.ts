import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import type { Vec3 } from '../../types/common';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';
import {
    SCENE_BEZEL_COLOR, SCENE_GAME_AREA_COLOR, SCENE_WIDTH_PX, SCENE_HEIGHT_PX,
} from '../scene';

type Draw =
    | { kind: 'clear'; r: number; g: number; b: number; a: number }
    | { kind: 'fillRect'; x: number; y: number; width: number; height: number; color: Vec3; viewProj: Float32Array }
    | { kind: 'mesh' };

/**
 * Records clears, fills and meshes from now on, in call order.
 * Copied at call time: RenderSystem reuses its matrices and colors (M-1).
 */
const recordDraws = (scenario: Scenario): Draw[] => {
    const draws: Draw[] = [];
    const { renderer } = scenario;
    vi.spyOn(renderer, 'clear').mockImplementation((r, g, b, a) => {
        draws.push({
            kind: 'clear', r, g, b, a,
        });
    });
    vi.spyOn(renderer, 'fillRect').mockImplementation((x, y, width, height, color) => {
        draws.push({
            kind: 'fillRect', x, y, width, height, color: { ...color }, viewProj: renderer.getViewProjection().slice(),
        });
    });
    vi.spyOn(renderer, 'drawMesh').mockImplementation(() => {
        draws.push({ kind: 'mesh' });
    });
    return draws;
};

// Where a logical point lands in clip space (-1..1, y up), through a column-major matrix
const toNdc = (m: Float32Array, x: number, y: number): { x: number; y: number } => {
    const w = m[3] * x + m[7] * y + m[15];
    return { x: (m[0] * x + m[4] * y + m[12]) / w, y: (m[1] * x + m[5] * y + m[13]) / w };
};

describe('Drawing the scene - scenario (stub platform)', () => {
    let scenario: Scenario;

    beforeEach(() => {
        scenario = createScenario({ debugSettings: createDebugSettings() });
        // Something solid in the world, so a frame that draws the world is easy to spot
        scenario.addChunk({
            meshes: [{
                type: 'cube', pos: [0, 0, -3], scale: 1, color: [1, 1, 1],
            }],
        });
    });

    it('paints the bezel over the whole canvas, then the game area over it', () => {
        scenario.enterScene();
        const draws = recordDraws(scenario);

        scenario.tick();

        expect(draws.filter((draw) => draw.kind !== 'mesh').map((draw) => {
            if (draw.kind !== 'fillRect') return draw;
            const {
                kind, x, y, width, height, color,
            } = draw;
            return {
                kind, x, y, width, height, color,
            };
        })).toEqual([
            {
                kind: 'clear', r: SCENE_BEZEL_COLOR.x, g: SCENE_BEZEL_COLOR.y, b: SCENE_BEZEL_COLOR.z, a: 1,
            },
            {
                kind: 'fillRect', x: 0, y: 0, width: SCENE_WIDTH_PX, height: SCENE_HEIGHT_PX, color: SCENE_GAME_AREA_COLOR,
            },
        ]);
    });

    it('can tell the bezel from the game area', () => {
        // Otherwise the test above can't catch the two being swapped
        expect(SCENE_BEZEL_COLOR).not.toEqual(SCENE_GAME_AREA_COLOR);
    });

    it('fills in the game area\'s logical units: (0, 0) is its top-left, (800, 600) its bottom-right', () => {
        scenario.enterScene();
        const draws = recordDraws(scenario);

        scenario.tick();

        const fill = draws.find((draw) => draw.kind === 'fillRect');
        if (fill?.kind !== 'fillRect') throw new Error('No fill this frame');
        // The stub's viewport is 800 x 600, so the game area fits it exactly
        const topLeft = toNdc(fill.viewProj, 0, 0);
        const bottomRight = toNdc(fill.viewProj, SCENE_WIDTH_PX, SCENE_HEIGHT_PX);
        expect(topLeft.x).toBeCloseTo(-1, 6);
        expect(topLeft.y).toBeCloseTo(1, 6);
        expect(bottomRight.x).toBeCloseTo(1, 6);
        expect(bottomRight.y).toBeCloseTo(-1, 6);
    });

    it('draws at full strength while the entry transition still runs: no fade', () => {
        scenario.enterScene();
        const draws = recordDraws(scenario);

        scenario.tick();

        // The timer is kept for the iris wipe, so it's still running here
        expect(scenario.gameState.discrete.sceneIsTransitioning).toBe(true);
        expect(scenario.gameState.interpolated.sceneTransitionProgress).toBeLessThan(1);
        const clear = draws.find((draw) => draw.kind === 'clear');
        expect(clear).toEqual({
            kind: 'clear', r: SCENE_BEZEL_COLOR.x, g: SCENE_BEZEL_COLOR.y, b: SCENE_BEZEL_COLOR.z, a: 1,
        });
    });

    it('draws none of the world underneath', () => {
        const worldDraws = recordDraws(scenario);
        scenario.tick();
        // The cube is drawn while in the world, so the check below means something
        expect(worldDraws.some((draw) => draw.kind === 'mesh')).toBe(true);
        vi.restoreAllMocks();

        scenario.enterScene();
        const sceneDraws = recordDraws(scenario);
        scenario.tick();

        expect(sceneDraws.some((draw) => draw.kind === 'mesh')).toBe(false);
    });

    it('neither clears nor fills outside the scene', () => {
        const draws = recordDraws(scenario);

        scenario.tick();

        expect(draws.some((draw) => draw.kind === 'clear' || draw.kind === 'fillRect')).toBe(false);
    });
});
