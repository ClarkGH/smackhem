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

describe('EnvironmentSystem sun path', () => {
    it('rises due east (+x) at 06:00 and sets due west at 18:00', () => {
        const rise = at(0.25).lightDirection;
        const set = at(0.75).lightDirection;
        expect(rise.x).toBeCloseTo(1, 6);
        expect(rise.y).toBeCloseTo(0, 6);
        expect(rise.z).toBeCloseTo(0, 6);
        expect(set.x).toBeCloseTo(-1, 6);
        expect(set.y).toBeCloseTo(0, 6);
        expect(set.z).toBeCloseTo(0, 6);
    });

    it('is highest at noon, due south (+z) and not straight overhead', () => {
        const noon = at(0.5).lightDirection;
        expect(noon.x).toBeCloseTo(0, 6);
        expect(noon.z).toBeGreaterThan(0);
        expect(noon.y).toBeLessThan(1);
        [0.3, 0.4, 0.45, 0.55, 0.6, 0.7].forEach((t) => {
            expect(at(t).lightDirection.y).toBeLessThan(noon.y);
        });
    });

    // A real sun's path is one circle across the sky. The old path ran its compass direction and
    // height separately, which made a V through the zenith: off to one side before noon and after.
    it('keeps to one circle all day: every direction lies in the plane of sunrise and noon', () => {
        const rise = at(0.25).lightDirection;
        const noon = at(0.5).lightDirection;
        // The circle's axis, square to both
        const axis = {
            x: rise.y * noon.z - rise.z * noon.y,
            y: rise.z * noon.x - rise.x * noon.z,
            z: rise.x * noon.y - rise.y * noon.x,
        };
        for (let i = 0; i < 96; i += 1) {
            const d = at(i / 96).lightDirection;
            expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
            expect(d.x * axis.x + d.y * axis.y + d.z * axis.z).toBeCloseTo(0, 6);
        }
    });

    it('keeps the moon straight opposite the sun', () => {
        [0, 0.2, 0.5, 0.8].forEach((t) => {
            const environment = at(t);
            expect(environment.moonLightDirection.x).toBeCloseTo(-environment.lightDirection.x, 6);
            expect(environment.moonLightDirection.y).toBeCloseTo(-environment.lightDirection.y, 6);
            expect(environment.moonLightDirection.z).toBeCloseTo(-environment.lightDirection.z, 6);
        });
    });
});

describe('EnvironmentSystem sun for cloud edges', () => {
    // The sky shader scales its lit cloud edges by the sun's horizontal length times its
    // visibility (cloudAt in webGLRenderer.ts). These are the inputs that has to be smooth.
    const edgeStrength = (environment: EnvironmentSystem): number => (
        Math.hypot(environment.lightDirection.x, environment.lightDirection.z) * environment.sunVisibility
    );

    it('has softer lit edges with the sun high at noon, and none with it below the horizon at midnight', () => {
        expect(edgeStrength(at(0.5))).toBeGreaterThan(0);
        expect(edgeStrength(at(0.5))).toBeLessThan(edgeStrength(at(0.27)));
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
