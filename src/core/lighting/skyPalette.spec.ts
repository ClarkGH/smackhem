import { describe, it, expect } from 'vitest';
import {
    PALETTE_COLORS, SKY_KEYS, createPalette, paletteAt, type TimeOfDayPalette, type SkyKeyName,
} from './skyPalette';
import EnvironmentSystem from './environment';
import { createGameState } from '../gameState';

const hours = (h: number): number => h / 24;

const colorsAt = (timeOfDay: number): TimeOfDayPalette => {
    const out = createPalette();
    paletteAt(timeOfDay, out);
    return out;
};

// Just the palette values of a key (no name or time), for comparing against paletteAt
const colorsOf = (k: TimeOfDayPalette): TimeOfDayPalette => ({
    horizon: k.horizon,
    upper: k.upper,
    zenith: k.zenith,
    glow: k.glow,
    sunLight: k.sunLight,
    moonLight: k.moonLight,
    sunDisc: k.sunDisc,
    ambient: k.ambient,
    stars: k.stars,
});

// Expected colors always come from the key table, so tuning a color never touches this spec
const key = (name: SkyKeyName) => {
    const found = SKY_KEYS.find((k) => k.name === name);
    if (!found) throw new Error(`No sky key "${name}"`);
    return found;
};

// The sun's height at a time of day, through the debug override
const sunHeight = (timeOfDay: number): number => {
    const environment = new EnvironmentSystem(100);
    environment.update(createGameState(), { x: 0, y: 0, z: 0 }, 1, 1, timeOfDay);
    return environment.lightDirection.y;
};

// Where the sun crosses the horizon in the given direction, found by scanning then bisecting
const sunCrossing = (rising: boolean): number => {
    const STEPS = 96;
    for (let i = 0; i < STEPS; i += 1) {
        let low = i / STEPS;
        let high = (i + 1) / STEPS;
        const before = sunHeight(low);
        const after = sunHeight(high);
        if (rising ? before < 0 && after >= 0 : before > 0 && after <= 0) {
            for (let j = 0; j < 40; j += 1) {
                const mid = (low + high) / 2;
                const midHeight = sunHeight(mid);
                if (rising ? midHeight < 0 : midHeight > 0) low = mid;
                else high = mid;
            }
            return (low + high) / 2;
        }
    }
    throw new Error('The sun never crosses the horizon');
};

describe('paletteAt', () => {
    // paletteAt keeps the last key at or before the time, which only means "latest" in a sorted table
    it('has its keys in time order, within one day', () => {
        SKY_KEYS.forEach((k, i) => {
            expect(k.time).toBeGreaterThanOrEqual(0);
            expect(k.time).toBeLessThan(1);
            if (i > 0) expect(k.time).toBeGreaterThan(SKY_KEYS[i - 1].time);
        });
    });

    it('returns each key exactly at its time, every value', () => {
        SKY_KEYS.forEach((k) => {
            expect(colorsAt(k.time)).toEqual(colorsOf(k));
        });
    });

    it('holds the night colors across midnight, from nightStart to nightEnd', () => {
        const night = colorsOf(key('nightStart'));
        expect(colorsOf(key('nightEnd'))).toEqual(night);
        [20, 23 + 59 / 60, 0, 1 / 60, 3, 5].forEach((h) => {
            expect(colorsAt(hours(h))).toEqual(night);
        });
    });

    it('leaves the night hold toward dawn, strictly between the two', () => {
        const night = key('nightEnd');
        const dawn = key('dawn');
        const between = colorsAt(hours(5.5));
        PALETTE_COLORS.forEach((channel) => {
            (['x', 'y', 'z'] as const).forEach((rgb) => {
                const low = Math.min(night[channel][rgb], dawn[channel][rgb]);
                const high = Math.max(night[channel][rgb], dawn[channel][rgb]);
                if (low === high) return;
                expect(between[channel][rgb]).toBeGreaterThan(low);
                expect(between[channel][rgb]).toBeLessThan(high);
            });
        });
        (['stars', 'ambient'] as const).forEach((value) => {
            expect(between[value]).toBeGreaterThan(Math.min(night[value], dawn[value]));
            expect(between[value]).toBeLessThan(Math.max(night[value], dawn[value]));
        });
    });

    it('shows stars through the whole night and none through the day', () => {
        [20, 23 + 59 / 60, 0, 3, 5].forEach((h) => {
            expect(colorsAt(hours(h)).stars).toBe(key('nightStart').stars);
        });
        [7.5, 12, 16.5].forEach((h) => {
            expect(colorsAt(hours(h)).stars).toBe(key('morning').stars);
        });
        expect(key('nightStart').stars).toBe(1);
        expect(key('morning').stars).toBe(0);
    });

    it('holds the day sky from morning to afternoon, noon included', () => {
        // Everything but the sun's light and disc, which have their own curve through the day (next test)
        const skyOf = (p: TimeOfDayPalette) => {
            const { sunLight: _sunLight, sunDisc: _sunDisc, ...rest } = colorsOf(p);
            return rest;
        };
        const day = skyOf(key('morning'));
        expect(skyOf(key('noon'))).toEqual(day);
        expect(skyOf(key('afternoon'))).toEqual(day);
        [7.5, 10, 12, 14, 16.5].forEach((h) => {
            expect(skyOf(colorsAt(hours(h)))).toEqual(day);
        });
    });

    it('brightens the sun\'s light and disc toward noon: the same at morning and afternoon, different at noon', () => {
        (['sunLight', 'sunDisc'] as const).forEach((field) => {
            expect(key('afternoon')[field]).toEqual(key('morning')[field]);
            expect(key('noon')[field]).not.toEqual(key('morning')[field]);
            expect(colorsAt(hours(12))[field]).toEqual(key('noon')[field]);
            // Mid-morning sits strictly between the two, so the change is gradual
            const morning = key('morning')[field];
            const noon = key('noon')[field];
            const midMorning = colorsAt(hours(9.75))[field];
            (['x', 'y', 'z'] as const).forEach((rgb) => {
                if (morning[rgb] === noon[rgb]) return;
                expect(midMorning[rgb]).toBeGreaterThan(Math.min(morning[rgb], noon[rgb]));
                expect(midMorning[rgb]).toBeLessThan(Math.max(morning[rgb], noon[rgb]));
            });
        });
    });

    it('never jumps in any value across a whole day, midnight included', () => {
        const STEPS = 2400; // 0.05 s apart on a 120 s day
        let previous = colorsAt(0);
        let biggestJump = 0;
        for (let i = 1; i <= STEPS; i += 1) {
            const colors = colorsAt(i / STEPS);
            for (let c = 0; c < PALETTE_COLORS.length; c += 1) {
                const channel = PALETTE_COLORS[c];
                biggestJump = Math.max(
                    biggestJump,
                    Math.abs(colors[channel].x - previous[channel].x),
                    Math.abs(colors[channel].y - previous[channel].y),
                    Math.abs(colors[channel].z - previous[channel].z),
                );
            }
            biggestJump = Math.max(
                biggestJump,
                Math.abs(colors.stars - previous.stars),
                Math.abs(colors.ambient - previous.ambient),
            );
            previous = colors;
        }
        expect(biggestJump).toBeLessThan(0.02);
    });

    it('puts dawn and sunset where EnvironmentSystem puts the sun on the horizon', () => {
        expect(key('dawn').time).toBeCloseTo(sunCrossing(true), 6);
        expect(key('sunset').time).toBeCloseTo(sunCrossing(false), 6);
    });
});
