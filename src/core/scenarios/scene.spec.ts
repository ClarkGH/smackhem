import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import { createScenario, type Scenario } from '../../testing/scenario';
import { createDebugSettings } from '../settings/debugSettings';

describe('2D scene movement - scenario (stub platform)', () => {
    let scenario: Scenario;

    beforeEach(() => {
        scenario = createScenario({ debugSettings: createDebugSettings() });
        scenario.enterScene();
        // Let the entry transition finish
        scenario.tick(120);
    });

    // The grid is 18.75 tiles tall, so the last row is partly off screen. It's still walkable.
    it('walks the whole bottom row, into the bottom-right tile', () => {
        const { gameState, input, tick } = scenario;
        expect(gameState.discrete.sceneIsActive).toBe(true);

        // One axis at a time: a step past the scene's edge is refused on both axes
        input.setIntent({ move: { x: 0, y: -1 } });
        tick(600);
        input.setIntent({ move: { x: 1, y: 0 } });
        tick(900);

        expect(gameState.discrete.sceneCharacterPositionGrid).toEqual({ x: 24, y: 18 });
    });
});
