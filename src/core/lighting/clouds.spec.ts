import { describe, it, expect } from 'vitest';
import {
    CLOUD_CYCLE_SECONDS, CLOUD_HIGH_OCTAVE_LAPS, CLOUD_NOISE_PERIOD, CLOUD_OCTAVE_LAPS, cloudTimeAt,
} from './clouds';

// Both layers' tables: every rule below applies to each
const LAYERS = [['low', CLOUD_OCTAVE_LAPS], ['high', CLOUD_HIGH_OCTAVE_LAPS]] as const;

// What the sky shader does with it: each octave's offset, in noise cells
const octaveOffset = (
    laps: readonly (readonly [number, number])[],
    cloudTime: number,
    octave: number,
): [number, number] => {
    const [lapsX, lapsZ] = laps[octave];
    const phase = cloudTime / CLOUD_CYCLE_SECONDS;
    return [lapsX * CLOUD_NOISE_PERIOD * phase, lapsZ * CLOUD_NOISE_PERIOD * phase];
};

// How far apart two offsets are on the repeating noise: going round the period, the short way
const apartOnPeriod = (a: number, b: number): number => {
    const d = Math.abs(a - b) % CLOUD_NOISE_PERIOD;
    return Math.min(d, CLOUD_NOISE_PERIOD - d);
};

describe('cloudTimeAt', () => {
    it('follows sim time within a cycle, and is the same for the same time', () => {
        expect(cloudTimeAt(0)).toBe(0);
        expect(cloudTimeAt(250)).toBe(250);
        expect(cloudTimeAt(250)).toBe(cloudTimeAt(250));
    });

    it('wraps at the end of a cycle and stays in range after hours of play', () => {
        expect(cloudTimeAt(CLOUD_CYCLE_SECONDS)).toBe(0);
        expect(cloudTimeAt(CLOUD_CYCLE_SECONDS + 30)).toBeCloseTo(30, 6);
        const late = cloudTimeAt(10 * 3600 + 17);
        expect(late).toBeGreaterThanOrEqual(0);
        expect(late).toBeLessThan(CLOUD_CYCLE_SECONDS);
    });

    it('moves every octave of both layers a whole number of noise periods per cycle', () => {
        LAYERS.forEach(([, laps]) => {
            laps.forEach(([x, z]) => {
                expect(Number.isInteger(x)).toBe(true);
                expect(Number.isInteger(z)).toBe(true);
            });
        });
    });

    it('has no jump at the wrap: just before it, every octave is where it is just after', () => {
        const justBefore = CLOUD_CYCLE_SECONDS - 0.001;
        const justAfter = cloudTimeAt(CLOUD_CYCLE_SECONDS + 0.001);
        LAYERS.forEach(([, laps]) => {
            laps.forEach((_, octave) => {
                const [bx, bz] = octaveOffset(laps, justBefore, octave);
                const [ax, az] = octaveOffset(laps, justAfter, octave);
                // Within a hair: the two moments are only 0.002 s apart
                expect(apartOnPeriod(bx, ax)).toBeLessThan(0.01);
                expect(apartOnPeriod(bz, az)).toBeLessThan(0.01);
            });
        });
    });
});
