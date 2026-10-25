import type { Vec3 } from '../../types/common';
import { smoothstep } from '../math/mathHelpers';

export type SkyKeyName = 'nightEnd' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'dusk' | 'nightStart';

/**
 * Everything that changes with the time of day, in one place: the sky's colors, the light
 * on the world, and the stars. One table means the sky and the lighting can't drift apart.
 */
export interface TimeOfDayPalette {
    // The sky, bottom to top
    horizon: Vec3;
    upper: Vec3;
    zenith: Vec3;
    // Added low in the sky toward the sun. Black for none.
    glow: Vec3;
    // Color of the sun's and moon's light and discs. EnvironmentSystem fades the light by each
    // body's visibility, so the values while a body is below the horizon never show.
    sunLight: Vec3;
    moonLight: Vec3;
    // The sun orb's own color: golden, never white, against a blue sky and clouds (Clark).
    // Values from colorguide.org/sun: Noon Sun by day, Sunburst Orange at dawn, Tropic Sun at sunset.
    // Separate from sunLight so daylight can stay near-neutral. The moon's disc uses moonLight.
    sunDisc: Vec3;
    // The clouds' three flat tones: lit tops, middles, shaded undersides
    cloudLight: Vec3;
    cloudMid: Vec3;
    cloudShadow: Vec3;
    // Light that reaches every surface regardless of direction, 0..1
    ambient: number;
    // How visible the stars are, 0..1
    stars: number;
}

export interface SkyKey extends TimeOfDayPalette {
    name: SkyKeyName;
    // Fraction of the day, 0..1, like EnvironmentSystem.timeOfDay
    time: number;
}

// The palette's colors, blended in one loop. The numbers (ambient, stars) are blended after it.
export const PALETTE_COLORS = [
    'horizon', 'upper', 'zenith', 'glow', 'sunLight', 'moonLight', 'sunDisc', 'cloudLight', 'cloudMid', 'cloudShadow',
] as const;

const hours = (h: number): number => h / 24;

// 0xRRGGBB to 0..1 channels, so keys read like the hex picked from the references
const hex = (value: number): Vec3 => ({
    x: ((value >> 16) & 0xff) / 255,
    y: ((value >> 8) & 0xff) / 255,
    z: (value & 0xff) / 255,
});

// A zeroed palette to fill with paletteAt, allocated once by its owner (M-1)
export const createPalette = (): TimeOfDayPalette => ({
    horizon: { x: 0, y: 0, z: 0 },
    upper: { x: 0, y: 0, z: 0 },
    zenith: { x: 0, y: 0, z: 0 },
    glow: { x: 0, y: 0, z: 0 },
    sunLight: { x: 0, y: 0, z: 0 },
    moonLight: { x: 0, y: 0, z: 0 },
    sunDisc: { x: 0, y: 0, z: 0 },
    cloudLight: { x: 0, y: 0, z: 0 },
    cloudMid: { x: 0, y: 0, z: 0 },
    cloudShadow: { x: 0, y: 0, z: 0 },
    ambient: 0,
    stars: 0,
});

const MOONLIGHT = hex(0x6680cc);

// Held values, shared by both ends of their hold. Night's sunLight never shows (the sun's
// visibility is 0); it matches dawn so nothing shifts as the sun comes up.
const NIGHT = {
    horizon: hex(0x3a3f75),
    upper: hex(0x1e2250),
    zenith: hex(0x0b1033),
    glow: hex(0x000000),
    sunLight: hex(0xffb38a),
    moonLight: MOONLIGHT,
    sunDisc: hex(0xffa333),
    // Dark silhouettes against the stars
    cloudLight: hex(0x4a5180),
    cloudMid: hex(0x343a66),
    cloudShadow: hex(0x22264a),
    ambient: 0.12,
    stars: 1,
};

// The day's sky holds from morning to afternoon. Its light doesn't: warm cream (Pale Sunshine,
// colorguide.org/sun) at both ends, rising to near-white at the noon key, so mid-morning and
// mid-afternoon stay warmer than high noon.
const DAY = {
    horizon: hex(0x8fb7d0),
    upper: hex(0x4f86b8),
    zenith: hex(0x0a4f8f),
    glow: hex(0x000000),
    sunLight: hex(0xfeedc2),
    moonLight: MOONLIGHT,
    sunDisc: hex(0xf7d038),
    // White over blue-grey
    cloudLight: hex(0xf4f7fa),
    cloudMid: hex(0xc9d6e3),
    cloudShadow: hex(0x8fa3ba),
    ambient: 0.5,
    stars: 0,
};

/**
 * The art-directed keys, sorted by time. The list is circular: the last key blends into the first,
 * across midnight. Two neighbours with the same values are a hold (night; the day's sky).
 * Dawn and sunset sit where the sun crosses the horizon, which the spec checks against EnvironmentSystem.
 * Colors are seeds eyedropped from the references, to tune in game.
 */
export const SKY_KEYS: readonly SkyKey[] = [
    { name: 'nightEnd', time: hours(5), ...NIGHT },
    {
        name: 'dawn',
        time: hours(6),
        horizon: hex(0xf07476),
        upper: hex(0xb07ab0),
        zenith: hex(0x5a4a9a),
        glow: hex(0xffb38a),
        sunLight: hex(0xffb38a),
        moonLight: MOONLIGHT,
        sunDisc: hex(0xffa333),
        // Peach, pink, violet
        cloudLight: hex(0xffd9c2),
        cloudMid: hex(0xf2a7a0),
        cloudShadow: hex(0x8a6fa8),
        ambient: 0.3,
        stars: 0,
    },
    { name: 'morning', time: hours(7.5), ...DAY },
    // Near-white light and a paler gold disc (Light Sun) at high noon, deepening toward the day's ends
    {
        name: 'noon', time: hours(12), ...DAY, sunLight: hex(0xfff4e0), sunDisc: hex(0xfde87a),
    },
    { name: 'afternoon', time: hours(16.5), ...DAY },
    {
        name: 'sunset',
        time: hours(18),
        horizon: hex(0xf8b07a),
        upper: hex(0xb07ab0),
        zenith: hex(0x3a2f7a),
        glow: hex(0xffb070),
        sunLight: hex(0xffb070),
        moonLight: MOONLIGHT,
        sunDisc: hex(0xf38b21),
        // Gold, coral, purple-blue
        cloudLight: hex(0xffd08a),
        cloudMid: hex(0xf4a08a),
        cloudShadow: hex(0x7a5a9a),
        ambient: 0.3,
        stars: 0,
    },
    {
        name: 'dusk',
        time: hours(19),
        horizon: hex(0xb07ab0),
        upper: hex(0x6a3fc0),
        zenith: hex(0x2a1f7a),
        glow: hex(0x79536f),
        sunLight: hex(0xffb070),
        moonLight: MOONLIGHT,
        sunDisc: hex(0xf38b21),
        // Muted lilac to deep violet, the warmth fading
        cloudLight: hex(0xb48cc8),
        cloudMid: hex(0x7e66aa),
        cloudShadow: hex(0x45407a),
        ambient: 0.2,
        stars: 0.25,
    },
    { name: 'nightStart', time: hours(20), ...NIGHT },
];

/**
 * The palette at a time of day (0..1), written into out (no allocation).
 * Finds the segment from the last key at or before timeOfDay to the next key, wrapping
 * past midnight, and smoothsteps between them.
 */
export const paletteAt = (timeOfDay: number, out: TimeOfDayPalette): void => {
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

    // Every value shares the same segment and blend, so they all move together
    for (let c = 0; c < PALETTE_COLORS.length; c += 1) {
        const channel = PALETTE_COLORS[c];
        const a = from[channel];
        const b = to[channel];
        const o = out[channel];
        o.x = a.x + (b.x - a.x) * blend;
        o.y = a.y + (b.y - a.y) * blend;
        o.z = a.z + (b.z - a.z) * blend;
    }
    out.ambient = from.ambient + (to.ambient - from.ambient) * blend;
    out.stars = from.stars + (to.stars - from.stars) * blend;
};
