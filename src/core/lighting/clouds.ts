// Cloud motion, shared by core (which works out the time) and the sky shader (which moves the
// noise by it), so the two can't disagree.

// Noise cells before the cloud noise repeats, on each octave's own scale
export const CLOUD_NOISE_PERIOD = 256;

// Seconds of sim time per full cloud cycle. cloudTime wraps here.
export const CLOUD_CYCLE_SECONDS = 12000;

/**
 * How many whole periods each noise octave travels per cycle, as (x, z), biggest shapes first.
 * Whole numbers make the wrap at the end of a cycle invisible: every octave is back on the
 * same spot of its repeating noise. Different speeds and directions per octave make the
 * clouds change shape as they drift, the finer layers sliding across the big masses.
 * With the shader's noise scale, the big shapes drift about 1.5 world units per second.
 */
export const CLOUD_OCTAVE_LAPS: readonly (readonly [number, number])[] = [
    [1, 0],
    [3, 1],
    [5, -2],
    [-4, 9],
];

// Sim time wrapped to the cycle, so the shader's offsets stay small after hours of play
export const cloudTimeAt = (simulationTime: number): number => (
    ((simulationTime % CLOUD_CYCLE_SECONDS) + CLOUD_CYCLE_SECONDS) % CLOUD_CYCLE_SECONDS
);
