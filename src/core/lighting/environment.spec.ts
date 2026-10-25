import { describe, it, expect } from 'vitest';
import EnvironmentSystem from './environment';
import { createGameState } from '../gameState';
import { SKY_KEYS } from './skyPalette';

const ORIGIN = { x: 0, y: 0, z: 0 };

// Environment at a time of day (0..1), through the debug override
const at = (timeOfDay: number): EnvironmentSystem => {
    const environment = new EnvironmentSystem(100);
    environment.update(createGameState(), ORIGIN, timeOfDay);
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

describe('EnvironmentSystem sun for cloud edges', () => {
    // The sky shader scales its lit cloud edges by the sun's horizontal length times its
    // visibility (cloudAt in webGLRenderer.ts). These are the inputs that has to be smooth.
    const edgeStrength = (environment: EnvironmentSystem): number => (
        Math.hypot(environment.lightDirection.x, environment.lightDirection.z) * environment.sunVisibility
    );

    it('has no lit edges with the sun overhead at noon or below the horizon at midnight', () => {
        expect(edgeStrength(at(0.5))).toBeCloseTo(0, 5);
        expect(edgeStrength(at(0))).toBe(0);
    });

    it('has lit edges with the sun low at sunrise and sunset', () => {
        expect(edgeStrength(at(0.27))).toBeGreaterThan(0.5);
        expect(edgeStrength(at(0.73))).toBeGreaterThan(0.5);
    });

    it('never jumps in strength across a whole day', () => {
        const STEPS = 2400; // 0.05 s apart on a 120 s day
        let previous = edgeStrength(at(0));
        let biggestJump = 0;
        for (let i = 1; i <= STEPS; i += 1) {
            const strength = edgeStrength(at(i / STEPS));
            biggestJump = Math.max(biggestJump, Math.abs(strength - previous));
            previous = strength;
        }
        expect(biggestJump).toBeLessThan(0.02);
    });
});

describe('EnvironmentSystem light from the palette', () => {
    // At every key: ambient is the palette's, and each body's light is its palette color
    // faded by its own visibility. Expected values come from the key table.
    it('takes ambient and light colors from the palette at every key', () => {
        SKY_KEYS.forEach((k) => {
            const environment = at(k.time);
            expect(environment.ambientIntensity).toBeCloseTo(k.ambient, 6);
            (['x', 'y', 'z'] as const).forEach((rgb) => {
                expect(environment.sunColorWithVisibility[rgb]).toBeCloseTo(k.sunLight[rgb] * environment.sunVisibility, 6);
                expect(environment.moonColorWithVisibility[rgb]).toBeCloseTo(k.moonLight[rgb] * environment.moonVisibility, 6);
            });
        });
    });

    it('has no sunlight at midnight and full sunlight at noon', () => {
        expect(at(0).sunColorWithVisibility).toEqual({ x: 0, y: 0, z: 0 });
        const noon = at(0.5);
        const day = SKY_KEYS.find((k) => k.name === 'noon')!;
        expect(noon.sunColorWithVisibility.x).toBeCloseTo(day.sunLight.x, 6);
    });
});
