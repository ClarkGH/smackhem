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
