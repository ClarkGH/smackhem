// Star twinkle timing, shared by core (which works out the time) and the sky shader (which
// twinkles by it), so the two can't disagree.

// Seconds of sim time per full twinkle cycle. starTime wraps here.
export const STAR_CYCLE_SECONDS = 12000;

/**
 * Each star's time is cut into slots this long. In each slot a star may twinkle once (the shader
 * hashes the star and the slot number to decide). A whole number of slots per cycle makes the
 * wrap at the end of a cycle invisible: the slots line up with themselves again.
 */
export const STAR_TWINKLE_SLOT_SECONDS = 3;

// Sim time wrapped to the cycle, so the shader's float time stays precise after hours of play
export const starTimeAt = (simulationTime: number): number => (
    ((simulationTime % STAR_CYCLE_SECONDS) + STAR_CYCLE_SECONDS) % STAR_CYCLE_SECONDS
);
