import type { Vec3 } from '../../types/common';
import { smoothstep } from '../math/mathHelpers';

export type SkyKeyName = 'nightEnd' | 'dawn' | 'morning' | 'afternoon' | 'sunset' | 'dusk' | 'nightStart';

// The sky's colors at one moment, bottom to top, plus the warm glow on the sun's side
export interface SkyColors {
    horizon: Vec3;
    upper: Vec3;
    zenith: Vec3;
    // Added low in the sky toward the sun. Black for none.
    glow: Vec3;
    // How visible the stars are, 0..1. One number, blended with the colors so they fade in step.
    stars: number;
}

export interface SkyKey extends SkyColors {
    name: SkyKeyName;
    // Fraction of the day, 0..1, like EnvironmentSystem.timeOfDay
    time: number;
}

export const SKY_CHANNELS = ['horizon', 'upper', 'zenith', 'glow'] as const;

const hours = (h: number): number => h / 24;

// 0xRRGGBB to 0..1 channels, so keys read like the hex picked from the references
const hex = (value: number): Vec3 => ({
    x: ((value >> 16) & 0xff) / 255,
    y: ((value >> 8) & 0xff) / 255,
    z: (value & 0xff) / 255,
});

// Held colors, shared by both ends of their hold
const NIGHT = {
    horizon: hex(0x3a3f75), upper: hex(0x1e2250), zenith: hex(0x0b1033), glow: hex(0x000000), stars: 1,
};

const DAY = {
    horizon: hex(0x8fb7d0), upper: hex(0x4f86b8), zenith: hex(0x0a4f8f), glow: hex(0x000000), stars: 0,
};

/**
 * The art-directed keys, sorted by time. The list is circular: the last key blends into the first,
 * across midnight. Two neighbours with the same color are a hold (night, day).
 * Dawn and sunset sit where the sun crosses the horizon, which the spec checks against EnvironmentSystem.
 * Colors are seeds eyedropped from the references, to tune in game.
 */
export const SKY_KEYS: readonly SkyKey[] = [
    { name: 'nightEnd', time: hours(5), ...NIGHT },
    {
        name: 'dawn', time: hours(6), horizon: hex(0xf07476), upper: hex(0xb07ab0), zenith: hex(0x5a4a9a), glow: hex(0xffb38a), stars: 0,
    },
    { name: 'morning', time: hours(7.5), ...DAY },
    { name: 'afternoon', time: hours(16.5), ...DAY },
    {
        name: 'sunset', time: hours(18), horizon: hex(0xf8b07a), upper: hex(0xb07ab0), zenith: hex(0x3a2f7a), glow: hex(0xffb070), stars: 0,
    },
    {
        name: 'dusk', time: hours(19), horizon: hex(0xb07ab0), upper: hex(0x6a3fc0), zenith: hex(0x2a1f7a), glow: hex(0x79536f), stars: 0.25,
    },
    { name: 'nightStart', time: hours(20), ...NIGHT },
];

/**
 * Sky colors at a time of day (0..1), written into out (no allocation).
 * Any object with the four color fields and stars works as out, e.g. the renderer's SkyState.
 * Finds the segment from the last key at or before timeOfDay to the next key, wrapping
 * past midnight, and smoothsteps between them.
 */
export const skyColorsAt = (timeOfDay: number, out: SkyColors): void => {
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

    // Every color shares the same segment and blend, so they move together
    for (let c = 0; c < SKY_CHANNELS.length; c += 1) {
        const channel = SKY_CHANNELS[c];
        const a = from[channel];
        const b = to[channel];
        const o = out[channel];
        o.x = a.x + (b.x - a.x) * blend;
        o.y = a.y + (b.y - a.y) * blend;
        o.z = a.z + (b.z - a.z) * blend;
    }
    out.stars = from.stars + (to.stars - from.stars) * blend;
};
