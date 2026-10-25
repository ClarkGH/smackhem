import { describe, it, expect } from 'vitest';
import { MAX_FRAME_DT } from '../gameLoop';
import { createScenario, FIXED_DT } from '../../testing/scenario';

// Keeps float error from dropping the last tick of a multi-tick frame
const EPSILON = 1e-9;

describe('frame cap - scenario (stub platform)', () => {
    it('runs a normal multi-tick frame in full', () => {
        const { gameState, frame } = createScenario();

        frame(FIXED_DT * 12 + EPSILON);

        expect(gameState.interpolated.simulationTime).toBeCloseTo(FIXED_DT * 12, 9);
    });

    it('catches up at most a quarter second after a long stall', () => {
        const { gameState, input, frame } = createScenario();
        input.setIntent({ move: { x: 0, y: 1 } });

        // A 5 second stall would otherwise run 300 ticks
        frame(5);

        expect(gameState.interpolated.simulationTime).toBeLessThanOrEqual(MAX_FRAME_DT + EPSILON);
        expect(gameState.interpolated.simulationTime).toBeGreaterThan(MAX_FRAME_DT - FIXED_DT * 2);
        // Walked a quarter second's worth (10 units/s), not 50 units
        expect(Math.abs(gameState.interpolated.cameraPosition.z)).toBeLessThan(2.6);
    });

    it('carries on normally on the frame after the stall', () => {
        const { gameState, frame } = createScenario();
        frame(5);
        const after = gameState.interpolated.simulationTime;

        frame(FIXED_DT + EPSILON);

        expect(gameState.interpolated.simulationTime - after).toBeCloseTo(FIXED_DT, 9);
    });
});
