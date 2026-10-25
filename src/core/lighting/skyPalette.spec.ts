import { describe, it, expect } from 'vitest';
import {
    SKY_KEYS, skyColorAt, type SkyKeyName,
} from './skyPalette';
import EnvironmentSystem from './environment';
import { createGameState } from '../gameState';
import type { Vec3 } from '../../types/common';

const hours = (h: number): number => h / 24;

const colorAt = (timeOfDay: number): Vec3 => {
    const out = { x: 0, y: 0, z: 0 };
    skyColorAt(timeOfDay, out);
    return out;
};

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

describe('skyColorAt', () => {
    // skyColorAt keeps the last key at or before the time, which only means "latest" in a sorted table
    it('has its keys in time order, within one day', () => {
        SKY_KEYS.forEach((k, i) => {
            expect(k.time).toBeGreaterThanOrEqual(0);
            expect(k.time).toBeLessThan(1);
            if (i > 0) expect(k.time).toBeGreaterThan(SKY_KEYS[i - 1].time);
        });
    });

    it('returns each key exactly at its time', () => {
        SKY_KEYS.forEach((k) => {
            expect(colorAt(k.time)).toEqual(k.horizon);
        });
    });

    it('holds the night color across midnight, from nightStart to nightEnd', () => {
        const night = key('nightStart').horizon;
        expect(key('nightEnd').horizon).toEqual(night);
        [20, 23 + 59 / 60, 0, 1 / 60, 3, 5].forEach((h) => {
            expect(colorAt(hours(h))).toEqual(night);
        });
    });

    it('leaves the night hold toward dawn, strictly between the two', () => {
        const night = key('nightEnd').horizon;
        const dawn = key('dawn').horizon;
        const between = colorAt(hours(5.5));
        (['x', 'y', 'z'] as const).forEach((channel) => {
            const low = Math.min(night[channel], dawn[channel]);
            const high = Math.max(night[channel], dawn[channel]);
            if (low === high) return;
            expect(between[channel]).toBeGreaterThan(low);
            expect(between[channel]).toBeLessThan(high);
        });
    });

    it('holds the day color from morning to afternoon', () => {
        const day = key('morning').horizon;
        expect(key('afternoon').horizon).toEqual(day);
        [7.5, 14, 16.5].forEach((h) => {
            expect(colorAt(hours(h))).toEqual(day);
        });
    });

    it('never jumps in color across a whole day, midnight included', () => {
        const STEPS = 2400; // 0.05 s apart on a 120 s day
        let previous = colorAt(0);
        let biggestJump = 0;
        for (let i = 1; i <= STEPS; i += 1) {
            const color = colorAt(i / STEPS);
            biggestJump = Math.max(
                biggestJump,
                Math.abs(color.x - previous.x),
                Math.abs(color.y - previous.y),
                Math.abs(color.z - previous.z),
            );
            previous = color;
        }
        expect(biggestJump).toBeLessThan(0.02);
    });

    it('puts dawn and sunset where EnvironmentSystem puts the sun on the horizon', () => {
        expect(key('dawn').time).toBeCloseTo(sunCrossing(true), 6);
        expect(key('sunset').time).toBeCloseTo(sunCrossing(false), 6);
    });
});
