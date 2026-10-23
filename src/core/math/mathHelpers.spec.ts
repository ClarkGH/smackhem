import { describe, it, expect } from 'vitest';
import { fitLogicalOrtho } from './mathHelpers';

const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 600;

// Visible area's aspect matches the viewport, so nothing is stretched
const aspectOf = (b: ReturnType<typeof fitLogicalOrtho>): number => (b.right - b.left) / (b.bottom - b.top);

describe('fitLogicalOrtho', () => {
    it('shows exactly the logical area at the same aspect (4:3)', () => {
        expect(fitLogicalOrtho(1024, 768, LOGICAL_WIDTH, LOGICAL_HEIGHT)).toEqual({
            left: 0, right: 800, bottom: 600, top: 0,
        });
    });

    it('adds space at the sides of a wider viewport (16:9)', () => {
        const b = fitLogicalOrtho(1920, 1080, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.top).toBe(0);
        expect(b.bottom).toBe(600);
        expect(b.left).toBeCloseTo(-(b.right - 800));
        expect(aspectOf(b)).toBeCloseTo(1920 / 1080);
    });

    it('works for 16:10', () => {
        const b = fitLogicalOrtho(1680, 1050, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.left).toBeLessThan(0);
        expect(aspectOf(b)).toBeCloseTo(1680 / 1050);
    });

    it('adds space above and below a taller viewport (phone-like)', () => {
        const b = fitLogicalOrtho(390, 844, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.left).toBe(0);
        expect(b.right).toBe(800);
        expect(b.top).toBeCloseTo(-(b.bottom - 600));
        expect(aspectOf(b)).toBeCloseTo(390 / 844);
    });
});
