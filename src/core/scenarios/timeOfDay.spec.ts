import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import { createScenario, FIXED_DT, type Scenario } from '../../testing/scenario';
import { DAY_LENGTH_SECONDS } from '../lighting/environment';

// How far one tick moves the day, as a fraction of it
const PER_TICK = FIXED_DT / DAY_LENGTH_SECONDS;

describe('time of day - scenario (stub platform)', () => {
    let scenario: Scenario;

    beforeEach(() => {
        scenario = createScenario({ mode: 'main_menu' });
        // New Game
        scenario.press({ interact: true });
    });

    it('moves on by one tick\'s share of the day every tick of play', () => {
        const { gameState, tick } = scenario;
        const start = gameState.timeOfDay;
        tick(90);

        expect(gameState.timeOfDay).toBeCloseTo(start + 90 * PER_TICK, 9);
    });

    it('wraps past the end of the day back to the start, without a jump', () => {
        const { gameState, tick } = scenario;
        // Half a tick before midnight, so the next tick crosses it
        gameState.timeOfDay = 1 - PER_TICK / 2;
        tick();

        expect(gameState.timeOfDay).toBeGreaterThanOrEqual(0);
        expect(gameState.timeOfDay).toBeLessThan(1);
        expect(gameState.timeOfDay).toBeCloseTo(PER_TICK / 2, 9);
    });

    it('drives the sky when the Debug time of day is Live', () => {
        const { gameState, gameLoop, tick } = scenario;
        tick(90);

        expect(gameLoop.getTimeOfDay()).toBe(gameState.timeOfDay);
    });

    it('stands still while paused', () => {
        const { gameState, press, tick } = scenario;
        press({ menu: true });
        const time = gameState.timeOfDay;
        tick(30);

        expect(gameState.timeOfDay).toBe(time);
    });

    it('stands still in the 2D scene', () => {
        const { gameState, press, tick } = scenario;
        press({ interact: true });
        expect(gameState.discrete.gameMode).toBe('scene_2d');
        const time = gameState.timeOfDay;
        tick(30);

        expect(gameState.timeOfDay).toBe(time);
    });

    it('stands still while time is frozen for the instance', () => {
        const { gameState, press, tick } = scenario;
        press({ pause: true });
        expect(gameState.discrete.isTimeFrozen).toBe(true);
        const time = gameState.timeOfDay;
        tick(30);

        expect(gameState.timeOfDay).toBe(time);
    });
});
