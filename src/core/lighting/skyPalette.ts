import type { Vec3 } from '../../types/common';
import { smoothstep } from '../math/mathHelpers';

export type SkyKeyName = 'nightEnd' | 'dawn' | 'morning' | 'afternoon' | 'sunset' | 'dusk' | 'nightStart';

export interface SkyKey {
    name: SkyKeyName;
    // Fraction of the day, 0..1, like EnvironmentSystem.timeOfDay
    time: number;
    // Sky color at this key. Today the whole sky (the clear color); later the horizon stop.
    horizon: Vec3;
}

const hours = (h: number): number => h / 24;

// 0xRRGGBB to 0..1 channels, so keys read like the hex picked from the references
const hex = (value: number): Vec3 => ({
    x: ((value >> 16) & 0xff) / 255,
    y: ((value >> 8) & 0xff) / 255,
    z: (value & 0xff) / 255,
});

/**
 * The art-directed keys, sorted by time. The list is circular: the last key blends into the first,
 * across midnight. Two neighbours with the same color are a hold (night, day).
 * Dawn and sunset sit where the sun crosses the horizon, which the spec checks against EnvironmentSystem.
 * Colors are seeds eyedropped from the references, to tune in game.
 */
export const SKY_KEYS: readonly SkyKey[] = [
    { name: 'nightEnd', time: hours(5), horizon: hex(0x3a3f75) },
    { name: 'dawn', time: hours(6), horizon: hex(0xf07476) },
    { name: 'morning', time: hours(7.5), horizon: hex(0x8fb7d0) },
    { name: 'afternoon', time: hours(16.5), horizon: hex(0x8fb7d0) },
    { name: 'sunset', time: hours(18), horizon: hex(0xf8b07a) },
    { name: 'dusk', time: hours(19), horizon: hex(0xb07ab0) },
    { name: 'nightStart', time: hours(20), horizon: hex(0x3a3f75) },
];

/**
 * Sky color at a time of day (0..1), written into out (no allocation).
 * Finds the segment from the last key at or before timeOfDay to the next key, wrapping
 * past midnight, and smoothsteps between them.
 */
export const skyColorAt = (timeOfDay: number, out: Vec3): void => {
    const t = timeOfDay - Math.floor(timeOfDay);
    const count = SKY_KEYS.length;

    // Before the first key of the day, the segment is the one that started last night
    let index = count - 1;
    for (let i = 0; i < count; i += 1) {
        if (SKY_KEYS[i].time <= t) index = i;
    }
    const from = SKY_KEYS[index];
    const to = SKY_KEYS[(index + 1) % count];

    // Lengths measured forward with a wrap, so 20:00 -> 05:00 is 9 hours, not -15
    const span = (to.time - from.time + 1) % 1;
    const into = (t - from.time + 1) % 1;
    const blend = smoothstep(into / span);

    out.x = from.horizon.x + (to.horizon.x - from.horizon.x) * blend;
    out.y = from.horizon.y + (to.horizon.y - from.horizon.y) * blend;
    out.z = from.horizon.z + (to.horizon.z - from.horizon.z) * blend;
};
