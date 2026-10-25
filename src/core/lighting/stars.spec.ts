import { describe, it, expect } from 'vitest';
import { STAR_CYCLE_SECONDS, STAR_TWINKLE_SLOT_SECONDS, starTimeAt } from './stars';

// What the sky shader does with it: which slot a star is in (slot numbers repeat every cycle),
// and how far through that slot it is (0..1). phase is the star's own 0..1 offset.
const SLOTS = STAR_CYCLE_SECONDS / STAR_TWINKLE_SLOT_SECONDS;
const slotAt = (starTime: number, phase: number): { slot: number, through: number } => {
    const t = starTime / STAR_TWINKLE_SLOT_SECONDS + phase;
    return { slot: Math.floor(t) % SLOTS, through: t - Math.floor(t) };
};

describe('starTimeAt', () => {
    it('follows sim time within a cycle, and is the same for the same time', () => {
        expect(starTimeAt(0)).toBe(0);
        expect(starTimeAt(250)).toBe(250);
        expect(starTimeAt(250)).toBe(starTimeAt(250));
    });

    it('wraps at the end of a cycle and stays in range after hours of play', () => {
        expect(starTimeAt(STAR_CYCLE_SECONDS)).toBe(0);
        expect(starTimeAt(STAR_CYCLE_SECONDS + 30)).toBeCloseTo(30, 6);
        const late = starTimeAt(10 * 3600 + 17);
        expect(late).toBeGreaterThanOrEqual(0);
        expect(late).toBeLessThan(STAR_CYCLE_SECONDS);
    });

    it('fits a whole number of twinkle slots in a cycle', () => {
        expect(Number.isInteger(SLOTS)).toBe(true);
    });

    it('has no jump at the wrap: just before it, every star is in the slot it is in just after', () => {
        const justBefore = STAR_CYCLE_SECONDS - 0.001;
        const justAfter = starTimeAt(STAR_CYCLE_SECONDS + 0.001);
        [0, 0.25, 0.5, 0.9999].forEach((phase) => {
            const before = slotAt(justBefore, phase);
            const after = slotAt(justAfter, phase);
            // Same slot unless a slot boundary falls between the two moments, 0.002 s apart
            const crossed = after.through < before.through;
            expect(after.slot).toBe(crossed ? (before.slot + 1) % SLOTS : before.slot);
            // How far through the slot, going round the short way (0.9997 and 0.0003 are close)
            const d = Math.abs(after.through - before.through);
            expect(Math.min(d, 1 - d)).toBeLessThan(0.01);
        });
    });
});
