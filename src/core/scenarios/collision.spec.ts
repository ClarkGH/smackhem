import { describe, it, expect } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../camera';
import { updatePlayerAABB } from '../collision';
import { aabbIntersects, createAABB } from '../math/aabb';
import { createScenario } from '../../testing/scenario';

const DIAGONAL = Math.SQRT1_2;

// Where a diagonal step lands against the corner depends on the distance, so try a few
const OFFSETS = [0, 0.013, 0.037, 0.05, 0.071];

// Walks forward-right for a second into a cube whose near corner is ahead and to the right
const walkIntoCorner = (offset: number) => {
    const scenario = createScenario({ mode: 'world_3d' });
    scenario.addChunk({
        meshes: [{
            type: 'cube', pos: [1.5 + offset, 0, -1.5 - offset], scale: 1, color: [1, 1, 1],
        }],
    });
    scenario.input.setIntent({ move: { x: DIAGONAL, y: DIAGONAL } });
    scenario.tick(60);
    return scenario;
};

describe('walking diagonally into a corner - scenario (stub platform)', () => {
    it('stops outside the box', () => {
        OFFSETS.forEach((offset) => {
            const { gameState, world } = walkIntoCorner(offset);
            const player = createAABB();
            updatePlayerAABB(gameState.interpolated.cameraPosition, PLAYER_HEIGHT, PLAYER_RADIUS, player);

            expect(aabbIntersects(player, world.getCollidableAABBs()[0]), `offset ${offset}`).toBe(false);
        });
    });

    it('can still back away with a light stick push', () => {
        OFFSETS.forEach((offset) => {
            const { gameState, input, tick } = walkIntoCorner(offset);
            const stoppedZ = gameState.interpolated.cameraPosition.z;

            input.setIntent({ move: { x: 0, y: -0.2 } });
            tick();

            expect(gameState.interpolated.cameraPosition.z, `offset ${offset}`).toBeGreaterThan(stoppedZ);
        });
    });
});

// Walks straight forward for a second at a cube of the given size, 2 ahead on the floor
const walkAtCube = (size: number) => {
    const scenario = createScenario({ mode: 'world_3d' });
    scenario.addChunk({
        meshes: [{
            type: 'cube', pos: [0, 0, -2], scale: size, color: [1, 1, 1],
        }],
    });
    scenario.input.setIntent({ move: { x: 0, y: 1 } });
    scenario.tick(60);
    return scenario.gameState.interpolated.cameraPosition.z;
};

// The cube's near face is at z = -2 + size / 2
describe('walking straight at a cube on the floor - scenario (stub platform)', () => {
    it('stops at a full height cube', () => {
        expect(walkAtCube(1)).toBeGreaterThan(-1.5);
    });

    // KNOWN BUG: the player's box spans y 0.8..2.4, not 0..1.6, so cubes under 0.8 tall
    // are walked through. it.fails passes while the bug is there; when fixed, make it a plain it.
    it.fails('stops at a low cube', () => {
        expect(walkAtCube(0.5)).toBeGreaterThan(-1.75);
    });
});
