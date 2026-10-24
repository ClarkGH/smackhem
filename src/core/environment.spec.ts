import { describe, it, expect } from 'vitest';
import EnvironmentSystem from './environment';
import { createGameState } from './gameState';

const ORIGIN = { x: 0, y: 0, z: 0 };

// Environment at a time of day (0..1), through the debug override
const at = (timeOfDay: number): EnvironmentSystem => {
    const environment = new EnvironmentSystem(100);
    environment.update(createGameState(), ORIGIN, 1, 1, timeOfDay);
    return environment;
};

describe('EnvironmentSystem shadow caster', () => {
    it('casts from the sun at noon, at full strength', () => {
        const noon = at(0.5);
        expect(noon.shadowLightDirection).toEqual(noon.lightDirection);
        expect(noon.shadowStrength).toBeCloseTo(1, 5);
    });

    it('casts from the moon at midnight', () => {
        const midnight = at(0);
        expect(midnight.shadowLightDirection).toEqual(midnight.moonLightDirection);
        expect(midnight.shadowStrength).toBeGreaterThan(0.9);
    });

    it('has no shadows at dawn and dusk, while both bodies sit on the horizon', () => {
        expect(at(0.25).shadowStrength).toBe(0);
        expect(at(0.75).shadowStrength).toBe(0);
    });

    it('hands over from moon to sun across dawn', () => {
        const before = at(0.24);
        const after = at(0.26);
        expect(before.shadowLightDirection).toEqual(before.moonLightDirection);
        expect(after.shadowLightDirection).toEqual(after.lightDirection);
    });

    it('never jumps in strength across a whole day', () => {
        const STEPS = 2400; // 0.05 s apart on a 120 s day
        let previous = at(0).shadowStrength;
        let biggestJump = 0;
        for (let i = 1; i <= STEPS; i += 1) {
            const strength = at(i / STEPS).shadowStrength;
            biggestJump = Math.max(biggestJump, Math.abs(strength - previous));
            previous = strength;
        }
        expect(biggestJump).toBeLessThan(0.02);
    });
});
